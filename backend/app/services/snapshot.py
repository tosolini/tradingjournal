from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PositionDailySnapshot, Trade, TradeExecution
from app.services.pnl import compute_weighted_average_pnl
from app.services.price_provider import get_close_price


def recompute_daily_snapshots(
    db: Session, snapshot_date: date, user_id: int | None = None
) -> int:
    trades_query = select(Trade).where(Trade.status == "open")
    if user_id is not None:
        trades_query = trades_query.where(Trade.user_id == user_id)
    trades = db.execute(trades_query).scalars().all()

    grouped: dict[tuple[int, str], dict[str, Decimal]] = {}
    for trade in trades:
        executions = db.execute(
            select(TradeExecution).where(TradeExecution.trade_id == trade.id)
        ).scalars().all()
        if not executions:
            continue
        close_price = get_close_price(trade.symbol, snapshot_date, trade.market)
        if close_price is None:
            continue
        pnl = compute_weighted_average_pnl(executions, market_price=close_price)
        if pnl.position_qty <= 0:
            continue

        key = (trade.account_id, trade.symbol)
        if key not in grouped:
            grouped[key] = {
                "position_qty": Decimal("0"),
                "market_value": Decimal("0"),
                "realized_pnl": Decimal("0"),
                "unrealized_pnl": Decimal("0"),
                "close_price": close_price,
            }
        grouped[key]["position_qty"] += pnl.position_qty
        grouped[key]["market_value"] += pnl.market_value
        grouped[key]["realized_pnl"] += pnl.net_realized_pnl
        grouped[key]["unrealized_pnl"] += pnl.unrealized_pnl

    upserts = 0
    for (account_id, symbol), data in grouped.items():
        snapshot = db.execute(
            select(PositionDailySnapshot).where(
                PositionDailySnapshot.account_id == account_id,
                PositionDailySnapshot.symbol == symbol,
                PositionDailySnapshot.snapshot_date == snapshot_date,
            )
        ).scalar_one_or_none()
        if snapshot is None:
            snapshot = PositionDailySnapshot(
                account_id=account_id,
                symbol=symbol,
                snapshot_date=snapshot_date,
            )
            db.add(snapshot)

        snapshot.position_qty = data["position_qty"]
        snapshot.close_price = data["close_price"]
        snapshot.market_value = data["market_value"]
        snapshot.realized_pnl = data["realized_pnl"]
        snapshot.unrealized_pnl = data["unrealized_pnl"]
        upserts += 1

    db.commit()
    return upserts
