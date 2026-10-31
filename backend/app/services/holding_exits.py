from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Asset, BondDetail, CashLedgerEntry, Holding, HoldingExit
from app.schemas import (
    HoldingExitCreate,
    HoldingExitPreviewResponse,
    HoldingExitResponse,
)
from app.services.bonds import calculate_accrued_interest, get_bond_cash_flows
from app.services.portfolio import is_bond_instrument
from app.services.price_provider import get_current_price

EXIT_TYPES = {"market_sale", "maturity", "early_redemption"}
GOV_INSTRUMENT_TYPES = {"government_bond", "titolo_di_stato"}
logger = logging.getLogger(__name__)


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _q6(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def _load_holding(db: Session, user_id: int, holding_id: int) -> Holding | None:
    return db.execute(
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account).joinedload(Account.broker))
        .where(Holding.user_id == user_id, Holding.id == holding_id)
    ).scalars().first()


def _default_price(holding: Holding) -> Decimal:
    fetched = get_current_price(holding.asset.symbol, holding.asset.exchange)
    if fetched is not None and fetched > Decimal("0"):
        return fetched
    return holding.avg_cost


def _broker_tax_config(holding: Holding) -> tuple[str, Decimal]:
    broker = holding.account.broker if holding.account else None
    mode = str(broker.capital_gain_mode or "immediate").lower() if broker else "immediate"
    standard_rate = (
        Decimal(str(broker.capital_gain_rate)) if broker else Decimal("26.00")
    )
    gov_rate = (
        Decimal(str(broker.capital_gain_rate_gov)) if broker else Decimal("12.50")
    )
    is_gov = (holding.asset.instrument_type or "").strip().lower() in GOV_INSTRUMENT_TYPES
    return mode, (gov_rate if is_gov else standard_rate)


def _coupon_flows(
    holding: Holding, quantity: Decimal, exit_date: date
) -> tuple[Decimal, Decimal]:
    """Gross coupons and bonus accrued on the sold quantity up to exit_date."""
    bond_detail = holding.asset.bond_detail
    if not bond_detail:
        return Decimal("0"), Decimal("0")

    flows = get_bond_cash_flows(
        bond_detail=bond_detail,
        nominal=quantity,
        eligible_for_bonus=holding.eligible_for_bonus,
        from_date=holding.entry_date,
    )
    coupons = sum(
        (
            f.gross_amount
            for f in flows
            if f.flow_type == "coupon" and holding.entry_date <= f.date <= exit_date
        ),
        Decimal("0"),
    )
    bonus = sum(
        (
            f.gross_amount
            for f in flows
            if f.flow_type == "bonus" and holding.entry_date <= f.date <= exit_date
        ),
        Decimal("0"),
    )
    return coupons, bonus


