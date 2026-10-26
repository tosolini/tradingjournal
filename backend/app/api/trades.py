from datetime import UTC, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error, translate
from app.models import Account, Broker, Ticker, Trade, TradeExecution, TradeImage, User
from app.schemas import (
    ExecutionCreate,
    ExecutionResponse,
    ExecutionUpdate,
    TradeCloseRequest,
    TradeClosureSummary,
    RecentExecutionResponse,
    TradeCreate,
    TradeDetailResponse,
    TradeResponse,
    TradeUpdate,
    TradeImageResponse,
)
from app.services.pnl import compute_weighted_average_pnl
from app.services.price_provider import get_current_price

router = APIRouter(prefix="/api/trades", tags=["trades"])


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.000001"))


def _determine_monthly_volume_tier(
    trade: Trade,
    executed_at: datetime | None,
    db: Session | None,
) -> int:
    broker = trade.account.broker if trade.account else None
    if not broker or db is None:
        return 1

    target_dt = executed_at or datetime.now(timezone.utc)
    if target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=timezone.utc)

    start_of_month = datetime(target_dt.year, target_dt.month, 1, 0, 0, 0, tzinfo=target_dt.tzinfo)
    if target_dt.month == 12:
        start_of_next_month = datetime(target_dt.year + 1, 1, 1, 0, 0, 0, tzinfo=target_dt.tzinfo)
    else:
        start_of_next_month = datetime(target_dt.year, target_dt.month + 1, 1, 0, 0, 0, tzinfo=target_dt.tzinfo)

    account_ids = [acc.id for acc in broker.accounts]
    if not account_ids:
        account_ids = [trade.account_id]

    monthly_comm_stmt = select(func.coalesce(func.sum(TradeExecution.fee), Decimal("0"))).join(
        Trade, TradeExecution.trade_id == Trade.id
    ).where(
        Trade.account_id.in_(account_ids),
        TradeExecution.executed_at >= start_of_month,
        TradeExecution.executed_at < start_of_next_month,
    )
    total_monthly_fees = db.execute(monthly_comm_stmt).scalar() or Decimal("0")

    if total_monthly_fees < Decimal("99.00"):
        return 1
    elif total_monthly_fees < Decimal("1500.00"):
        return 2
    elif total_monthly_fees < Decimal("2500.00"):
        return 3
    else:
        return 4


def _compute_execution_fee(
    trade: Trade,
    quantity: Decimal,
    price: Decimal,
    currency: str | None = None,
    executed_at: datetime | None = None,
    db: Session | None = None,
) -> Decimal:
    broker = trade.account.broker if trade.account else None
    if not broker:
        return Decimal("0")

    fee_mode = str(broker.fee_mode or "fixed").lower()
    fee_value = Decimal(str(broker.fee_value or Decimal("0")))
    if fee_value < 0:
        fee_value = Decimal("0")

    market_str = str(trade.market or "").upper()
    trade_curr = str(currency or (trade.account.base_currency if trade.account else "EUR") or "EUR").upper()
    is_usd = trade_curr == "USD" or any(us in market_str for us in ["US", "NYSE", "NASDAQ", "AMEX"])

    if fee_mode == "fixed":
        return _quantize(fee_value)

    elif fee_mode == "percent":
        notional = Decimal(str(quantity)) * Decimal(str(price))
        return _quantize((notional * fee_value) / Decimal("100"))

    elif fee_mode == "percent_min_max":
        notional = Decimal(str(quantity)) * Decimal(str(price))
        calculated = (notional * fee_value) / Decimal("100")
        if broker.fee_min is not None and calculated < broker.fee_min:
            calculated = broker.fee_min
        if broker.fee_max is not None and calculated > broker.fee_max:
            calculated = broker.fee_max
        return _quantize(calculated)

    elif fee_mode == "under_30":
        if is_usd:
            usd_fee = broker.fee_us_value if broker.fee_us_value is not None else Decimal("3.95")
            return _quantize(usd_fee)
        eur_fee = broker.fee_value if broker.fee_value > Decimal("0") else Decimal("2.95")
        return _quantize(eur_fee)

    elif fee_mode == "tiered_volume":
        tier = broker.fee_tier_override
        if tier not in {1, 2, 3, 4} and db is not None:
            tier = _determine_monthly_volume_tier(trade, executed_at, db)
        elif tier not in {1, 2, 3, 4}:
            tier = 1

        tier_rates_eur = {
            1: Decimal("19.00"),
            2: Decimal("9.95"),
            3: Decimal("6.95"),
            4: Decimal("2.95"),
        }
        tier_rates_usd = {
            1: Decimal("12.95"),
            2: Decimal("9.95"),
            3: Decimal("8.95"),
            4: Decimal("3.95"),
        }
        if is_usd:
            return _quantize(tier_rates_usd.get(tier, Decimal("12.95")))
        return _quantize(tier_rates_eur.get(tier, Decimal("19.00")))

    return _quantize(fee_value)


