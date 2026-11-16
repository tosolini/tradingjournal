from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from app.models import Asset, BondDetail, Holding, Trade, TradeIdea, User
from app.schemas import (
    AlertCounts,
    BondCouponAlert,
    BondMaturityAlert,
    TradeIdeaResponse,
    TradePriceAlert,
    UnifiedAlertsResponse,
)
from app.services.bonds import get_bond_cash_flows
from app.services.price_provider import get_current_price


def get_acknowledged_alerts(user: User) -> dict[str, str]:
    """Retrieve acknowledged alert keys mapping: alert_key -> iso_timestamp."""
    prefs = user.preferences or {}
    if not isinstance(prefs, dict):
        return {}
    return dict(prefs.get("acknowledged_alerts", {}))


def _serialize_scouting_idea(
    idea: TradeIdea,
    current_price: Optional[Decimal] = None,
    is_acknowledged: bool = False,
) -> TradeIdeaResponse:
    from app.api.trade_ideas import _serialize_idea
    resp = _serialize_idea(idea, current_price)
    resp.alert_key = f"scouting:{idea.id}"
    resp.is_acknowledged = is_acknowledged
    return resp


def get_open_trade_alerts(
    db: Session,
    user: User,
    now: Optional[datetime] = None,
) -> list[TradePriceAlert]:
    """Evaluate open trades against live market prices for Take Profit and Stop Loss."""
    stmt = (
        select(Trade)
        .options(joinedload(Trade.account))
        .where(
            Trade.user_id == user.id,
            Trade.status == "open",
            or_(Trade.target_price.isnot(None), Trade.stop_loss.isnot(None)),
        )
    )
    trades = db.execute(stmt).scalars().all()
    if not trades:
        return []

    ack_map = get_acknowledged_alerts(user)
    alerts: list[TradePriceAlert] = []

    for trade in trades:
        try:
            curr_price = get_current_price(trade.symbol, trade.market)
        except Exception:
            curr_price = None

        if curr_price is None:
            continue

        side = (trade.side or "long").strip().lower()
        acc_name = trade.account.name if trade.account else None

        # Check Take Profit
        if trade.target_price is not None:
            tp_hit = (
                (side == "long" and curr_price >= trade.target_price)
                or (side == "short" and curr_price <= trade.target_price)
            )
            if tp_hit:
                delta = Decimal("0")
                if trade.target_price > 0:
                    delta = ((curr_price - trade.target_price) / trade.target_price * Decimal("100")).quantize(Decimal("0.01"))
                alert_key = f"trade:{trade.id}:take_profit:{trade.target_price}"
                alerts.append(
                    TradePriceAlert(
                        id=trade.id,
                        alert_key=alert_key,
                        trade_id=trade.id,
                        symbol=trade.symbol,
                        side=side,
                        alert_type="take_profit",
                        threshold_price=trade.target_price,
                        current_price=curr_price,
                        delta_pct=delta,
                        account_id=trade.account_id,
                        account_name=acc_name,
                        market=trade.market,
                        is_acknowledged=(alert_key in ack_map),
                    )
                )
                continue

        # Check Stop Loss
        if trade.stop_loss is not None:
            sl_hit = (
                (side == "long" and curr_price <= trade.stop_loss)
                or (side == "short" and curr_price >= trade.stop_loss)
            )
            if sl_hit:
                delta = Decimal("0")
                if trade.stop_loss > 0:
                    delta = ((curr_price - trade.stop_loss) / trade.stop_loss * Decimal("100")).quantize(Decimal("0.01"))
                alert_key = f"trade:{trade.id}:stop_loss:{trade.stop_loss}"
                alerts.append(
                    TradePriceAlert(
                        id=trade.id,
                        alert_key=alert_key,
                        trade_id=trade.id,
                        symbol=trade.symbol,
                        side=side,
                        alert_type="stop_loss",
                        threshold_price=trade.stop_loss,
                        current_price=curr_price,
                        delta_pct=delta,
                        account_id=trade.account_id,
                        account_name=acc_name,
                        market=trade.market,
                        is_acknowledged=(alert_key in ack_map),
                    )
                )

    return alerts


