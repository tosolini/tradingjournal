"""Migration-level tests for the bond rate data heal.

These tests run Alembic against a dedicated PostgreSQL database
(``TEST_MIGRATION_DATABASE_URL``) so the actual SQL and the revision chain are
exercised, not just the pure helpers in ``app.services.bond_rates``.
"""

import json
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
MIGRATION_URL = os.environ.get(
    "TEST_MIGRATION_DATABASE_URL",
    "postgresql+psycopg://tradejournal:tradejournal@db:5432/tradejournal_migration_test",
)

FIXTURES = [
    (
        """
        INSERT INTO users (email, username, hashed_password, role)
        VALUES (:email, :username, :password, :role)
        """,
        [{"email": "migrations@test.local", "username": "migrations", "password": "x", "role": "user"}],
    ),
    (
        """
        INSERT INTO assets (user_id, symbol, name, instrument_type)
        VALUES (:user_id, :symbol, :name, :instrument_type)
        """,
        [
            {"user_id": 1, "symbol": "IT0005583486", "name": "BTPVAL SC MZ30EUR", "instrument_type": "bond"},
            {"user_id": 1, "symbol": "IT0005519787", "name": "BTP TF 1,20% DC27", "instrument_type": "bond"},
            {"user_id": 1, "symbol": "IT0005519788", "name": "BTP TF 1,20% DC27 B", "instrument_type": "bond"},
            {"user_id": 1, "symbol": "IT0005519789", "name": "BTP TF 0,95% DC26", "instrument_type": "bond"},
            {"user_id": 1, "symbol": "IT0005519790", "name": "BTP FUTURA SC NO30EUR", "instrument_type": "bond"},
        ],
    ),
    (
        """
        INSERT INTO bond_details (
            asset_id, bond_type, issue_date, maturity_date, coupon_frequency,
            annual_coupon_rate, step_up_schedule, final_bonus_rate
        ) VALUES (
            :asset_id, :bond_type, :issue_date, :maturity_date, :coupon_frequency,
            :annual_coupon_rate, CAST(:step_up_schedule AS jsonb), :final_bonus_rate
        )
        """,
        [
            {
                "asset_id": 1,
                "bond_type": "step_up",
                "issue_date": "2024-03-05",
                "maturity_date": "2030-03-05",
                "coupon_frequency": 4,
                "annual_coupon_rate": 0.838,
                "step_up_schedule": json.dumps(
                    [
                        {"from_year": 1, "to_year": 3, "rate": 0.838},
                        {"from_year": 4, "to_year": 5, "rate": 1.588},
                    ]
                ),
                "final_bonus_rate": 0.8,
            },
            {
                "asset_id": 2,
                "bond_type": "fixed",
                "issue_date": "2023-01-01",
                "maturity_date": "2027-01-01",
                "coupon_frequency": 2,
                "annual_coupon_rate": 1.20,
                "step_up_schedule": None,
                "final_bonus_rate": 0,
            },
            {
                "asset_id": 3,
                "bond_type": "fixed",
                "issue_date": "2023-01-01",
                "maturity_date": "2027-01-01",
                "coupon_frequency": 2,
                "annual_coupon_rate": 0.60,
                "step_up_schedule": None,
                "final_bonus_rate": 0,
            },
            {
                "asset_id": 4,
                "bond_type": "fixed",
                "issue_date": "2023-01-01",
                "maturity_date": "2026-01-01",
                "coupon_frequency": 2,
                "annual_coupon_rate": 1.90,
                "step_up_schedule": None,
                "final_bonus_rate": 0,
            },
            {
                "asset_id": 5,
                "bond_type": "step_up",
                "issue_date": "2020-11-01",
                "maturity_date": "2030-11-01",
                "coupon_frequency": 2,
                "annual_coupon_rate": 1.15,
                "step_up_schedule": json.dumps(
                    [
                        {"from_year": 1, "to_year": 3, "rate": 1.15},
                        {"from_year": 4, "to_year": 6, "rate": 1.45},
                        {"from_year": 7, "to_year": 10, "rate": 1.60},
                    ]
                ),
                "final_bonus_rate": 0,
            },
        ],
    ),
]


def _ensure_database() -> None:
    url = make_url(MIGRATION_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": url.database},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin.dispose()


def _reset_schema() -> None:
    engine = create_engine(MIGRATION_URL)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def _alembic(revision: str, action: str = "upgrade") -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    previous = settings.database_url
    settings.database_url = MIGRATION_URL
    try:
        getattr(command, action)(cfg, revision)
    finally:
        settings.database_url = previous


def _rates(engine) -> dict[str, tuple]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT a.symbol, bd.annual_coupon_rate, bd.step_up_schedule
                FROM bond_details bd
                JOIN assets a ON a.id = bd.asset_id
            """)
        ).all()
    return {row.symbol: (row.annual_coupon_rate, row.step_up_schedule) for row in rows}


@pytest.fixture()
def migration_db():
    try:
        _ensure_database()
        _reset_schema()
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"PostgreSQL migration test database unavailable: {exc}")
    yield MIGRATION_URL


def test_bond_rate_migrations_heal_and_revert(migration_db):
    from decimal import Decimal

    _alembic("20261030_0014")
    engine = create_engine(migration_db)
    try:
        with engine.begin() as conn:
            for statement, params in FIXTURES:
                conn.execute(text(statement), params)

        _alembic("head")

        healed = _rates(engine)
        # BTP Valore quarterly quote annualized and schedule rebuilt.
        assert healed["IT0005583486"][0] == Decimal("3.3500")
        assert healed["IT0005583486"][1] == [
            {"from_year": 1, "to_year": 3, "rate": 3.35},
            {"from_year": 4, "to_year": 6, "rate": 3.9},
        ]
        # Legitimately low annual coupons are untouched.
        assert healed["IT0005519787"][0] == Decimal("1.2000")
        # Periodic quote corroborated by the coupon in the name.
        assert healed["IT0005519788"][0] == Decimal("1.2000")
        # Row over-healed by the first 0015 revision is restored by 0016.
        assert healed["IT0005519789"][0] == Decimal("0.9500")
        # BTP Futura low step-up coupons are annual, not periodic quotes.
        assert healed["IT0005519790"][0] == Decimal("1.1500")
        assert healed["IT0005519790"][1] == [
            {"from_year": 1, "to_year": 3, "rate": 1.15},
            {"from_year": 4, "to_year": 6, "rate": 1.45},
            {"from_year": 7, "to_year": 10, "rate": 1.6},
        ]

        # The backup table makes both data migrations reversible.
        _alembic("20261030_0014", action="downgrade")

        restored = _rates(engine)
        assert restored["IT0005583486"][0] == Decimal("0.8380")
        assert restored["IT0005583486"][1] == [
            {"from_year": 1, "to_year": 3, "rate": 0.838},
            {"from_year": 4, "to_year": 5, "rate": 1.588},
        ]
        assert restored["IT0005519788"][0] == Decimal("0.6000")
        assert restored["IT0005519789"][0] == Decimal("1.9000")
        assert restored["IT0005519787"][0] == Decimal("1.2000")
        assert restored["IT0005519790"][0] == Decimal("1.1500")

        with engine.connect() as conn:
            backup = conn.execute(
                text("SELECT to_regclass('public.bond_rate_heal_backup')")
            ).scalar()
        assert backup is None
    finally:
        engine.dispose()
