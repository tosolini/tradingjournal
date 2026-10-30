from datetime import date
from decimal import Decimal
import pytest

from app.models import BondDetail
from app.services.bonds import (
    calculate_accrued_interest,
    calculate_hpr,
    calculate_ytm,
    get_applicable_rate_for_date,
    get_bond_cash_flows,
    get_coupon_dates,
)


def test_btp_classic_cash_flows():
    # BTP 3.50% maturing 2030-11-15, issued 2024-11-15, semiannual (2)
    bond = BondDetail(
        bond_type="fixed",
        issue_date=date(2024, 11, 15),
        maturity_date=date(2030, 11, 15),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("3.5000"),
        tax_rate=Decimal("12.50"),
        final_bonus_rate=Decimal("0.0000"),
    )

    flows = get_bond_cash_flows(bond, nominal=Decimal("10000.00"), from_date=date(2025, 1, 1))

    # All coupon dates after 2025-01-01 plus maturity redemption
    coupon_flows = [f for f in flows if f.flow_type == "coupon"]
    redemption_flows = [f for f in flows if f.flow_type == "redemption"]

    assert len(redemption_flows) == 1
    assert redemption_flows[0].gross_amount == Decimal("10000.00")
    assert redemption_flows[0].net_amount == Decimal("10000.00")

    # Each semiannual coupon on 10,000 nominal at 3.5% is 175.00 gross
    for cf in coupon_flows:
        assert cf.gross_amount == Decimal("175.000000")
        # 175 * 0.125 = 21.875 tax -> 153.125 net
        assert cf.tax_amount == Decimal("21.875000")
        assert cf.net_amount == Decimal("153.125000")


def test_btp_accrued_interest():
    # BTP 3.50% maturing 2030-11-15, issued 2024-11-15
    bond = BondDetail(
        bond_type="fixed",
        issue_date=date(2024, 11, 15),
        maturity_date=date(2030, 11, 15),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("3.5000"),
        day_count_convention="ACT/ACT ICMA",
    )

    # Day of coupon stacco: accrued is 0
    acc_0 = calculate_accrued_interest(bond, as_of_date=date(2024, 11, 15), nominal=Decimal("10000"))
    assert acc_0 == Decimal("0.000000")

    # Halfway through semiannual coupon (approx 91 days into ~181 days):
    # Total coupon is 175. Halfway is around 87.50
    acc_mid = calculate_accrued_interest(bond, as_of_date=date(2025, 2, 14), nominal=Decimal("10000"))
    assert Decimal("80.00") < acc_mid < Decimal("95.00")

    # After maturity: accrued is 0
    acc_after = calculate_accrued_interest(bond, as_of_date=date(2031, 1, 1), nominal=Decimal("10000"))
    assert acc_after == Decimal("0.000000")


def test_btp_valore_step_up_and_loyalty_bonus():
    # BTP Valore 5 years: years 1-3 @ 3.25%, years 4-5 @ 4.00%, final bonus 0.80%
    bond = BondDetail(
        bond_type="step_up",
        issue_date=date(2025, 3, 10),
        maturity_date=date(2030, 3, 10),
        coupon_frequency=4,  # quarterly
        annual_coupon_rate=Decimal("3.2500"),
        step_up_schedule=[
            {"from_year": 1, "to_year": 3, "rate": 3.25},
            {"from_year": 4, "to_year": 5, "rate": 4.00},
        ],
        final_bonus_rate=Decimal("0.8000"),
        tax_rate=Decimal("12.50"),
    )

    # Check rates in year 2 vs year 4
    rate_y2 = get_applicable_rate_for_date(bond, date(2026, 6, 10))
    rate_y4 = get_applicable_rate_for_date(bond, date(2028, 6, 10))
    assert rate_y2 == Decimal("3.25")
    assert rate_y4 == Decimal("4.00")

    # Case A: eligible_for_bonus = True
    flows_with_bonus = get_bond_cash_flows(bond, nominal=Decimal("10000.00"), eligible_for_bonus=True)
    bonus_flows = [f for f in flows_with_bonus if f.flow_type == "bonus"]
    assert len(bonus_flows) == 1
    # 10,000 * 0.80% = 80.00 gross -> 80 * 0.125 = 10 tax -> 70 net
    assert bonus_flows[0].gross_amount == Decimal("80.000000")
    assert bonus_flows[0].tax_amount == Decimal("10.000000")
    assert bonus_flows[0].net_amount == Decimal("70.000000")

    # Case B: eligible_for_bonus = False (bought on secondary market)
    flows_no_bonus = get_bond_cash_flows(bond, nominal=Decimal("10000.00"), eligible_for_bonus=False)
    assert not any(f.flow_type == "bonus" for f in flows_no_bonus)


