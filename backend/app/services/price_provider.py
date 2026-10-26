import time
from datetime import date
from decimal import Decimal
from typing import Optional

import yfinance as yf

# In-memory TTL cache: {normalized_symbol: (timestamp, price_or_None)}
_price_cache: dict[str, tuple[float, Optional[Decimal]]] = {}
CACHE_TTL = 300  # 5 minutes

# Hardcoded market → yfinance suffix mapping (covers common cases; Exchange model's
# `suffix` field is the canonical source but requires DB access per call).
_MARKET_SUFFIX: dict[str, str] = {
    "borsa italiana": ".MI",
    "euronext milan": ".MI",
    "milan": ".MI",
    "nyse": "",
    "nasdaq": "",
    "euronext paris": ".PA",
    "euronext amsterdam": ".AS",
    "euronext brussels": ".BR",
    "euronext lisbon": ".LS",
    "xetra": ".DE",
    "frankfurt": ".DE",
    "london": ".L",
    "tokyo": ".T",
    "toronto": ".TO",
}


def _normalize_yfinance_symbol(symbol: str, market: Optional[str] = None) -> str:
    """Convert trade symbol to yfinance ticker string.

    Uses market name suffix mapping. Falls back to bare symbol (works for US stocks).
    """
    if market:
        market_lower = market.strip().lower()
        suffix = _MARKET_SUFFIX.get(market_lower, "")
        if suffix:
            return symbol.upper() + suffix
    return symbol.upper()


def get_current_price(
    symbol: str, market: Optional[str] = None
) -> Optional[Decimal]:
    """Fetch the latest available price via yfinance with TTL caching.

    Returns None if the symbol is unknown or the request fails (caller should
    fall back to entry price = 0 unrealized PnL).
    """
    yf_symbol = _normalize_yfinance_symbol(symbol, market)
    now = time.monotonic()

    cached = _price_cache.get(yf_symbol)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    def _fetch_quote(sym: str) -> Optional[Decimal]:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info
            # Try multiple price fields yfinance may populate
            price = (
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("previousClose")
            )
            if price is not None:
                return Decimal(str(price))
        except Exception:
            pass
        return None

    tried_symbols = {yf_symbol}
    result = _fetch_quote(yf_symbol)
    # If not found and market suffix was appended, try bare symbol
    if result is None and yf_symbol != symbol.upper():
        bare_symbol = symbol.upper()
        tried_symbols.add(bare_symbol)
        result = _fetch_quote(bare_symbol)
    # If still not found and original symbol had no dot, try .MI (popular for Milan / Euronext ETFs and Italian stocks)
    if result is None and "." not in symbol:
        mi_symbol = symbol.upper() + ".MI"
        if mi_symbol not in tried_symbols:
            result = _fetch_quote(mi_symbol)

    _price_cache[yf_symbol] = (now, result)
    return result


def get_close_price(
    symbol: str,
    target_date: date,
    market: Optional[str] = None,
) -> Optional[Decimal]:
    """Fetch the closing price for a specific date via yfinance history.

    Used by the daily snapshot job. Also uses cache to avoid redundant fetches.
    """
    yf_symbol = _normalize_yfinance_symbol(symbol, market)
    cache_key = f"{yf_symbol}:{target_date.isoformat()}"
    now = time.monotonic()

    cached = _price_cache.get(cache_key)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    from datetime import timedelta
    end_date = (target_date + timedelta(days=1)).isoformat()

    def _fetch_hist(sym: str) -> Optional[Decimal]:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(start=target_date.isoformat(), end=end_date)
            if not hist.empty:
                return Decimal(str(hist["Close"].iloc[-1]))
        except Exception:
            pass
        return None

    tried_symbols = {yf_symbol}
    result = _fetch_hist(yf_symbol)
    if result is None and yf_symbol != symbol.upper():
        bare_symbol = symbol.upper()
        tried_symbols.add(bare_symbol)
        result = _fetch_hist(bare_symbol)
    if result is None and "." not in symbol:
        mi_symbol = symbol.upper() + ".MI"
        if mi_symbol not in tried_symbols:
            result = _fetch_hist(mi_symbol)

    _price_cache[cache_key] = (now, result)
    return result
