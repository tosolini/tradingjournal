from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Holding, User
from app.schemas import HoldingCreate, HoldingResponse, HoldingUpdate

router = APIRouter(prefix="/api/holdings", tags=["holdings"])


@router.post("", response_model=HoldingResponse)
@router.post("/", response_model=HoldingResponse, include_in_schema=False)
def create_holding(
    payload: HoldingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.execute(
        select(Holding).where(
            Holding.user_id == current_user.id,
            Holding.account_id == payload.account_id,
            Holding.asset_id == payload.asset_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Holding already exists for this account and asset")

    holding = Holding(
        user_id=current_user.id,
        account_id=payload.account_id,
        asset_id=payload.asset_id,
        quantity=payload.quantity,
        avg_cost=payload.avg_cost,
        entry_date=payload.entry_date,
        exit_date=payload.exit_date,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.get("", response_model=list[HoldingResponse])
@router.get("/", response_model=list[HoldingResponse], include_in_schema=False)
def list_holdings(
    account_id: int | None = Query(None),
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
