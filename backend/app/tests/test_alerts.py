from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.api.alerts import list_alerts
from app.models import Account, Asset, BondDetail, Holding, Trade, TradeIdea, User
from app.services.alerts import (
    get_bond_maturity_alerts,
    get_coupon_alerts,
    get_open_trade_alerts,
    get_scouting_alerts,
    get_unified_alerts,
)
from app.security import hash_password


def _create_user(db, email="trader_alerts@example.com", prefs=None):
    user = User(
        email=email,
        username=email.split("@")[0],
        hashed_password=hash_password("password123"),
        preferences=prefs or {},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_account(db, user):
    acc = Account(
        user_id=user.id,
        name="Main Account",
        base_currency="EUR",
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


def test_open_trade_alerts_long_and_short(db):
    user = _create_user(db, "trader_tp_sl@example.com")
    acc = _create_account(db, user)

    # 1. Long trade hitting TP: TP=150, current price=155
    trade_long_tp = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="AAPL",
        side="long",
        status="open",
        target_price=Decimal("150.00"),
        stop_loss=Decimal("130.00"),
    )

    # 2. Long trade hitting SL: SL=100, current price=95
    trade_long_sl = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="MSFT",
        side="long",
        status="open",
        target_price=Decimal("120.00"),
        stop_loss=Decimal("100.00"),
    )

    # 3. Short trade hitting TP: TP=50, current price=45
    trade_short_tp = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="TSLA",
        side="short",
        status="open",
        target_price=Decimal("50.00"),
        stop_loss=Decimal("70.00"),
    )

    # 4. Short trade hitting SL: SL=80, current price=85
    trade_short_sl = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="NVDA",
        side="short",
        status="open",
        target_price=Decimal("60.00"),
        stop_loss=Decimal("80.00"),
    )

    # 5. Closed trade with target hit: should NOT trigger alert
    trade_closed = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="GOOGL",
        side="long",
        status="closed",
        target_price=Decimal("100.00"),
    )

    # 6. In-range trade: should NOT trigger alert
    trade_in_range = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="AMZN",
        side="long",
        status="open",
        target_price=Decimal("200.00"),
        stop_loss=Decimal("100.00"),
    )

    db.add_all([
        trade_long_tp,
        trade_long_sl,
        trade_short_tp,
        trade_short_sl,
        trade_closed,
        trade_in_range,
    ])
    db.commit()

    price_map = {
        "AAPL": Decimal("155.00"),
        "MSFT": Decimal("95.00"),
        "TSLA": Decimal("45.00"),
        "NVDA": Decimal("85.00"),
        "GOOGL": Decimal("110.00"),
        "AMZN": Decimal("150.00"),
    }

    with patch("app.services.alerts.get_current_price", side_effect=lambda sym, mkt=None: price_map.get(sym)):
        alerts = get_open_trade_alerts(db, user)

    assert len(alerts) == 4
    alerts_by_sym = {a.symbol: a for a in alerts}

    assert alerts_by_sym["AAPL"].alert_type == "take_profit"
    assert alerts_by_sym["AAPL"].current_price == Decimal("155.00")

    assert alerts_by_sym["MSFT"].alert_type == "stop_loss"
    assert alerts_by_sym["MSFT"].current_price == Decimal("95.00")

    assert alerts_by_sym["TSLA"].alert_type == "take_profit"
    assert alerts_by_sym["TSLA"].current_price == Decimal("45.00")

    assert alerts_by_sym["NVDA"].alert_type == "stop_loss"
    assert alerts_by_sym["NVDA"].current_price == Decimal("85.00")


