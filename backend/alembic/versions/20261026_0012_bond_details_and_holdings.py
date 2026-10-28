"""add bond_details table and bond fields to holdings

Revision ID: 20261026_0012
Revises: 20261026_0011
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261026_0012"
down_revision: str | None = "20261026_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS bond_details (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
        bond_type VARCHAR(32) NOT NULL DEFAULT 'fixed',
        issue_date DATE NULL,
        maturity_date DATE NOT NULL,
        coupon_frequency INTEGER NOT NULL DEFAULT 2,
        annual_coupon_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
        step_up_schedule JSONB NULL,
        final_bonus_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
        tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 12.50,
        day_count_convention VARCHAR(32) NOT NULL DEFAULT 'ACT/ACT ICMA',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_bond_details_asset_id ON bond_details(asset_id);
    CREATE INDEX IF NOT EXISTS ix_bond_details_maturity_date ON bond_details(maturity_date);
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS accrued_interest_in NUMERIC(18, 6) NOT NULL DEFAULT 0;
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS eligible_for_bonus BOOLEAN NOT NULL DEFAULT FALSE;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE holdings DROP COLUMN IF EXISTS eligible_for_bonus;
    ALTER TABLE holdings DROP COLUMN IF EXISTS accrued_interest_in;
    DROP INDEX IF EXISTS ix_bond_details_maturity_date;
    DROP INDEX IF EXISTS ix_bond_details_asset_id;
    DROP TABLE IF EXISTS bond_details;
    """)
