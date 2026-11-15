"""Tests for analysis data collector and aggregation."""
from decimal import Decimal
from unittest.mock import MagicMock
import numpy as np
import pandas as pd
import pytest

from app.models import Account, Asset, Holding, Trade, User
from app.services.analysis.data_collector import AnalysisDataBundle, collect_analysis_data
from app.services.analysis.data_providers.base import BaseDataProvider


class MockDataProvider(BaseDataProvider):
    """Deterministic mock provider returning synthetic financial series."""

    def fetch_ohlcv(self, symbol: str, market: str | None = None, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
        dates = pd.date_range("2024-01-01", periods=100, freq="B")
        prices = 100.0 + np.cumsum(np.random.normal(0.05, 1.0, 100))
        return pd.DataFrame(
            {
                "Open": prices,
                "High": prices + 1.0,
                "Low": prices - 1.0,
                "Close": prices,
                "Volume": np.full(100, 100000),
            },
            index=dates,
        )

    def fetch_fundamentals(self, symbol: str, market: str | None = None) -> dict:
        return {
            "shortName": f"Mock {symbol}",
            "sector": "Technology",
            "trailingPE": 18.5,
            "dividendYield": 0.025,
        }

    def fetch_quote(self, symbol: str, market: str | None = None) -> Decimal:
        return Decimal("105.50")


def test_collect_analysis_data_with_mock_provider(db):
    test_user = User(
        email="test_analysis@example.com",
        username="test_analysis_user",
        hashed_password="hash",
    )
    db.add(test_user)
    db.flush()

    # Setup asset and holding
    asset = Asset(
        user_id=test_user.id,
        symbol="TEST.MI",
        name="Test Asset",
        instrument_type="stock",
        currency="EUR",
    )
    db.add(asset)
    db.flush()

    mock_provider = MockDataProvider()
    bundle = collect_analysis_data(
        db=db,
        user_id=test_user.id,
        symbol="TEST.MI",
        market="Borsa Italiana",
        provider=mock_provider,
    )

    assert isinstance(bundle, AnalysisDataBundle)
    assert bundle.symbol == "TEST.MI"
    assert bundle.current_price == Decimal("105.50")
    assert bundle.technical["available"] is True
    assert bundle.cyclical["available"] is True
    assert bundle.fundamentals["shortName"] == "Mock TEST.MI"

    # Test serialization
    data_dict = bundle.to_dict()
    assert data_dict["symbol"] == "TEST.MI"
    assert isinstance(data_dict["current_price"], float)
    assert "technical" in data_dict
    assert "cyclical" in data_dict
    assert "fundamentals" in data_dict


def test_collect_analysis_data_with_open_trade(db):
    test_user = User(
        email="test_equity_trader@example.com",
        username="test_equity_trader",
        hashed_password="hash",
    )
    db.add(test_user)
    db.flush()

    account = Account(user_id=test_user.id, name="Trading Account", base_currency="USD")
    db.add(account)
    db.flush()

    from app.models import TradeExecution
    from datetime import datetime, timezone

    trade = Trade(
        user_id=test_user.id,
        account_id=account.id,
        symbol="AAPL",
        market="NASDAQ",
        instrument_type="stock",
        side="long",
        status="open",
        target_price=Decimal("250.00"),
        stop_loss=Decimal("210.00"),
        journal_notes="Breakout pullback play",
    )
    db.add(trade)
    db.flush()

    exec1 = TradeExecution(
        trade_id=trade.id,
        action="buy",
        quantity=Decimal("50"),
        price=Decimal("220.00"),
        fee=Decimal("1.50"),
        executed_at=datetime.now(timezone.utc),
    )
    db.add(exec1)
    db.commit()

    mock_provider = MockDataProvider()
    bundle = collect_analysis_data(
        db=db,
        user_id=test_user.id,
        symbol="AAPL",
        market="NASDAQ",
        trade_id=trade.id,
        provider=mock_provider,
    )

    assert bundle.trade_context is not None
    assert bundle.trade_context.trade_id == trade.id
    assert bundle.trade_context.open_quantity == Decimal("50")
    assert bundle.trade_context.average_entry_price == Decimal("220.00")
    assert bundle.trade_context.target_price == Decimal("250.00")
    assert bundle.trade_context.stop_loss == Decimal("210.00")
    assert bundle.trade_context.journal_notes == "Breakout pullback play"

    data_dict = bundle.to_dict()
    assert data_dict["trade_context"] is not None
    assert data_dict["trade_context"]["open_quantity"] == 50.0
