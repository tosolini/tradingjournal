"""Deterministic technical analysis indicators computation."""
from decimal import Decimal
from typing import Any, Optional
import numpy as np
import pandas as pd


def compute_rsi(series: pd.Series, period: int = 14) -> Optional[float]:
    """Calculate Relative Strength Index (RSI) using Wilder's exponential smoothing."""
    if len(series) < period + 1:
        return None

    delta = series.diff()
    gain = (delta.where(delta > 0, 0.0)).copy()
    loss = (-delta.where(delta < 0, 0.0)).copy()

    # Wilder's smoothing is an EMA with alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    last_gain = avg_gain.iloc[-1]
    last_loss = avg_loss.iloc[-1]

    if pd.isna(last_gain) or pd.isna(last_loss):
        return None

    rs = last_gain / (last_loss + 1e-9)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return float(np.clip(rsi, 0.0, 100.0))


def compute_macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> dict[str, Optional[float]]:
    """Calculate Moving Average Convergence Divergence (MACD)."""
    if len(series) < slow + signal:
        return {"macd_line": None, "signal_line": None, "histogram": None}

    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line

    return {
        "macd_line": float(macd_line.iloc[-1]),
        "signal_line": float(signal_line.iloc[-1]),
        "histogram": float(histogram.iloc[-1]),
    }


def compute_bollinger_bands(
    series: pd.Series,
    period: int = 20,
    num_std: float = 2.0,
) -> dict[str, Optional[float]]:
    """Calculate Bollinger Bands (upper, middle, lower, %B, bandwidth)."""
    if len(series) < period:
        return {
            "middle": None,
            "upper": None,
            "lower": None,
            "pct_b": None,
            "bandwidth": None,
        }

    middle = series.rolling(window=period).mean().iloc[-1]
    std = series.rolling(window=period).std(ddof=0).iloc[-1]
    upper = middle + (num_std * std)
    lower = middle - (num_std * std)

    last_price = series.iloc[-1]
    bandwidth = (upper - lower) / (middle + 1e-9) if middle else 0.0
    pct_b = (last_price - lower) / (upper - lower + 1e-9) if upper != lower else 0.5

    return {
        "middle": float(middle),
        "upper": float(upper),
        "lower": float(lower),
        "pct_b": float(pct_b),
        "bandwidth": float(bandwidth),
    }


def compute_atr(df: pd.DataFrame, period: int = 14) -> Optional[float]:
    """Calculate Average True Range (ATR)."""
    if len(df) < period + 1 or not {"High", "Low", "Close"}.issubset(df.columns):
        return None

    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    prev_close = close.shift(1)

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = true_range.rolling(window=period).mean().iloc[-1]
    return float(atr) if pd.notna(atr) else None


def find_support_resistance(
    df: pd.DataFrame,
    window: int = 15,
    num_levels: int = 3,
) -> dict[str, list[float]]:
    """Detect local swing highs (resistance) and swing lows (support)."""
    if len(df) < window * 2 or not {"High", "Low"}.issubset(df.columns):
        return {"support": [], "resistance": []}

    highs = df["High"].values
    lows = df["Low"].values

    supports: list[float] = []
    resistances: list[float] = []

    for i in range(window, len(df) - window):
        # Local peak
        if highs[i] == max(highs[i - window : i + window + 1]):
            resistances.append(float(highs[i]))
        # Local trough
        if lows[i] == min(lows[i - window : i + window + 1]):
            supports.append(float(lows[i]))

    # Filter and sort by proximity to current price
    current_price = float(df["Close"].iloc[-1])
    active_supports = sorted([s for s in set(supports) if s < current_price], reverse=True)[:num_levels]
    active_resistances = sorted([r for r in set(resistances) if r > current_price])[:num_levels]

    return {
        "support": [round(s, 2) for s in active_supports],
        "resistance": [round(r, 2) for r in active_resistances],
    }


def classify_trend(series: pd.Series) -> dict[str, Any]:
    """Determine trend structure using Moving Averages alignment."""
    if len(series) < 20:
        return {"trend": "neutral", "strength": "low", "sma_alignment": "indeterminate"}

    sma_20 = series.rolling(20).mean().iloc[-1] if len(series) >= 20 else None
    sma_50 = series.rolling(50).mean().iloc[-1] if len(series) >= 50 else None
    sma_200 = series.rolling(200).mean().iloc[-1] if len(series) >= 200 else None
    last_price = series.iloc[-1]

    if sma_20 and sma_50 and sma_200:
        if last_price > sma_20 > sma_50 > sma_200:
            return {"trend": "strong_bullish", "strength": "high", "sma_alignment": "bullish"}
        elif last_price < sma_20 < sma_50 < sma_200:
            return {"trend": "strong_bearish", "strength": "high", "sma_alignment": "bearish"}
        elif last_price > sma_50 and sma_20 > sma_50:
            return {"trend": "bullish", "strength": "moderate", "sma_alignment": "moderately_bullish"}
        elif last_price < sma_50 and sma_20 < sma_50:
            return {"trend": "bearish", "strength": "moderate", "sma_alignment": "moderately_bearish"}

    return {"trend": "neutral", "strength": "low", "sma_alignment": "mixed"}


def compute_technical_bundle(df: pd.DataFrame) -> dict[str, Any]:
    """Calculate full technical indicators bundle for agent consumption."""
    if df.empty or "Close" not in df.columns or len(df) < 5:
        return {
            "available": False,
            "error": "Insufficient historical data for technical indicators",
        }

    close = df["Close"]
    last_price = float(close.iloc[-1])

    rsi = compute_rsi(close, period=14)
    macd = compute_macd(close)
    bb = compute_bollinger_bands(close, period=20)
    atr = compute_atr(df, period=14)
    levels = find_support_resistance(df)
    trend = classify_trend(close)

    # Moving averages
    sma_20 = float(close.rolling(20).mean().iloc[-1]) if len(close) >= 20 else None
    sma_50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
    sma_200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None

    # Volume dynamics
    volume_surge = None
    if "Volume" in df.columns and len(df["Volume"]) >= 20:
        avg_vol = df["Volume"].rolling(20).mean().iloc[-1]
        last_vol = df["Volume"].iloc[-1]
        volume_surge = float(last_vol / (avg_vol + 1e-9)) if avg_vol > 0 else 1.0

    return {
        "available": True,
        "last_price": round(last_price, 4),
        "rsi_14": round(rsi, 2) if rsi is not None else None,
        "macd": {k: round(v, 4) if v is not None else None for k, v in macd.items()},
        "bollinger_bands": {k: round(v, 4) if v is not None else None for k, v in bb.items()},
        "atr_14": round(atr, 4) if atr is not None else None,
        "sma_20": round(sma_20, 4) if sma_20 is not None else None,
        "sma_50": round(sma_50, 4) if sma_50 is not None else None,
        "sma_200": round(sma_200, 4) if sma_200 is not None else None,
        "supports": levels["support"],
        "resistances": levels["resistance"],
        "trend": trend,
        "volume_relative_20d": round(volume_surge, 2) if volume_surge is not None else None,
    }
