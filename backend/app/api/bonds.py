from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Asset, BondDetail, Holding, User
from app.schemas import BondCalendarItem, BondLookupRequest, BondLookupResponse, BondPortfolioMetrics
from app.services.bonds import (
    calculate_accrued_interest,
    calculate_ytm,
    get_bond_cash_flows,
)
from app.services.price_provider import get_current_price

router = APIRouter(prefix="/api/bonds", tags=["bonds"])


@router.get("/calendar", response_model=list[BondCalendarItem])
def get_bond_calendar(
    account_id: int | None = None,
    holding_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    aggregate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = from_date or date.today()
    end_date = to_date or (start_date + timedelta(days=365 * 30))

    query = (
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account))
        .join(Asset, Asset.id == Holding.asset_id)
        .where(
            Holding.user_id == current_user.id,
            func.lower(Asset.instrument_type).in_(["bond", "government_bond", "titolo_di_stato"]),
            or_(Holding.exit_date.is_(None), Holding.exit_date >= start_date),
            Holding.quantity > Decimal("0"),
        )
    )
    if account_id is not None:
        query = query.where(Holding.account_id == account_id)
    if holding_id is not None:
        query = query.where(Holding.id == holding_id)

    holdings = db.execute(query).scalars().all()

    items: list[BondCalendarItem] = []
    merged: dict[tuple[date, int, int, str], dict] = {}

    for h in holdings:
        if not h.asset.bond_detail:
            continue

        flows = get_bond_cash_flows(
            bond_detail=h.asset.bond_detail,
            nominal=h.quantity,
            eligible_for_bonus=h.eligible_for_bonus,
            from_date=start_date,
        )

        acc_name = h.account.name if h.account else f"Account {h.account_id}"

        for f in flows:
            if f.date > end_date:
                continue
            if h.exit_date and f.date > h.exit_date:
                continue

            if aggregate:
                key = (f.date, h.asset_id, h.account_id, f.flow_type)
                item = merged.get(key)
                if item is None:
                    merged[key] = {
                        "holding_id": h.id,
                        "asset_symbol": h.asset.symbol,
                        "asset_name": h.asset.name,
                        "account_name": acc_name,
                        "rate": f.rate,
                        "gross_amount": f.gross_amount,
                        "tax_amount": f.tax_amount,
                        "net_amount": f.net_amount,
                    }
                else:
                    item["gross_amount"] += f.gross_amount
                    item["tax_amount"] += f.tax_amount
                    item["net_amount"] += f.net_amount
                continue

            items.append(
                BondCalendarItem(
                    holding_id=h.id,
                    asset_symbol=h.asset.symbol,
                    asset_name=h.asset.name,
                    account_name=acc_name,
                    date=f.date,
                    flow_type=f.flow_type,
                    rate=f.rate,
                    gross_amount=f.gross_amount,
                    tax_amount=f.tax_amount,
                    net_amount=f.net_amount,
                )
            )

    if aggregate:
        items = [
            BondCalendarItem(
                holding_id=data["holding_id"],
                asset_symbol=data["asset_symbol"],
                asset_name=data["asset_name"],
                account_name=data["account_name"],
                date=flow_date,
                flow_type=flow_type,
                rate=data["rate"],
                gross_amount=data["gross_amount"],
                tax_amount=data["tax_amount"],
                net_amount=data["net_amount"],
            )
            for (flow_date, _asset_id, _account_id, flow_type), data in merged.items()
        ]

    items.sort(key=lambda x: x.date)
    return items


@router.get("/metrics", response_model=BondPortfolioMetrics)
def get_bond_metrics(
    account_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    one_year_later = today + timedelta(days=365)

    query = (
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .join(Asset, Asset.id == Holding.asset_id)
        .where(
            Holding.user_id == current_user.id,
            func.lower(Asset.instrument_type).in_(["bond", "government_bond", "titolo_di_stato"]),
            or_(Holding.exit_date.is_(None), Holding.exit_date >= today),
            Holding.quantity > Decimal("0"),
        )
    )
    if account_id is not None:
        query = query.where(Holding.account_id == account_id)

    holdings = db.execute(query).scalars().all()

    total_nominal = Decimal("0")
    total_market_value = Decimal("0")
    weighted_ytm_gross_sum = Decimal("0")
    weighted_ytm_net_sum = Decimal("0")
    estimated_annual_income_net = Decimal("0")

    bonds_count = len({h.asset_id for h in holdings})

    for h in holdings:
        qty = h.quantity
        total_nominal += qty

        fetched = get_current_price(h.asset.symbol, h.asset.exchange)
        clean_price = fetched if fetched is not None and fetched > Decimal("0") else h.avg_cost

        if h.asset.bond_detail:
            accrued = calculate_accrued_interest(h.asset.bond_detail, today, nominal=Decimal("100"))
            dirty_price = clean_price + accrued
            mv = (qty * dirty_price) / Decimal("100")
            total_market_value += mv

            ytm_g = calculate_ytm(
                clean_price,
                h.asset.bond_detail,
                today,
                eligible_for_bonus=h.eligible_for_bonus,
                is_net=False,
            )
            ytm_n = calculate_ytm(
                clean_price,
                h.asset.bond_detail,
                today,
                eligible_for_bonus=h.eligible_for_bonus,
                is_net=True,
            )

            weighted_ytm_gross_sum += ytm_g * mv
            weighted_ytm_net_sum += ytm_n * mv

            flows = get_bond_cash_flows(
                bond_detail=h.asset.bond_detail,
                nominal=qty,
                eligible_for_bonus=h.eligible_for_bonus,
                from_date=today,
            )
            for f in flows:
                if f.flow_type in ("coupon", "bonus") and today <= f.date <= one_year_later:
                    estimated_annual_income_net += f.net_amount
        else:
            dirty_price = clean_price
            mv = (qty * dirty_price) / Decimal("100")
            total_market_value += mv

    weighted_ytm_gross = (
        (weighted_ytm_gross_sum / total_market_value).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if total_market_value > Decimal("0")
        else Decimal("0.0000")
    )
    weighted_ytm_net = (
        (weighted_ytm_net_sum / total_market_value).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if total_market_value > Decimal("0")
        else Decimal("0.0000")
    )

    return BondPortfolioMetrics(
        total_nominal=total_nominal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        total_market_value=total_market_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        weighted_ytm_gross=weighted_ytm_gross,
        weighted_ytm_net=weighted_ytm_net,
        estimated_annual_income_net=estimated_annual_income_net.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        bonds_count=bonds_count,
    )

@router.post("/lookup", response_model=BondLookupResponse)
def lookup_bond(
    payload: BondLookupRequest,
    _current_user: User = Depends(get_current_user),
):
    from app.services.euronext import fetch_euronext_bond_details
    try:
        data = fetch_euronext_bond_details(payload.query)
        return BondLookupResponse(**data)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Errore nel recupero dati Euronext per '{payload.query}': {str(e)}",
        )
