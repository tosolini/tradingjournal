"""repair bond rates over-healed by 20261030_0015

Revision ID: 20261030_0016
Revises: 20261030_0015
Create Date: 2026-10-30

The first version of ``20261030_0015`` multiplied any coupon below 2% by the
payment frequency, which could inflate legitimately low annual coupons
(e.g. a manually entered 1.20% semiannual bond became 2.40%).

Databases that already executed that version need a corrective pass. For rows
whose name carries the real annual coupon (``BTP TF 1,20%``) the inflated
value is detected and restored. The scoped heal from ``bond_rates`` is also
re-applied so the migration stays idempotent on fresh databases.
"""

from collections.abc import Sequence
import json
import logging

from alembic import op
import sqlalchemy as sa

from app.services.bond_rates import heal_periodic_bond_rate, restore_overhealed_rate


revision: str = "20261030_0016"
down_revision: str | None = "20261030_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("""
            SELECT bd.id, bd.bond_type, bd.coupon_frequency, bd.annual_coupon_rate,
                   bd.step_up_schedule, bd.issue_date, bd.maturity_date, bd.final_bonus_rate,
                   a.symbol, a.name
            FROM bond_details bd
            JOIN assets a ON a.id = bd.asset_id
        """)
    ).fetchall()

    healed = 0
    restored = 0
    for row in rows:
        bd_id = row[0]
        bond_type = row[1]
        freq = row[2]
        rate = row[3]
        schedule = row[4]
        issue_d = row[5]
        mat_d = row[6]
        final_bonus = row[7]
        symbol = row[8]
        name = row[9]

        result = heal_periodic_bond_rate(
            annual_coupon_rate=rate,
            coupon_frequency=freq,
            bond_type=bond_type,
            final_bonus_rate=final_bonus,
            step_up_schedule=schedule,
            asset_name=name,
            issue_date=issue_d,
            maturity_date=mat_d,
        )

        new_rate = result.annual_coupon_rate
        new_schedule = result.step_up_schedule
        changed = result.changed

        # Undo the over-broad heal of the previous 0015 revision.
        restore = restore_overhealed_rate(
            annual_coupon_rate=rate,
            coupon_frequency=freq,
            asset_name=name,
            step_up_schedule=schedule,
        )
        if restore.changed:
            new_rate = restore.annual_coupon_rate
            new_schedule = restore.step_up_schedule
            changed = True
            restored += 1
            logger.warning(
                "Restored over-healed bond_detail %s (%s / %s): %s -> %s",
                bd_id,
                symbol,
                name,
                rate,
                new_rate,
            )

        if not changed:
            continue

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
        healed += 1

    logger.info(
        "Bond rate repair: %s rows updated (%s over-healed restorations)",
        healed,
        restored,
    )


def downgrade() -> None:
    # Data repair: original values are not stored, so there is nothing to revert.
    pass
