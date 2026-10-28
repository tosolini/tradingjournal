from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api import accounts, assets, auth, admin, bonds, brokers, calendar, dashboard, data, exchanges, holdings, ledger, notes, portfolio, snapshots, tickers, trades, trade_ideas, uploads
from app.bootstrap import ensure_seed_admin, ensure_seed_exchanges
from app.config import settings
from app.database import Base, engine
from app.scheduler import start_scheduler, stop_scheduler


def ensure_runtime_schema_compatibility() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "users" in table_names:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "preferences" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb"))
            if "timezone" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)"))

    if "accounts" not in table_names:
        return

    if "accounts" not in table_names:
        return

    account_columns = {column["name"] for column in inspector.get_columns("accounts")}
    if "broker_id" not in account_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS broker_id INTEGER"))

    if "brokers" not in table_names:
        return

    broker_columns = {column["name"] for column in inspector.get_columns("brokers")}
    with engine.begin() as conn:
        if "fee_mode" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_mode VARCHAR(32) NOT NULL DEFAULT 'fixed'"))
        else:
            conn.execute(text("ALTER TABLE brokers ALTER COLUMN fee_mode TYPE VARCHAR(32)"))
        if "broker_profile" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS broker_profile VARCHAR(32) NOT NULL DEFAULT 'custom'"))
        if "fee_value" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_value NUMERIC(18, 6) NOT NULL DEFAULT 0"))
        if "fee_min" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_min NUMERIC(18, 6)"))
        if "fee_max" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_max NUMERIC(18, 6)"))
        if "fee_us_value" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_us_value NUMERIC(18, 6)"))
        if "fee_currency" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_currency VARCHAR(8) NOT NULL DEFAULT 'EUR'"))
        if "monthly_fee" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(18, 2) NOT NULL DEFAULT 0"))
        if "fee_tier_override" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_tier_override INTEGER"))
        if "capital_gain_mode" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS capital_gain_mode VARCHAR(16) NOT NULL DEFAULT 'immediate'"))
        if "capital_gain_rate" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS capital_gain_rate NUMERIC(5, 2) NOT NULL DEFAULT 26"))
        if "capital_gain_rate_gov" not in broker_columns:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS capital_gain_rate_gov NUMERIC(5, 2) NOT NULL DEFAULT 12.50"))

    if "trades" not in table_names:
        return

    trade_columns = {column["name"] for column in inspector.get_columns("trades")}
    with engine.begin() as conn:
        if "close_reason" not in trade_columns:
            conn.execute(text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS close_reason VARCHAR(32)"))
        if "closed_at" not in trade_columns:
            conn.execute(text("ALTER TABLE trades ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE"))

    if "exchanges" not in table_names:
        return

    exchange_columns = {column["name"] for column in inspector.get_columns("exchanges")}
    with engine.begin() as conn:
        if "closed_on_weekends" not in exchange_columns:
            conn.execute(text("ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS closed_on_weekends BOOLEAN NOT NULL DEFAULT TRUE"))

        # Fix stale closed_on_weekends=TRUE for 24/7 exchanges (LMAX and CME)
        no_weekend_close_names = [
            "LMAX Forex",
            "LMAX Criptovalute",
            "LMAX CFD su Indici",
            "LMAX Commodities",
            "CME",
        ]
        placeholders = ", ".join(f"'{n}'" for n in no_weekend_close_names)
        conn.execute(text(
            f"UPDATE exchanges SET closed_on_weekends = FALSE"
            f" WHERE name IN ({placeholders}) AND closed_on_weekends = TRUE"
        ))

    # Ensure tickers table unique constraint exists (created by SQLAlchemy metadata)
    if "daily_notes" in table_names:
        note_columns = {column["name"] for column in inspector.get_columns("daily_notes")}
        if "symbol" not in note_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE daily_notes ADD COLUMN IF NOT EXISTS symbol VARCHAR(32)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_notes_symbol ON daily_notes (symbol)"))

    if "cash_ledger_entries" in table_names:
        ledger_columns = {column["name"] for column in inspector.get_columns("cash_ledger_entries")}
        if "entry_date" not in ledger_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE cash_ledger_entries ADD COLUMN IF NOT EXISTS entry_date DATE"))
                conn.execute(
                    text("UPDATE cash_ledger_entries SET entry_date = created_at::date WHERE entry_date IS NULL")
                )
                conn.execute(text("ALTER TABLE cash_ledger_entries ALTER COLUMN entry_date SET NOT NULL"))
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_cash_ledger_entries_entry_date ON cash_ledger_entries (entry_date)")
                )
    if "holdings" in table_names:
        holding_columns = {column["name"] for column in inspector.get_columns("holdings")}
        if "accrued_interest_in" not in holding_columns or "eligible_for_bonus" not in holding_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS accrued_interest_in NUMERIC(18, 6) NOT NULL DEFAULT 0"))
                conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS eligible_for_bonus BOOLEAN NOT NULL DEFAULT FALSE"))

    # The table is created by Base.metadata.create_all, no ALTER needed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema_compatibility()
    ensure_seed_admin()
    _seed_exchanges_for_admin()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


def _seed_exchanges_for_admin() -> None:
    """Seed Directa exchanges for the admin user at startup if enabled."""
    if not settings.seed_admin_enabled:
        return
    from sqlalchemy import select
    from app.database import SessionLocal
    from app.models import User

    with SessionLocal() as db:
        admin = db.execute(
            select(User).where(User.username == settings.seed_admin_username)
        ).scalar_one_or_none()
        if admin:
            ensure_seed_exchanges(admin.id)


app = FastAPI(title="TradeJournal API", lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
allow_all = "*" in allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else allowed_origins,
    allow_credentials=not allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(accounts.router)
app.include_router(brokers.router)
app.include_router(exchanges.router)
app.include_router(exchanges.broker_router)
app.include_router(assets.router)
app.include_router(holdings.router)
app.include_router(bonds.router)
app.include_router(ledger.router)
app.include_router(portfolio.router)
app.include_router(trades.router)
app.include_router(notes.router)
app.include_router(trade_ideas.router)
app.include_router(uploads.router)
app.include_router(dashboard.router)
app.include_router(calendar.router)
app.include_router(tickers.router)
app.include_router(snapshots.router)
app.include_router(data.router)