def _trade_currency(trade: Trade) -> str:
    return trade.account.base_currency if trade.account and trade.account.base_currency else "EUR"


def _close_action(side: str) -> str:
    return "SELL" if side == "long" else "BUY"


def _capital_gain_tax(
    net_pnl: Decimal,
    broker: Broker | None,
    instrument_type: str = "stock",
    request: Request | None = None,
) -> tuple[str, Decimal, Decimal | None, str | None]:
    mode = str(broker.capital_gain_mode or "immediate").lower() if broker else "immediate"
    is_gov = str(instrument_type or "stock").strip().lower() in {"government_bond", "titolo_di_stato"}
    if is_gov:
        rate = Decimal(str(broker.capital_gain_rate_gov if broker else Decimal("12.50")))
    else:
        rate = Decimal(str(broker.capital_gain_rate if broker else Decimal("26.00")))

    if mode == "year_end":
        return mode, rate, None, translate("notes.tax_deferred_dashboard", request=request)
    taxable = net_pnl if net_pnl > 0 else Decimal("0")
    tax = _quantize((taxable * rate) / Decimal("100"))
    return mode, rate, tax, None


def _trade_closure_summary(
    trade: Trade,
    executions: list[TradeExecution],
    request: Request | None = None,
) -> TradeClosureSummary | None:
    if not executions or trade.status != "close":
        return None

    pnl = compute_weighted_average_pnl(executions)
    exit_execution = sorted(executions, key=lambda item: item.executed_at)[-1]
    broker = trade.account.broker if trade.account and trade.account.broker else None
    capital_gain_mode, capital_gain_rate, capital_gain_tax_estimate, tax_note = _capital_gain_tax(
        pnl.net_realized_pnl, broker, instrument_type=trade.instrument_type, request=request
    )
    gross_pnl = _quantize(pnl.net_realized_pnl + pnl.total_fees)

    return TradeClosureSummary(
        closed_at=trade.closed_at or exit_execution.executed_at,
        close_reason=trade.close_reason,
        instrument_type=trade.instrument_type or "stock",
        exit_action=exit_execution.action,
        exit_price=_quantize(Decimal(str(exit_execution.price))),
        exit_fee=_quantize(Decimal(str(exit_execution.fee))),
        exit_currency=exit_execution.currency,
        gross_pnl=gross_pnl,
        net_pnl=_quantize(pnl.net_realized_pnl),
        capital_gain_mode=capital_gain_mode,
        capital_gain_rate=_quantize(capital_gain_rate),
        capital_gain_tax_estimate=capital_gain_tax_estimate,
        tax_note=tax_note,
        total_fees=_quantize(pnl.total_fees),
    )


