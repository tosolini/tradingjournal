from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Asset, CashLedgerEntry, Holding, PortfolioSnapshot, PositionDailySnapshot
from app.services.price_provider import get_current_price
from app.schemas import AllAssetsPnlPoint, DailyPnlPoint, HoldingDetailResponse, PortfolioSummaryResponse


def get_holding_details(
    db: Session, user_id: int, account_id: int | None = None
) -> list[HoldingDetailResponse]:
    query = (
        select(Holding)
        .options(joinedload(Holding.asset))
        .options(joinedload(Holding.account))
        .where(Holding.user_id == user_id)
    )
    if account_id is not None:
        query = query.where(Holding.account_id == account_id)

    holdings = db.execute(query).scalars().all()
    today = date.today()
    results: list[HoldingDetailResponse] = []

    for h in holdings:
        fetched_price = get_current_price(h.asset.symbol, h.asset.exchange)
        current_price = (
            fetched_price
            if fetched_price is not None and fetched_price > Decimal("0")
            else h.avg_cost
        )
        qty = h.quantity
        mkt_val = current_price * qty
        cost_basis = h.avg_cost * qty
        ret_val = mkt_val - cost_basis
        ret_pct = (ret_val / cost_basis * Decimal("100")) if cost_basis != 0 else Decimal("0")

        if h.exit_date:
            hold_duration_days = (h.exit_date - h.entry_date).days
        else:
            hold_duration_days = (today - h.entry_date).days

        results.append(
            HoldingDetailResponse(
                id=h.id,
                account_id=h.account_id,
                asset_id=h.asset_id,
                asset_symbol=h.asset.symbol,
                asset_name=h.asset.name,
                instrument_type=h.asset.instrument_type,
                asset_currency=h.asset.currency,
                quantity=qty,
                avg_cost=h.avg_cost,
                entry_date=h.entry_date,
                exit_date=h.exit_date,
                hold_duration_days=hold_duration_days,
                current_price=current_price,
                market_value=mkt_val,
                return_value=ret_val,
                return_pct=ret_pct,
            )
        )

    return results


def get_portfolio_summary(
    db: Session, user_id: int, account_id: int | None = None
) -> list[PortfolioSummaryResponse]:
    holdings = get_holding_details(db, user_id, account_id)

    acc_groups: dict[int, dict] = {}
    for h in holdings:
        if h.account_id not in acc_groups:
            acc_group = db.get(Holding, h.id)
            account_name = acc_group.account.name if acc_group and acc_group.account else f"Account {h.account_id}"
            acc_groups[h.account_id] = {
                "account_name": account_name,
                "total_value": Decimal("0"),
                "total_cost": Decimal("0"),
                "total_return": Decimal("0"),
                "holdings_count": 0,
            }
        acc_groups[h.account_id]["total_value"] += h.market_value
        acc_groups[h.account_id]["total_cost"] += h.avg_cost * h.quantity
        acc_groups[h.account_id]["holdings_count"] += 1

    results: list[PortfolioSummaryResponse] = []
    for acc_id, data in acc_groups.items():
        total_cost = data["total_cost"]
        total_return = data["total_value"] - total_cost
        return_pct = (total_return / total_cost * Decimal("100")) if total_cost != 0 else Decimal("0")
        results.append(
            PortfolioSummaryResponse(
                account_id=acc_id,
                account_name=data["account_name"],
                total_value=data["total_value"],
                total_cost=total_cost,
                total_return=total_return,
                total_return_pct=return_pct,
                holdings_count=data["holdings_count"],
            )
        )

    return results


def recompute_portfolio_snapshot(
    db: Session, snapshot_date: date, user_id: int
) -> int:
    summaries = get_portfolio_summary(db, user_id)
    upserts = 0

    for s in summaries:
        snapshot = db.execute(
            select(PortfolioSnapshot).where(
                PortfolioSnapshot.account_id == s.account_id,
                PortfolioSnapshot.snapshot_date == snapshot_date,
            )
        ).scalar_one_or_none()

        if snapshot is None:
            snapshot = PortfolioSnapshot(
                account_id=s.account_id,
                snapshot_date=snapshot_date,
            )
            db.add(snapshot)

        snapshot.total_value = s.total_value
        snapshot.total_cost = s.total_cost
        snapshot.total_return = s.total_return
        snapshot.total_return_pct = s.total_return_pct
        upserts += 1

    db.commit()
    return upserts