def test_coupon_alerts_today(db):
    user = _create_user(db, "trader_coupons@example.com")
    acc = _create_account(db, user)
    today = date(2026, 11, 20)

    # Asset 1: Coupon exactly today (semi-annual coupon, maturity in 2 years on 20th Nov)
    asset_1 = Asset(
        user_id=user.id,
        symbol="IT0005545678",
        name="BTP 3.25% 2028",
        instrument_type="bond",
    )
    db.add(asset_1)
    db.commit()
    db.refresh(asset_1)

    bd_1 = BondDetail(
        asset_id=asset_1.id,
        maturity_date=date(2028, 11, 20),
        issue_date=date(2023, 11, 20),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("3.25"),
        tax_rate=Decimal("12.5"),
    )
    db.add(bd_1)

    holding_1 = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset_1.id,
        quantity=Decimal("10000"),
        avg_cost=Decimal("100.00"),
        entry_date=date(2024, 1, 1),
    )
    db.add(holding_1)

    # Asset 2: Coupon in 1 month (20th Dec), not today
    asset_2 = Asset(
        user_id=user.id,
        symbol="IT0009999999",
        name="BTP 4.00% 2030",
        instrument_type="bond",
    )
    db.add(asset_2)
    db.commit()
    db.refresh(asset_2)

    bd_2 = BondDetail(
        asset_id=asset_2.id,
        maturity_date=date(2030, 12, 20),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("4.00"),
    )
    db.add(bd_2)

    holding_2 = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset_2.id,
        quantity=Decimal("5000"),
        avg_cost=Decimal("100.00"),
        entry_date=date(2024, 1, 1),
    )
    db.add(holding_2)
    db.commit()

    alerts = get_coupon_alerts(db, user, target_date=today)
    assert len(alerts) == 1
    assert alerts[0].asset_symbol == "IT0005545678"
    assert alerts[0].coupon_date == today
    assert alerts[0].gross_amount > Decimal("0")


def test_bond_maturity_alerts_and_preferences(db):
    user = _create_user(db, "trader_maturity@example.com")
    acc = _create_account(db, user)
    today = date(2026, 11, 1)

    # Bond 1: matures in 15 days (Nov 16, 2026) -> within 30 days
    asset_1 = Asset(user_id=user.id, symbol="BTP15", name="BTP Matures 15d", instrument_type="bond")
    db.add(asset_1)
    db.commit()
    db.refresh(asset_1)
    db.add(BondDetail(asset_id=asset_1.id, maturity_date=date(2026, 11, 16)))
    db.add(Holding(user_id=user.id, account_id=acc.id, asset_id=asset_1.id, quantity=Decimal("10000"), entry_date=date(2024, 1, 1)))

    # Bond 2: matures in 40 days (Dec 11, 2026) -> outside 30 days default
    asset_2 = Asset(user_id=user.id, symbol="BTP40", name="BTP Matures 40d", instrument_type="bond")
    db.add(asset_2)
    db.commit()
    db.refresh(asset_2)
    db.add(BondDetail(asset_id=asset_2.id, maturity_date=date(2026, 12, 11)))
    db.add(Holding(user_id=user.id, account_id=acc.id, asset_id=asset_2.id, quantity=Decimal("5000"), entry_date=date(2024, 1, 1)))

    # Bond 3: already matured in the past (Oct 20, 2026)
    asset_3 = Asset(user_id=user.id, symbol="BTPPAST", name="BTP Past", instrument_type="bond")
    db.add(asset_3)
    db.commit()
    db.refresh(asset_3)
    db.add(BondDetail(asset_id=asset_3.id, maturity_date=date(2026, 10, 20)))
    db.add(Holding(user_id=user.id, account_id=acc.id, asset_id=asset_3.id, quantity=Decimal("2000"), entry_date=date(2024, 1, 1)))

    db.commit()

    # Default 30-day threshold
    alerts = get_bond_maturity_alerts(db, user, target_date=today)
    assert len(alerts) == 1
    assert alerts[0].asset_symbol == "BTP15"
    assert alerts[0].days_remaining == 15

    # With custom threshold = 45 days
    alerts_45 = get_bond_maturity_alerts(db, user, target_date=today, threshold_days=45)
    assert len(alerts_45) == 2
    assert [a.asset_symbol for a in alerts_45] == ["BTP15", "BTP40"]

    # Test user preference resolution
    user.preferences = {"alerts": {"bond_expiry_days": 50}}
    db.commit()
    alerts_pref = get_bond_maturity_alerts(db, user, target_date=today)
    assert len(alerts_pref) == 2


