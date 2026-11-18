"""Mathematical computation of harmonic cyclical waves, moving averages, and candlestick chart datasets."""
from datetime import datetime, timedelta
from typing import Any, Optional
import numpy as np
import pandas as pd


def compute_harmonic_composite_wave(
    df: pd.DataFrame,
    dominant_cycles: list[dict[str, Any]],
    forward_days: int = 40,
    max_components: int = 3,
) -> dict[str, Any]:
    """Fit dominant Fourier harmonics and project the composite cycle into the future.

    Args:
        df: Historical price dataframe with DatetimeIndex and 'Close' column.
        dominant_cycles: Extracted cyclical periodicities (from extract_dominant_cycles).
        forward_days: Number of business days to project forward.
        max_components: Maximum number of harmonic waves to combine.

    Returns:
        Dictionary with composite wave points, future turning points, and metadata.
    """
    if df.empty or "Close" not in df.columns or len(df) < 30:
        return {
            "composite_wave": [],
            "turning_points": [],
            "dominant_periods": [],
        }

    prices = df["Close"].values.astype(float)
    n = len(prices)
    t = np.arange(n)

    # Detrend using linear fit
    poly = np.polyfit(t, prices, 1)
    trend = poly[0] * t + poly[1]
    detrended = prices - trend

    # Filter valid cycle periods
    valid_periods = []
    for c in dominant_cycles:
        p = c.get("period_trading_days")
        if isinstance(p, (int, float)) and 5.0 <= p <= 250.0:
            valid_periods.append(float(p))
        if len(valid_periods) >= max_components:
            break

    if not valid_periods:
        valid_periods = [20.0, 42.0]

    # Fit harmonic terms via least squares: y(t) = sum(a_k * cos(w_k*t) + b_k * sin(w_k*t))
    design_matrix_cols = []
    omegas = []
    for period in valid_periods:
        omega = 2.0 * np.pi / period
        omegas.append(omega)
        design_matrix_cols.append(np.cos(omega * t))
        design_matrix_cols.append(np.sin(omega * t))

    design_matrix = np.column_stack(design_matrix_cols)
    coeffs, _, _, _ = np.linalg.lstsq(design_matrix, detrended, rcond=None)

    # Historical composite wave
    hist_wave = trend + design_matrix @ coeffs

    # Generate dates
    if isinstance(df.index, pd.DatetimeIndex):
        hist_dates = [d.strftime("%Y-%m-%d") for d in df.index]
        last_date = df.index[-1].to_pydatetime()
    else:
        hist_dates = [str(d)[:10] for d in df.index]
        last_date = datetime.now()

    composite_points: list[dict[str, Any]] = []
    # Sample last 120 bars for clean historical rendering
    start_idx = max(0, n - 120)
    for i in range(start_idx, n):
        composite_points.append({
            "time": hist_dates[i],
            "value": round(float(hist_wave[i]), 3),
            "is_projection": False,
        })

    # Forward projection
    t_forward = np.arange(n, n + forward_days)
    forward_trend = poly[0] * t_forward + poly[1]

    forward_cols = []
    for omega in omegas:
        forward_cols.append(np.cos(omega * t_forward))
        forward_cols.append(np.sin(omega * t_forward))
    forward_design = np.column_stack(forward_cols)
    forward_wave = forward_trend + forward_design @ coeffs

    # Generate forward business dates (skipping Saturday=5, Sunday=6)
    forward_dates: list[str] = []
    cur_date = last_date + timedelta(days=1)
    while len(forward_dates) < forward_days:
        if cur_date.weekday() < 5:
            forward_dates.append(cur_date.strftime("%Y-%m-%d"))
        cur_date += timedelta(days=1)

    for i in range(len(forward_dates)):
        composite_points.append({
            "time": forward_dates[i],
            "value": round(float(forward_wave[i]), 3),
            "is_projection": True,
        })

    # Detect future local extrema (turning points)
    turning_points: list[dict[str, Any]] = []
    for i in range(1, len(forward_wave) - 1):
        val = forward_wave[i]
        prev_val = forward_wave[i - 1]
        next_val = forward_wave[i + 1]

        if val < prev_val and val < next_val:
            turning_points.append({
                "date": forward_dates[i],
                "type": "trough",
                "value": round(float(val), 2),
                "label": "Minimo ciclico stimato",
            })
        elif val > prev_val and val > next_val:
            turning_points.append({
                "date": forward_dates[i],
                "type": "peak",
                "value": round(float(val), 2),
                "label": "Massimo ciclico stimato",
            })

    return {
        "composite_wave": composite_points,
        "turning_points": turning_points,
        "dominant_periods": valid_periods,
    }


