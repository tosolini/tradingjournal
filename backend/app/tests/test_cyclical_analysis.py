"""Tests for Hurst Exponent, spectral cycles, and cyclical regime analysis."""
import numpy as np
import pandas as pd
import pytest

from app.services.analysis.cyclical import (
    classify_market_regime,
    compute_cyclical_bundle,
    compute_hurst_exponent,
    estimate_cycle_phase,
    extract_dominant_cycles,
)


def test_hurst_trending_series():
    # Strong persistent trend (fractional Brownian motion proxy)
    np.random.seed(42)
    steps = 400
    # Add strong autocorrelation in returns
    increments = np.random.normal(0.002, 0.01, steps)
    smooth_trend = np.convolve(increments, np.ones(5) / 5.0, mode="same")
    prices = 100.0 * np.exp(np.cumsum(smooth_trend))

    h = compute_hurst_exponent(prices)
    assert h is not None
    assert 0.0 < h < 1.0
    assert h > 0.50  # Should be persistent


def test_hurst_short_data():
    prices = np.array([10.0, 11.0, 12.0])
    assert compute_hurst_exponent(prices) is None


def test_classify_market_regime():
    assert classify_market_regime(0.65)["regime"] == "trending"
    assert classify_market_regime(0.40)["regime"] == "mean_reverting"
    assert classify_market_regime(0.50)["regime"] == "random_walk"
    assert classify_market_regime(None)["regime"] == "unknown"


def test_extract_dominant_cycles_known_sine():
    # Construct synthetic series with clear 40-day periodic oscillation
    n = 250
    t = np.arange(n)
    cycle_period = 40.0
    prices = 100.0 + 10.0 * np.sin(2.0 * np.pi * t / cycle_period) + np.random.normal(0, 0.5, n)

    cycles = extract_dominant_cycles(prices, max_cycles=3)
    assert len(cycles) > 0
    # Primary cycle should be reasonably close to 40 days (within 20% margin)
    primary_period = cycles[0]["period_trading_days"]
    assert 32.0 <= primary_period <= 48.0


def test_estimate_cycle_phase():
    n = 100
    t = np.arange(n)
    # Sine wave peaking at the very end
    prices = 100.0 + 10.0 * np.sin(2.0 * np.pi * t / 40.0)
    phase = estimate_cycle_phase(prices, dominant_period=40.0)
    assert "phase" in phase
    assert "cycle_progress_pct" in phase


def test_compute_cyclical_bundle_complete():
    dates = pd.date_range("2024-01-01", periods=150, freq="B")
    t = np.arange(150)
    prices = 100.0 + 5.0 * np.sin(2.0 * np.pi * t / 25.0) + t * 0.1
    df = pd.DataFrame({"Close": prices}, index=dates)

    bundle = compute_cyclical_bundle(df)
    assert bundle["available"] is True
    assert "hurst_exponent" in bundle
    assert "regime" in bundle
    assert "dominant_cycles" in bundle
    assert "primary_cycle" in bundle


def test_compute_cyclical_bundle_insufficient_data():
    df = pd.DataFrame({"Close": [10.0, 11.0]})
    bundle = compute_cyclical_bundle(df)
    assert bundle["available"] is False