def get_coupon_alerts(
    db: Session,
    user: User,
    target_date: Optional[date] = None,
) -> list[BondCouponAlert]:
    """Returns coupon payment alerts for active holdings scheduled on target_date (default today)."""
    if target_date is None:
        target_date = date.today()

    stmt = (
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account))
        .join(Asset, Asset.id == Holding.asset_id)
        .where(
            Holding.user_id == user.id,
            Holding.quantity > Decimal("0"),
            or_(Holding.exit_date.is_(None), Holding.exit_date >= target_date),
        )
    )
    holdings = db.execute(stmt).scalars().all()
    ack_map = get_acknowledged_alerts(user)
    alerts: list[BondCouponAlert] = []

    for h in holdings:
        if not h.asset or not h.asset.bond_detail:
            continue

        flows = get_bond_cash_flows(
            bond_detail=h.asset.bond_detail,
            nominal=h.quantity,
            eligible_for_bonus=h.eligible_for_bonus,
            from_date=target_date,
        )

        acc_name = h.account.name if h.account else f"Account {h.account_id}"

        for f in flows:
            if f.flow_type == "coupon" and f.date == target_date:
                alert_key = f"coupon:{h.id}:{f.date.isoformat()}"
                alerts.append(
                    BondCouponAlert(
                        id=f"{h.id}_{f.date.isoformat()}",
                        alert_key=alert_key,
                        holding_id=h.id,
                        asset_id=h.asset_id,
                        asset_symbol=h.asset.symbol,
                        asset_name=h.asset.name,
                        account_id=h.account_id,
                        account_name=acc_name,
                        coupon_date=f.date,
                        gross_amount=f.gross_amount,
                        net_amount=f.net_amount,
                        currency=h.asset.currency or "EUR",
                        is_acknowledged=(alert_key in ack_map),
                    )
                )

    return alerts


def get_bond_maturity_alerts(
    db: Session,
    user: User,
    target_date: Optional[date] = None,
    threshold_days: Optional[int] = None,
) -> list[BondMaturityAlert]:
    """Returns alerts for bonds / BTPs maturing naturally within threshold_days (default 30 days)."""
    if target_date is None:
        target_date = date.today()

    if threshold_days is None:
        prefs = user.preferences or {}
        alert_prefs = prefs.get("alerts", {}) if isinstance(prefs, dict) else {}
        try:
            threshold_days = int(alert_prefs.get("bond_expiry_days", 30))
        except (ValueError, TypeError):
            threshold_days = 30

    cutoff_date = target_date + timedelta(days=threshold_days)

    stmt = (
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account))
        .join(Asset, Asset.id == Holding.asset_id)
        .join(BondDetail, BondDetail.asset_id == Asset.id)
        .where(
            Holding.user_id == user.id,
            Holding.quantity > Decimal("0"),
            or_(Holding.exit_date.is_(None), Holding.exit_date >= target_date),
            BondDetail.maturity_date >= target_date,
            BondDetail.maturity_date <= cutoff_date,
        )
    )
    holdings = db.execute(stmt).scalars().all()
    ack_map = get_acknowledged_alerts(user)
    alerts: list[BondMaturityAlert] = []

    for h in holdings:
        if not h.asset or not h.asset.bond_detail:
            continue

        bd = h.asset.bond_detail
        days_rem = (bd.maturity_date - target_date).days
        acc_name = h.account.name if h.account else f"Account {h.account_id}"
        alert_key = f"maturity:{h.id}:{bd.maturity_date.isoformat()}"

        alerts.append(
            BondMaturityAlert(
                id=h.id,
                alert_key=alert_key,
                holding_id=h.id,
                asset_id=h.asset_id,
                asset_symbol=h.asset.symbol,
                asset_name=h.asset.name,
                isin=h.asset.isin,
                account_id=h.account_id,
                account_name=acc_name,
                maturity_date=bd.maturity_date,
                days_remaining=days_rem,
                nominal_value=h.quantity,
                final_bonus_rate=bd.final_bonus_rate,
                currency=h.asset.currency or "EUR",
                is_acknowledged=(alert_key in ack_map),
            )
        )

    alerts.sort(key=lambda a: a.days_remaining)
    return alerts


def get_scouting_alerts(
    db: Session,
    user: User,
    limit: int = 20,
) -> list[TradeIdeaResponse]:
    """Returns active scouting ideas in triggered status."""
    stmt = (
        select(TradeIdea)
        .where(
            TradeIdea.user_id == user.id,
            TradeIdea.status == "triggered",
        )
        .order_by(TradeIdea.triggered_at.desc().nulls_last())
        .limit(limit)
    )
    ideas = db.execute(stmt).scalars().all()
    ack_map = get_acknowledged_alerts(user)
    return [_serialize_scouting_idea(i, is_acknowledged=(f"scouting:{i.id}" in ack_map)) for i in ideas]


