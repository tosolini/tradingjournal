import pytest
from fastapi import HTTPException

from app.api.assets import create_asset, delete_asset, list_assets, update_asset
from app.models import Asset, Holding, User
from app.schemas import AssetCreate, AssetUpdate
from app.security import hash_password


def test_asset_crud_and_duplicate_handling(db):
    user = User(
        email="assetuser@example.com",
        username="assetuser",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 1. Create asset
    asset1 = create_asset(
        payload=AssetCreate(
            symbol="VWCE",
            name="Vanguard FTSE All-World",
            isin="IE00BK5BQT80",
            instrument_type="etf",
            currency="EUR",
        ),
        db=db,
        current_user=user,
    )
    assert asset1.id is not None
    assert asset1.symbol == "VWCE"
    assert asset1.currency == "EUR"

    # 2. Duplicate create fails with 409
    with pytest.raises(HTTPException) as exc_info:
        create_asset(
            payload=AssetCreate(
                symbol="vwce",  # test case insensitivity/stripping
                name="Another Vanguard",
            ),
            db=db,
            current_user=user,
        )
    assert exc_info.value.status_code == 409

    # 3. List assets
    assets = list_assets(db=db, current_user=user)
    assert len(assets) == 1
    assert assets[0].symbol == "VWCE"

    # 4. Create second asset
    asset2 = create_asset(
        payload=AssetCreate(
            symbol="SWDA",
            name="iShares Core MSCI World",
            currency="EUR",
        ),
        db=db,
        current_user=user,
    )

    # 5. Update asset2 to rename to asset1 symbol -> 409
    with pytest.raises(HTTPException) as exc_info:
        update_asset(
            asset_id=asset2.id,
            payload=AssetUpdate(symbol="VWCE"),
            db=db,
            current_user=user,
        )
    assert exc_info.value.status_code == 409

    # 6. Update asset2 name successfully
    updated = update_asset(
        asset_id=asset2.id,
        payload=AssetUpdate(name="iShares MSCI World UCITS ETF"),
        db=db,
        current_user=user,
    )
    assert updated.name == "iShares MSCI World UCITS ETF"

    # 7. Delete asset2
    res = delete_asset(asset_id=asset2.id, db=db, current_user=user)
    assert res == {"ok": True}
    assert len(list_assets(db=db, current_user=user)) == 1
