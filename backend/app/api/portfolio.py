from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, Asset, Holding, PortfolioSnapshot, User
from app.schemas import (
    BondCalendarItem,
    HoldingDetailResponse,
    HoldingPriceHistoryResponse,
    HoldingSingleDetailResponse,
    PortfolioHistoryPoint,
    PortfolioSummaryResponse,
)
from app.services.bonds import get_bond_cash_flows
from app.services.portfolio import (
    get_holding_details,
    get_holding_price_history,
    get_portfolio_summary,
    get_single_holding_detail,
)
router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/details", response_model=list[HoldingDetailResponse])
def portfolio_details(
    account_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_holding_details(db, current_user.id, account_id)


@router.get("/summary", response_model=list[PortfolioSummaryResponse])
def portfolio_summary(
    account_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_portfolio_summary(db, current_user.id, account_id)


@router.get("/history", response_model=list[PortfolioHistoryPoint])
def portfolio_history(
    account_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(PortfolioSnapshot)
        .join(Account, Account.id == PortfolioSnapshot.account_id)
        .where(Account.user_id == current_user.id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    )
    if account_id is not None:
        query = query.where(PortfolioSnapshot.account_id == account_id)

    snapshots = db.execute(query).scalars().all()

    from decimal import Decimal
    by_date: dict[str, dict[str, Decimal]] = {}
    for s in snapshots:
        d_str = s.snapshot_date.isoformat()
        val = s.total_value if s.total_value > Decimal("0") else s.total_cost
        cost = s.total_cost
        if d_str not in by_date:
            by_date[d_str] = {"value": Decimal("0"), "cost": Decimal("0")}
        by_date[d_str]["value"] += val
        by_date[d_str]["cost"] += cost

    today_str = date.today().isoformat()
    # Include current live valuation as today's point
    live_summaries = get_portfolio_summary(db, current_user.id, account_id)
    if live_summaries:
        live_val = sum(s.total_value for s in live_summaries)
        live_cost = sum(s.total_cost for s in live_summaries)
        by_date[today_str] = {"value": live_val, "cost": live_cost}

    # If there are fewer than 2 points, backfill starting points from holding entry dates
    if len(by_date) < 2:
        holdings_query = select(Holding).where(Holding.user_id == current_user.id)
        if account_id is not None:
            holdings_query = holdings_query.where(Holding.account_id == account_id)
        holdings = db.execute(holdings_query).scalars().all()
        for h in holdings:
            e_str = h.entry_date.isoformat()
            # Do not fold entry-date costs into today's already-complete live valuation
            if e_str == today_str:
                continue
            is_bond = (h.asset.instrument_type or "").lower() in ("bond", "government_bond")
            cost = (h.quantity * (h.avg_cost + (h.accrued_interest_in or Decimal("0")))) / Decimal("100") if is_bond else h.quantity * h.avg_cost
            if e_str not in by_date:
                by_date[e_str] = {"value": cost, "cost": cost}
            else:
                by_date[e_str]["value"] += cost
                by_date[e_str]["cost"] += cost

        # If still only today's point exists, ensure a starting baseline at yesterday
        if len(by_date) == 1 and today_str in by_date and by_date[today_str]["cost"] > Decimal("0"):
            yesterday_str = (date.today() - timedelta(days=1)).isoformat()
            by_date[yesterday_str] = {
                "value": by_date[today_str]["cost"],
                "cost": by_date[today_str]["cost"],
            }
    points: list[PortfolioHistoryPoint] = []
    for d_str in sorted(by_date.keys()):
        val = by_date[d_str]["value"]
        cost = by_date[d_str]["cost"]
        ret_pct = ((val - cost) / cost * Decimal("100")) if cost > Decimal("0") else Decimal("0")
        points.append(
            PortfolioHistoryPoint(
                date=d_str,
                value=float(val),
                cost=float(cost),
                return_pct=float(ret_pct),
            )
        )
    return points


@router.get("/holdings/{holding_id}", response_model=HoldingSingleDetailResponse)
def holding_detail(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    detail = get_single_holding_detail(db, current_user.id, holding_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Holding not found")
    return detail


@router.get("/holdings/{holding_id}/price-history", response_model=HoldingPriceHistoryResponse)
def holding_price_history(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    history = get_holding_price_history(db, current_user.id, holding_id)
    if not history:
        raise HTTPException(status_code=404, detail="Holding not found")
    return history


@router.get("/holdings/{holding_id}/calendar", response_model=list[BondCalendarItem])
def holding_calendar(
    holding_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import joinedload
    from datetime import timedelta

    start_date = from_date or date.today()
    end_date = to_date or (start_date + timedelta(days=365 * 30))

    h = db.execute(
        select(Holding)
        .options(joinedload(Holding.asset).joinedload(Asset.bond_detail))
        .options(joinedload(Holding.account))
        .where(Holding.id == holding_id, Holding.user_id == current_user.id)
    ).scalars().first()

    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")

    if not h.asset or not h.asset.bond_detail:
        return []

    flows = get_bond_cash_flows(
        bond_detail=h.asset.bond_detail,
        nominal=h.quantity,
        eligible_for_bonus=h.eligible_for_bonus,
        from_date=start_date,
    )

    acc_name = h.account.name if h.account else f"Account {h.account_id}"
    items: list[BondCalendarItem] = []
    for f in flows:
        if f.date > end_date:
            continue
        if h.exit_date and f.date > h.exit_date:
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

    items.sort(key=lambda x: x.date)
    return items
