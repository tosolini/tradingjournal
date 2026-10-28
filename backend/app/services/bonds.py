from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import math
from typing import Any, Optional

from app.models import BondDetail


@dataclass
class BondCashFlowPoint:
    date: date
    flow_type: str  # "coupon", "redemption", "bonus"
    rate: Decimal
    gross_amount: Decimal
    tax_amount: Decimal
    net_amount: Decimal


def _add_months(d: date, months: int) -> date:
    """Add or subtract months from a date preserving the day of month when possible."""
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    # Handle shorter months (e.g. 31st into Feb/April)
    import calendar
    max_days = calendar.monthrange(year, month)[1]
    day = min(d.day, max_days)
    return date(year, month, day)


def get_coupon_dates(
    maturity_date: date,
    issue_date: Optional[date] = None,
    frequency: int = 2,
) -> list[date]:
    """Generate all coupon dates stepping backwards from maturity_date.

    If frequency == 0 (e.g. Zero-Coupon / BOT), returns [maturity_date].
    Otherwise, steps backwards by (12 / frequency) months until issue_date
    (or up to 50 years max).
    """
    if frequency <= 0:
        return [maturity_date]

    step_months = 12 // frequency
    start_bound = issue_date or (maturity_date - timedelta(days=365 * 30))

    dates = [maturity_date]
    curr = maturity_date
    for _ in range(50 * frequency):
        curr = _add_months(curr, -step_months)
        if curr <= start_bound:
            break
        dates.append(curr)

    dates.sort()
    return dates