def test_unified_alerts_aggregation(db):
    user = _create_user(db, "trader_unified@example.com")
    acc = _create_account(db, user)
    today = date(2026, 11, 16)

    # 1. Triggered trade idea (scouting)
    now_dt = datetime.now(timezone.utc)
    idea = TradeIdea(
        user_id=user.id,
        symbol="ENEL.MI",
        direction="long",
        status="triggered",
        initial_price=Decimal("6.50"),
        trigger_price=Decimal("6.50"),
        stale_at=now_dt + timedelta(days=7),
        expires_at=now_dt + timedelta(days=10),
        triggered_at=now_dt,
        triggered_price=Decimal("6.52"),
    )
    db.add(idea)

    # 2. Open trade hitting SL
    trade = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="STM.MI",
        side="long",
        status="open",
        stop_loss=Decimal("25.00"),
    )
    db.add(trade)

    # 3. Bond with coupon today
    asset = Asset(user_id=user.id, symbol="BTP26", name="BTP Nov 26", instrument_type="bond")
    db.add(asset)
    db.commit()
    db.refresh(asset)
    db.add(BondDetail(asset_id=asset.id, maturity_date=date(2026, 11, 16), annual_coupon_rate=Decimal("2.5")))
    db.add(Holding(user_id=user.id, account_id=acc.id, asset_id=asset.id, quantity=Decimal("10000"), entry_date=date(2024, 1, 1)))
    db.commit()

    with patch("app.services.alerts.get_current_price", return_value=Decimal("24.50")):
        res = get_unified_alerts(db, user, target_date=today)
        endpoint_res = list_alerts(target_date=today, db=db, current_user=user)

    assert res.counts.scouting == 1
    assert res.counts.trades == 1
    assert res.counts.coupons == 1
    assert res.counts.maturities == 1  # matures today, which is <= 30 days!
    assert res.unread_count == 4
    assert res.counts.all == 4

    assert endpoint_res.unread_count == 4
    assert endpoint_res.counts.trades == 1


def test_alert_acknowledgment_single_and_all(db):
    from app.api.alerts import (
        mark_alert_as_acknowledged,
        mark_all_alerts_as_acknowledged,
        unmark_alert_as_acknowledged,
    )
    from app.schemas import AlertAcknowledgeRequest

    user = _create_user(db, "trader_ack@example.com")
    acc = _create_account(db, user)
    today = date(2026, 11, 16)

    # 1. Trade
    trade = Trade(
        user_id=user.id,
        account_id=acc.id,
        symbol="ENI",
        side="long",
        status="open",
        target_price=Decimal("15.00"),
    )
    db.add(trade)

    # 2. Idea
    now_dt = datetime.now(timezone.utc)
    idea = TradeIdea(
        user_id=user.id,
        symbol="PST",
        direction="long",
        status="triggered",
        initial_price=Decimal("10.00"),
        trigger_price=Decimal("10.00"),
        stale_at=now_dt + timedelta(days=7),
        expires_at=now_dt + timedelta(days=10),
        triggered_at=now_dt,
        triggered_price=Decimal("10.05"),
    )
    db.add(idea)
    db.commit()

    with patch("app.services.alerts.get_current_price", return_value=Decimal("15.50")):
        initial_res = get_unified_alerts(db, user, target_date=today)
        assert initial_res.unread_count == 2
        trade_alert = initial_res.trades[0]
        assert trade_alert.alert_key == f"trade:{trade.id}:take_profit:{trade.target_price}"

        # Acknowledge the trade alert
        ack_res = mark_alert_as_acknowledged(
            payload=AlertAcknowledgeRequest(alert_key=trade_alert.alert_key),
            db=db,
            current_user=user,
        )
        assert ack_res.success is True
        assert trade_alert.alert_key in ack_res.acknowledged_keys

        # Check updated alerts: trade alert must be excluded by default
        after_ack = get_unified_alerts(db, user, target_date=today)
        assert after_ack.unread_count == 1
        assert len(after_ack.trades) == 0
        assert len(after_ack.scouting) == 1

        # When include_acknowledged=True, trade alert is present with is_acknowledged=True
        all_included = get_unified_alerts(db, user, target_date=today, include_acknowledged=True)
        assert all_included.unread_count == 1
        assert len(all_included.trades) == 1
        assert all_included.trades[0].is_acknowledged is True

        # Undo acknowledgment
        unmark_alert_as_acknowledged(alert_key=trade_alert.alert_key, db=db, current_user=user)
        after_undo = get_unified_alerts(db, user, target_date=today)
        assert after_undo.unread_count == 2
        assert len(after_undo.trades) == 1

        # Acknowledge ALL alerts
        ack_all_res = mark_all_alerts_as_acknowledged(target_date=today, db=db, current_user=user)
        assert ack_all_res.success is True
        assert len(ack_all_res.acknowledged_keys) == 2

        # Check unread count is now 0
        final_res = get_unified_alerts(db, user, target_date=today)
        assert final_res.unread_count == 0
        assert final_res.counts.all == 0
        assert len(final_res.trades) == 0
        assert len(final_res.scouting) == 0

