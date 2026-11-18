"""Tests for harmonic composite wave and candlestick charting datasets."""
import numpy as np
import pandas as pd
import pytest

from app.services.analysis.cyclical_wave import (
    compute_chart_dataset,
    compute_harmonic_composite_wave,
)


@pytest.fixture
def sample_ohlcv_df():
    dates = pd.bdate_range(start="2024-01-01", periods=100)
    t = np.arange(100)
    # Synthetic wave: trend + 25-day cycle
    close = 100.0 + 0.1 * t + 5.0 * np.cos(2 * np.pi * t / 25.0)
    open_p = close - 0.5
    high = close + 1.0
    low = close - 1.0
    volume = np.full(100, 1000000.0)

    return pd.DataFrame(
        {
            "Open": open_p,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=dates,
    )


def test_compute_harmonic_composite_wave(sample_ohlcv_df):
    dominant_cycles = [
        {"period_trading_days": 25.0, "spectral_power_pct": 80.0},
    ]

    result = compute_harmonic_composite_wave(sample_ohlcv_df, dominant_cycles, forward_days=30)

    assert "composite_wave" in result
    assert "turning_points" in result
    assert result["dominant_periods"] == [25.0]

    # Verify points include historical and projected bars
    wave = result["composite_wave"]
    assert len(wave) > 30

    historical_pts = [p for p in wave if not p["is_projection"]]
    projected_pts = [p for p in wave if p["is_projection"]]

    assert len(historical_pts) == 100
    assert len(projected_pts) == 30

    # Ensure projected points have dates formatted YYYY-MM-DD
    assert projected_pts[0]["time"] > historical_pts[-1]["time"]

    # Turning points should be detected
    tps = result["turning_points"]
    assert len(tps) >= 1
    assert tps[0]["type"] in ("trough", "peak")
    assert "date" in tps[0]
    assert "value" in tps[0]


def test_compute_chart_dataset_includes_sma_and_ema(sample_ohlcv_df):
    tech_bundle = {
        "supports": [98.50, 95.00],
        "resistances": [108.00, 112.50],
    }
    cyc_bundle = {
        "hurst_exponent": 0.62,
        "regime": "trending",
        "dominant_cycles": [{"period_trading_days": 25.0}],
    }
    coach_snapshot = {
        "trade_context": {
            "stop_loss": 94.00,
            "target_price": 115.00,
        }
    }

    dataset = compute_chart_dataset(
        df=sample_ohlcv_df,
        symbol="TEST.MI",
        market="Borsa Italiana",
        cyclical_bundle=cyc_bundle,
        technical_bundle=tech_bundle,
        coach_snapshot=coach_snapshot,
    )

    assert dataset["symbol"] == "TEST.MI"
    assert len(dataset["candles"]) == 100

    # Check SMA & EMA 20, 50
    tech = dataset["technical"]
    assert len(tech["sma_20"]) > 0
    assert len(tech["sma_50"]) > 0
    assert len(tech["ema_20"]) > 0
    assert len(tech["ema_50"]) > 0
    assert tech["supports"] == [98.50, 95.00]
    assert tech["resistances"] == [108.00, 112.50]
    assert tech["coach_levels"]["stop_loss"] == 94.00
    assert tech["coach_levels"]["target_price"] == 115.00

    # Check Cyclical
    cyc = dataset["cyclical"]
    assert cyc["hurst_exponent"] == 0.62
    assert len(cyc["composite_wave"]) > 0
    assert len(cyc["turning_points"]) >= 1
