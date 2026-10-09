"""user accounting fields + db-backed app settings

Revision ID: 20261009_0009
Revises: 20260811_0008
Create Date: 2026-10-09

- users: is_active, must_change_password, password_changed_at,
  last_login_at, created_by_id. Boolean server defaults backfill
  existing rows (all active, no forced password change -> no lockout).
- app_settings table with password_policy + registration_open seeds.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261009_0009"
down_revision: str | None = "20260811_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("created_by_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_created_by_id",
        "users",
        "users",
        ["created_by_id"],
        ["id"],
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Explicit backfill (belt and braces on top of server defaults).
    op.execute(
        "UPDATE users SET is_active = true WHERE is_active IS NULL;"
    )
    op.execute(
        "UPDATE users SET must_change_password = false "
        "WHERE must_change_password IS NULL;"
    )

    op.execute(
        "INSERT INTO app_settings (key, value, created_at, updated_at) VALUES "
        "('password_policy', "
        "'{\"min_length\": 12, \"require_digit\": false, "
        "\"require_uppercase\": false, \"require_symbol\": false, "
        "\"max_length\": 128, \"reject_common\": true}', "
        "now(), now()) "
        "ON CONFLICT (key) DO NOTHING;"
    )
    op.execute(
        "INSERT INTO app_settings (key, value, created_at, updated_at) VALUES "
        "('registration_open', 'false', now(), now()) "
        "ON CONFLICT (key) DO NOTHING;"
    )


def downgrade() -> None:
    op.execute("DELETE FROM app_settings WHERE key IN ('password_policy', 'registration_open');")
    op.drop_table("app_settings")
    op.drop_constraint("fk_users_created_by_id", "users", type_="foreignkey")
    op.drop_column("users", "created_by_id")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "is_active")
