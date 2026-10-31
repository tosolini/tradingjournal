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

Original values are copied to ``bond_rate_heal_backup`` before any update, so
``alembic downgrade`` can restore the pre-0016 state.
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

BACKUP_TABLE = "bond_rate_heal_backup"

CREATE_BACKUP_TABLE = f"""
    CREATE TABLE IF NOT EXISTS {BACKUP_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        bond_detail_id INTEGER NOT NULL REFERENCES bond_details(id) ON DELETE CASCADE,
        revision VARCHAR(32) NOT NULL,
        old_annual_coupon_rate NUMERIC(8, 4),
        old_step_up_schedule JSONB,
        new_annual_coupon_rate NUMERIC(8, 4),
        new_step_up_schedule JSONB,
        healed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
"""


def upgrade() -> None:
    conn = op.get_bind()
    # 0015 creates the table on fresh databases; this keeps the corrective
    # pass working on databases where the first 0015 revision already ran.
    op.execute(CREATE_BACKUP_TABLE)

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
            sa.text(f"""
                INSERT INTO {BACKUP_TABLE} (
                    bond_detail_id, revision,
                    old_annual_coupon_rate, old_step_up_schedule,
                    new_annual_coupon_rate, new_step_up_schedule
                ) VALUES (
                    :bd_id, :revision,
                    :old_rate, CAST(:old_sched AS jsonb),
                    :new_rate, CAST(:new_sched AS jsonb)
                )
            """),
            {
                "bd_id": bd_id,
                "revision": revision,
                "old_rate": rate,
                "old_sched": json.dumps(schedule) if schedule is not None else None,
                "new_rate": new_rate,
                "new_sched": json.dumps(new_schedule) if new_schedule is not None else None,
            },
        )
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
    """Restore the coupon values captured before this migration ran."""
    conn = op.get_bind()
    has_table = conn.execute(
        sa.text("SELECT to_regclass(:table_name)"), {"table_name": f"public.{BACKUP_TABLE}"}
    ).scalar()
    if not has_table:
        return

    conn.execute(
        sa.text(f"""
            UPDATE bond_details bd
            SET annual_coupon_rate = b.old_annual_coupon_rate,
                step_up_schedule = b.old_step_up_schedule,
                updated_at = NOW()
            FROM {BACKUP_TABLE} b
            WHERE b.bond_detail_id = bd.id
              AND b.revision = :revision
        """),
        {"revision": revision},
    )
    conn.execute(
        sa.text(f"DELETE FROM {BACKUP_TABLE} WHERE revision = :revision"),
        {"revision": revision},
    )
    remaining = conn.execute(sa.text(f"SELECT COUNT(*) FROM {BACKUP_TABLE}")).scalar()
    if not remaining:
        op.execute(f"DROP TABLE {BACKUP_TABLE}")