def calculate_holding_exit(holding: Holding, payload: HoldingExitCreate) -> dict:
    """Compute an exit preview without persisting anything."""
    if holding.quantity <= Decimal("0"):
        raise ValueError("La tranche è già chiusa")

    exit_type = (payload.exit_type or "market_sale").strip().lower()
    if exit_type not in EXIT_TYPES:
        raise ValueError("Tipo di uscita non valido")

    is_bond = is_bond_instrument(holding.asset.instrument_type)
    bond_detail = holding.asset.bond_detail if is_bond else None
    today = date.today()

    if exit_type in {"maturity", "early_redemption"} and not is_bond:
        raise ValueError("Questo tipo di uscita è disponibile solo per le obbligazioni")

    if exit_type == "maturity":
        if not bond_detail:
            raise ValueError("La scadenza naturale è disponibile solo per le obbligazioni")
        exit_date = bond_detail.maturity_date
        if exit_date > today:
            raise ValueError("Il rimborso a scadenza non è ancora avvenuto")
    else:
        exit_date = payload.exit_date or today
        if exit_date > today:
            raise ValueError("La data di uscita non può essere nel futuro")
        if exit_date < holding.entry_date:
            raise ValueError("La data di uscita non può precedere la data di ingresso")

    quantity_before = holding.quantity
    quantity = quantity_before if exit_type == "maturity" else (
        payload.quantity if payload.quantity is not None else quantity_before
    )
    if quantity <= Decimal("0") or quantity > quantity_before:
        raise ValueError("Quantità non valida")
    quantity_after = quantity_before - quantity

    if payload.clean_price is not None:
        clean_price = payload.clean_price
    elif exit_type in {"maturity", "early_redemption"}:
        clean_price = Decimal("100")
    else:
        clean_price = _default_price(holding)
    if clean_price <= Decimal("0"):
        raise ValueError("Prezzo di uscita non valido")

    if payload.accrued_interest_out is not None:
        accrued_out = payload.accrued_interest_out
    elif bond_detail and exit_type != "maturity":
        accrued_out = calculate_accrued_interest(
            bond_detail, exit_date, nominal=Decimal("100")
        )
    else:
        accrued_out = Decimal("0")
    if accrued_out < Decimal("0"):
        raise ValueError("Rateo di uscita non valido")

    fee_in = holding.fee_in or Decimal("0")
    fee_in_allocated = _q2(fee_in * quantity / quantity_before) if quantity_before else Decimal("0")
    fees = payload.fees or Decimal("0")
    if fees < Decimal("0"):
        raise ValueError("Commissioni non valide")

    computed_coupons, computed_bonus = _coupon_flows(holding, quantity, exit_date)
    coupons_received = (
        payload.coupons_received
        if payload.coupons_received is not None
        else computed_coupons
    )
    bonus_received = (
        payload.bonus_received
        if exit_type == "maturity" and payload.bonus_received is not None
        else (computed_bonus if exit_type == "maturity" else Decimal("0"))
    )
    if coupons_received < Decimal("0") or bonus_received < Decimal("0"):
        raise ValueError("Cedole/premio non validi")

    if is_bond:
        principal = quantity * clean_price / Decimal("100")
        accrued_out_amount = quantity * accrued_out / Decimal("100")
        cost_basis = (
            quantity * (holding.avg_cost + (holding.accrued_interest_in or Decimal("0")))
            / Decimal("100")
        ) + fee_in_allocated
        capital_gain = (
            principal
            - quantity * holding.avg_cost / Decimal("100")
            - fee_in_allocated
            - fees
        )
        interest_income = (
            accrued_out_amount
            + coupons_received
            + bonus_received
            - quantity * (holding.accrued_interest_in or Decimal("0")) / Decimal("100")
        )
    else:
        principal = quantity * clean_price
        accrued_out_amount = Decimal("0")
        cost_basis = quantity * holding.avg_cost + fee_in_allocated
        capital_gain = principal - quantity * holding.avg_cost - fee_in_allocated - fees
        interest_income = Decimal("0")

    gross_proceeds = principal + accrued_out_amount + coupons_received + bonus_received
    realized_pnl = capital_gain + interest_income

    tax_mode, capital_rate = _broker_tax_config(holding)
    bond_tax_rate = bond_detail.tax_rate if bond_detail else Decimal("0")
    capital_gain_tax = max(Decimal("0"), capital_gain) * capital_rate / Decimal("100")
    interest_tax = max(Decimal("0"), interest_income) * bond_tax_rate / Decimal("100")
    tax_estimate = capital_gain_tax + interest_tax

    taxes = payload.taxes if payload.taxes is not None else tax_estimate
    if taxes < Decimal("0"):
        raise ValueError("Imposte non valide")
    withheld_taxes = taxes if tax_mode == "immediate" else interest_tax
    net_proceeds = gross_proceeds - fees - withheld_taxes

    warnings: list[str] = []
    if (
        exit_type != "maturity"
        and holding.eligible_for_bonus
        and bond_detail
        and bond_detail.final_bonus_rate > Decimal("0")
    ):
        warnings.append(
            "Vendita anticipata: il premio fedeltà CUM non viene riconosciuto sulla quantità venduta."
        )
    if quantity_after > Decimal("0"):
        warnings.append(
            f"Vendita parziale: restano {_q6(quantity_after)} di quantità nella tranche."
        )
    else:
        warnings.append("La tranche verrà chiusa.")
    if tax_mode == "year_end" and capital_gain_tax > Decimal("0"):
        warnings.append(
            "Tassa sul capital gain differita a fine anno secondo la configurazione del broker."
        )

    coupon_net = coupons_received - (coupons_received * bond_tax_rate / Decimal("100"))
    bonus_net = bonus_received - (bonus_received * bond_tax_rate / Decimal("100"))
    ledger_entries: list[dict] = []
    if exit_type == "maturity":
        principal_net = net_proceeds - coupon_net - bonus_net
        if principal_net != Decimal("0"):
            ledger_entries.append(
                {
                    "entry_type": "bond_redemption",
                    "amount": _q2(abs(principal_net)),
                    "description": f"Rimborso a scadenza {holding.asset.symbol} (tranche {holding.id})",
                }
            )
        if coupon_net != Decimal("0"):
            ledger_entries.append(
                {
                    "entry_type": "coupon",
                    "amount": _q2(abs(coupon_net)),
                    "description": f"Cedole a scadenza {holding.asset.symbol} (tranche {holding.id})",
                }
            )
        if bonus_net != Decimal("0"):
            ledger_entries.append(
                {
                    "entry_type": "bond_bonus",
                    "amount": _q2(abs(bonus_net)),
                    "description": f"Premio fedeltà {holding.asset.symbol} (tranche {holding.id})",
                }
            )
    elif exit_type == "early_redemption":
        ledger_entries.append(
            {
                "entry_type": "bond_redemption",
                "amount": _q2(abs(net_proceeds)),
                "description": f"Rimborso anticipato emittente {holding.asset.symbol} (tranche {holding.id})",
            }
        )
    else:
        ledger_entries.append(
            {
                "entry_type": "asset_sale",
                "amount": _q2(abs(net_proceeds)),
                "description": f"Vendita {holding.asset.symbol} (tranche {holding.id})",
            }
        )

    return {
        "exit_type": exit_type,
        "exit_date": exit_date,
        "quantity": _q6(quantity),
        "quantity_before": _q6(quantity_before),
        "quantity_after": _q6(quantity_after),
        "clean_price": _q6(clean_price),
        "accrued_interest_out": _q6(accrued_out),
        "fees": _q2(fees),
        "taxes": _q2(taxes),
        "capital_gain_tax": _q2(capital_gain_tax),
        "interest_tax": _q2(interest_tax),
        "tax_mode": tax_mode,
        "fee_in_allocated": _q2(fee_in_allocated),
        "coupons_received": _q2(coupons_received),
        "bonus_received": _q2(bonus_received),
        "gross_proceeds": _q2(gross_proceeds),
        "net_proceeds": _q2(net_proceeds),
        "cost_basis": _q2(cost_basis),
        "realized_capital_gain": _q2(capital_gain),
        "realized_interest_income": _q2(interest_income),
        "realized_pnl": _q2(realized_pnl),
        "warnings": warnings,
        "currency": holding.asset.currency,
        "ledger_entries": ledger_entries,
    }


