"""Cyclical and Hurst Exponent financial time-series analysis."""
from typing import Any, Optional
import numpy as np
import pandas as pd


def compute_hurst_exponent(prices: np.ndarray, min_window: int = 10, max_window: Optional[int] = None) -> Optional[float]:
    """Calculate Hurst Exponent (H) via standard Rescaled Range (R/S) analysis.

    H < 0.45: Mean-reverting / anti-persistent (cyclical oscillations / range)
    0.45 <= H <= 0.55: Random walk (geometric Brownian motion)
    H > 0.55: Trending / persistent (directional momentum / impulse waves)
    """
    if len(prices) < 30:
        return None

    # Calculate log returns
    returns = np.diff(np.log(prices + 1e-9))
    n_total = len(returns)

    if max_window is None or max_window > n_total // 2:
        max_window = n_total // 2

    if min_window >= max_window:
        return 0.5  # Neutral fallback

    # Generate log-spaced window sizes
    step_count = min(15, max_window - min_window)
    window_sizes = np.unique(
        np.logspace(np.log10(min_window), np.log10(max_window), num=step_count).astype(int)
    )

    rs_averages = []
    valid_windows = []

    for w in window_sizes:
        if w < 2:
            continue
        num_segments = n_total // w
        if num_segments < 1:
            continue

        rs_segments = []
        for i in range(num_segments):
            segment = returns[i * w : (i + 1) * w]
            mean_seg = np.mean(segment)
            std_seg = np.std(segment, ddof=1)

            if std_seg < 1e-9:
                continue

            # Cumulative deviations
            cum_dev = np.cumsum(segment - mean_seg)
            r = np.max(cum_dev) - np.min(cum_dev)
            rs_segments.append(r / std_seg)

        if rs_segments:
            rs_averages.append(np.mean(rs_segments))
            valid_windows.append(w)

    if len(valid_windows) < 3:
        return 0.5

    # Linear regression: log(R/S) = H * log(n) + c
    log_w = np.log(valid_windows)
    log_rs = np.log(rs_averages)

    slope, _ = np.polyfit(log_w, log_rs, 1)
    return float(np.clip(slope, 0.01, 0.99))


def classify_market_regime(hurst: Optional[float]) -> dict[str, str]:
    """Classify regime and recommended analytical stance based on Hurst Exponent."""
    if hurst is None:
        return {
            "regime": "unknown",
            "interpretation": "Insufficient data to determine regime",
            "stance": "neutral",
        }

    if hurst > 0.55:
        return {
            "regime": "trending",
            "interpretation": "Strong persistent memory. Directional trends and impulse waves are favored.",
            "stance": "trend_following",
        }
    elif hurst < 0.45:
        return {
            "regime": "mean_reverting",
            "interpretation": "Anti-persistent memory. Price oscillates around mean; cyclic corrections favored.",
            "stance": "swing_counter_trend",
        }
    else:
        return {
            "regime": "random_walk",
            "interpretation": "No significant memory (Brownian noise). Breakouts have lower reliability.",
            "stance": "defensive_neutral",
        }


def extract_dominant_cycles(prices: np.ndarray, max_cycles: int = 4) -> list[dict[str, Any]]:
    """Detect dominant periodicities via Fast Fourier Transform (FFT) spectrogram."""
    if len(prices) < 40:
        return []

    # Detrend using linear fit to focus on oscillating component
    x = np.arange(len(prices))
    poly = np.polyfit(x, prices, 1)
    detrended = prices - (poly[0] * x + poly[1])

    # Apply Hanning window to reduce spectral leakage
    window = np.hanning(len(detrended))
    fft_vals = np.fft.rfft(detrended * window)
    freqs = np.fft.rfftfreq(len(detrended))
    power = np.abs(fft_vals) ** 2

    # Skip 0 frequency (DC component)
    freqs = freqs[1:]
    power = power[1:]

    # Filter frequencies corresponding to realistic cycles between 5 and 250 trading days
    valid_mask = (freqs > 0) & (1.0 / freqs >= 5) & (1.0 / freqs <= 260)
    if not np.any(valid_mask):
        return []

    valid_freqs = freqs[valid_mask]
    valid_power = power[valid_mask]

    # Find local spectral peaks
    sorted_indices = np.argsort(valid_power)[::-1]
    dominant: list[dict[str, Any]] = []
    seen_periods: list[float] = []

    for idx in sorted_indices:
        period_days = float(1.0 / valid_freqs[idx])
        # Avoid duplicate harmonics (within 15% proximity)
        if any(abs(period_days - p) / p < 0.15 for p in seen_periods):
            continue

        dominant.append({
            "period_trading_days": round(period_days, 1),
            "spectral_power_pct": round(float(valid_power[idx] / (np.sum(valid_power) + 1e-9) * 100), 1),
        })
        seen_periods.append(period_days)
        if len(dominant) >= max_cycles:
            break

    return dominant


def estimate_cycle_phase(prices: np.ndarray, dominant_period: float) -> dict[str, Any]:
    """Estimate the current position / phase within the primary dominant cycle."""
    if dominant_period <= 0 or len(prices) < int(dominant_period):
        return {"phase": "indeterminate", "progress_pct": 50.0}

    # Analyze last complete cycle window
    window_len = int(min(len(prices), dominant_period * 1.5))
    recent = prices[-window_len:]

    trough_idx = int(np.argmin(recent))
    peak_idx = int(np.argmax(recent))

    # Days since trough and peak
    days_since_trough = len(recent) - 1 - trough_idx
    days_since_peak = len(recent) - 1 - peak_idx

    half_cycle = dominant_period / 2.0

    if days_since_trough < days_since_peak:
        # Ascending wave from trough
        progress = min(100.0, (days_since_trough / (half_cycle + 1e-9)) * 50.0)
        phase = "ascending" if progress < 40 else "approaching_top"
    else:
        # Descending wave from peak
        progress = 50.0 + min(50.0, (days_since_peak / (half_cycle + 1e-9)) * 50.0)
        phase = "descending" if progress < 90 else "approaching_trough"

    return {
        "phase": phase,
        "cycle_progress_pct": round(progress, 1),
        "days_since_recent_trough": days_since_trough,
        "days_since_recent_peak": days_since_peak,
    }


def compute_cyclical_bundle(df: pd.DataFrame) -> dict[str, Any]:
    """Assemble complete cyclical analysis output for the Cyclical Analyst Agent."""
    if df.empty or "Close" not in df.columns or len(df) < 30:
        return {
            "available": False,
            "error": "Insufficient historical data for cyclical and Hurst analysis (minimum 30 bars required)",
        }

    prices = df["Close"].values.astype(float)

    # 1. Full-period Hurst exponent
    hurst_full = compute_hurst_exponent(prices)

    # 2. Shorter rolling Hurst (last 120 bars) to spot recent regime change
    hurst_recent = (
        compute_hurst_exponent(prices[-120:]) if len(prices) >= 120 else hurst_full
    )

    regime_info = classify_market_regime(hurst_full)

    # 3. FFT Cycles
    cycles = extract_dominant_cycles(prices)
    primary_period = cycles[0]["period_trading_days"] if cycles else 20.0
    phase_info = estimate_cycle_phase(prices, primary_period)

    return {
        "available": True,
        "hurst_exponent": round(hurst_full, 3) if hurst_full is not None else None,
        "hurst_recent_120d": round(hurst_recent, 3) if hurst_recent is not None else None,
        "regime": regime_info["regime"],
        "regime_interpretation": regime_info["interpretation"],
        "recommended_stance": regime_info["stance"],
        "dominant_cycles": cycles,
        "primary_cycle": phase_info,
    }