def _trade_response_with_metrics(
    trade: Trade, executions: list[TradeExecution], market_price: Decimal | None = None
) -> TradeResponse:
    if not executions:
        response = TradeResponse.model_validate(trade)
        payload = response.model_dump()
        payload["account_currency"] = trade.account.base_currency if trade.account else "EUR"
        payload["close_reason"] = trade.close_reason
        payload["closed_at"] = trade.closed_at
        payload["ticker_id"] = trade.ticker_id
        payload["isin"] = trade.ticker.isin if trade.ticker else trade.isin
        payload["instrument_type"] = trade.instrument_type or "stock"
        return TradeResponse.model_validate(payload)

    buys = [ex for ex in executions if ex.action.upper() == "BUY"]
    sells = [ex for ex in executions if ex.action.upper() == "SELL"]

    buy_qty = sum((Decimal(str(ex.quantity)) for ex in buys), Decimal("0"))
    sell_qty = sum((Decimal(str(ex.quantity)) for ex in sells), Decimal("0"))
    entry_total = sum((Decimal(str(ex.price)) * Decimal(str(ex.quantity)) for ex in buys), Decimal("0"))
    exit_total = sum((Decimal(str(ex.price)) * Decimal(str(ex.quantity)) for ex in sells), Decimal("0"))

    avg_entry = entry_total / buy_qty if buy_qty > 0 else None
    avg_exit = exit_total / sell_qty if sell_qty > 0 else None

    earliest_exec = min(ex.executed_at for ex in executions)
    latest_exec = max(ex.executed_at for ex in executions)

    if earliest_exec.tzinfo is None:
        earliest_exec = earliest_exec.replace(tzinfo=UTC)
    if latest_exec.tzinfo is None:
        latest_exec = latest_exec.replace(tzinfo=UTC)

    hold_end = latest_exec if sells else datetime.now(UTC)
    hold_hours = Decimal(str((hold_end - earliest_exec).total_seconds() / 3600))

    pnl = compute_weighted_average_pnl(executions, market_price=market_price)
    net_return = pnl.net_realized_pnl + pnl.unrealized_pnl

    payload = {
        "id": trade.id,
        "account_id": trade.account_id,
        "ticker_id": trade.ticker_id,
        "market": trade.market,
        "symbol": trade.symbol,
        "isin": trade.ticker.isin if trade.ticker else trade.isin,
        "instrument_type": trade.instrument_type or "stock",
        "side": trade.side,
        "status": trade.status,
        "strategy_name": trade.strategy_name,
        "tags": trade.tags,
        "target_price": trade.target_price,
        "stop_loss": trade.stop_loss,
        "confidence_score": trade.confidence_score,
        "journal_notes": trade.journal_notes,
        "account_currency": trade.account.base_currency if trade.account else "EUR",
        "created_at": trade.created_at,
        "average_entry_price": _quantize(avg_entry) if avg_entry is not None else None,
        "average_exit_price": _quantize(avg_exit) if avg_exit is not None else None,
        "entry_total": _quantize(entry_total),
        "exit_total": _quantize(exit_total),
        "open_position_qty": pnl.position_qty,
        "hold_duration_hours": _quantize(hold_hours),
        "net_return": _quantize(net_return),
        "return_pct": pnl.return_pct,
    }
    return TradeResponse.model_validate(payload)


