"""add annotations_json to trade_images for non-destructive editing

Revision ID: 20261124_0020
Revises: 20261115_0019
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261124_0020"
down_revision: str | None = "20261115_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("trade_images", sa.Column("annotations_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("trade_images", "annotations_json")
