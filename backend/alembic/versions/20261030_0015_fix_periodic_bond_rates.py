"""fix periodic bond rates and step-up schedules

Revision ID: 20261030_0015
Revises: 20261030_0014
Create Date: 2026-10-30
"""

from collections.abc import Sequence
from decimal import Decimal, ROUND_HALF_UP
import json

from alembic import op
import sqlalchemy as sa


revision: str = "20261030_0015"
down_revision: str | None = "20261030_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("""
            SELECT bd.id, bd.asset_id, bd.bond_type, bd.coupon_frequency, bd.annual_coupon_rate,
                   bd.step_up_schedule, bd.issue_date, bd.maturity_date, a.symbol, a.name
            FROM bond_details bd
            JOIN assets a ON a.id = bd.asset_id
        """)
    ).fetchall()

    for row in rows:
        bd_id = row[0]
        bond_type = row[2]
        freq = row[3]
        rate = Decimal(str(row[4])) if row[4] is not None else Decimal("0")
        schedule = row[5]
        issue_d = row[6]
        mat_d = row[7]
        name = (row[9] or "").lower()

        updated = False
        new_rate = rate
        new_schedule = schedule

        # Check periodic coupon rate (< 2.0% when frequency is 4 or 2)
        if freq == 4 and Decimal("0") < rate < Decimal("2.0"):
            annual_val = rate * Decimal("4")
            step = Decimal("0.05")
            nearest = (annual_val / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step
            if abs(annual_val - nearest) <= Decimal("0.02"):
                new_rate = nearest
            else:
                new_rate = annual_val.quantize(Decimal("0.0001"))
            updated = True
        elif freq == 2 and Decimal("0") < rate < Decimal("2.0"):
            annual_val = rate * Decimal("2")
            step = Decimal("0.05")
            nearest = (annual_val / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step
            if abs(annual_val - nearest) <= Decimal("0.02"):
                new_rate = nearest
            else:
                new_rate = annual_val.quantize(Decimal("0.0001"))
            updated = True

        # Check step_up_schedule
        is_btp_valore = "valore" in name
        if schedule and isinstance(schedule, list):
            sched_updated = False
            total_years = (mat_d.year - issue_d.year) if (issue_d and mat_d) else 6
            rebuilt = []
            for step in schedule:
                if isinstance(step, dict):
                    s_rate = Decimal(str(step.get("rate", 0)))
                    f_yr = int(step.get("from_year", 1))
                    t_yr = int(step.get("to_year", 999))
                    if s_rate < Decimal("2.0"):
                        if f_yr == 1:
                            s_rate = Decimal(str(new_rate))
                        else:
                            if new_rate == Decimal("3.35"):
                                s_rate = Decimal("3.90")
                            elif new_rate == Decimal("4.10"):
                                s_rate = Decimal("4.50")
                            elif new_rate == Decimal("3.25"):
                                s_rate = Decimal("4.00")
                            else:
                                s_rate = (new_rate + Decimal("0.75")).quantize(Decimal("0.01"))
                        sched_updated = True
                    if t_yr == 5 and total_years == 6:
                        t_yr = 6
                        sched_updated = True
                    rebuilt.append({"from_year": f_yr, "to_year": t_yr, "rate": float(s_rate)})
            if sched_updated:
                new_schedule = rebuilt
                updated = True

        if updated:
            conn.execute(
                sa.text("""
                    UPDATE bond_details
                    SET annual_coupon_rate = :rate,
                        step_up_schedule = CAST(:sched AS jsonb),
                        updated_at = NOW()
                    WHERE id = :bd_id
                """),
                {
                    "rate": new_rate,
                    "sched": json.dumps(new_schedule) if new_schedule is not None else None,
                    "bd_id": bd_id,
                },
            )


def downgrade() -> None:
    pass