@router.post("", response_model=TradeResponse)
def create_trade(
    payload: TradeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = db.get(Account, payload.account_id)
    if not account or account.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.account_not_found", request=request)

    data = payload.model_dump()
    if payload.ticker_id:
        ticker = db.get(Ticker, payload.ticker_id)
        if ticker:
            data["symbol"] = ticker.symbol
            data["isin"] = ticker.isin
            data["market"] = ticker.market

    trade = Trade(user_id=current_user.id, **data)
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return TradeResponse.model_validate(trade)


@router.get("", response_model=list[TradeResponse])
def list_trades(
    account_id: int | None = Query(default=None),
    symbol: str | None = Query(default=None),
    status: str | None = Query(default=None),
    side: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    limit: int = Query(default=100, le=200),
    offset: int = Query(default=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Trade).where(Trade.user_id == current_user.id)
    if account_id is not None:
        stmt = stmt.where(Trade.account_id == account_id)
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol)
    if status:
        stmt = stmt.where(Trade.status == status)
    if side:
        stmt = stmt.where(Trade.side == side)
    if from_date:
        stmt = stmt.where(Trade.created_at >= from_date)
    if to_date:
        stmt = stmt.where(Trade.created_at <= to_date)
    stmt = stmt.order_by(Trade.created_at.desc()).limit(limit).offset(offset)
    trades = db.execute(stmt).scalars().all()

    responses: list[TradeResponse] = []
    for trade in trades:
        executions = db.execute(
            select(TradeExecution).where(TradeExecution.trade_id == trade.id)
        ).scalars().all()
        responses.append(_trade_response_with_metrics(trade, executions))
    return responses


@router.get("/{trade_id}", response_model=TradeDetailResponse)
def trade_detail(
    trade_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)
    executions = db.execute(
        select(TradeExecution).where(TradeExecution.trade_id == trade.id)
    ).scalars().all()
    images = db.execute(select(TradeImage).where(TradeImage.trade_id == trade.id)).scalars().all()

    # Fetch market price for open trades
    market_price = None
    if trade.status == "open":
        market_price = get_current_price(trade.symbol, trade.market)

    pnl = compute_weighted_average_pnl(executions, market_price=market_price) if executions else None
    closure = _trade_closure_summary(trade, executions, request=request)
    return {
        "trade": _trade_response_with_metrics(trade, executions, market_price=market_price),
        "executions": [ExecutionResponse.model_validate(ex) for ex in executions],
        "images": [TradeImageResponse.model_validate(image) for image in images],
        "pnl": pnl.__dict__ if pnl else None,
        "closure": closure.model_dump() if closure else None,
        "current_price": market_price,
    }


@router.post("/{trade_id}/executions", response_model=ExecutionResponse)
def add_execution(
    trade_id: int,
    payload: ExecutionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    data = payload.model_dump()
    quantity = Decimal(str(data["quantity"]))
    price = Decimal(str(data["price"]))
    if payload.fee is not None and payload.fee > Decimal("0"):
        data["fee"] = payload.fee
    else:
        data["fee"] = _compute_execution_fee(
            trade, quantity, price, currency=payload.currency, executed_at=payload.executed_at, db=db
        )

    execution = TradeExecution(trade_id=trade.id, **data)
    db.add(execution)
    db.commit()
    db.refresh(execution)
    return execution


@router.post("/{trade_id}/close", response_model=TradeDetailResponse)
def close_trade(
    trade_id: int,
    payload: TradeCloseRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)
    if trade.status == "close":
        raise localized_error(status_code=400, code="errors.trade_already_closed", request=request)

    executions = db.execute(
        select(TradeExecution).where(TradeExecution.trade_id == trade.id)
    ).scalars().all()
    pnl = compute_weighted_average_pnl(executions) if executions else None
    if not pnl or pnl.position_qty <= 0:
        raise localized_error(status_code=400, code="errors.no_open_position_to_close", request=request)

    closing_quantity = pnl.position_qty
    closing_action = _close_action(trade.side)
    closing_fee = _compute_execution_fee(
        trade, closing_quantity, payload.price, currency=_trade_currency(trade), executed_at=payload.executed_at, db=db
    )
    closing_execution = TradeExecution(
        trade_id=trade.id,
        action=closing_action,
        executed_at=payload.executed_at,
        quantity=closing_quantity,
        price=payload.price,
        fee=closing_fee,
        currency=_trade_currency(trade),
        note=payload.note or payload.close_reason,
    )
    trade.status = "close"
    trade.close_reason = payload.close_reason
    trade.closed_at = payload.executed_at

    db.add(closing_execution)
    db.commit()
    db.refresh(trade)
    db.refresh(closing_execution)

    return trade_detail(trade_id, request=request, db=db, current_user=current_user)


@router.patch("/{trade_id}", response_model=TradeResponse)
def update_trade(
    trade_id: int,
    payload: TradeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    updates = payload.model_dump(exclude_unset=True)
    if "account_id" in updates and updates["account_id"] is not None:
        account = db.get(Account, updates["account_id"])
        if not account or account.user_id != current_user.id:
            raise localized_error(status_code=400, code="errors.account_not_found", request=request)

    if "ticker_id" in updates and updates["ticker_id"]:
        ticker = db.get(Ticker, updates["ticker_id"])
        if ticker:
            updates["symbol"] = ticker.symbol
            updates["isin"] = ticker.isin
            updates["market"] = ticker.market

    for field, value in updates.items():
        setattr(trade, field, value)

    db.commit()
    db.refresh(trade)
    executions = db.execute(
        select(TradeExecution).where(TradeExecution.trade_id == trade.id)
    ).scalars().all()
    return _trade_response_with_metrics(trade, executions)


@router.patch("/{trade_id}/executions/{execution_id}", response_model=ExecutionResponse)
def update_execution(
    trade_id: int,
    execution_id: int,
    payload: ExecutionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    execution = db.get(TradeExecution, execution_id)
    if not execution or execution.trade_id != trade.id:
        raise localized_error(status_code=404, code="errors.execution_not_found", request=request)

    updates = payload.model_dump(exclude_unset=True)

    if "fee" not in updates:
        next_quantity = Decimal(str(updates.get("quantity", execution.quantity)))
        next_price = Decimal(str(updates.get("price", execution.price)))
        next_executed_at = updates.get("executed_at", execution.executed_at)
        next_currency = updates.get("currency", execution.currency)
        updates["fee"] = _compute_execution_fee(
            trade, next_quantity, next_price, currency=next_currency, executed_at=next_executed_at, db=db
        )

    for field, value in updates.items():
        setattr(execution, field, value)

    db.commit()
    db.refresh(execution)
    return execution


@router.get("/executions/recent", response_model=list[RecentExecutionResponse])
def recent_executions(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(TradeExecution, Trade.symbol)
        .join(Trade, Trade.id == TradeExecution.trade_id)
        .where(Trade.user_id == current_user.id)
        .order_by(TradeExecution.executed_at.desc())
        .limit(limit)
    ).all()

    return [
        RecentExecutionResponse(
            id=execution.id,
            trade_id=execution.trade_id,
            trade_symbol=symbol,
            action=execution.action,
            executed_at=execution.executed_at,
            quantity=execution.quantity,
            price=execution.price,
            fee=execution.fee,
            currency=execution.currency,
        )
        for execution, symbol in rows
    ]


@router.delete("/{trade_id}")
def delete_trade(
    trade_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    db.delete(trade)
    db.commit()
    return {"deleted": True, "trade_id": trade_id}
