from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, Asset, Holding, User
from app.schemas import (
    HoldingCreate,
    HoldingExitCreate,
    HoldingExitPreviewResponse,
    HoldingExitResponse,
    HoldingResponse,
    HoldingUpdate,
)
from app.services.holding_exits import (
    create_holding_exit,
    create_holding_group_exits,
    delete_holding_exit,
    list_holding_exits,
    preview_holding_exit,
    preview_holding_group_exit,
    to_exit_response,
)

router = APIRouter(prefix="/api/holdings", tags=["holdings"])


@router.post("", response_model=HoldingResponse)
@router.post("/", response_model=HoldingResponse, include_in_schema=False)
def create_holding(
    payload: HoldingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = db.execute(
        select(Account).where(
            Account.id == payload.account_id, Account.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    asset = db.execute(
        select(Asset).where(
            Asset.id == payload.asset_id, Asset.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    holding = Holding(
        user_id=current_user.id,
        account_id=payload.account_id,
        asset_id=payload.asset_id,
        quantity=payload.quantity,
        avg_cost=payload.avg_cost,
        entry_date=payload.entry_date,
        exit_date=payload.exit_date,
        accrued_interest_in=payload.accrued_interest_in,
        eligible_for_bonus=payload.eligible_for_bonus,
        fee_in=payload.fee_in,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.get("", response_model=list[HoldingResponse])
@router.get("/", response_model=list[HoldingResponse], include_in_schema=False)
def list_holdings(
    account_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Holding).where(Holding.user_id == current_user.id)
    if account_id is not None:
        query = query.where(Holding.account_id == account_id)
    holdings = db.execute(query.order_by(Holding.id)).scalars().all()
    return holdings


@router.patch("/{holding_id}", response_model=HoldingResponse)
@router.patch("/{holding_id}/", response_model=HoldingResponse, include_in_schema=False)
def update_holding(
    holding_id: int,
    payload: HoldingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    holding = db.execute(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == current_user.id)
    ).scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(holding, key, value)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/{holding_id}")
@router.delete("/{holding_id}/", include_in_schema=False)
def delete_holding(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    holding = db.execute(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == current_user.id)
    ).scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    db.delete(holding)
    db.commit()
    return {"ok": True}


@router.post("/{holding_id}/exits/preview", response_model=HoldingExitPreviewResponse)
def preview_exit(
    holding_id: int,
    payload: HoldingExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        preview = preview_holding_exit(db, current_user.id, holding_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not preview:
        raise HTTPException(status_code=404, detail="Holding not found")
    return preview


@router.post("/{holding_id}/exits", response_model=HoldingExitResponse)
def create_exit(
    holding_id: int,
    payload: HoldingExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        exit_event = create_holding_exit(db, current_user.id, holding_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not exit_event:
        raise HTTPException(status_code=404, detail="Holding not found")
    return to_exit_response(exit_event)


@router.post("/{holding_id}/exits/bulk/preview", response_model=HoldingExitPreviewResponse)
def preview_bulk_exit(
    holding_id: int,
    payload: HoldingExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        preview = preview_holding_group_exit(
            db, current_user.id, holding_id, payload
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not preview:
        raise HTTPException(status_code=404, detail="Holding not found")
    return preview


@router.post("/{holding_id}/exits/bulk", response_model=list[HoldingExitResponse])
def create_bulk_exit(
    holding_id: int,
    payload: HoldingExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        exits = create_holding_group_exits(db, current_user.id, holding_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not exits:
        raise HTTPException(status_code=404, detail="Holding not found")
    return [to_exit_response(item) for item in exits]


@router.get("/{holding_id}/exits", response_model=list[HoldingExitResponse])
def list_exits(
    holding_id: int,
    aggregate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exits = list_holding_exits(
        db, current_user.id, holding_id=holding_id, aggregate=aggregate
    )
    return [to_exit_response(item) for item in exits]


@router.delete("/exits/{exit_id}")
def delete_exit(
    exit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not delete_holding_exit(db, current_user.id, exit_id):
        raise HTTPException(status_code=404, detail="Exit not found")
    return {"ok": True}