def get_unified_alerts(
    db: Session,
    user: User,
    target_date: Optional[date] = None,
    include_acknowledged: bool = False,
) -> UnifiedAlertsResponse:
    """Aggregates trade price alerts, coupon alerts, bond maturity alerts, and scouting alerts."""
    all_trade_alerts = get_open_trade_alerts(db, user)
    all_coupon_alerts = get_coupon_alerts(db, user, target_date=target_date)
    all_maturity_alerts = get_bond_maturity_alerts(db, user, target_date=target_date)
    all_scouting_alerts = get_scouting_alerts(db, user)

    # Filter unacknowledged unless requested
    if include_acknowledged:
        trades = all_trade_alerts
        coupons = all_coupon_alerts
        maturities = all_maturity_alerts
        scouting = all_scouting_alerts
    else:
        trades = [a for a in all_trade_alerts if not a.is_acknowledged]
        coupons = [c for c in all_coupon_alerts if not c.is_acknowledged]
        maturities = [m for m in all_maturity_alerts if not m.is_acknowledged]
        scouting = [s for s in all_scouting_alerts if not s.is_acknowledged]

    # Unread count is strictly the count of unacknowledged alerts
    unack_trades = [a for a in all_trade_alerts if not a.is_acknowledged]
    unack_coupons = [c for c in all_coupon_alerts if not c.is_acknowledged]
    unack_maturities = [m for m in all_maturity_alerts if not m.is_acknowledged]
    unack_scouting = [s for s in all_scouting_alerts if not s.is_acknowledged]

    total_unread = (
        len(unack_trades)
        + len(unack_coupons)
        + len(unack_maturities)
        + len(unack_scouting)
    )

    counts = AlertCounts(
        all=total_unread,
        trades=len(unack_trades),
        coupons=len(unack_coupons),
        maturities=len(unack_maturities),
        scouting=len(unack_scouting),
    )

    return UnifiedAlertsResponse(
        unread_count=total_unread,
        counts=counts,
        trades=trades,
        coupons=coupons,
        maturities=maturities,
        scouting=scouting,
    )


def acknowledge_alert(db: Session, user: User, alert_key: str) -> None:
    """Mark a specific alert_key as acknowledged in user preferences."""
    prefs = dict(user.preferences or {})
    ack_dict = dict(prefs.get("acknowledged_alerts", {}))
    ack_dict[alert_key] = datetime.now(timezone.utc).isoformat()
    prefs["acknowledged_alerts"] = ack_dict
    user.preferences = prefs
    flag_modified(user, "preferences")
    db.commit()
    db.refresh(user)


def acknowledge_all_alerts(
    db: Session,
    user: User,
    alert_keys: Optional[list[str]] = None,
    target_date: Optional[date] = None,
) -> list[str]:
    """Mark all provided or all currently active alerts as acknowledged."""
    prefs = dict(user.preferences or {})
    ack_dict = dict(prefs.get("acknowledged_alerts", {}))
    now_iso = datetime.now(timezone.utc).isoformat()

    if alert_keys is None or len(alert_keys) == 0:
        active = get_unified_alerts(db=db, user=user, target_date=target_date, include_acknowledged=False)
        keys_to_ack = []
        for t in active.trades:
            keys_to_ack.append(t.alert_key)
        for c in active.coupons:
            keys_to_ack.append(c.alert_key)
        for m in active.maturities:
            keys_to_ack.append(m.alert_key)
        for s in active.scouting:
            if s.alert_key:
                keys_to_ack.append(s.alert_key)
    else:
        keys_to_ack = alert_keys

    for k in keys_to_ack:
        ack_dict[k] = now_iso

    prefs["acknowledged_alerts"] = ack_dict
    user.preferences = prefs
    flag_modified(user, "preferences")
    db.commit()
    db.refresh(user)
    return keys_to_ack


def unacknowledge_alert(db: Session, user: User, alert_key: str) -> None:
    """Remove an alert_key from user's acknowledged list (undo)."""
    prefs = dict(user.preferences or {})
    ack_dict = dict(prefs.get("acknowledged_alerts", {}))
    if alert_key in ack_dict:
        del ack_dict[alert_key]
        prefs["acknowledged_alerts"] = ack_dict
        user.preferences = prefs
        flag_modified(user, "preferences")
        db.commit()
        db.refresh(user)
