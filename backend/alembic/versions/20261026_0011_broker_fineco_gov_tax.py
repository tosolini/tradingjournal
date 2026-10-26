"""add fineco broker fee configuration and government bond tax rate

Revision ID: 20261026_0011
Revises: 20261025_0010
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261026_0011"
down_revision: str | None = "20261025_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE brokers ALTER COLUMN fee_mode TYPE VARCHAR(32);")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS broker_profile VARCHAR(32) NOT NULL DEFAULT 'custom';")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_min NUMERIC(18, 6);")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_max NUMERIC(18, 6);")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_us_value NUMERIC(18, 6);")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(18, 2) NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_tier_override INTEGER;")
    op.execute("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS capital_gain_rate_gov NUMERIC(5, 2) NOT NULL DEFAULT 12.50;")


def downgrade() -> None:
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS capital_gain_rate_gov;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS fee_tier_override;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS monthly_fee;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS fee_us_value;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS fee_max;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS fee_min;")
    op.execute("ALTER TABLE brokers DROP COLUMN IF EXISTS broker_profile;")
    op.execute("ALTER TABLE brokers ALTER COLUMN fee_mode TYPE VARCHAR(16);")