def _preview_response(calc: dict) -> HoldingExitPreviewResponse:
    return HoldingExitPreviewResponse(
        exit_type=calc["exit_type"],
        exit_date=calc["exit_date"],
        quantity=calc["quantity"],
        quantity_before=calc["quantity_before"],
        quantity_after=calc["quantity_after"],
        clean_price=calc["clean_price"],
        accrued_interest_out=calc["accrued_interest_out"],
        fees=calc["fees"],
        taxes=calc["taxes"],
        capital_gain_tax=calc["capital_gain_tax"],
        interest_tax=calc["interest_tax"],
        tax_mode=calc["tax_mode"],
        fee_in_allocated=calc["fee_in_allocated"],
        coupons_received=calc["coupons_received"],
        bonus_received=calc["bonus_received"],
        gross_proceeds=calc["gross_proceeds"],
        net_proceeds=calc["net_proceeds"],
        cost_basis=calc["cost_basis"],
        realized_capital_gain=calc["realized_capital_gain"],
        realized_interest_income=calc["realized_interest_income"],
        realized_pnl=calc["realized_pnl"],
        currency=calc["currency"],
        warnings=calc["warnings"],
    )


def preview_holding_exit(
    db: Session, user_id: int, holding_id: int, payload: HoldingExitCreate
) -> HoldingExitPreviewResponse | None:
    holding = _load_holding(db, user_id, holding_id)
    if not holding:
        return None
    return _preview_response(calculate_holding_exit(holding, payload))


