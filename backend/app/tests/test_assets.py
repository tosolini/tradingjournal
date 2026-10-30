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


def test_multiple_holdings_for_same_asset_allowed(db):
    from app.models import Account
    from app.api.holdings import create_holding, list_holdings
    from app.schemas import HoldingCreate
    from app.services.portfolio import get_holding_details, get_portfolio_summary
    from datetime import date
    from decimal import Decimal

    user = User(
        email="multiholding@example.com",
        username="multiholding",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="PAC Account", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    asset = create_asset(
        payload=AssetCreate(symbol="VWCE", name="Vanguard FTSE All-World", instrument_type="etf"),
        db=db,
        current_user=user,
    )

    # 1. First tranche: 10 units @ 100 on 2026-01-01
    h1 = create_holding(
        payload=HoldingCreate(
            account_id=account.id,
            asset_id=asset.id,
            quantity=Decimal("10"),
            avg_cost=Decimal("100.00"),
            entry_date=date(2026, 1, 1),
        ),
        db=db,
        current_user=user,
    )
    assert h1.id is not None

    # 2. Second tranche for the SAME asset & account: 20 units @ 110 on 2026-02-01
    h2 = create_holding(
        payload=HoldingCreate(
            account_id=account.id,
            asset_id=asset.id,
            quantity=Decimal("20"),
            avg_cost=Decimal("110.00"),
            entry_date=date(2026, 2, 1),
        ),
        db=db,
        current_user=user,
    )
    assert h2.id is not None
    assert h2.id != h1.id

    # 3. List holdings returns both
    all_holdings = list_holdings(account_id=None, db=db, current_user=user)
    assert len(all_holdings) == 2
    assert {h.quantity for h in all_holdings} == {Decimal("10"), Decimal("20")}

    # 4. Holding details returns both with accurate cost basis
    details = get_holding_details(db, user_id=user.id)
    assert len(details) == 2

    # 5. Portfolio summary aggregates both tranches
    summaries = get_portfolio_summary(db, user_id=user.id)
    assert len(summaries) == 1
    # total cost = 10*100 + 20*110 = 1000 + 2200 = 3200
    assert summaries[0].total_cost == Decimal("3200.00")
    assert summaries[0].holdings_count == 2

def test_locale_decimal_parsing_in_schemas():
    from datetime import date
    from decimal import Decimal
    from app.schemas import HoldingCreate, ExecutionCreate, BondDetailCreate

    # Comma decimal separator commonly used in Italy/Europe
    hc = HoldingCreate(
        account_id=1,
        asset_id=1,
        quantity="10,5",
        avg_cost="98,50",
        accrued_interest_in="0,45",
        entry_date=date(2026, 1, 1),
    )
    assert hc.quantity == Decimal("10.5")
    assert hc.avg_cost == Decimal("98.50")
    assert hc.accrued_interest_in == Decimal("0.45")

    # Execution with European format numbers
    ec = ExecutionCreate(
        action="BUY",
        executed_at="2026-01-01T10:00:00Z",
        quantity="1.250,5",
        price="12,75",
        fee="2,50",
    )
    assert ec.quantity == Decimal("1250.5")
    assert ec.price == Decimal("12.75")
    assert ec.fee == Decimal("2.50")

    # Bond detail with coupon rate
    bc = BondDetailCreate(
        annual_coupon_rate="3,85",
        final_bonus_rate="0,80",
        tax_rate="12,50",
        maturity_date=date(2030, 1, 1),
    )
    assert bc.annual_coupon_rate == Decimal("3.85")
    assert bc.final_bonus_rate == Decimal("0.80")
    assert bc.tax_rate == Decimal("12.50")
