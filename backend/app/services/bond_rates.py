"""Normalization helpers for periodic bond coupon rates.

Euronext factsheets sometimes report the coupon of the current period
(quarterly or semiannual) instead of the annual rate. These helpers
annualize such values and heal rows that were stored un-normalized.

The healing logic is intentionally conservative: it only rewrites rows where
there is positive evidence of a periodic quote (a coupon rate embedded in the
asset name, or a quarterly step-up bond such as BTP Valore). Legitimately low
annual coupons must never be multiplied by the payment frequency.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Any, Optional

# Italian government step-up bonds quote coupons on a 0.05% grid.
RATE_STEP = Decimal("0.05")
SNAP_TOLERANCE = Decimal("0.02")
# A quote below this value may be a periodic coupon instead of an annual rate.
PERIODIC_RATE_MAX = Decimal("2.0")

_NAME_RATE_RE = re.compile(r"\b(\d{1,3}(?:[.,]\d{1,4})?)\s*%")


def to_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def extract_rate_from_name(name: Optional[str]) -> Optional[Decimal]:
    """Return the coupon rate embedded in an asset name (e.g. ``BTP TF 3,85% DC29``)."""
    if not name:
        return None
    match = _NAME_RATE_RE.search(name)
    if not match:
        return None
    try:
        return Decimal(match.group(1).replace(",", "."))
    except Exception:
        return None


def round_to_rate_step(
    value: Decimal,
    *,
    step: Decimal = RATE_STEP,
    tolerance: Decimal = SNAP_TOLERANCE,
) -> Decimal:
    """Snap ``value`` to the nearest multiple of ``step`` when close enough."""
    nearest = (value / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step
    if abs(value - nearest) <= tolerance:
        return nearest
    return value.quantize(Decimal("0.0001"))


def annualize_periodic_rate(raw_rate: Decimal, multiplier: int, *, snap: bool = True) -> Decimal:
    """Convert a periodic coupon into an annual rate.

    ``snap`` enables the 0.05% grid used by BTP Valore; generic bonds keep the
    plain 4-decimal conversion so a genuine annual coupon is not rounded up.
    """
    annual = to_decimal(raw_rate) * Decimal(multiplier)
    if snap:
        return round_to_rate_step(annual)
    return annual.quantize(Decimal("0.0001"))


@dataclass(frozen=True)
class BondRateHeal:
    annual_coupon_rate: Decimal
    step_up_schedule: Optional[list[Any]]
    changed: bool


def _is_step_up(bond_type: Optional[str], final_bonus_rate: Any) -> bool:
    return (bond_type or "").strip().lower() == "step_up" or to_decimal(final_bonus_rate) > 0


def _next_step_rate(new_rate: Decimal) -> Decimal:
    if new_rate == Decimal("3.35"):
        return Decimal("3.90")
    if new_rate == Decimal("4.10"):
        return Decimal("4.50")
    if new_rate == Decimal("3.25"):
        return Decimal("4.00")
    return (new_rate + Decimal("0.75")).quantize(Decimal("0.01"))


def _rebuild_step_up_schedule(
    schedule: list[Any],
    new_rate: Decimal,
    issue_date: Optional[date],
    maturity_date: Optional[date],
) -> list[Any]:
    total_years = (maturity_date.year - issue_date.year) if (issue_date and maturity_date) else 6
    rebuilt: list[Any] = []
    for step in schedule:
        if not isinstance(step, dict):
            rebuilt.append(step)
            continue
        step_rate = to_decimal(step.get("rate"))
        from_year = int(step.get("from_year", 1))
        to_year = int(step.get("to_year", 999))
        if from_year == 1:
            step_rate = new_rate
        elif step_rate < PERIODIC_RATE_MAX:
            step_rate = _next_step_rate(new_rate)
        if to_year == 5 and total_years == 6:
            to_year = 6
        rebuilt.append({"from_year": from_year, "to_year": to_year, "rate": float(step_rate)})
    return rebuilt


def heal_periodic_bond_rate(
    *,
    annual_coupon_rate: Any,
    coupon_frequency: Optional[int],
    bond_type: Optional[str],
    final_bonus_rate: Any,
    step_up_schedule: Any,
    asset_name: Optional[str],
    issue_date: Optional[date],
    maturity_date: Optional[date],
) -> BondRateHeal:
    """Return the healed coupon rate and step-up schedule for a stored bond row.

    Healing happens only when the stored rate can be proven periodic:

    * the asset name carries an annual coupon and the stored value equals that
      coupon divided by the payment frequency (e.g. ``BTP TF 1,20%`` stored as
      ``0.60`` with semiannual coupons);
    * or the bond is a quarterly step-up (BTP Valore) with an annual rate below
      2%, which can only be a quarterly quote.
    """
    rate = to_decimal(annual_coupon_rate)
    schedule = step_up_schedule if isinstance(step_up_schedule, list) else None
    step_up = _is_step_up(bond_type, final_bonus_rate)
    frequency = coupon_frequency or 0
    expected = extract_rate_from_name(asset_name)

    new_rate = rate
    rate_changed = False

    if expected is not None and expected > 0 and frequency in (2, 4) and rate > 0:
        if rate != expected and abs(rate * Decimal(frequency) - expected) <= SNAP_TOLERANCE:
            new_rate = expected
            rate_changed = True
    elif step_up and frequency == 4 and Decimal("0") < rate < PERIODIC_RATE_MAX:
        new_rate = annualize_periodic_rate(rate, 4)
        rate_changed = new_rate != rate

    new_schedule = schedule
    schedule_changed = False
    if step_up and schedule:
        first_step = schedule[0]
        first_rate = to_decimal(first_step.get("rate")) if isinstance(first_step, dict) else None
        has_periodic_evidence = rate_changed or (
            first_rate is not None
            and first_rate < PERIODIC_RATE_MAX
            and new_rate >= PERIODIC_RATE_MAX
        )
        if has_periodic_evidence:
            new_schedule = _rebuild_step_up_schedule(schedule, new_rate, issue_date, maturity_date)
            schedule_changed = new_schedule != schedule

    return BondRateHeal(
        annual_coupon_rate=new_rate,
        step_up_schedule=new_schedule,
        changed=rate_changed or schedule_changed,
    )


def _restore_first_step(schedule: Any, inflated_rate: Decimal, expected: Decimal) -> Any:
    if not isinstance(schedule, list):
        return schedule
    restored = []
    for step in schedule:
        if (
            isinstance(step, dict)
            and int(step.get("from_year", 1)) == 1
            and abs(to_decimal(step.get("rate")) - inflated_rate) <= SNAP_TOLERANCE
        ):
            step = {**step, "rate": float(expected)}
        restored.append(step)
    return restored


def restore_overhealed_rate(
    *,
    annual_coupon_rate: Any,
    coupon_frequency: Optional[int],
    asset_name: Optional[str],
    step_up_schedule: Any,
) -> BondRateHeal:
    """Undo an over-broad heal that multiplied a name coupon by the frequency.

    Example: ``BTP TF 1,20%`` with semiannual coupons stored as ``2.40`` is
    restored to ``1.20``. Only the first step of a step-up schedule is
    restored, because later steps cannot be reconstructed reliably.
    """
    rate = to_decimal(annual_coupon_rate)
    schedule = step_up_schedule if isinstance(step_up_schedule, list) else None
    frequency = coupon_frequency or 0
    expected = extract_rate_from_name(asset_name)

    if expected is None or expected <= 0 or frequency not in (2, 4) or rate <= 0:
        return BondRateHeal(rate, schedule, False)

    inflated = expected * Decimal(frequency)
    if rate == expected or abs(rate - inflated) > SNAP_TOLERANCE:
        return BondRateHeal(rate, schedule, False)

    return BondRateHeal(
        annual_coupon_rate=expected,
        step_up_schedule=_restore_first_step(schedule, rate, expected),
        changed=True,
    )
