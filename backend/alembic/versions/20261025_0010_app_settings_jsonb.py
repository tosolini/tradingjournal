"""app_settings value column to jsonb

Revision ID: 20261025_0010
Revises: 20261009_0009
Create Date: 2026-10-25

"""
from collections.abc import Sequence

from alembic import op


revision: str = "20261025_0010"
down_revision: str | None = "20261009_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE app_settings ALTER COLUMN value TYPE jsonb USING value::jsonb;"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE app_settings ALTER COLUMN value TYPE json USING value::json;"
    )
