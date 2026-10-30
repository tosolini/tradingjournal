"""allow multiple holdings per asset (remove uq_holding_account_asset)

Revision ID: 20261030_0014
Revises: 20261028_0013
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261030_0014"
down_revision: str | None = "20261028_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE holdings DROP CONSTRAINT IF EXISTS uq_holding_account_asset;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE holdings ADD CONSTRAINT uq_holding_account_asset UNIQUE (account_id, asset_id);
    """)
