"""add trade_ideas table for scouting and trade ideas lifecycle

Revision ID: 20261028_0013
Revises: 20261026_0012
Create Date: 2026-10-28
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261028_0013"
down_revision: str | None = "20261026_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS trade_ideas (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(32) NOT NULL,
        market VARCHAR(80) NOT NULL DEFAULT 'Euronext',
        direction VARCHAR(8) NOT NULL DEFAULT 'long',
        initial_price NUMERIC(18, 6) NOT NULL,
        trigger_price NUMERIC(18, 6) NOT NULL,
        trigger_condition VARCHAR(8) NOT NULL DEFAULT '<=',
        stop_loss NUMERIC(18, 6) NULL,
        target_price NUMERIC(18, 6) NULL,
        thesis_notes TEXT NULL,
        tags JSONB NOT NULL DEFAULT '[]',
        status VARCHAR(20) NOT NULL DEFAULT 'watching',
        stale_days INTEGER NOT NULL DEFAULT 7,
        expire_days INTEGER NOT NULL DEFAULT 10,
        stale_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        triggered_at TIMESTAMPTZ NULL,
        triggered_price NUMERIC(18, 6) NULL,
        closed_at TIMESTAMPTZ NULL,
        trade_id INTEGER NULL REFERENCES trades(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS ix_trade_ideas_user_id ON trade_ideas(user_id);
    CREATE INDEX IF NOT EXISTS ix_trade_ideas_symbol ON trade_ideas(symbol);
    CREATE INDEX IF NOT EXISTS ix_trade_ideas_status ON trade_ideas(status);
    CREATE INDEX IF NOT EXISTS ix_trade_ideas_stale_at ON trade_ideas(stale_at);
    CREATE INDEX IF NOT EXISTS ix_trade_ideas_expires_at ON trade_ideas(expires_at);
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS trade_ideas CASCADE;
    """)