def test_bot_zero_coupon_ytm():
    # BOT 12 months: bought at 96.50 with 360 days to maturity
    bond = BondDetail(
        bond_type="zero_coupon",
        coupon_frequency=0,
        issue_date=date(2025, 1, 1),
        maturity_date=date(2026, 1, 1),
        annual_coupon_rate=Decimal("0.0000"),
        tax_rate=Decimal("12.50"),
    )

    ytm_gross = calculate_ytm(
        clean_price=Decimal("96.50"),
        bond_detail=bond,
        settlement_date=date(2025, 1, 1),
        is_net=False,
    )
    # Gross yield: (100 / 96.50 - 1) * (365.25 / 365) * 100 ~= 3.63%
    assert Decimal("3.50") < ytm_gross < Decimal("3.80")

    ytm_net = calculate_ytm(
        clean_price=Decimal("96.50"),
        bond_detail=bond,
        settlement_date=date(2025, 1, 1),
        is_net=True,
    )
    assert ytm_net < ytm_gross
    assert Decimal("3.00") < ytm_net < Decimal("3.35")


def test_ytm_fixed_above_and_below_par():
    bond = BondDetail(
        bond_type="fixed",
        issue_date=date(2025, 1, 1),
        maturity_date=date(2030, 1, 1),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("3.0000"),
        tax_rate=Decimal("12.50"),
    )

    # Par (100): gross YTM should be equal to coupon rate 3.00%
    ytm_par = calculate_ytm(Decimal("100.00"), bond, settlement_date=date(2025, 1, 1), is_net=False)
    assert Decimal("2.95") <= ytm_par <= Decimal("3.05")

    # Below par (95): gross YTM should be higher than 3.00%
    ytm_below = calculate_ytm(Decimal("95.00"), bond, settlement_date=date(2025, 1, 1), is_net=False)
    assert ytm_below > Decimal("3.90")

    # Above par (105): gross YTM should be lower than 3.00%
    ytm_above = calculate_ytm(Decimal("105.00"), bond, settlement_date=date(2025, 1, 1), is_net=False)
    assert ytm_above < Decimal("2.20")


def test_hpr_secondary_market_trade():
    # Buy 10,000 nominal at 98.00 (accrued in = 0.50), sell at 101.00 (accrued out = 0.80)
    # 1 coupon received = 175.00
    res = calculate_hpr(
        nominal=Decimal("10000.00"),
        entry_price_clean=Decimal("98.00"),
        exit_price_clean=Decimal("101.00"),
        entry_date=date(2025, 1, 1),
        exit_date=date(2025, 10, 1),
        accrued_in=Decimal("0.50"),
        accrued_out=Decimal("0.80"),
        coupons_sum=Decimal("175.00"),
        fee_in=Decimal("5.00"),
        fee_out=Decimal("5.00"),
    )

    # Outlay = 10000 * 98.50 / 100 + 5 = 9855.00
    assert res["outlay"] == Decimal("9855.00")

    # Inflow = 10000 * 101.80 / 100 + 175 - 5 = 10180 + 175 - 5 = 10350.00
    assert res["inflow"] == Decimal("10350.00")

    # Capital gain on clean price: 10000 * (101 - 98) / 100 - 10 = 300 - 10 = 290.00
    assert res["capital_gain"] == Decimal("290.00")

    # Interest gain: 175 + (80 - 50) = 205.00
    assert res["interest_gain"] == Decimal("205.00")

    # Total gain = 290 + 205 = 495.00
    assert res["total_gain"] == Decimal("495.00")
    assert res["hpr_pct"] == Decimal("5.0228")  # 495 / 9855 * 100

