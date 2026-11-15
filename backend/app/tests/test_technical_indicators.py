"""Tests for technical analysis indicator calculations."""
import numpy as np
import pandas as pd
import pytest

from app.services.analysis.technical import (
    classify_trend,
    compute_atr,
    compute_bollinger_bands,
    compute_macd,
    compute_rsi,
    compute_technical_bundle,
    find_support_resistance,
)


def _generate_synthetic_ohlcv(n: int = 250, trend: float = 0.1) -> pd.DataFrame:
    """Generate realistic synthetic OHLCV data."""
    np.random.seed(42)
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    returns = np.random.normal(trend / n, 0.015, n)
    close_prices = 100.0 * np.exp(np.cumsum(returns))

    high_prices = close_prices * (1.0 + np.abs(np.random.normal(0, 0.008, n)))
    low_prices = close_prices * (1.0 - np.abs(np.random.normal(0, 0.008, n)))
    open_prices = low_prices + np.random.uniform(0, 1, n) * (high_prices - low_prices)
    volume = np.random.uniform(50000, 200000, n)

    return pd.DataFrame(
        {
            "Open": open_prices,
            "High": high_prices,
            "Low": low_prices,
            "Close": close_prices,
            "Volume": volume,
        },
        index=dates,
    )


def test_compute_rsi_bounded_and_responsive():
    df = _generate_synthetic_ohlcv(100)
    rsi = compute_rsi(df["Close"], period=14)
    assert rsi is not None
    assert 0.0 <= rsi <= 100.0


def test_compute_rsi_short_data():
    df = _generate_synthetic_ohlcv(10)
    assert compute_rsi(df["Close"], period=14) is None


def test_compute_macd_structure():
    df = _generate_synthetic_ohlcv(100)
    macd = compute_macd(df["Close"])
    assert macd["macd_line"] is not None
    assert macd["signal_line"] is not None
    assert macd["histogram"] is not None
    # Histogram must equal macd_line - signal_line
    assert np.isclose(macd["histogram"], macd["macd_line"] - macd["signal_line"])


def test_compute_bollinger_bands():
    df = _generate_synthetic_ohlcv(100)
    bb = compute_bollinger_bands(df["Close"], period=20, num_std=2.0)
    assert bb["middle"] is not None
    assert bb["upper"] > bb["middle"] > bb["lower"]
    assert bb["bandwidth"] > 0


def test_compute_atr():
    df = _generate_synthetic_ohlcv(50)
    atr = compute_atr(df, period=14)
    assert atr is not None
    assert atr > 0.0


def test_find_support_resistance():
    df = _generate_synthetic_ohlcv(120)
    levels = find_support_resistance(df, window=10)
    assert "support" in levels
    assert "resistance" in levels
    current = float(df["Close"].iloc[-1])
    for s in levels["support"]:
        assert s < current
    for r in levels["resistance"]:
        assert r > current


def test_classify_trend():
    df_uptrend = _generate_synthetic_ohlcv(250, trend=0.5)
    trend_info = classify_trend(df_uptrend["Close"])
    assert "trend" in trend_info
    assert "strength" in trend_info


def test_compute_technical_bundle_complete():
    df = _generate_synthetic_ohlcv(220)
    bundle = compute_technical_bundle(df)
    assert bundle["available"] is True
    assert "rsi_14" in bundle
    assert "macd" in bundle
    assert "bollinger_bands" in bundle
    assert "atr_14" in bundle
    assert "supports" in bundle
    assert "resistances" in bundle
    assert "trend" in bundle


def test_compute_technical_bundle_empty():
    empty_df = pd.DataFrame()
    bundle = compute_technical_bundle(empty_df)
    assert bundle["available"] is False
    assert "error" in bundle
