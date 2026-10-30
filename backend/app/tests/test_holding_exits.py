from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models import Account, Asset, BondDetail, CashLedgerEntry, Holding, User
from app.schemas import HoldingExitCreate
from app.security import hash_password
from app.services.holding_exits import (
    auto_record_matured_holdings,
    create_holding_exit,
    create_holding_group_exits,
    delete_holding_exit,
    preview_holding_exit,
    preview_holding_group_exit,
)
from app.services.portfolio import get_holding_details, get_single_holding_detail


def _create_bond_fixture(
    db,
    *,
    email: str,
    instrument_type: str = "government_bond",
    maturity: date = date(2030, 3, 5),
    holdings: list[tuple[Decimal, date]],
) -> tuple[User, Account, Asset, list[Holding]]:
    user = User(
        email=email,
        username=email.split("@")[0],
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="Directa", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    asset = Asset(
        user_id=user.id,
        symbol="IT0005583486",
        name="BTP Valore Mar 2030",
        isin="IT0005583486",
        instrument_type=instrument_type,
        exchange="MOT",
        currency="EUR",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    db.add(
        BondDetail(
            asset_id=asset.id,
            bond_type="fixed",
            issue_date=date(2023, 3, 5),
            maturity_date=maturity,
            coupon_frequency=4,
            annual_coupon_rate=Decimal("3.2500"),
            tax_rate=Decimal("12.50"),
            final_bonus_rate=Decimal("0.8000"),
        )
    )
    db.commit()

    created: list[Holding] = []
    for quantity, entry_date in holdings:
        holding = Holding(
            user_id=user.id,
            account_id=account.id,
            asset_id=asset.id,
            quantity=quantity,
            avg_cost=Decimal("100.00"),
            entry_date=entry_date,
            eligible_for_bonus=True,
        )
        db.add(holding)
        created.append(holding)
    db.commit()
    for holding in created:
        db.refresh(holding)
    return user, account, asset, created


def test_partial_bond_sale_updates_quantity_and_can_be_undone(db):
    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="partial-exit@example.com",
        holdings=[
            (Decimal("15000.00"), date(2024, 5, 14)),
            (Decimal("10000.00"), date(2026, 10, 26)),
        ],
    )
    holding = holdings[0]

    payload = HoldingExitCreate(
        exit_type="market_sale",
        exit_date=date(2026, 10, 1),
        quantity=Decimal("5000"),
        clean_price=Decimal("101"),
        accrued_interest_out=Decimal("0.5"),
        fees=Decimal("5"),
    )

    preview = preview_holding_exit(db, user.id, holding.id, payload)
    assert preview is not None
    assert preview.quantity_after == Decimal("10000.000000")
    assert preview.cost_basis == Decimal("5000.00")
    assert preview.realized_capital_gain == Decimal("45.00")
    assert preview.realized_interest_income == Decimal("431.25")
    assert preview.realized_pnl == Decimal("476.25")
    assert preview.taxes == Decimal("59.53")
    assert preview.net_proceeds == Decimal("5416.72")
    assert any("parziale" in warning.lower() for warning in preview.warnings)

    exit_event = create_holding_exit(db, user.id, holding.id, payload)
    assert exit_event is not None
    exit_id = exit_event.id

    db.refresh(holding)
    assert holding.quantity == Decimal("10000.000000")
    assert holding.closed_at is None

    ledger = db.query(CashLedgerEntry).filter_by(holding_exit_id=exit_id).all()
    assert len(ledger) == 1
    assert ledger[0].entry_type == "asset_sale"
    assert ledger[0].amount == Decimal("5416.72")

    assert delete_holding_exit(db, user.id, exit_id) is True
    db.refresh(holding)
    assert holding.quantity == Decimal("15000.000000")
    assert db.query(CashLedgerEntry).filter_by(holding_exit_id=exit_id).count() == 0


def test_maturity_exit_closes_holding_and_pays_final_coupon_and_bonus(db):
    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="maturity-exit@example.com",
        maturity=date(2025, 3, 5),
        holdings=[(Decimal("10000.00"), date(2024, 3, 6))],
    )
    holding = holdings[0]

    payload = HoldingExitCreate(exit_type="maturity")
    exit_event = create_holding_exit(db, user.id, holding.id, payload)
    assert exit_event is not None
    exit_id = exit_event.id

    assert exit_event.exit_date == date(2025, 3, 5)
    assert exit_event.quantity == Decimal("10000.000000")
    assert exit_event.quantity_after == Decimal("0.000000")
    assert exit_event.coupons_received == Decimal("325.00")
    assert exit_event.bonus_received == Decimal("80.00")
    assert exit_event.realized_capital_gain == Decimal("0.00")
    assert exit_event.realized_interest_income == Decimal("405.00")
    assert exit_event.taxes == Decimal("50.63")
    assert exit_event.net_proceeds == Decimal("10354.38")

    db.refresh(holding)
    assert holding.quantity == Decimal("0.000000")
    assert holding.closed_at == date(2025, 3, 5)

    ledger_types = {
        item.entry_type
        for item in db.query(CashLedgerEntry).filter_by(holding_exit_id=exit_id).all()
    }
    assert ledger_types == {"bond_redemption", "coupon", "bond_bonus"}

    # Closed positions are excluded from the active portfolio.
    assert get_holding_details(db, user.id) == []
    single = get_single_holding_detail(db, user.id, holding.id)
    assert single is not None
    assert single.quantity == Decimal("0.000000")
    assert single.closed_at == date(2025, 3, 5)


