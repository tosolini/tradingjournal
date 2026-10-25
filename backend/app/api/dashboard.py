from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, PortfolioSnapshot, PositionDailySnapshot, Trade, TradeExecution, User
from app.services.portfolio import get_all_assets_pnl_series, get_holding_details
from app.services.pnl import compute_weighted_average_pnl

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def dashboard_kpis(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    trades = (
        db.execute(
            select(Trade).where(Trade.user_id == current_user.id).order_by(Trade.created_at)
        )
        .scalars()
        .all()
    )

    executions_by_trade: dict[int, list[TradeExecution]] = defaultdict(list)
    if trades:
        executions = (
            db.execute(
                select(TradeExecution).where(
                    TradeExecution.trade_id.in_([trade.id for trade in trades])
                )
            )
            .scalars()
            .all()
        )
        for execution in executions:
            executions_by_trade[execution.trade_id].append(execution)

    currencies: set[str] = set()
    yearly_tax_currency: set[str] = set()
    wins = 0
    losses = 0
    breakeven = 0
    realized = Decimal("0")
    unrealized = Decimal("0")
    gross_wins = Decimal("0")
    gross_losses = Decimal("0")
    open_positions = 0
    current_year = date.today().year
    year_start = datetime(current_year, 1, 1, tzinfo=UTC)
    immediate_tax = Decimal("0")
    year_end_buckets: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    year_end_rates: dict[int, Decimal] = {}
    loss_offset = Decimal("0")
    monthly: dict[str, dict] = {}
    weekly: dict[str, dict] = {}
    trade_rows: list[dict] = []

    for trade in trades:
        if trade.account and trade.account.base_currency:
            currencies.add(str(trade.account.base_currency).upper())
        executions = executions_by_trade.get(trade.id, [])
        if not executions:
            continue
        pnl = compute_weighted_average_pnl(executions)
        net = pnl.net_realized_pnl
        closed_at = trade.closed_at or max(execution.executed_at for execution in executions)
        if closed_at.tzinfo is None:
            closed_at = closed_at.replace(tzinfo=UTC)

        realized += net
        unrealized += pnl.unrealized_pnl
        if pnl.position_qty > 0:
            open_positions += 1

        if trade.status == "close":
            if net > 0:
                wins += 1
                gross_wins += net
            elif net < 0:
                losses += 1
                gross_losses += abs(net)
            else:
                breakeven += 1

        broker = trade.account.broker if trade.account and trade.account.broker else None
        broker_id = broker.id if broker else trade.account_id
        mode = str(broker.capital_gain_mode if broker else "immediate").lower()
        rate = Decimal(str(broker.capital_gain_rate if broker else Decimal("26")))
        yearly_tax_currency.add((trade.account.base_currency if trade.account else "EUR").upper())
        if closed_at >= year_start:
            if mode == "year_end":
                year_end_buckets[broker_id] += net
                year_end_rates.setdefault(broker_id, rate)
            else:
                taxable = net if net > 0 else Decimal("0")
                immediate_tax += taxable * rate / Decimal("100")
                if net < 0:
                    loss_offset += abs(net)

        month_key = closed_at.strftime("%Y-%m")
        bucket = monthly.setdefault(month_key, {"realized": Decimal("0"), "count": 0})
        bucket["realized"] += net
        bucket["count"] += 1

        iso_year, iso_week, _ = closed_at.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        w_bucket = weekly.setdefault(week_key, {"realized": Decimal("0"), "count": 0})
        w_bucket["realized"] += net
        w_bucket["count"] += 1

        trade_rows.append(
            {
                "trade": trade,
                "net": net,
                "return_pct": pnl.return_pct,
                "closed_at": closed_at,
            }
        )

    for broker_id, net_pnl in year_end_buckets.items():
        rate = year_end_rates.get(broker_id, Decimal("26"))
        if net_pnl > 0:
            immediate_tax += net_pnl * rate / Decimal("100")
        else:
            loss_offset += abs(net_pnl)

    snapshots = db.execute(select(PositionDailySnapshot)).scalars().all()
    equity_curve = [
        {
            "date": s.snapshot_date.isoformat(),
            "value": float(s.market_value),
        }
        for s in snapshots
    ]

    kpi_currency = "EUR"
    if len(currencies) == 1:
        kpi_currency = next(iter(currencies))
    elif len(currencies) > 1:
        kpi_currency = "MIX"

    tax_currency = next(iter(yearly_tax_currency), kpi_currency)

    win_rate = (
        Decimal(wins) / Decimal(wins + losses) * Decimal("100")
    ) if (wins + losses) > 0 else Decimal("0")
    profit_factor = (
        gross_wins / gross_losses if gross_losses > 0 else (gross_wins if wins > 0 else Decimal("0"))
    )
    avg_win = gross_wins / wins if wins > 0 else Decimal("0")
    avg_loss = gross_losses / losses if losses > 0 else Decimal("0")

    nonzero = [row for row in trade_rows if row["net"] != 0]
    best = max(nonzero, key=lambda row: row["net"]) if nonzero else None
    worst = min(nonzero, key=lambda row: row["net"]) if nonzero else None

    def trade_stat(row: dict) -> dict:
        trade = row["trade"]
        return {
            "symbol": trade.symbol,
            "side": trade.side,
            "status": trade.status,
            "net_pnl": str(row["net"]),
            "return_pct": float(row["return_pct"]),
            "closed_date": row["closed_at"].date().isoformat() if trade.status == "close" else None,
        }

    top_trades = [trade_stat(row) for row in sorted(trade_rows, key=lambda r: r["net"], reverse=True)[:8]]

    monthly_pnl = [
        {"month": key, "realized": str(bucket["realized"]), "count": bucket["count"]}
        for key, bucket in sorted(monthly.items())
    ]

    weekly_pnl = [
        {"week": key, "realized": str(bucket["realized"]), "count": bucket["count"]}
        for key, bucket in sorted(weekly.items())
    ]

    # ── Portfolio & Trades combined equity and cost basis history ────────
    account_ids = (
        db.execute(select(Account.id).where(Account.user_id == current_user.id)).scalars().all()
    )

    # 1. Holdings snapshots (PortfolioSnapshot) per account & date
    ps_by_acc_date: dict[tuple[int, date], tuple[Decimal, Decimal]] = {}
    if account_ids:
        ps_rows = (
            db.execute(
                select(PortfolioSnapshot)
                .where(PortfolioSnapshot.account_id.in_(account_ids))
                .order_by(PortfolioSnapshot.snapshot_date)
            )
            .scalars()
            .all()
        )
        for ps in ps_rows:
            # Fallback to total_cost if total_value was saved as 0 due to historical missing quote
            val = ps.total_value if ps.total_value > Decimal("0") else ps.total_cost
            ps_by_acc_date[(ps.account_id, ps.snapshot_date)] = (val, ps.total_cost)

    # 2. Open trade positions snapshots (PositionDailySnapshot) per account & date
    pds_by_acc_date: dict[tuple[int, date], dict[str, Decimal]] = defaultdict(
        lambda: {"val": Decimal("0"), "cost": Decimal("0")}
    )
    if account_ids:
        pds_rows = (
            db.execute(
                select(PositionDailySnapshot)
                .where(PositionDailySnapshot.account_id.in_(account_ids))
                .order_by(PositionDailySnapshot.snapshot_date)
            )
            .scalars()
            .all()
        )
        for pds in pds_rows:
            # Nominal cost basis of position = market_value - unrealized_pnl
            pos_cost = max(Decimal("0"), pds.market_value - pds.unrealized_pnl)
            pds_entry = pds_by_acc_date[(pds.account_id, pds.snapshot_date)]
            pds_entry["val"] += pds.market_value
            pds_entry["cost"] += pos_cost

    # Collect all historical snapshot dates across all user accounts
    all_dates = sorted(
        set([d for _, d in ps_by_acc_date.keys()] + [d for _, d in pds_by_acc_date.keys()])
    )

    by_date: dict[date, dict[str, Decimal]] = {}
    last_ps = {acc_id: (Decimal("0"), Decimal("0")) for acc_id in account_ids}
    last_pds = {acc_id: (Decimal("0"), Decimal("0")) for acc_id in account_ids}

    for d in all_dates:
        for acc_id in account_ids:
            if (acc_id, d) in ps_by_acc_date:
                last_ps[acc_id] = ps_by_acc_date[(acc_id, d)]
            if (acc_id, d) in pds_by_acc_date:
                pds_item = pds_by_acc_date[(acc_id, d)]
                last_pds[acc_id] = (pds_item["val"], pds_item["cost"])

        tot_val = sum(last_ps[a][0] + last_pds[a][0] for a in account_ids)
        tot_cost = sum(last_ps[a][1] + last_pds[a][1] for a in account_ids)
        by_date[d] = {"value": tot_val, "cost": tot_cost}

    # 3. Live current day mark-to-market and nominal cost basis
    holding_details = get_holding_details(db, current_user.id)
    live_holdings_val = sum((h.market_value for h in holding_details), Decimal("0"))
    live_holdings_cost = sum((h.avg_cost * h.quantity for h in holding_details), Decimal("0"))

    live_trades_val = Decimal("0")
    live_trades_cost = Decimal("0")
    earliest_open_date: date | None = None

    for trade in trades:
        if trade.status == "open":
            t_execs = executions_by_trade.get(trade.id, [])
            if t_execs:
                t_pnl = compute_weighted_average_pnl(t_execs)
                if t_pnl.position_qty > Decimal("0"):
                    live_trades_val += t_pnl.market_value
                    live_trades_cost += t_pnl.average_entry_price * abs(t_pnl.position_qty)
                    for ex in t_execs:
                        ex_date = ex.executed_at.date()
                        if earliest_open_date is None or ex_date < earliest_open_date:
                            earliest_open_date = ex_date

    for h in holding_details:
        if earliest_open_date is None or h.entry_date < earliest_open_date:
            earliest_open_date = h.entry_date

    today = date.today()
    live_total_val = live_holdings_val + live_trades_val
    live_total_cost = live_holdings_cost + live_trades_cost

    if live_total_cost > Decimal("0") or live_total_val > Decimal("0") or not by_date:
        by_date[today] = {"value": live_total_val, "cost": live_total_cost}

    # Ensure at least 2 points if active positions exist so the chart can draw
    if len(by_date) == 1 and live_total_cost > Decimal("0"):
        start_date = (
            earliest_open_date
            if earliest_open_date and earliest_open_date < today
            else (today - timedelta(days=1))
        )
        if start_date not in by_date:
            by_date[start_date] = {"value": live_total_cost, "cost": live_total_cost}

    portfolio_history = []
    for snapshot_date in sorted(by_date):
        value = by_date[snapshot_date]["value"]
        cost = by_date[snapshot_date]["cost"]
        return_pct = (value - cost) / cost * Decimal("100") if cost else Decimal("0")
        portfolio_history.append(
            {
                "date": snapshot_date.isoformat(),
                "value": float(value),
                "cost": float(cost),
                "return_pct": float(return_pct),
            }
        )
    by_symbol: dict[str, dict] = {}
    total_market_value = Decimal("0")
    for holding in holding_details:
        total_market_value += holding.market_value
        entry = by_symbol.setdefault(
            holding.asset_symbol,
            {
                "name": holding.asset_name,
                "instrument_type": holding.instrument_type,
                "market_value": Decimal("0"),
            },
        )
        entry["market_value"] += holding.market_value

    sorted_symbols = sorted(
        by_symbol.items(), key=lambda item: item[1]["market_value"], reverse=True
    )
    asset_allocation = [
        {
            "symbol": symbol,
            "name": entry["name"],
            "instrument_type": entry["instrument_type"],
            "market_value": str(entry["market_value"]),
            "weight_pct": float(
                entry["market_value"] / total_market_value * Decimal("100")
            )
            if total_market_value
            else 0.0,
        }
        for symbol, entry in sorted_symbols[:8]
    ]

    by_class: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for symbol, entry in by_symbol.items():
        by_class[entry["instrument_type"]] += entry["market_value"]
    asset_classes = [
        {
            "instrument_type": instrument_type,
            "market_value": str(market_value),
            "weight_pct": float(market_value / total_market_value * Decimal("100"))
            if total_market_value
            else 0.0,
        }
        for instrument_type, market_value in sorted(
            by_class.items(), key=lambda item: item[1], reverse=True
        )
    ]

    return {
        "trade_count": len(trades),
        "wins": wins,
        "losses": losses,
        "breakeven": breakeven,
        "win_rate": float(win_rate),
        "profit_factor": float(profit_factor),
        "gross_wins": str(gross_wins),
        "gross_losses": str(gross_losses),
        "avg_win": str(avg_win),
        "avg_loss": str(avg_loss),
        "best_trade": trade_stat(best) if best else None,
        "worst_trade": trade_stat(worst) if worst else None,
        "top_trades": top_trades,
        "monthly_pnl": monthly_pnl,
        "weekly_pnl": weekly_pnl,
        "open_positions": open_positions,
        "realized_pnl": str(realized),
        "unrealized_pnl": str(unrealized),
        "total_pnl": str(realized + unrealized),
        "kpi_currency": kpi_currency,
        "capital_gain_tax_estimate": str(immediate_tax),
        "capital_gain_loss_offset": str(loss_offset),
        "capital_gain_currency": tax_currency,
        "equity_curve": equity_curve,
        "portfolio_history": portfolio_history,
        "all_assets_daily_pnl": [
            point.model_dump() for point in get_all_assets_pnl_series(db, current_user.id)
        ],
        "asset_allocation": asset_allocation,
        "asset_classes": asset_classes,
    }