def _model_fields(calc: dict) -> dict:
    return {
        key: calc[key]
        for key in (
            "exit_type",
            "exit_date",
            "quantity",
            "quantity_before",
            "quantity_after",
            "clean_price",
            "accrued_interest_out",
            "fees",
            "taxes",
            "capital_gain_tax",
            "interest_tax",
            "tax_mode",
            "fee_in_allocated",
            "coupons_received",
            "bonus_received",
            "gross_proceeds",
            "net_proceeds",
            "cost_basis",
            "realized_capital_gain",
            "realized_interest_income",
            "realized_pnl",
        )
    }


def _persist_exit(
    db: Session,
    holding: Holding,
    payload: HoldingExitCreate,
    calc: dict,
) -> HoldingExit:
    exit_event = HoldingExit(
        user_id=holding.user_id,
        account_id=holding.account_id,
        asset_id=holding.asset_id,
        holding_id=holding.id,
        previous_exit_date=holding.exit_date,
        notes=payload.notes,
        **_model_fields(calc),
    )
    db.add(exit_event)
    db.flush()

    holding.quantity = calc["quantity_after"]
    holding.fee_in = max(
        Decimal("0"),
        (holding.fee_in or Decimal("0")) - calc["fee_in_allocated"],
    )
    if holding.quantity == Decimal("0"):
        holding.closed_at = calc["exit_date"]
        holding.exit_date = calc["exit_date"]

    for entry in calc["ledger_entries"]:
        db.add(
            CashLedgerEntry(
                account_id=holding.account_id,
                entry_type=entry["entry_type"],
                amount=entry["amount"],
                description=entry["description"],
                entry_date=calc["exit_date"],
                holding_exit_id=exit_event.id,
            )
        )
    return exit_event


def create_holding_exit(
    db: Session, user_id: int, holding_id: int, payload: HoldingExitCreate
) -> HoldingExit | None:
    holding = _load_holding(db, user_id, holding_id)
    if not holding:
        return None

    calc = calculate_holding_exit(holding, payload)
    exit_event = _persist_exit(db, holding, payload, calc)
    db.commit()
    db.refresh(exit_event)
    return exit_event


def _load_group_active(
    db: Session, user_id: int, holding_id: int
) -> list[Holding]:
    primary = _load_holding(db, user_id, holding_id)
    if not primary:
        return []
    return list(
        db.execute(
            select(Holding)
            .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
            .options(joinedload(Holding.account).joinedload(Account.broker))
            .where(
                Holding.user_id == user_id,
                Holding.account_id == primary.account_id,
                Holding.asset_id == primary.asset_id,
                Holding.quantity > 0,
            )
            .order_by(Holding.entry_date.asc(), Holding.id.asc())
        ).scalars().all()
    )


