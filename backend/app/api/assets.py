from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Asset, BondDetail, Holding, User
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
    bond_detail_data = data.pop("bond_detail", None)
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
    db.flush()

    if bond_detail_data and payload.instrument_type == "bond":
        bond_detail = BondDetail(asset_id=asset.id, **bond_detail_data)
        db.add(bond_detail)

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
        select(Asset)
        .options(joinedload(Asset.bond_detail))
        .where(Asset.user_id == current_user.id)
        .order_by(Asset.symbol)
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
        select(Asset)
        .options(joinedload(Asset.bond_detail))
        .where(Asset.id == asset_id, Asset.user_id == current_user.id)
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

    updates = payload.model_dump(exclude_unset=True)
    bond_detail_data = updates.pop("bond_detail", None)

    for key, value in updates.items():
        if key == "symbol" and isinstance(value, str):
            value = value.strip().upper()
        elif key == "isin" and isinstance(value, str):
            value = value.strip().upper() or None
        elif key == "currency" and isinstance(value, str):
            value = value.strip().upper()
        elif isinstance(value, str):
            value = value.strip()
        setattr(asset, key, value)

    if bond_detail_data is not None:
        if asset.bond_detail:
            for k, v in bond_detail_data.items():
                setattr(asset.bond_detail, k, v)
        else:
            db.add(BondDetail(asset_id=asset.id, **bond_detail_data))

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

    db.execute(
        delete(Holding).where(Holding.asset_id == asset_id, Holding.user_id == current_user.id)
    )
    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.post("/{asset_id}/sync-euronext", response_model=AssetResponse)
@router.post("/{asset_id}/sync-euronext/", response_model=AssetResponse, include_in_schema=False)
def sync_asset_euronext(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.execute(
        select(Asset)
        .options(joinedload(Asset.bond_detail))
        .where(Asset.id == asset_id, Asset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    query = asset.isin or asset.symbol
    if not query:
        raise HTTPException(status_code=400, detail="Asset has no ISIN or symbol for Euronext lookup")

    from app.services.euronext import fetch_euronext_bond_details
    try:
        data = fetch_euronext_bond_details(query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore Euronext: {e}")

    bd_data = data.get("bond_detail")
    if not bd_data:
        raise HTTPException(status_code=400, detail="Nessun dato obbligazionario trovato su Euronext")

    if not asset.bond_detail:
        asset.bond_detail = BondDetail(asset_id=asset.id)

    for k, v in bd_data.items():
        setattr(asset.bond_detail, k, v)

    if data.get("name") and (not asset.name or asset.name.startswith("BTP ")):
        asset.name = data["name"]
    if data.get("exchange") and not asset.exchange:
        asset.exchange = data["exchange"]

    asset.instrument_type = "bond"

    db.commit()
    db.refresh(asset)
    return asset
