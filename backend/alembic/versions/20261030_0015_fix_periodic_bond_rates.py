"""fix periodic bond rates and step-up schedules

Revision ID: 20261030_0015
Revises: 20261030_0014
Create Date: 2026-10-30

The heal is deliberately scoped: only rows with positive evidence of a
periodic coupon quote are rewritten (see ``app.services.bond_rates``).
Legitimately low annual coupons must not be inflated by the payment
frequency.

Before every update the original values are copied to
``bond_rate_heal_backup`` so this data heal is auditable and can be reverted
with ``alembic downgrade``.
"""

from collections.abc import Sequence
import json
import logging

from alembic import op
import sqlalchemy as sa

from app.services.bond_rates import heal_periodic_bond_rate


revision: str = "20261030_0015"
down_revision: str | None = "20261030_0014"
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
    op.execute(CREATE_BACKUP_TABLE)

    rows = conn.execute(
        sa.text("""
            SELECT bd.id, bd.asset_id, bd.bond_type, bd.coupon_frequency, bd.annual_coupon_rate,
                   bd.step_up_schedule, bd.issue_date, bd.maturity_date, bd.final_bonus_rate,
                   a.symbol, a.name
            FROM bond_details bd
            JOIN assets a ON a.id = bd.asset_id
        """)
    ).fetchall()

    healed = 0
    for row in rows:
        bd_id = row[0]
        bond_type = row[2]
        freq = row[3]
        rate = row[4]
        schedule = row[5]
        issue_d = row[6]
        mat_d = row[7]
        final_bonus = row[8]
        symbol = row[9]
        name = row[10]

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
        if not result.changed:
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
                "new_rate": result.annual_coupon_rate,
                "new_sched": json.dumps(result.step_up_schedule) if result.step_up_schedule is not None else None,
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
                "rate": result.annual_coupon_rate,
                "sched": json.dumps(result.step_up_schedule) if result.step_up_schedule is not None else None,
                "bd_id": bd_id,
            },
        )
        healed += 1
        logger.info(
            "Healed bond_detail %s (%s / %s): coupon %s -> %s",
            bd_id,
            symbol,
            name,
            rate,
            result.annual_coupon_rate,
        )

    logger.info("Bond rate healing: %s of %s rows updated", healed, len(rows))


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
