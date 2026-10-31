from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.api.holdings import create_holding
from app.api.snapshots import list_portfolio_snapshots, list_snapshots
from app.models import (
    Account,
    Asset,
    Holding,
    PortfolioSnapshot,
    PositionDailySnapshot,
    User,
)
from app.schemas import HoldingCreate
from app.security import hash_password


def _make_user(db, email: str, username: str) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_snapshot_endpoints_are_scoped_per_user(db):
    user_a = _make_user(db, "snap-a@example.com", "snap_a")
    user_b = _make_user(db, "snap-b@example.com", "snap_b")

    account_a = Account(name="A", user_id=user_a.id, base_currency="EUR")
    account_b = Account(name="B", user_id=user_b.id, base_currency="EUR")
    db.add_all([account_a, account_b])
    db.commit()
    db.refresh(account_a)
    db.refresh(account_b)

    db.add_all(
        [
            PositionDailySnapshot(
                account_id=account_a.id,
                symbol="AAA",
                snapshot_date=date(2026, 1, 1),
                position_qty=Decimal("1"),
                close_price=Decimal("100"),
                market_value=Decimal("100"),
            ),
            PositionDailySnapshot(
                account_id=account_b.id,
                symbol="BBB",
                snapshot_date=date(2026, 1, 1),
                position_qty=Decimal("1"),
                close_price=Decimal("200"),
                market_value=Decimal("200"),
            ),
            PortfolioSnapshot(
                account_id=account_a.id,
                snapshot_date=date(2026, 1, 1),
                total_value=Decimal("100"),
                total_cost=Decimal("100"),
            ),
            PortfolioSnapshot(
                account_id=account_b.id,
                snapshot_date=date(2026, 1, 1),
                total_value=Decimal("200"),
                total_cost=Decimal("200"),
            ),
        ]
    )
    db.commit()

    position_snaps = list_snapshots(db=db, current_user=user_a)
    assert [s.symbol for s in position_snaps] == ["AAA"]

    portfolio_snaps = list_portfolio_snapshots(db=db, current_user=user_a)
    assert [s.account_id for s in portfolio_snaps] == [account_a.id]


def test_create_holding_rejects_foreign_account_or_asset(db):
    owner = _make_user(db, "owner@example.com", "owner")
    intruder = _make_user(db, "intruder@example.com", "intruder")

    account = Account(name="Owner account", user_id=owner.id, base_currency="EUR")
    asset = Asset(user_id=owner.id, symbol="OWN", name="Owned asset", instrument_type="etf")
    db.add_all([account, asset])
    db.commit()
    db.refresh(account)
    db.refresh(asset)

    with pytest.raises(HTTPException) as exc:
        create_holding(
            payload=HoldingCreate(
                account_id=account.id,
                asset_id=asset.id,
                quantity=Decimal("1"),
                avg_cost=Decimal("10"),
                entry_date=date(2026, 1, 1),
            ),
            db=db,
            current_user=intruder,
        )

    assert exc.value.status_code == 404
    assert db.query(Holding).filter(Holding.user_id == intruder.id).count() == 0