def test_early_issuer_redemption_uses_par_and_forfeits_bonus(db):
    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="early-redemption@example.com",
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    holding = holdings[0]

    payload = HoldingExitCreate(
        exit_type="early_redemption",
        exit_date=date(2026, 10, 1),
        quantity=Decimal("10000"),
    )
    preview = preview_holding_exit(db, user.id, holding.id, payload)
    assert preview is not None
    assert preview.clean_price == Decimal("100.000000")
    assert preview.bonus_received == Decimal("0.00")
    assert any("CUM" in warning for warning in preview.warnings)

    exit_event = create_holding_exit(db, user.id, holding.id, payload)
    assert exit_event is not None
    assert exit_event.exit_type == "early_redemption"
    db.refresh(holding)
    assert holding.quantity == Decimal("0.000000")
    assert holding.closed_at == date(2026, 10, 1)
    ledger = db.query(CashLedgerEntry).filter_by(holding_exit_id=exit_event.id).all()
    assert len(ledger) == 1
    assert ledger[0].entry_type == "bond_redemption"


def test_exit_is_scoped_to_owning_user(db):
    owner, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="exit-owner@example.com",
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    intruder = User(
        email="exit-intruder@example.com",
        username="exit_intruder",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(intruder)
    db.commit()
    db.refresh(intruder)

    payload = HoldingExitCreate(
        exit_type="market_sale",
        exit_date=date(2026, 10, 1),
        quantity=Decimal("1000"),
        clean_price=Decimal("100"),
    )
    assert preview_holding_exit(db, intruder.id, holdings[0].id, payload) is None
    assert create_holding_exit(db, intruder.id, holdings[0].id, payload) is None

    exit_event = create_holding_exit(db, owner.id, holdings[0].id, payload)
    assert exit_event is not None
    assert delete_holding_exit(db, intruder.id, exit_event.id) is False


def test_exit_api_endpoints(db):
    from app.api.holdings import create_exit, delete_exit, list_exits, preview_exit

    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="exit-api@example.com",
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    holding = holdings[0]
    payload = HoldingExitCreate(
        exit_type="market_sale",
        exit_date=date(2026, 10, 1),
        quantity=Decimal("2000"),
        clean_price=Decimal("100"),
        fees=Decimal("1"),
    )

    preview = preview_exit(
        holding_id=holding.id, payload=payload, db=db, current_user=user
    )
    assert preview.quantity_after == Decimal("8000.000000")

    created = create_exit(
        holding_id=holding.id, payload=payload, db=db, current_user=user
    )
    assert created.holding_id == holding.id
    assert created.asset_symbol == "IT0005583486"
    assert created.account_name == "Directa"

    listed = list_exits(
        holding_id=holding.id, aggregate=False, db=db, current_user=user
    )
    assert [item.id for item in listed] == [created.id]

    assert delete_exit(exit_id=created.id, db=db, current_user=user) == {"ok": True}


def test_holding_exit_export_import_roundtrip(db):
    import io
    import json
    from unittest.mock import MagicMock

    from fastapi import UploadFile
    from sqlalchemy import select

    from app.api.data import export_data, import_data
    from app.models import CashLedgerEntry, HoldingExit

    owner, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="exit-export-owner@example.com",
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    exit_event = create_holding_exit(
        db,
        owner.id,
        holdings[0].id,
        HoldingExitCreate(
            exit_type="market_sale",
            exit_date=date(2026, 10, 1),
            quantity=Decimal("2000"),
            clean_price=Decimal("100"),
            fees=Decimal("1"),
        ),
    )
    assert exit_event is not None

    response = export_data(request=MagicMock(), db=db, current_user=owner)
    payload = json.loads(response.body)
    assert len(payload["holding_exits"]) == 1
    assert payload["holding_exits"][0]["holding_id"] == holdings[0].id
    assert payload["holding_exits"][0]["quantity"] == "2000.000000"

    importer = User(
        email="exit-export-importer@example.com",
        username="exit_export_importer",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(importer)
    db.commit()
    db.refresh(importer)

    upload = UploadFile(file=io.BytesIO(response.body), filename="backup.json")
    result = import_data(
        request=MagicMock(), file=upload, db=db, current_user=importer
    )
    assert result["errors"] == []
    assert result["imported"]["holding_exits"] == 1

    imported_exit = db.execute(
        select(HoldingExit).where(HoldingExit.user_id == importer.id)
    ).scalar_one()
    imported_holding = db.get(Holding, imported_exit.holding_id)
    assert imported_holding is not None
    assert imported_holding.user_id == importer.id
    assert imported_holding.quantity == Decimal("8000.000000")

    imported_ledger = db.execute(
        select(CashLedgerEntry).where(
            CashLedgerEntry.holding_exit_id == imported_exit.id
        )
    ).scalars().all()
    assert len(imported_ledger) == 1
    assert imported_ledger[0].entry_type == "asset_sale"


def test_dashboard_includes_holding_exit_realized_pnl(db):
    from app.api.dashboard import dashboard_kpis

    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="exit-dashboard@example.com",
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    exit_event = create_holding_exit(
        db,
        user.id,
        holdings[0].id,
        HoldingExitCreate(
            exit_type="market_sale",
            exit_date=date(2026, 10, 1),
            quantity=Decimal("2000"),
            clean_price=Decimal("100"),
            fees=Decimal("1"),
        ),
    )
    assert exit_event is not None

    kpis = dashboard_kpis(db=db, current_user=user)
    assert kpis["holding_exits_count"] == 1
    assert Decimal(kpis["holding_realized_pnl"]) == exit_event.realized_pnl
    assert Decimal(kpis["realized_pnl"]) == exit_event.realized_pnl

    month_key = exit_event.exit_date.strftime("%Y-%m")
    month_bucket = next(
        item for item in kpis["monthly_pnl"] if item["month"] == month_key
    )
    assert Decimal(month_bucket["realized"]) == exit_event.realized_pnl
    assert month_bucket["count"] == 1

    iso_year, iso_week, _ = exit_event.exit_date.isocalendar()
    week_key = f"{iso_year}-W{iso_week:02d}"
    week_bucket = next(
        item for item in kpis["weekly_pnl"] if item["week"] == week_key
    )
    assert Decimal(week_bucket["realized"]) == exit_event.realized_pnl

    assert Decimal(kpis["capital_gain_tax_estimate"]) >= exit_event.interest_tax


def test_bulk_exit_creates_one_exit_per_active_tranche(db):
    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="bulk-exit@example.com",
        holdings=[
            (Decimal("15000.00"), date(2024, 5, 14)),
            (Decimal("10000.00"), date(2026, 10, 26)),
        ],
    )
    payload = HoldingExitCreate(
        exit_type="market_sale",
        exit_date=date(2026, 10, 30),
        clean_price=Decimal("100"),
        fees=Decimal("10"),
    )

    preview = preview_holding_group_exit(db, user.id, holdings[0].id, payload)
    assert preview is not None
    assert preview.quantity == Decimal("25000.000000")
    assert preview.fees == Decimal("10.00")
    assert preview.quantity_after == Decimal("0.000000")
    assert any("2 tranche" in warning for warning in preview.warnings)

    exits = create_holding_group_exits(db, user.id, holdings[0].id, payload)
    assert exits is not None
    assert len(exits) == 2
    assert sum((item.quantity for item in exits), Decimal("0")) == Decimal("25000.000000")
    assert sum((item.fees for item in exits), Decimal("0")) == Decimal("10.00")
    assert {item.quantity_after for item in exits} == {Decimal("0.000000")}

    for holding in holdings:
        db.refresh(holding)
        assert holding.quantity == Decimal("0.000000")
        assert holding.closed_at == date(2026, 10, 30)

    # Idempotent: a second bulk request finds no active tranche.
    assert create_holding_group_exits(db, user.id, holdings[0].id, payload) is None


def test_auto_record_matured_holdings_is_idempotent(db):
    from app.models import HoldingExit

    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="auto-maturity@example.com",
        maturity=date(2025, 3, 5),
        holdings=[(Decimal("10000.00"), date(2024, 3, 6))],
    )
    holding = holdings[0]

    assert auto_record_matured_holdings(db, user.id) == 1
    db.refresh(holding)
    assert holding.quantity == Decimal("0.000000")
    assert holding.closed_at == date(2025, 3, 5)

    exit_event = db.execute(
        select(HoldingExit).where(HoldingExit.holding_id == holding.id)
    ).scalar_one()
    assert exit_event.exit_type == "maturity"
    assert exit_event.exit_date == date(2025, 3, 5)

    # Running the job again must not create a duplicate exit.
    assert auto_record_matured_holdings(db, user.id) == 0
    assert db.query(HoldingExit).filter(HoldingExit.holding_id == holding.id).count() == 1


