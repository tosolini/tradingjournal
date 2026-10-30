"""add holding exits, purchase fees and actual close date

Revision ID: 20261030_0017
Revises: 20261030_0016
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261030_0017"
down_revision: str | None = "20261030_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS fee_in NUMERIC(18, 6) NOT NULL DEFAULT 0;
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS closed_at DATE NULL;

    CREATE TABLE IF NOT EXISTS holding_exits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
        exit_date DATE NOT NULL,
        exit_type VARCHAR(32) NOT NULL,
        quantity NUMERIC(18, 6) NOT NULL,
        quantity_before NUMERIC(18, 6) NOT NULL,
        quantity_after NUMERIC(18, 6) NOT NULL,
        clean_price NUMERIC(18, 6) NOT NULL,
        accrued_interest_out NUMERIC(18, 6) NOT NULL DEFAULT 0,
        fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
        taxes NUMERIC(18, 2) NOT NULL DEFAULT 0,
        tax_mode VARCHAR(16) NOT NULL DEFAULT 'immediate',
        fee_in_allocated NUMERIC(18, 2) NOT NULL DEFAULT 0,
        coupons_received NUMERIC(18, 2) NOT NULL DEFAULT 0,
        bonus_received NUMERIC(18, 2) NOT NULL DEFAULT 0,
        gross_proceeds NUMERIC(18, 2) NOT NULL DEFAULT 0,
        net_proceeds NUMERIC(18, 2) NOT NULL DEFAULT 0,
        cost_basis NUMERIC(18, 2) NOT NULL DEFAULT 0,
        realized_capital_gain NUMERIC(18, 2) NOT NULL DEFAULT 0,
        realized_interest_income NUMERIC(18, 2) NOT NULL DEFAULT 0,
        realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
        previous_exit_date DATE NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_holding_exits_user_id ON holding_exits(user_id);
    CREATE INDEX IF NOT EXISTS ix_holding_exits_account_id ON holding_exits(account_id);
    CREATE INDEX IF NOT EXISTS ix_holding_exits_asset_id ON holding_exits(asset_id);
    CREATE INDEX IF NOT EXISTS ix_holding_exits_holding_id ON holding_exits(holding_id);
    CREATE INDEX IF NOT EXISTS ix_holding_exits_exit_date ON holding_exits(exit_date);

    ALTER TABLE cash_ledger_entries
        ADD COLUMN IF NOT EXISTS holding_exit_id INTEGER NULL
        REFERENCES holding_exits(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS ix_cash_ledger_entries_holding_exit_id
        ON cash_ledger_entries(holding_exit_id);
    """)


def downgrade() -> None:
    op.execute("""
    DROP INDEX IF EXISTS ix_cash_ledger_entries_holding_exit_id;
    ALTER TABLE cash_ledger_entries DROP COLUMN IF EXISTS holding_exit_id;
    DROP TABLE IF EXISTS holding_exits CASCADE;
    ALTER TABLE holdings DROP COLUMN IF EXISTS closed_at;
    ALTER TABLE holdings DROP COLUMN IF EXISTS fee_in;
    """)
