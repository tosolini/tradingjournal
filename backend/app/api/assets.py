from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Asset, User
from app.schemas import AssetCreate, AssetResponse, AssetUpdate

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post("", response_model=AssetResponse)
@router.post("/", response_model=AssetResponse, include_in_schema=False)
def create_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    symbol = payload.symbol.strip().upper()
    existing = db.execute(
        select(Asset).where(
            Asset.user_id == current_user.id, Asset.symbol == symbol
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Asset with this symbol already exists")

    data = payload.model_dump()
    data["symbol"] = symbol
    if isinstance(data.get("name"), str):
        data["name"] = data["name"].strip()
    if isinstance(data.get("isin"), str):
        data["isin"] = data["isin"].strip().upper() or None
    if isinstance(data.get("currency"), str):
        data["currency"] = data["currency"].strip().upper() or "EUR"
    if isinstance(data.get("exchange"), str):
        data["exchange"] = data["exchange"].strip() or None

    asset = Asset(user_id=current_user.id, **data)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("", response_model=list[AssetResponse])
@router.get("/", response_model=list[AssetResponse], include_in_schema=False)
def list_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    assets = db.execute(
        select(Asset).where(Asset.user_id == current_user.id).order_by(Asset.symbol)
    ).scalars().all()
    return assets


@router.patch("/{asset_id}", response_model=AssetResponse)
@router.patch("/{asset_id}/", response_model=AssetResponse, include_in_schema=False)
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if payload.symbol:
        new_symbol = payload.symbol.strip().upper()
        if new_symbol != asset.symbol:
            existing = db.execute(
                select(Asset).where(
                    Asset.user_id == current_user.id,
                    Asset.symbol == new_symbol,
                    Asset.id != asset_id,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=409, detail="Asset with this symbol already exists")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "symbol" and isinstance(value, str):
            value = value.strip().upper()
        elif key == "isin" and isinstance(value, str):
            value = value.strip().upper() or None
        elif key == "currency" and isinstance(value, str):
            value = value.strip().upper()
        elif isinstance(value, str):
            value = value.strip()
        setattr(asset, key, value)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}")
@router.delete("/{asset_id}/", include_in_schema=False)
def delete_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    from app.models import Holding
    holding_count = db.execute(
        select(Holding).where(Holding.asset_id == asset_id)
    ).scalar()
    if holding_count:
        raise HTTPException(status_code=409, detail="Cannot delete asset with active holdings")

    db.delete(asset)
    db.commit()
    return {"ok": True}