def compute_chart_dataset(
    df: pd.DataFrame,
    symbol: str,
    market: str = "Euronext",
    cyclical_bundle: Optional[dict[str, Any]] = None,
    technical_bundle: Optional[dict[str, Any]] = None,
    coach_snapshot: Optional[dict[str, Any]] = None,
    max_bars: int = 250,
) -> dict[str, Any]:
    """Assemble complete interactive candlestick and indicator dataset for Lightweight Charts.

    Computes:
    - OHLCV daily candlestick bars
    - SMA (20, 50, 200) time series
    - EMA (20, 50, 200) time series
    - Support and Resistance price lines
    - Cyclical composite wave & turning point markers
    - Coach risk/reward levels (stop loss, target price)
    """
    if df.empty or "Close" not in df.columns or len(df) < 5:
        return {
            "symbol": symbol,
            "market": market,
            "candles": [],
            "technical": {},
            "cyclical": {},
        }

    # Slice to last max_bars for fast network transfer and smooth client rendering
    # Keep extra 200 bars before for accurate SMA/EMA 200 calculation
    close = df["Close"]
    sma_20 = close.rolling(20).mean()
    sma_50 = close.rolling(50).mean()
    sma_200 = close.rolling(200).mean()

    ema_20 = close.ewm(span=20, adjust=False).mean()
    ema_50 = close.ewm(span=50).mean()
    ema_200 = close.ewm(span=200).mean()

    # Slice the view window
    view_df = df.iloc[-max_bars:].copy()

    candles: list[dict[str, Any]] = []
    sma_20_series: list[dict[str, Any]] = []
    sma_50_series: list[dict[str, Any]] = []
    sma_200_series: list[dict[str, Any]] = []
    ema_20_series: list[dict[str, Any]] = []
    ema_50_series: list[dict[str, Any]] = []
    ema_200_series: list[dict[str, Any]] = []

    for idx, row in view_df.iterrows():
        date_str = idx.strftime("%Y-%m-%d") if isinstance(idx, pd.Timestamp) else str(idx)[:10]

        candles.append({
            "time": date_str,
            "open": round(float(row.get("Open", row["Close"])), 2),
            "high": round(float(row.get("High", row["Close"])), 2),
            "low": round(float(row.get("Low", row["Close"])), 2),
            "close": round(float(row["Close"]), 2),
            "volume": float(row.get("Volume", 0.0)) if pd.notna(row.get("Volume")) else 0.0,
        })

        if pd.notna(sma_20.loc[idx]):
            sma_20_series.append({"time": date_str, "value": round(float(sma_20.loc[idx]), 2)})
        if pd.notna(sma_50.loc[idx]):
            sma_50_series.append({"time": date_str, "value": round(float(sma_50.loc[idx]), 2)})
        if pd.notna(sma_200.loc[idx]):
            sma_200_series.append({"time": date_str, "value": round(float(sma_200.loc[idx]), 2)})

        if pd.notna(ema_20.loc[idx]):
            ema_20_series.append({"time": date_str, "value": round(float(ema_20.loc[idx]), 2)})
        if pd.notna(ema_50.loc[idx]):
            ema_50_series.append({"time": date_str, "value": round(float(ema_50.loc[idx]), 2)})
        if pd.notna(ema_200.loc[idx]):
            ema_200_series.append({"time": date_str, "value": round(float(ema_200.loc[idx]), 2)})

    # Support and Resistance levels
    supports = (technical_bundle or {}).get("supports", [])
    resistances = (technical_bundle or {}).get("resistances", [])

    # Coach levels
    coach_levels: dict[str, Optional[float]] = {
        "stop_loss": None,
        "target_price": None,
    }
    if coach_snapshot:
        trade_ctx = coach_snapshot.get("trade_context") or {}
        idea_ctx = coach_snapshot.get("trade_idea_context") or {}
        if trade_ctx.get("stop_loss"):
            coach_levels["stop_loss"] = float(trade_ctx["stop_loss"])
        elif idea_ctx.get("stop_loss"):
            coach_levels["stop_loss"] = float(idea_ctx["stop_loss"])

        if trade_ctx.get("target_price"):
            coach_levels["target_price"] = float(trade_ctx["target_price"])
        elif idea_ctx.get("target_price"):
            coach_levels["target_price"] = float(idea_ctx["target_price"])

    # Cyclical harmonic wave
    dominant_cycles = (cyclical_bundle or {}).get("dominant_cycles", [])
    wave_data = compute_harmonic_composite_wave(view_df, dominant_cycles, forward_days=40)

    return {
        "symbol": symbol,
        "market": market,
        "candles": candles,
        "technical": {
            "sma_20": sma_20_series,
            "sma_50": sma_50_series,
            "sma_200": sma_200_series,
            "ema_20": ema_20_series,
            "ema_50": ema_50_series,
            "ema_200": ema_200_series,
            "supports": supports,
            "resistances": resistances,
            "coach_levels": coach_levels,
        },
        "cyclical": {
            "hurst_exponent": (cyclical_bundle or {}).get("hurst_exponent"),
            "regime": (cyclical_bundle or {}).get("regime"),
            "dominant_periods": wave_data.get("dominant_periods", []),
            "composite_wave": wave_data.get("composite_wave", []),
            "turning_points": wave_data.get("turning_points", []),
            "forward_days": 40,
        },
    }
