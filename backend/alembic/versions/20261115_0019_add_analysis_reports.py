"""add analysis_reports table for multi-agent asset coaching

Revision ID: 20261115_0019
Revises: 20261030_0018
Create Date: 2026-11-15
"""

from collections.abc import Sequence
from alembic import op

revision: str = "20261115_0019"
down_revision: str | None = "20261030_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS analysis_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(32) NOT NULL,
        market VARCHAR(80) NOT NULL DEFAULT 'Euronext',
        holding_id INTEGER NULL REFERENCES holdings(id) ON DELETE SET NULL,
        trade_idea_id INTEGER NULL REFERENCES trade_ideas(id) ON DELETE SET NULL,
        language VARCHAR(8) NOT NULL DEFAULT 'it',
        trigger_mode VARCHAR(16) NOT NULL DEFAULT 'manual',
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        completed_at TIMESTAMPTZ NULL,
        technical_report TEXT NULL,
        fundamental_report TEXT NULL,
        cyclical_report TEXT NULL,
        bull_thesis TEXT NULL,
        bear_thesis TEXT NULL,
        lead_synthesis TEXT NULL,
        coaching_report TEXT NULL,
        overall_score INTEGER NULL,
        action_suggestions JSONB NOT NULL DEFAULT '[]',
        risk_warnings JSONB NOT NULL DEFAULT '[]',
        data_snapshot JSONB NOT NULL DEFAULT '{}',
        llm_model_used VARCHAR(64) NULL,
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS ix_analysis_reports_user_id ON analysis_reports(user_id);
    CREATE INDEX IF NOT EXISTS ix_analysis_reports_symbol ON analysis_reports(symbol);
    CREATE INDEX IF NOT EXISTS ix_analysis_reports_status ON analysis_reports(status);
    CREATE INDEX IF NOT EXISTS ix_analysis_reports_holding_id ON analysis_reports(holding_id);
    CREATE INDEX IF NOT EXISTS ix_analysis_reports_trade_idea_id ON analysis_reports(trade_idea_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analysis_reports CASCADE;")