def test_portfolio_holding_details_with_bond(db, monkeypatch):
    from app.models import User, Account, Asset, Holding, BondDetail
    from app.services.portfolio import get_holding_details
    from app.security import hash_password

    user = User(
        email="bondholder@example.com",
        username="bondholder",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="BondAccount", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    asset = Asset(
        user_id=user.id,
        symbol="IT0005518128",
        name="BTP 3.50% 2030",
        instrument_type="bond",
        currency="EUR",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    bond_detail = BondDetail(
        asset_id=asset.id,
        bond_type="fixed",
        issue_date=date(2024, 11, 15),
        maturity_date=date(2030, 11, 15),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("3.5000"),
        tax_rate=Decimal("12.50"),
    )
    db.add(bond_detail)
    db.commit()

    holding = Holding(
        user_id=user.id,
        account_id=account.id,
        asset_id=asset.id,
        quantity=Decimal("10000.00"),
        avg_cost=Decimal("98.00"),
        accrued_interest_in=Decimal("0.50"),
        entry_date=date(2025, 1, 10),
        eligible_for_bonus=False,
    )
    db.add(holding)
    db.commit()

    monkeypatch.setattr("app.services.portfolio.get_current_price", lambda *_a, **_kw: Decimal("100.00"))

    details = get_holding_details(db, user_id=user.id)
    assert len(details) == 1
    d = details[0]

    # Cost basis = 10000 * (98.00 + 0.50) / 100 = 9850.00
    assert d.quantity == Decimal("10000.00")
    assert d.avg_cost == Decimal("98.00")
    assert d.accrued_interest_in == Decimal("0.50")
    assert d.dirty_price is not None
    assert d.dirty_price >= Decimal("100.00")
    # Market value is on base 100: 10000 * dirty_price / 100
    expected_mv = (Decimal("10000.00") * d.dirty_price) / Decimal("100")
    assert d.market_value == expected_mv
    assert d.ytm_gross is not None
    assert d.ytm_net is not None
    assert d.ytm_gross > Decimal("0")


def test_portfolio_daily_pnl_neutrality_with_coupon(db):
    from app.models import User, Account, CashLedgerEntry, PortfolioSnapshot
    from app.services.portfolio import get_daily_pnl_series
    from app.security import hash_password

    user = User(
        email="couponuser@example.com",
        username="couponuser",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="Acc", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    # Day 1: snapshot 10,000
    s1 = PortfolioSnapshot(
        account_id=account.id,
        snapshot_date=date(2025, 5, 1),
        total_value=Decimal("10000.00"),
        total_cost=Decimal("10000.00"),
        total_return=Decimal("0.00"),
        total_return_pct=Decimal("0.00"),
    )
    # Day 2: snapshot 9,850 (bond value drops ex-coupon)
    s2 = PortfolioSnapshot(
        account_id=account.id,
        snapshot_date=date(2025, 5, 2),
        total_value=Decimal("9850.00"),
        total_cost=Decimal("10000.00"),
        total_return=Decimal("-150.00"),
        total_return_pct=Decimal("-1.50"),
    )
    db.add_all([s1, s2])

    # On Day 2, a coupon of 150.00 is credited in CashLedger
    entry = CashLedgerEntry(
        account_id=account.id,
        entry_type="coupon",
        amount=Decimal("150.00"),
        entry_date=date(2025, 5, 2),
        description="BTP Semiannual Coupon",
    )
    db.add(entry)
    db.commit()

    series = get_daily_pnl_series(db, user_id=user.id)
    assert len(series) == 2

    day2 = series[1]
    # Coupon income is an internal inflow: it must not look like a market loss.
    assert day2.net_cash_flow == Decimal("-150.00")
    assert day2.day_pnl == Decimal("0.00")
    assert day2.cumulative_pnl == Decimal("0.00")
    assert day2.investment_inflows == Decimal("150.00")
    assert day2.total_wealth == Decimal("10000.00")

def test_bonds_api_crud_calendar_and_metrics(db):
    from app.models import User, Account
    from app.schemas import AssetCreate, AssetUpdate, BondDetailCreate, BondDetailUpdate, HoldingCreate
    from app.api.assets import create_asset, list_assets, update_asset
    from app.api.holdings import create_holding
    from app.api.bonds import get_bond_calendar, get_bond_metrics
    from app.security import hash_password

    user = User(
        email="bondapi@example.com",
        username="bondapi",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="Fineco Bond", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    # 1. Create asset with bond_detail
    asset_res = create_asset(
        payload=AssetCreate(
            symbol="IT0005518128",
            name="BTP 3.50% 2030",
            isin="IT0005518128",
            instrument_type="bond",
            currency="EUR",
            bond_detail=BondDetailCreate(
                bond_type="fixed",
                issue_date=date(2024, 11, 15),
                maturity_date=date(2030, 11, 15),
                coupon_frequency=2,
                annual_coupon_rate=Decimal("3.5000"),
                tax_rate=Decimal("12.50"),
            ),
        ),
        db=db,
        current_user=user,
    )
    assert asset_res.bond_detail is not None
    assert asset_res.bond_detail.annual_coupon_rate == Decimal("3.5000")
    assert asset_res.bond_detail.maturity_date == date(2030, 11, 15)

    # 2. List assets includes bond_detail
    all_assets = list_assets(db=db, current_user=user)
    assert len(all_assets) == 1
    assert all_assets[0].bond_detail is not None
    assert all_assets[0].bond_detail.bond_type == "fixed"

    # 3. Update asset and bond_detail
    updated = update_asset(
        asset_id=asset_res.id,
        payload=AssetUpdate(
            name="BTP TF 3.50% 2030 Updated",
            bond_detail=BondDetailUpdate(annual_coupon_rate=Decimal("3.7500")),
        ),
        db=db,
        current_user=user,
    )
    assert updated.name == "BTP TF 3.50% 2030 Updated"
    assert updated.bond_detail.annual_coupon_rate == Decimal("3.7500")

    # 4. Create holding
    holding_res = create_holding(
        payload=HoldingCreate(
            account_id=account.id,
            asset_id=asset_res.id,
            quantity=Decimal("10000.00"),
            avg_cost=Decimal("98.50"),
            entry_date=date(2025, 1, 1),
            accrued_interest_in=Decimal("0.40"),
            eligible_for_bonus=True,
        ),
        db=db,
        current_user=user,
    )
    assert holding_res.accrued_interest_in == Decimal("0.40")
    assert holding_res.eligible_for_bonus is True

    # 5. Bond Calendar endpoint
    calendar_items = get_bond_calendar(db=db, current_user=user)
    assert len(calendar_items) > 0
    assert calendar_items[0].asset_symbol == "IT0005518128"
    assert calendar_items[0].account_name == "Fineco Bond"
    assert calendar_items[0].gross_amount > Decimal("0")

    # 6. Bond Metrics endpoint
    metrics = get_bond_metrics(db=db, current_user=user)
    assert metrics.bonds_count == 1
    assert metrics.total_nominal == Decimal("10000.00")
    assert metrics.total_market_value > Decimal("0")
    assert metrics.weighted_ytm_gross > Decimal("0")
    assert metrics.estimated_annual_income_net > Decimal("0")

    # 7. Holding with future exit_date (e.g. maturity date) is included
    asset_res2 = create_asset(
        payload=AssetCreate(
            symbol="IT0005611741",
            name="BTP 4.3% 2054",
            isin="IT0005611741",
            instrument_type="bond",
            currency="EUR",
            bond_detail=BondDetailCreate(
                bond_type="fixed",
                issue_date=date(2024, 9, 17),
                maturity_date=date(2054, 10, 1),
                coupon_frequency=2,
                annual_coupon_rate=Decimal("4.3000"),
                tax_rate=Decimal("12.50"),
            ),
        ),
        db=db,
        current_user=user,
    )
    create_holding(
        payload=HoldingCreate(
            account_id=account.id,
            asset_id=asset_res2.id,
            quantity=Decimal("10000.00"),
            avg_cost=Decimal("99.00"),
            entry_date=date(2025, 1, 1),
            exit_date=date(2054, 10, 1),
        ),
        db=db,
        current_user=user,
    )
    metrics2 = get_bond_metrics(db=db, current_user=user)
    assert metrics2.bonds_count == 2
    assert metrics2.total_nominal == Decimal("20000.00")

    # 8. Holding with past exit_date (closed position) is excluded
    asset_res3 = create_asset(
        payload=AssetCreate(
            symbol="IT0001234567",
            name="Old Matured BTP",
            isin="IT0001234567",
            instrument_type="bond",
            currency="EUR",
            bond_detail=BondDetailCreate(
                bond_type="fixed",
                issue_date=date(2015, 1, 1),
                maturity_date=date(2020, 1, 1),
                coupon_frequency=2,
                annual_coupon_rate=Decimal("2.0000"),
                tax_rate=Decimal("12.50"),
            ),
        ),
        db=db,
        current_user=user,
    )
    create_holding(
        payload=HoldingCreate(
            account_id=account.id,
            asset_id=asset_res3.id,
            quantity=Decimal("5000.00"),
            avg_cost=Decimal("95.00"),
            entry_date=date(2015, 1, 1),
            exit_date=date(2020, 1, 1),
        ),
        db=db,
        current_user=user,
    )
    metrics3 = get_bond_metrics(db=db, current_user=user)
    assert metrics3.bonds_count == 2
    assert metrics3.total_nominal == Decimal("20000.00")

def test_parse_euronext_bond_query():
    from app.services.euronext import parse_euronext_bond_query

    isin, mic = parse_euronext_bond_query("https://live.euronext.com/en/product/bonds/IT0005611741-MOTX")
    assert isin == "IT0005611741"
    assert mic == "MOTX"

    isin, mic = parse_euronext_bond_query("IT0005735227")
    assert isin == "IT0005735227"
    assert mic == "MOTX"

    isin, mic = parse_euronext_bond_query("IT0005735227-MOTX")
    assert isin == "IT0005735227"
    assert mic == "MOTX"

    with pytest.raises(ValueError):
        parse_euronext_bond_query("invalid_query")


def test_euronext_lookup_endpoint(monkeypatch):
    from app.models import User
    from app.schemas import BondLookupRequest
    from app.api.bonds import lookup_bond

    fake_user = User(id=1, email="test@example.com", username="tester")

    monkeypatch.setattr(
        "app.services.euronext.fetch_euronext_bond_details",
        lambda q: {
            "symbol": "IT0005611741",
            "name": "BTP FX 4.3% OCT54 EUR",
            "isin": "IT0005611741",
            "exchange": "MOT",
            "currency": "EUR",
            "instrument_type": "bond",
            "live_price": Decimal("90.30"),
            "issue_price": Decimal("99.789"),
            "bond_detail": {
                "bond_type": "fixed",
                "issue_date": date(2024, 9, 17),
                "maturity_date": date(2054, 10, 1),
                "coupon_frequency": 2,
                "annual_coupon_rate": Decimal("4.3000"),
                "step_up_schedule": None,
                "final_bonus_rate": Decimal("0.0000"),
                "tax_rate": Decimal("12.50"),
                "day_count_convention": "ACT/ACT ICMA",
            },
        },
    )

    res = lookup_bond(
        payload=BondLookupRequest(query="https://live.euronext.com/en/product/bonds/IT0005611741-MOTX"),
        _current_user=fake_user,
    )
    assert res.symbol == "IT0005611741"
    assert res.name == "BTP FX 4.3% OCT54 EUR"
    assert res.live_price == Decimal("90.30")
    assert res.bond_detail.annual_coupon_rate == Decimal("4.3000")
    assert res.bond_detail.maturity_date == date(2054, 10, 1)

def test_single_holding_detail_and_history(db):
    from app.api.bonds import get_bond_calendar
    from app.api.portfolio import holding_calendar, holding_detail, holding_price_history
    from app.models import Account, Asset, BondDetail, Holding, User
    from app.security import hash_password

    user = User(
        email="bondholder@example.com",
        username="bondholder",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = Account(name="Directa", user_id=user.id, base_currency="EUR")
    db.add(acc)
    db.commit()
    db.refresh(acc)

    asset = Asset(
        user_id=user.id,
        symbol="IT0005611741",
        name="BTP 4.30% Oct 2054",
        isin="IT0005611741",
        instrument_type="bond",
        exchange="MOT",
        currency="EUR",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    bond = BondDetail(
        asset_id=asset.id,
        bond_type="fixed",
        issue_date=date(2024, 9, 17),
        maturity_date=date(2054, 10, 1),
        coupon_frequency=2,
        annual_coupon_rate=Decimal("4.3000"),
        tax_rate=Decimal("12.50"),
        final_bonus_rate=Decimal("0.0000"),
    )
    db.add(bond)
    db.commit()

    holding = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset.id,
        quantity=Decimal("10000.00"),
        avg_cost=Decimal("95.00"),
        entry_date=date(2024, 10, 1),
        accrued_interest_in=Decimal("0.15"),
        eligible_for_bonus=False,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)

    # 1. Test holding_detail
    detail = holding_detail(holding_id=holding.id, db=db, current_user=user)
    assert detail.id == holding.id
    assert detail.asset_symbol == "IT0005611741"
    assert detail.account_name == "Directa"
    assert detail.quantity == Decimal("10000.00")
    assert detail.avg_cost == Decimal("95.00")
    assert detail.entry_date == date(2024, 10, 1)
    assert detail.bond_detail is not None
    assert detail.bond_detail.maturity_date == date(2054, 10, 1)
    assert detail.nominal_yield == Decimal("4.3000")
    assert detail.ytm_net is not None
    assert detail.hold_duration_days is not None and detail.hold_duration_days > 0
    assert detail.remaining_days is not None and detail.remaining_days > 0

    # 2. Test holding_price_history
    history = holding_price_history(holding_id=holding.id, db=db, current_user=user)
    assert history.symbol == "IT0005611741"
    assert history.nominal_price == Decimal("100.00")
    assert len(history.points) >= 2
    # First point should be entry_date
    assert history.points[0].date == "2024-10-01"
    assert history.points[0].avg_cost == Decimal("95.00")
    # Last projection point should be maturity date at 100
    assert history.points[-1].date == "2054-10-01"
    assert history.points[-1].market_price == Decimal("100.00")

    # 3. Test holding_calendar
    cal = holding_calendar(holding_id=holding.id, db=db, current_user=user)
    assert len(cal) > 0
    assert all(c.holding_id == holding.id for c in cal)
    assert all(c.asset_symbol == "IT0005611741" for c in cal)

    # 4. Test /api/bonds/calendar filter by holding_id
    filtered_cal = get_bond_calendar(holding_id=holding.id, db=db, current_user=user)
    assert len(filtered_cal) == len(cal)


def test_euronext_bond_rate_normalization_and_step_up(monkeypatch):
    """Verify periodic coupons (e.g. 0.812% quarterly for BTP Valore) are converted to annual (3.25%)."""
    from app.services.euronext import fetch_euronext_bond_details

    # Mock urllib.request to return BTP Valore factsheet
    import io

    class DummyResponse:
        def __init__(self, content: bytes):
            self.content = content
        def read(self):
            return self.content
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    def dummy_urlopen(req, timeout=10):
        url = req.full_url if hasattr(req, "full_url") else str(req)
        if "fs_couponinfo_block" in url or "fs_info_block" in url:
            html = b"""
            <table>
                <tr><td>Sub type</td><td>Btp Valore</td></tr>
                <tr><td>Issue Date</td><td>05/03/2024</td></tr>
                <tr><td>Repayment date</td><td>05/03/2030</td></tr>
                <tr><td>Interest Rate</td><td>0.812%</td></tr>
                <tr><td>Interest rate frequency</td><td>Quarterly</td></tr>
                <tr><td>Market</td><td>MOT</td></tr>
            </table>
            """
            return DummyResponse(html)
        elif "/ajax/getFactsheetInfoBlock/" in url:
            return DummyResponse(b"<table></table>")
        else:
            # Main page
            return DummyResponse(b'<html><head><title>BTPVAL SC MZ30EUR</title></head><body></body></html>')

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", dummy_urlopen)

    res = fetch_euronext_bond_details("IT0005583486")
    bd = res["bond_detail"]
    # 0.812% quarterly * 4 = 3.248% -> rounded to 3.25%
    assert bd["annual_coupon_rate"] == Decimal("3.25")
    assert bd["coupon_frequency"] == 4
    assert bd["bond_type"] == "step_up"
    assert bd["step_up_schedule"] == [
        {"from_year": 1, "to_year": 3, "rate": 3.25},
        {"from_year": 4, "to_year": 6, "rate": 4.0},
    ]


def test_sync_asset_and_holding_euronext(db, monkeypatch):
    from app.models import User, Account, Asset, Holding, BondDetail
    from app.api.assets import sync_asset_euronext
    from app.api.portfolio import holding_sync_euronext

    user = User(email="test_sync@example.com", username="test_sync", hashed_password="pw")
    db.add(user)
    db.commit()

    account = Account(user_id=user.id, name="Test BTP Account")
    db.add(account)
    db.commit()

    # Create asset with old buggy bond_detail (quarterly rate 0.838)
    asset = Asset(
        user_id=user.id,
        symbol="IT0005594483",
        name="BTPVAL SC MG30EUR",
        isin="IT0005594483",
        instrument_type="bond",
        exchange="MOT",
        currency="EUR",
    )
    db.add(asset)
    db.commit()

    bd = BondDetail(
        asset_id=asset.id,
        bond_type="step_up",
        issue_date=date(2024, 5, 14),
        maturity_date=date(2030, 5, 14),
        coupon_frequency=4,
        annual_coupon_rate=Decimal("0.8380"),
        step_up_schedule=[
            {"from_year": 1, "to_year": 3, "rate": 0.838},
            {"from_year": 4, "to_year": 5, "rate": 1.588},
        ],
        final_bonus_rate=Decimal("0.8000"),
        tax_rate=Decimal("12.50"),
    )
    db.add(bd)
    db.commit()

    holding = Holding(
        user_id=user.id,
        account_id=account.id,
        asset_id=asset.id,
        quantity=Decimal("15000"),
        avg_cost=Decimal("100"),
        entry_date=date(2024, 5, 14),
        exit_date=date(2030, 5, 14),
        eligible_for_bonus=True,
    )
    db.add(holding)
    db.commit()

    # Mock euronext fetch
    mock_data = {
        "symbol": "IT0005594483",
        "name": "BTPVAL SC MG30EUR",
        "isin": "IT0005594483",
        "instrument_type": "bond",
        "exchange": "MOT",
        "currency": "EUR",
        "live_price": Decimal("99.59"),
        "bond_detail": {
            "bond_type": "step_up",
            "issue_date": date(2024, 5, 14),
            "maturity_date": date(2030, 5, 14),
            "coupon_frequency": 4,
            "annual_coupon_rate": Decimal("3.35"),
            "step_up_schedule": [
                {"from_year": 1, "to_year": 3, "rate": 3.35},
                {"from_year": 4, "to_year": 6, "rate": 3.90},
            ],
            "final_bonus_rate": Decimal("0.8000"),
            "tax_rate": Decimal("12.50"),
            "day_count_convention": "ACT/ACT ICMA",
        },
    }
    monkeypatch.setattr("app.services.euronext.fetch_euronext_bond_details", lambda q: mock_data)

    # 1. Test sync_asset_euronext
    res_asset = sync_asset_euronext(asset_id=asset.id, db=db, current_user=user)
    assert res_asset.bond_detail.annual_coupon_rate == Decimal("3.3500")
    assert res_asset.bond_detail.step_up_schedule[1]["to_year"] == 6

    # 2. Test holding_sync_euronext
    res_holding = holding_sync_euronext(holding_id=holding.id, db=db, current_user=user)
    assert res_holding.nominal_yield == Decimal("3.35")
    assert res_holding.bond_detail.annual_coupon_rate == Decimal("3.3500")
    assert res_holding.ytm_gross > Decimal("3.5")


def test_sync_euronext_rejects_non_bond_asset(db):
    from fastapi import HTTPException

    from app.api.assets import sync_asset_euronext
    from app.models import Asset, User

    user = User(email="test_sync_guard@example.com", username="test_sync_guard", hashed_password="pw")
    db.add(user)
    db.commit()

    asset = Asset(
        user_id=user.id,
        symbol="AAPL",
        name="Apple Inc.",
        instrument_type="stock",
        currency="USD",
    )
    db.add(asset)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        sync_asset_euronext(asset_id=asset.id, db=db, current_user=user)

    assert exc.value.status_code == 400


def _make_aggregated_bond_fixture(db, instrument_type="bond"):
    from app.models import Account, Asset, BondDetail, Holding, User
    from app.security import hash_password

    user = User(
        email=f"agg-{instrument_type}@example.com",
        username=f"agg_{instrument_type}",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = Account(name="Directa", user_id=user.id, base_currency="EUR")
    db.add(acc)
    db.commit()
    db.refresh(acc)

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

    bond = BondDetail(
        asset_id=asset.id,
        bond_type="fixed",
        issue_date=date(2023, 3, 5),
        maturity_date=date(2030, 3, 5),
        coupon_frequency=4,
        annual_coupon_rate=Decimal("3.2500"),
        tax_rate=Decimal("12.50"),
        final_bonus_rate=Decimal("0.8000"),
    )
    db.add(bond)
    db.commit()

    h1 = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset.id,
        quantity=Decimal("15000.00"),
        avg_cost=Decimal("100.00"),
        entry_date=date(2024, 5, 14),
        eligible_for_bonus=True,
    )
    h2 = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset.id,
        quantity=Decimal("10000.00"),
        avg_cost=Decimal("100.00"),
        entry_date=date(2026, 10, 26),
        eligible_for_bonus=True,
    )
    db.add_all([h1, h2])
    db.commit()
    db.refresh(h1)
    db.refresh(h2)
    return user, acc, asset, h1, h2


def test_aggregated_holding_detail_calendar_and_history(db, monkeypatch):
    from app.api.portfolio import holding_calendar, holding_detail, holding_price_history

    user, _acc, _asset, h1, h2 = _make_aggregated_bond_fixture(db)
    monkeypatch.setattr(
        "app.services.portfolio.get_current_price",
        lambda *_args, **_kwargs: Decimal("100.00"),
    )

    detail = holding_detail(holding_id=h1.id, aggregate=True, db=db, current_user=user)
    assert detail.id == h1.id
    assert detail.tranche_count == 2
    assert len(detail.tranches) == 2
    assert {t.id for t in detail.tranches} == {h1.id, h2.id}
    assert detail.all_eligible_for_bonus is True
    assert detail.has_eligible_for_bonus is True
    assert detail.quantity == Decimal("25000.00")
    assert detail.avg_cost == Decimal("100.00")
    assert detail.market_value - detail.return_value == Decimal("25000.00")
    assert detail.return_value == detail.market_value - Decimal("25000.00")
    assert detail.market_value > Decimal("25000.00")
    # Weighted YTM must match the single tranche (same price and bond).
    single = holding_detail(holding_id=h1.id, db=db, current_user=user)
    assert detail.ytm_net == single.ytm_net

    # Backward compatibility: without aggregate only the requested tranche is returned.
    assert single.quantity == Decimal("15000.00")
    assert single.tranche_count == 1
    assert single.tranches == []

    # Aggregated calendar consolidates coupons by (date, flow_type).
    cal = holding_calendar(
        holding_id=h1.id,
        from_date=date(2026, 1, 1),
        to_date=date(2031, 1, 1),
        aggregate=True,
        db=db,
        current_user=user,
    )
    keys = [(c.date, c.flow_type) for c in cal]
    assert len(keys) == len(set(keys))
    redemption = [c for c in cal if c.flow_type == "redemption"]
    assert len(redemption) == 1
    assert redemption[0].net_amount == Decimal("25000.00")
    first_coupon = next(c for c in cal if c.flow_type == "coupon")
    assert first_coupon.net_amount == Decimal("177.734375")
    bonus = [c for c in cal if c.flow_type == "bonus"]
    assert len(bonus) == 1
    assert bonus[0].gross_amount == Decimal("200.000000")

    # Aggregated price history uses the earliest entry date and weighted avg cost.
    history = holding_price_history(
        holding_id=h1.id, aggregate=True, db=db, current_user=user
    )
    assert history.avg_cost == Decimal("100.00")
    assert history.points[0].date == "2024-05-14"
    assert history.points[0].avg_cost == Decimal("100.00")

    single_history = holding_price_history(
        holding_id=h2.id, db=db, current_user=user
    )
    assert single_history.points[0].date == "2026-10-26"


def test_government_bond_uses_bond_valuation(db, monkeypatch):
    from app.services.portfolio import get_holding_details, get_single_holding_detail

    user, _acc, _asset, h1, _h2 = _make_aggregated_bond_fixture(
        db, instrument_type="government_bond"
    )
    monkeypatch.setattr(
        "app.services.portfolio.get_current_price",
        lambda *_args, **_kwargs: Decimal("100.00"),
    )

    details = get_holding_details(db, user.id)
    assert len(details) == 2
    for item in details:
        # Bond formula: qty * (clean price + accrued) / 100, NOT price * qty.
        assert item.market_value < Decimal("20000.00")
        assert item.market_value - item.return_value == item.quantity

    single = get_single_holding_detail(db, user.id, h1.id)
    assert single is not None
    assert single.market_value < Decimal("20000.00")


def test_bond_metrics_counts_distinct_assets_not_tranches(db, monkeypatch):
    from app.api.bonds import get_bond_metrics

    user, _acc, _asset, _h1, _h2 = _make_aggregated_bond_fixture(db)
    monkeypatch.setattr(
        "app.api.bonds.get_current_price",
        lambda *_args, **_kwargs: Decimal("100.00"),
    )

    metrics = get_bond_metrics(db=db, current_user=user)
    assert metrics.bonds_count == 1
    assert metrics.total_nominal == Decimal("25000.00")


def test_bond_calendar_aggregate_consolidates_tranches(db):
    from app.api.bonds import get_bond_calendar

    user, _acc, _asset, _h1, _h2 = _make_aggregated_bond_fixture(db)
    params = {
        "from_date": date(2026, 1, 1),
        "to_date": date(2031, 1, 1),
        "db": db,
        "current_user": user,
    }

    raw = get_bond_calendar(**params)
    aggregated = get_bond_calendar(**params, aggregate=True)

    assert len(aggregated) < len(raw)
    keys = [(c.date, c.flow_type) for c in aggregated]
    assert len(keys) == len(set(keys))

    raw_first_coupon = [
        c for c in raw if c.flow_type == "coupon" and c.date == date(2026, 12, 5)
    ]
    assert len(raw_first_coupon) == 2

    aggregated_first_coupon = next(
        c for c in aggregated if c.flow_type == "coupon" and c.date == date(2026, 12, 5)
    )
    assert aggregated_first_coupon.net_amount == Decimal("177.734375")

    redemption = [c for c in aggregated if c.flow_type == "redemption"]
    assert len(redemption) == 1
    assert redemption[0].net_amount == Decimal("25000.00")
