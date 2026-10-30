"""split holding exit taxes into capital gain and interest components

Revision ID: 20261030_0018
Revises: 20261030_0017
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261030_0018"
down_revision: str | None = "20261030_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE holding_exits
        ADD COLUMN IF NOT EXISTS capital_gain_tax NUMERIC(18, 2) NOT NULL DEFAULT 0;
    ALTER TABLE holding_exits
        ADD COLUMN IF NOT EXISTS interest_tax NUMERIC(18, 2) NOT NULL DEFAULT 0;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE holding_exits DROP COLUMN IF EXISTS interest_tax;
    ALTER TABLE holding_exits DROP COLUMN IF EXISTS capital_gain_tax;
    """)
