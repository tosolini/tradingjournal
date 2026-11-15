import calendar as py_calendar
from datetime import UTC, date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import DailyNote, HoldingExit, Trade, TradeExecution, User
from app.services.calendar import EuronextCalendarProvider
from app.services.pnl import compute_weighted_average_pnl
from app.services.portfolio import get_daily_pnl_series, get_holding_details

router = APIRouter(prefix="/api/market-calendar", tags=["market-calendar"])


@router.get("/today")
def market_calendar_today():
    provider = EuronextCalendarProvider()
    now = datetime.now()
    today = now.date()
    return {
        "timezone": provider.timezone,
        "date": today.isoformat(),
        "is_trading_day": provider.is_trading_day(today),
        "is_after_cutoff": provider.is_after_cutoff(now),
        "cutoff": provider.cutoff,
    }


@router.get("/journal-month")
def journal_month(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    month_start = date(year, month, 1)
    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)

    _, days_in_month = py_calendar.monthrange(year, month)

    # 1. Initialize days bucket for all dates in the month
    days: dict[str, dict] = {}
    for d in range(1, days_in_month + 1):
        iso_str = f"{year}-{month:02d}-{d:02d}"
        days[iso_str] = {
            "date": iso_str,
            "notes": [],
            "executions": [],
            "pnl": {
                "stock": 0.0,
                "etf": 0.0,
                "bond": 0.0,
                "total": 0.0,
            },
        }

    # 2. Daily Notes
    notes = db.execute(
        select(DailyNote)
        .where(
            DailyNote.user_id == current_user.id,
            DailyNote.note_date >= month_start,
            DailyNote.note_date < next_month_start,
        )
        .order_by(DailyNote.note_date.asc())
    ).scalars().all()

    for note in notes:
        key = note.note_date.isoformat()
        day_bucket = days.setdefault(
            key,
            {
                "date": key,
                "notes": [],
                "executions": [],
                "pnl": {"stock": 0.0, "etf": 0.0, "bond": 0.0, "total": 0.0},
            },
        )
        day_bucket["notes"].append(
            {
                "id": note.id,
                "mood": note.mood,
                "summary": note.short_summary,
                "text": note.rich_text,
                "market_condition": note.market_condition,
            }
        )

    # 3. Executions with instrument_type
    exec_rows = db.execute(
        select(TradeExecution, Trade.symbol, Trade.instrument_type)
        .join(Trade, Trade.id == TradeExecution.trade_id)
        .where(
            Trade.user_id == current_user.id,
            TradeExecution.executed_at >= datetime.combine(month_start, time.min, tzinfo=UTC),
            TradeExecution.executed_at < datetime.combine(next_month_start, time.min, tzinfo=UTC),
        )
        .order_by(TradeExecution.executed_at.desc())
    ).all()

    for execution, symbol, inst_type in exec_rows:
        key = execution.executed_at.date().isoformat()
        day_bucket = days.setdefault(
            key,
            {
                "date": key,
                "notes": [],
                "executions": [],
                "pnl": {"stock": 0.0, "etf": 0.0, "bond": 0.0, "total": 0.0},
            },
        )
        if len(day_bucket["executions"]) >= 5:
            continue
        raw_type = (inst_type or "stock").strip().lower()
        norm_type = (
            "etf"
            if raw_type == "etf"
            else ("bond" if raw_type in {"bond", "government_bond", "titolo_di_stato"} else "stock")
        )
        day_bucket["executions"].append(
            {
                "id": execution.id,
                "trade_id": execution.trade_id,
                "symbol": symbol,
                "instrument_type": norm_type,
                "action": execution.action,
                "executed_at": execution.executed_at.isoformat(),
                "quantity": float(execution.quantity),
                "price": float(execution.price),
                "fee": float(execution.fee),
                "currency": execution.currency,
            }
        )

    # 4. Compute realized PnL by date and asset category from closed trades
    daily_realized: dict[str, dict[str, Decimal]] = {}
    closed_trades = db.execute(
        select(Trade)
        .options(joinedload(Trade.executions))
        .where(
            Trade.user_id == current_user.id,
            Trade.status == "close",
            Trade.closed_at >= datetime.combine(month_start, time.min, tzinfo=UTC),
            Trade.closed_at < datetime.combine(next_month_start, time.min, tzinfo=UTC),
        )
    ).unique().scalars().all()

    for trade in closed_trades:
        if not trade.closed_at or not trade.executions:
            continue
        pnl = compute_weighted_average_pnl(trade.executions)
        net = pnl.net_realized_pnl
        key = trade.closed_at.date().isoformat()
        bucket = daily_realized.setdefault(
            key, {"stock": Decimal("0"), "etf": Decimal("0"), "bond": Decimal("0"), "total": Decimal("0")}
        )
        raw_type = (trade.instrument_type or "stock").strip().lower()
        cat = (
            "etf"
            if raw_type == "etf"
            else ("bond" if raw_type in {"bond", "government_bond", "titolo_di_stato"} else "stock")
        )
        bucket[cat] += net
        bucket["total"] += net

    # 5. Compute realized PnL from holding exits
    holding_exits = db.execute(
        select(HoldingExit)
        .options(joinedload(HoldingExit.asset))
        .where(
            HoldingExit.user_id == current_user.id,
            HoldingExit.exit_date >= month_start,
            HoldingExit.exit_date < next_month_start,
        )
    ).scalars().all()

    for exit_event in holding_exits:
        key = exit_event.exit_date.isoformat()
        bucket = daily_realized.setdefault(
            key, {"stock": Decimal("0"), "etf": Decimal("0"), "bond": Decimal("0"), "total": Decimal("0")}
        )
        raw_type = (
            (exit_event.asset.instrument_type or "etf").strip().lower()
            if exit_event.asset
            else "etf"
        )
        cat = (
            "etf"
            if raw_type == "etf"
            else ("bond" if raw_type in {"bond", "government_bond", "titolo_di_stato"} else "stock")
        )
        bucket[cat] += exit_event.realized_pnl
        bucket["total"] += exit_event.realized_pnl

    # 6. Portfolio snapshot day_pnl for dates without direct trade closures
    total_holding_val = Decimal("0")
    holding_weights = {"stock": Decimal("0"), "etf": Decimal("0"), "bond": Decimal("0")}
    details = get_holding_details(db, current_user.id)
    for h in details:
        itype = (h.instrument_type or "etf").strip().lower()
        cat = (
            "etf"
            if itype == "etf"
            else ("bond" if itype in {"bond", "government_bond", "titolo_di_stato"} else "stock")
        )
        holding_weights[cat] += h.market_value
        total_holding_val += h.market_value

    if total_holding_val > 0:
        stock_ratio = holding_weights["stock"] / total_holding_val
        etf_ratio = holding_weights["etf"] / total_holding_val
        bond_ratio = holding_weights["bond"] / total_holding_val
    else:
        stock_ratio = Decimal("0.5")
        etf_ratio = Decimal("0.5")
        bond_ratio = Decimal("0")

    daily_pnl_series = get_daily_pnl_series(db, current_user.id)
    month_prefix = f"{year}-{month:02d}"
    daily_snapshot_pnl: dict[str, Decimal] = {}
    for point in daily_pnl_series:
        if point.date.startswith(month_prefix):
            daily_snapshot_pnl[point.date] = Decimal(str(point.day_pnl))

    # 7. Merge into days bucket
    month_totals = {
        "stock": Decimal("0"),
        "etf": Decimal("0"),
        "bond": Decimal("0"),
        "total": Decimal("0"),
    }
    for iso_str, day_data in days.items():
        if iso_str in daily_realized:
            r = daily_realized[iso_str]
            day_data["pnl"] = {
                "stock": round(float(r["stock"]), 2),
                "etf": round(float(r["etf"]), 2),
                "bond": round(float(r["bond"]), 2),
                "total": round(float(r["total"]), 2),
            }
        elif iso_str in daily_snapshot_pnl:
            snap_val = daily_snapshot_pnl[iso_str]
            day_data["pnl"] = {
                "stock": round(float(snap_val * stock_ratio), 2),
                "etf": round(float(snap_val * etf_ratio), 2),
                "bond": round(float(snap_val * bond_ratio), 2),
                "total": round(float(snap_val), 2),
            }
        for k in ("stock", "etf", "bond", "total"):
            month_totals[k] += Decimal(str(day_data["pnl"][k]))

    sorted_days = sorted(days.values(), key=lambda item: item["date"])
    return {
        "year": year,
        "month": month,
        "days": sorted_days,
        "month_pnl": {
            "stock": round(float(month_totals["stock"]), 2),
            "etf": round(float(month_totals["etf"]), 2),
            "bond": round(float(month_totals["bond"]), 2),
            "total": round(float(month_totals["total"]), 2),
        },
    }
