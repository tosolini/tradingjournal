import pytest
from fastapi import HTTPException
from sqlalchemy import select

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


def test_delete_asset_cascades_to_holdings(db):
    from app.models import Account, Holding
    from datetime import date
    from decimal import Decimal

    user = User(
        email="cascadedelete@example.com",
        username="cascadedelete",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="TestAcc", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    asset = create_asset(
        payload=AssetCreate(symbol="OLD-BTP", name="Old BTP to Remove", instrument_type="bond"),
        db=db,
        current_user=user,
    )

    holding = Holding(
        user_id=user.id,
        account_id=account.id,
        asset_id=asset.id,
        quantity=Decimal("10000"),
        avg_cost=Decimal("99.00"),
        entry_date=date(2025, 1, 1),
    )
    db.add(holding)
    db.commit()

    # Deleting the asset should succeed and remove associated holdings
    res = delete_asset(asset_id=asset.id, db=db, current_user=user)
    assert res == {"ok": True}

    remaining_assets = list_assets(db=db, current_user=user)
    assert len(remaining_assets) == 0

    remaining_holdings = db.execute(select(Holding).where(Holding.user_id == user.id)).scalars().all()
    assert len(remaining_holdings) == 0