def test_auto_record_matured_holdings_ignores_future_maturity(db):
    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="future-maturity@example.com",
        maturity=date(2030, 3, 5),
        holdings=[(Decimal("10000.00"), date(2024, 5, 14))],
    )
    assert auto_record_matured_holdings(db, user.id) == 0
    db.refresh(holdings[0])
    assert holdings[0].quantity == Decimal("10000.000000")


def test_bulk_exit_api_endpoints(db):
    from app.api.holdings import create_bulk_exit, preview_bulk_exit

    user, _account, _asset, holdings = _create_bond_fixture(
        db,
        email="bulk-exit-api@example.com",
        holdings=[
            (Decimal("15000.00"), date(2024, 5, 14)),
            (Decimal("10000.00"), date(2026, 10, 26)),
        ],
    )
    payload = HoldingExitCreate(
        exit_type="market_sale",
        exit_date=date(2026, 10, 30),
        clean_price=Decimal("100"),
        fees=Decimal("4"),
    )

    preview = preview_bulk_exit(
        holding_id=holdings[0].id, payload=payload, db=db, current_user=user
    )
    assert preview.quantity == Decimal("25000.000000")
    assert preview.fees == Decimal("4.00")

    created = create_bulk_exit(
        holding_id=holdings[0].id, payload=payload, db=db, current_user=user
    )
    assert len(created) == 2
    assert {item.holding_id for item in created} == {item.id for item in holdings}