def get_daily_pnl_series(
    db: Session, user_id: int, account_id: int | None = None
) -> list[DailyPnlPoint]:
    """Build a day-by-day P&L series from portfolio snapshots, cash-adjusted.

    Values across the user's accounts are aggregated per snapshot_date.
    `day_pnl` is the day-over-day change in total portfolio value minus the
    net cash flow that day (deposits add cash, withdrawals remove cash), so
    moving money in/out does not count as a gain or loss.
    `cumulative_pnl` is the running sum of those adjusted daily changes.
    """
    query = (
        select(PortfolioSnapshot)
        .join(Account, Account.id == PortfolioSnapshot.account_id)
        .where(Account.user_id == user_id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    )
    if account_id is not None:
        query = query.where(PortfolioSnapshot.account_id == account_id)

    rows = db.execute(query).scalars().all()

    by_date: dict[date, dict[str, Decimal]] = {}
    for snapshot in rows:
        entry = by_date.setdefault(
            snapshot.snapshot_date,
            {"total_value": Decimal("0"), "total_cost": Decimal("0")},
        )
        entry["total_value"] += snapshot.total_value
        entry["total_cost"] += snapshot.total_cost

    # Net cash flow per date: deposits (+) minus withdrawals (−)
    ledger_query = (
        select(CashLedgerEntry)
        .join(Account, Account.id == CashLedgerEntry.account_id)
        .where(Account.user_id == user_id)
    )
    if account_id is not None:
        ledger_query = ledger_query.where(CashLedgerEntry.account_id == account_id)
    cash_flow_by_date: dict[date, Decimal] = {}
    for entry in db.execute(ledger_query).scalars().all():
        delta = entry.amount if entry.entry_type == "deposit" else -entry.amount
        cash_flow_by_date[entry.entry_date] = cash_flow_by_date.get(entry.entry_date, Decimal("0")) + delta

    result: list[DailyPnlPoint] = []
    prev_value: Decimal | None = None
    cumulative_pnl = Decimal("0")
    for d in sorted(by_date):
        entry = by_date[d]
        value = entry["total_value"]
        cost = entry["total_cost"]

        net_cash_flow = cash_flow_by_date.get(d, Decimal("0"))
        if prev_value is None:
            day_pnl = Decimal("0")
        else:
            day_pnl = (value - prev_value) - net_cash_flow
        day_pnl_pct = (day_pnl / prev_value * Decimal("100")) if prev_value else Decimal("0")
        cumulative_pnl += day_pnl

        result.append(
            DailyPnlPoint(
                date=d.isoformat(),
                total_value=value,
                total_cost=cost,
                total_return=value - cost,
                day_pnl=day_pnl,
                day_pnl_pct=day_pnl_pct,
                cumulative_pnl=cumulative_pnl,
                net_cash_flow=net_cash_flow,
            )
        )
        prev_value = value

    return result

def get_all_assets_pnl_series(
    db: Session, user_id: int
) -> list[AllAssetsPnlPoint]:
    """Day-by-day P&L across BOTH tracking systems: long-term holdings
    (PortfolioSnapshot) and open trade positions (PositionDailySnapshot),
    cash-adjusted. `trades_value` is the current market value of open
    positions (PositionDailySnapshot.market_value); realized and unrealized
    P&L are already embedded in market value, so they must not be added.
    """
    by_date: dict[date, dict[str, Decimal]] = {}

    # Holdings (portfolio snapshots) per date
    portfolio_query = (
        select(PortfolioSnapshot)
        .join(Account, Account.id == PortfolioSnapshot.account_id)
        .where(Account.user_id == user_id)
    )
    for snapshot in db.execute(portfolio_query).scalars().all():
        entry = by_date.setdefault(
            snapshot.snapshot_date,
            {"holdings": Decimal("0"), "trades": Decimal("0")},
        )
        entry["holdings"] += snapshot.total_value

    # Trade positions per date
    positions_query = (
        select(PositionDailySnapshot)
        .join(Account, Account.id == PositionDailySnapshot.account_id)
        .where(Account.user_id == user_id)
    )
    for position in db.execute(positions_query).scalars().all():
        entry = by_date.setdefault(
            position.snapshot_date,
            {"holdings": Decimal("0"), "trades": Decimal("0")},
        )
        entry["trades"] += position.market_value

    # Net cash flow per date: deposits (+) minus withdrawals (−)
    ledger_query = (
        select(CashLedgerEntry)
        .join(Account, Account.id == CashLedgerEntry.account_id)
        .where(Account.user_id == user_id)
    )
    cash_flow_by_date: dict[date, Decimal] = {}
    for entry in db.execute(ledger_query).scalars().all():
        delta = entry.amount if entry.entry_type == "deposit" else -entry.amount
        cash_flow_by_date[entry.entry_date] = cash_flow_by_date.get(entry.entry_date, Decimal("0")) + delta

    result: list[AllAssetsPnlPoint] = []
    prev_total: Decimal | None = None
    cumulative_pnl = Decimal("0")
    for d in sorted(by_date):
        entry = by_date[d]
        holdings_value = entry["holdings"]
        trades_value = entry["trades"]
        total_value = holdings_value + trades_value

        net_cash_flow = cash_flow_by_date.get(d, Decimal("0"))
        if prev_total is None:
            day_pnl = Decimal("0")
        else:
            day_pnl = (total_value - prev_total) - net_cash_flow
        day_pnl_pct = (day_pnl / prev_total * Decimal("100")) if prev_total else Decimal("0")
        cumulative_pnl += day_pnl

        result.append(
            AllAssetsPnlPoint(
                date=d.isoformat(),
                holdings_value=holdings_value,
                trades_value=trades_value,
                total_value=total_value,
                day_pnl=day_pnl,
                day_pnl_pct=day_pnl_pct,
                cumulative_pnl=cumulative_pnl,
                net_cash_flow=net_cash_flow,
            )
        )
        prev_total = total_value

    return result