def _bulk_payloads(
    holdings: list[Holding], payload: HoldingExitCreate
) -> list[tuple[Holding, HoldingExitCreate]]:
    total_quantity = sum((item.quantity for item in holdings), Decimal("0"))
    total_fees = payload.fees or Decimal("0")
    remaining_fees = total_fees
    result: list[tuple[Holding, HoldingExitCreate]] = []
    for index, holding in enumerate(holdings):
        if index == len(holdings) - 1:
            fee = remaining_fees
        else:
            fee = (
                _q2(total_fees * holding.quantity / total_quantity)
                if total_quantity > 0
                else Decimal("0")
            )
            remaining_fees -= fee
        item_payload = payload.model_copy(
            update={
                "quantity": None,
                "fees": fee,
                "taxes": None,
                "coupons_received": None,
                "bonus_received": None,
            }
        )
        result.append((holding, item_payload))
    return result


def preview_holding_group_exit(
    db: Session, user_id: int, holding_id: int, payload: HoldingExitCreate
) -> HoldingExitPreviewResponse | None:
    holdings = _load_group_active(db, user_id, holding_id)
    if not holdings:
        return None

    calcs = [
        calculate_holding_exit(holding, item_payload)
        for holding, item_payload in _bulk_payloads(holdings, payload)
    ]
    if not calcs:
        return None

    def total(key: str) -> Decimal:
        return sum((item[key] for item in calcs), Decimal("0"))

    warnings: list[str] = [f"Vendita di {len(calcs)} tranche."]
    for calc in calcs:
        for warning in calc["warnings"]:
            if warning not in warnings:
                warnings.append(warning)

    return HoldingExitPreviewResponse(
        exit_type=calcs[0]["exit_type"],
        exit_date=calcs[0]["exit_date"],
        quantity=_q6(total("quantity")),
        quantity_before=_q6(total("quantity_before")),
        quantity_after=_q6(total("quantity_after")),
        clean_price=calcs[0]["clean_price"],
        accrued_interest_out=calcs[0]["accrued_interest_out"],
        fees=_q2(total("fees")),
        taxes=_q2(total("taxes")),
        capital_gain_tax=_q2(total("capital_gain_tax")),
        interest_tax=_q2(total("interest_tax")),
        tax_mode=calcs[0]["tax_mode"],
        fee_in_allocated=_q2(total("fee_in_allocated")),
        coupons_received=_q2(total("coupons_received")),
        bonus_received=_q2(total("bonus_received")),
        gross_proceeds=_q2(total("gross_proceeds")),
        net_proceeds=_q2(total("net_proceeds")),
        cost_basis=_q2(total("cost_basis")),
        realized_capital_gain=_q2(total("realized_capital_gain")),
        realized_interest_income=_q2(total("realized_interest_income")),
        realized_pnl=_q2(total("realized_pnl")),
        currency=calcs[0]["currency"],
        warnings=warnings,
    )


def create_holding_group_exits(
    db: Session, user_id: int, holding_id: int, payload: HoldingExitCreate
) -> list[HoldingExit] | None:
    holdings = _load_group_active(db, user_id, holding_id)
    if not holdings:
        return None

    created: list[HoldingExit] = []
    try:
        for holding, item_payload in _bulk_payloads(holdings, payload):
            calc = calculate_holding_exit(holding, item_payload)
            created.append(_persist_exit(db, holding, item_payload, calc))
        db.commit()
    except Exception:
        db.rollback()
        raise

    for exit_event in created:
        db.refresh(exit_event)
    return created


def delete_holding_exit(db: Session, user_id: int, exit_id: int) -> bool:
    exit_event = db.execute(
        select(HoldingExit).where(
            HoldingExit.id == exit_id, HoldingExit.user_id == user_id
        )
    ).scalar_one_or_none()
    if not exit_event:
        return False

    holding = db.get(Holding, exit_event.holding_id)
    if holding:
        holding.quantity = (holding.quantity or Decimal("0")) + exit_event.quantity
        holding.fee_in = (holding.fee_in or Decimal("0")) + exit_event.fee_in_allocated
        if holding.quantity > Decimal("0"):
            holding.closed_at = None
            if holding.exit_date == exit_event.exit_date:
                holding.exit_date = exit_event.previous_exit_date

    db.execute(
        delete(CashLedgerEntry).where(CashLedgerEntry.holding_exit_id == exit_event.id)
    )
    db.delete(exit_event)
    db.commit()
    return True