def get_applicable_rate_for_date(
    bond_detail: BondDetail,
    target_date: date,
) -> Decimal:
    """Return the annual coupon rate applicable for target_date.

    For fixed-rate bonds, returns annual_coupon_rate.
    For step-up bonds (e.g. BTP Valore), finds the step matching the year index.
    """
    if bond_detail.bond_type != "step_up" or not bond_detail.step_up_schedule:
        return Decimal(str(bond_detail.annual_coupon_rate))

    issue = bond_detail.issue_date or (bond_detail.maturity_date - timedelta(days=365 * 5))
    if target_date < issue:
        year_idx = 1
    else:
        # 1-based year index (e.g. days 0..365 -> year 1)
        days = (target_date - issue).days
        year_idx = int(days // 365.25) + 1

    schedule = bond_detail.step_up_schedule
    if isinstance(schedule, list):
        for step in schedule:
            if isinstance(step, dict):
                from_yr = int(step.get("from_year", 1))
                to_yr = int(step.get("to_year", 999))
                if from_yr <= year_idx <= to_yr:
                    return Decimal(str(step.get("rate", bond_detail.annual_coupon_rate)))

    return Decimal(str(bond_detail.annual_coupon_rate))


def calculate_accrued_interest(
    bond_detail: BondDetail,
    as_of_date: date,
    nominal: Decimal = Decimal("100"),
) -> Decimal:
    """Calculate accrued interest (rateo maturato) at as_of_date for a given nominal.

    Returns the monetary accrued interest for the nominal.
    When nominal == Decimal("100"), returns the percentage rateo in base 100.
    """
    if (
        bond_detail.coupon_frequency <= 0
        or as_of_date >= bond_detail.maturity_date
        or (bond_detail.issue_date and as_of_date < bond_detail.issue_date)
    ):
        return Decimal("0.000000")

    all_coupon_dates = get_coupon_dates(
        maturity_date=bond_detail.maturity_date,
        issue_date=bond_detail.issue_date,
        frequency=bond_detail.coupon_frequency,
    )

    # Find the coupon period [prev_coupon, next_coupon]
    prev_date = bond_detail.issue_date
    next_date = bond_detail.maturity_date

    for i in range(len(all_coupon_dates)):
        d = all_coupon_dates[i]
        if d <= as_of_date:
            prev_date = d
        elif d > as_of_date:
            next_date = d
            break

    if prev_date is None:
        prev_date = _add_months(next_date, -(12 // bond_detail.coupon_frequency))

    days_elapsed = (as_of_date - prev_date).days
    days_period = (next_date - prev_date).days
    if days_period <= 0 or days_elapsed <= 0:
        return Decimal("0.000000")

    rate = get_applicable_rate_for_date(bond_detail, as_of_date)
    freq = Decimal(str(bond_detail.coupon_frequency))

    convention = (bond_detail.day_count_convention or "ACT/ACT ICMA").upper()
    if "360" in convention:
        # ACT/360 convention
        accrued_pct = rate * (Decimal(days_elapsed) / Decimal("360"))
    else:
        # ACT/ACT ICMA convention
        accrued_pct = (rate / freq) * (Decimal(days_elapsed) / Decimal(days_period))

    return (nominal * accrued_pct / Decimal("100")).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def get_bond_cash_flows(
    bond_detail: BondDetail,
    nominal: Decimal,
    eligible_for_bonus: bool = False,
    from_date: Optional[date] = None,
) -> list[BondCashFlowPoint]:
    """Generate all future (or all) cash flow points for a bond holding.

    Includes intermediate coupon stacchi, final capital redemption at 100%,
    and final loyalty bonus (if eligible_for_bonus and final_bonus_rate > 0).
    """
    coupon_dates = get_coupon_dates(
        maturity_date=bond_detail.maturity_date,
        issue_date=bond_detail.issue_date,
        frequency=bond_detail.coupon_frequency,
    )

    flows: list[BondCashFlowPoint] = []
    tax_factor = Decimal(str(bond_detail.tax_rate)) / Decimal("100")
    freq = Decimal(str(bond_detail.coupon_frequency)) if bond_detail.coupon_frequency > 0 else Decimal("1")

    # Intermediate coupons
    if bond_detail.coupon_frequency > 0:
        for c_date in coupon_dates:
            if from_date and c_date < from_date:
                continue

            rate = get_applicable_rate_for_date(bond_detail, c_date)
            gross = (nominal * rate / (Decimal("100") * freq)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            tax = (gross * tax_factor).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            net = gross - tax

            flows.append(
                BondCashFlowPoint(
                    date=c_date,
                    flow_type="coupon",
                    rate=rate,
                    gross_amount=gross,
                    tax_amount=tax,
                    net_amount=net,
                )
            )

    # Maturity redemption (100% of nominal)
    if not from_date or bond_detail.maturity_date >= from_date:
        flows.append(
            BondCashFlowPoint(
                date=bond_detail.maturity_date,
                flow_type="redemption",
                rate=Decimal("100.00"),
                gross_amount=nominal,
                tax_amount=Decimal("0.00"),
                net_amount=nominal,
            )
        )

        # Loyalty bonus if applicable
        if eligible_for_bonus and bond_detail.final_bonus_rate > Decimal("0"):
            bonus_rate = Decimal(str(bond_detail.final_bonus_rate))
            bonus_gross = (nominal * bonus_rate / Decimal("100")).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            bonus_tax = (bonus_gross * tax_factor).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            bonus_net = bonus_gross - bonus_tax

            flows.append(
                BondCashFlowPoint(
                    date=bond_detail.maturity_date,
                    flow_type="bonus",
                    rate=bonus_rate,
                    gross_amount=bonus_gross,
                    tax_amount=bonus_tax,
                    net_amount=bonus_net,
                )
            )

    flows.sort(key=lambda f: (f.date, 0 if f.flow_type == "coupon" else 1))
    return flows


def calculate_ytm(
    clean_price: Decimal,
    bond_detail: BondDetail,
    settlement_date: date,
    eligible_for_bonus: bool = False,
    is_net: bool = False,
) -> Decimal:
    """Calculate the annualized Yield to Maturity (YTM) for clean_price at settlement_date.

    Returns the annualized rate as percentage (e.g. Decimal("3.45") for 3.45%).
    Handles zero-coupon bonds (BOT) with standard analytical formula,
    and coupon/step-up/bonus bonds via Newton-Raphson root finding.
    """
    if settlement_date >= bond_detail.maturity_date:
        return Decimal("0.0000")

    days_to_mat = (bond_detail.maturity_date - settlement_date).days
    if days_to_mat <= 0:
        return Decimal("0.0000")

    tax_factor = Decimal(str(bond_detail.tax_rate)) / Decimal("100")

    # Analytical case: Zero-Coupon Bond (BOT)
    if bond_detail.coupon_frequency == 0 or bond_detail.bond_type == "zero_coupon":
        p = float(clean_price)
        if p <= 0:
            return Decimal("0.0000")
        if is_net:
            # Capital gain at maturity is (100 - P) * (1 - tax)
            gain = (100.0 - p) * (1.0 - float(tax_factor))
            payoff = p + gain
        else:
            payoff = 100.0
        # Annualized simple/compound yield
        ytm = ((payoff / p) ** (365.25 / days_to_mat) - 1.0) * 100.0
        return Decimal(str(round(ytm, 4)))

    # Coupon bond: target outlay is dirty price on nominal 100
    accrued = calculate_accrued_interest(bond_detail, settlement_date, nominal=Decimal("100"))
    target_pv = float(clean_price + accrued)
    if target_pv <= 0:
        return Decimal("0.0000")
    flows = get_bond_cash_flows(
        bond_detail=bond_detail,
        nominal=Decimal("100"),
        eligible_for_bonus=eligible_for_bonus,
        from_date=settlement_date,
    )

    cf_points: list[tuple[float, float]] = []
    for f in flows:
        if f.date <= settlement_date:
            continue
        t_years = (f.date - settlement_date).days / 365.25
        amt = float(f.net_amount if is_net else f.gross_amount)
        cf_points.append((t_years, amt))

    if not cf_points:
        return Decimal("0.0000")

    def pv_and_deriv(y: float) -> tuple[float, float]:
        val = -target_pv
        deriv = 0.0
        for t, amt in cf_points:
            disc = (1.0 + y) ** (-t)
            val += amt * disc
            deriv -= t * amt * ((1.0 + y) ** (-t - 1.0))
        return val, deriv

    # Initial guess
    y = float(bond_detail.annual_coupon_rate) / 100.0 if bond_detail.annual_coupon_rate else 0.03
    for _ in range(60):
        val, deriv = pv_and_deriv(y)
        if abs(val) < 1e-7:
            break
        if abs(deriv) < 1e-12:
            break
        step = val / deriv
        y = y - step
        # Keep in plausible range
        y = max(-0.5, min(2.0, y))

    return Decimal(str(round(y * 100.0, 4)))


def calculate_hpr(
    nominal: Decimal,
    entry_price_clean: Decimal,
    exit_price_clean: Decimal,
    entry_date: date,
    exit_date: date,
    accrued_in: Decimal = Decimal("0"),
    accrued_out: Decimal = Decimal("0"),
    coupons_sum: Decimal = Decimal("0"),
    fee_in: Decimal = Decimal("0"),
    fee_out: Decimal = Decimal("0"),
) -> dict[str, Any]:
    """Calculate Holding Period Return (HPR) for a bond traded on secondary market.

    Accurately separates capital gain/loss on clean price from coupon/interest earnings,
    accounting for accrued interest paid on entry and received on exit.
    """
    accrued_in_money = (nominal * accrued_in / Decimal("100"))
    accrued_out_money = (nominal * accrued_out / Decimal("100"))

    outlay = (nominal * (entry_price_clean + accrued_in) / Decimal("100")) + fee_in
    inflow = (nominal * (exit_price_clean + accrued_out) / Decimal("100")) + coupons_sum - fee_out

    capital_gain = (nominal * (exit_price_clean - entry_price_clean) / Decimal("100")) - (fee_in + fee_out)
    interest_gain = coupons_sum + accrued_out_money - accrued_in_money
    total_gain = inflow - outlay

    hpr_pct = (total_gain / outlay * Decimal("100")) if outlay > Decimal("0") else Decimal("0")

    days_held = max(1, (exit_date - entry_date).days)
    if days_held >= 30 and outlay > Decimal("0"):
        hpr_float = float(hpr_pct) / 100.0
        if hpr_float > -1.0:
            annualized = ((1.0 + hpr_float) ** (365.25 / days_held) - 1.0) * 100.0
            annualized_pct = Decimal(str(round(annualized, 4)))
        else:
            annualized_pct = Decimal("-100.0000")
    else:
        annualized_pct = hpr_pct

    return {
        "outlay": outlay.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "inflow": inflow.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "capital_gain": capital_gain.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "interest_gain": interest_gain.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "total_gain": total_gain.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "hpr_pct": hpr_pct.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        "annualized_pct": annualized_pct.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        "days_held": days_held,
    }
