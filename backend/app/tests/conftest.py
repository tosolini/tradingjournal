"""DB-backed tests run against a dedicated postgres test database.

The engine is lazy (no connection until a test requests the ``db``
fixture), so non-DB tests keep working anywhere. DB tests require the
dev stack postgres (``tradejournal_test`` database); they are executed
inside the backend container::

    docker exec tradingjournal-backend-1 python -m pytest app/tests/ -q
"""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://tradejournal:tradejournal@db:5432/tradejournal_test",
)

test_engine = create_engine(TEST_DATABASE_URL)
TestingSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def db():
    """Isolated session on the test database (tables truncated after test)."""
    Base.metadata.create_all(test_engine)
    with test_engine.begin() as conn:
        conn.execute(text("ALTER TABLE brokers ALTER COLUMN fee_mode TYPE VARCHAR(32);"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS broker_profile VARCHAR(32) NOT NULL DEFAULT 'custom';"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_min NUMERIC(18, 6);"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_max NUMERIC(18, 6);"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_us_value NUMERIC(18, 6);"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(18, 2) NOT NULL DEFAULT 0;"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS fee_tier_override INTEGER;"))
        conn.execute(text("ALTER TABLE brokers ADD COLUMN IF NOT EXISTS capital_gain_rate_gov NUMERIC(5, 2) NOT NULL DEFAULT 12.50;"))
        conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS accrued_interest_in NUMERIC(18, 6) NOT NULL DEFAULT 0;"))
        conn.execute(text("ALTER TABLE holdings ADD COLUMN IF NOT EXISTS eligible_for_bonus BOOLEAN NOT NULL DEFAULT FALSE;"))
    session = TestingSession()
    yield session
    session.close()
    with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