def list_holding_exits(
    db: Session,
    user_id: int,
    holding_id: int | None = None,
    aggregate: bool = False,
) -> list[HoldingExit]:
    query = (
        select(HoldingExit)
        .options(joinedload(HoldingExit.asset), joinedload(HoldingExit.account))
        .where(HoldingExit.user_id == user_id)
    )
    if holding_id is not None:
        if aggregate:
            holding = db.execute(
                select(Holding).where(
                    Holding.user_id == user_id, Holding.id == holding_id
                )
            ).scalars().first()
            if not holding:
                return []
            ids = db.execute(
                select(Holding.id).where(
                    Holding.user_id == user_id,
                    Holding.account_id == holding.account_id,
                    Holding.asset_id == holding.asset_id,
                )
            ).scalars().all()
            query = query.where(HoldingExit.holding_id.in_(ids))
        else:
            query = query.where(HoldingExit.holding_id == holding_id)

    return list(
        db.execute(
            query.order_by(HoldingExit.exit_date.desc(), HoldingExit.id.desc())
        ).scalars().all()
    )


def to_exit_response(exit_event: HoldingExit) -> HoldingExitResponse:
    return HoldingExitResponse(
        id=exit_event.id,
        holding_id=exit_event.holding_id,
        account_id=exit_event.account_id,
        account_name=exit_event.account.name if exit_event.account else f"Account {exit_event.account_id}",
        asset_id=exit_event.asset_id,
        asset_symbol=exit_event.asset.symbol if exit_event.asset else "",
        asset_name=exit_event.asset.name if exit_event.asset else "",
        exit_type=exit_event.exit_type,
        exit_date=exit_event.exit_date,
        quantity=exit_event.quantity,
        quantity_before=exit_event.quantity_before,
        quantity_after=exit_event.quantity_after,
        clean_price=exit_event.clean_price,
        accrued_interest_out=exit_event.accrued_interest_out,
        fees=exit_event.fees,
        taxes=exit_event.taxes,
        tax_mode=exit_event.tax_mode,
        fee_in_allocated=exit_event.fee_in_allocated,
        coupons_received=exit_event.coupons_received,
        bonus_received=exit_event.bonus_received,
        gross_proceeds=exit_event.gross_proceeds,
        net_proceeds=exit_event.net_proceeds,
        cost_basis=exit_event.cost_basis,
        realized_capital_gain=exit_event.realized_capital_gain,
        realized_interest_income=exit_event.realized_interest_income,
        realized_pnl=exit_event.realized_pnl,
        currency=exit_event.asset.currency if exit_event.asset else "EUR",
        previous_exit_date=exit_event.previous_exit_date,
        notes=exit_event.notes,
        created_at=exit_event.created_at,
    )


def auto_record_matured_holdings(db: Session, user_id: int) -> int:
    """Record maturity exits for every active bond that has reached maturity."""
    today = date.today()
    holdings = db.execute(
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account).joinedload(Account.broker))
        .join(Asset, Asset.id == Holding.asset_id)
        .join(BondDetail, BondDetail.asset_id == Asset.id)
        .where(
            Holding.user_id == user_id,
            Holding.quantity > 0,
            BondDetail.maturity_date <= today,
            func.lower(Asset.instrument_type).in_(
                ["bond", "government_bond", "titolo_di_stato"]
            ),
        )
        .order_by(Holding.id.asc())
    ).scalars().all()

    recorded = 0
    for holding in holdings:
        try:
            create_holding_exit(
                db,
                user_id,
                holding.id,
                HoldingExitCreate(
                    exit_type="maturity",
                    notes="Rimborso a scadenza registrato automaticamente",
                ),
            )
            recorded += 1
        except Exception:
            logger.exception(
                "Automatic maturity exit failed for holding %s", holding.id
            )
            db.rollback()
    return recorded
