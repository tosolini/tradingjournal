from datetime import date
from decimal import Decimal

from app.services.bond_rates import (
    annualize_periodic_rate,
    extract_rate_from_name,
    heal_periodic_bond_rate,
    restore_overhealed_rate,
)


def test_annualize_periodic_rate_snaps_btp_valore_grid():
    # 0.812% quarterly * 4 = 3.248% -> nearest 0.05% is 3.25%
    assert annualize_periodic_rate(Decimal("0.812"), 4) == Decimal("3.25")
    # 0.8375% quarterly * 4 = 3.35% (BTP Valore 2024)
    assert annualize_periodic_rate(Decimal("0.8375"), 4) == Decimal("3.35")


def test_annualize_periodic_rate_generic_keeps_full_precision():
    # Generic bonds are not on the 0.05% grid: 1.19% * 2 = 2.38%, not 2.40%
    assert annualize_periodic_rate(Decimal("1.19"), 2, snap=False) == Decimal("2.3800")


def test_extract_rate_from_name():
    assert extract_rate_from_name("BTP TF 3,85% DC29") == Decimal("3.85")
    assert extract_rate_from_name("BTP 4.3% OCT54 EUR") == Decimal("4.30")
    assert extract_rate_from_name("BTPVAL SC MG30EUR") is None
    assert extract_rate_from_name(None) is None


def test_heal_btp_valore_quarterly_rate_and_schedule():
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("0.8380"),
        coupon_frequency=4,
        bond_type="step_up",
        final_bonus_rate=Decimal("0.8"),
        step_up_schedule=[
            {"from_year": 1, "to_year": 3, "rate": 0.838},
            {"from_year": 4, "to_year": 5, "rate": 1.588},
        ],
        asset_name="BTPVAL SC MG30EUR",
        issue_date=date(2024, 5, 14),
        maturity_date=date(2030, 5, 14),
    )

    assert result.changed is True
    assert result.annual_coupon_rate == Decimal("3.35")
    assert result.step_up_schedule == [
        {"from_year": 1, "to_year": 3, "rate": 3.35},
        {"from_year": 4, "to_year": 6, "rate": 3.9},
    ]


def test_heal_leaves_legit_low_coupon_semiannual_untouched():
    """Regression: a manually entered 1.20% annual coupon must not become 2.40%."""
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("1.20"),
        coupon_frequency=2,
        bond_type="fixed",
        final_bonus_rate=Decimal("0"),
        step_up_schedule=None,
        asset_name="BTP TF DC27 EUR",
        issue_date=date(2023, 1, 1),
        maturity_date=date(2027, 1, 1),
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("1.20")


def test_heal_leaves_generic_quarterly_bond_untouched():
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("0.40"),
        coupon_frequency=4,
        bond_type="fixed",
        final_bonus_rate=Decimal("0"),
        step_up_schedule=None,
        asset_name="CORPORATE 0,4% 2030",
        issue_date=date(2024, 1, 1),
        maturity_date=date(2030, 1, 1),
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("0.40")


def test_heal_uses_rate_embedded_in_name():
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("0.60"),
        coupon_frequency=2,
        bond_type="fixed",
        final_bonus_rate=Decimal("0"),
        step_up_schedule=None,
        asset_name="BTP TF 1,20% DC27",
        issue_date=date(2023, 1, 1),
        maturity_date=date(2027, 1, 1),
    )

    assert result.changed is True
    assert result.annual_coupon_rate == Decimal("1.20")


def test_heal_name_rate_already_correct_untouched():
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("1.20"),
        coupon_frequency=2,
        bond_type="fixed",
        final_bonus_rate=Decimal("0"),
        step_up_schedule=None,
        asset_name="BTP TF 1,20% DC27",
        issue_date=date(2023, 1, 1),
        maturity_date=date(2027, 1, 1),
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("1.20")


def test_heal_leaves_step_up_futura_schedule_untouched():
    """BTP Futura low step-up coupons are annual, not periodic quotes."""
    schedule = [
        {"from_year": 1, "to_year": 3, "rate": 1.15},
        {"from_year": 4, "to_year": 6, "rate": 1.45},
        {"from_year": 7, "to_year": 10, "rate": 1.60},
    ]
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("1.15"),
        coupon_frequency=2,
        bond_type="step_up",
        final_bonus_rate=Decimal("0"),
        step_up_schedule=schedule,
        asset_name="BTP FUTURA SC NO30EUR",
        issue_date=date(2020, 11, 1),
        maturity_date=date(2030, 11, 1),
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("1.15")
    assert result.step_up_schedule == schedule


def test_heal_leaves_zero_rate_untouched():
    result = heal_periodic_bond_rate(
        annual_coupon_rate=Decimal("0"),
        coupon_frequency=4,
        bond_type="step_up",
        final_bonus_rate=Decimal("0.8"),
        step_up_schedule=[{"from_year": 1, "to_year": 3, "rate": 3.25}],
        asset_name="BTPINS OC OCT31EUR",
        issue_date=date(2026, 10, 27),
        maturity_date=date(2031, 10, 27),
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("0")


def test_restore_overhealed_rate_from_name():
    """Undo a previous over-broad heal: 1.20% * 2 = 2.40% -> 1.20%."""
    result = restore_overhealed_rate(
        annual_coupon_rate=Decimal("2.40"),
        coupon_frequency=2,
        asset_name="BTP TF 1,20% DC27",
        step_up_schedule=None,
    )

    assert result.changed is True
    assert result.annual_coupon_rate == Decimal("1.20")


def test_restore_overhealed_rate_ignores_correct_rows():
    result = restore_overhealed_rate(
        annual_coupon_rate=Decimal("1.20"),
        coupon_frequency=2,
        asset_name="BTP TF 1,20% DC27",
        step_up_schedule=None,
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("1.20")


def test_restore_overhealed_rate_ignores_rows_without_name_rate():
    result = restore_overhealed_rate(
        annual_coupon_rate=Decimal("2.40"),
        coupon_frequency=2,
        asset_name="BTP TF DC27 EUR",
        step_up_schedule=None,
    )

    assert result.changed is False
    assert result.annual_coupon_rate == Decimal("2.40")
