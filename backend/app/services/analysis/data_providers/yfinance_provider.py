"""yfinance concrete implementation of BaseDataProvider."""
from decimal import Decimal
from typing import Any, Optional
import pandas as pd
import yfinance as yf

from app.services.analysis.data_providers.base import BaseDataProvider
from app.services.price_provider import _normalize_yfinance_symbol, get_current_price


class YFinanceDataProvider(BaseDataProvider):
    """Fetches market quotes, historical bars, and fundamental metrics via yfinance."""

    def fetch_ohlcv(
        self,
        symbol: str,
        market: Optional[str] = None,
        period: str = "2y",
        interval: str = "1d",
    ) -> pd.DataFrame:
        yf_symbol = _normalize_yfinance_symbol(symbol, market)
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=period, interval=interval)

        # Fallback to bare symbol or .MI if empty
        if df.empty and yf_symbol != symbol.upper():
            ticker = yf.Ticker(symbol.upper())
            df = ticker.history(period=period, interval=interval)

        if df.empty and "." not in symbol:
            ticker = yf.Ticker(symbol.upper() + ".MI")
            df = ticker.history(period=period, interval=interval)

        if df.empty:
            return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

        # Flatten multi-level columns if produced by recent yfinance versions
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Ensure numeric columns
        for col in ["Open", "High", "Low", "Close", "Volume"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        return df.dropna(subset=["Close"])

    def fetch_fundamentals(
        self,
        symbol: str,
        market: Optional[str] = None,
    ) -> dict[str, Any]:
        yf_symbol = _normalize_yfinance_symbol(symbol, market)
        ticker = yf.Ticker(yf_symbol)
        try:
            info = ticker.info or {}
        except Exception:
            info = {}

        # Fallback to bare symbol
        if not info and yf_symbol != symbol.upper():
            try:
                info = yf.Ticker(symbol.upper()).info or {}
            except Exception:
                info = {}

        return {
            "shortName": info.get("shortName") or info.get("longName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "currency": info.get("currency", "EUR"),
            "marketCap": info.get("marketCap"),
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "pegRatio": info.get("pegRatio"),
            "enterpriseToEbitda": info.get("enterpriseToEbitda"),
            "priceToBook": info.get("priceToBook"),
            "priceToSales": info.get("priceToSalesTrailing12Months"),
            "dividendYield": info.get("dividendYield"),
            "profitMargins": info.get("profitMargins"),
            "operatingMargins": info.get("operatingMargins"),
            "grossMargins": info.get("grossMargins"),
            "revenueGrowth": info.get("revenueGrowth"),
            "earningsGrowth": info.get("earningsGrowth"),
            "freeCashflow": info.get("freeCashflow"),
            "operatingCashflow": info.get("operatingCashflow"),
            "debtToEquity": info.get("debtToEquity"),
            "trailingEps": info.get("trailingEps"),
            "forwardEps": info.get("forwardEps"),
            "targetMeanPrice": info.get("targetMeanPrice"),
            "targetHighPrice": info.get("targetHighPrice"),
            "targetLowPrice": info.get("targetLowPrice"),
            "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
            "recommendationKey": info.get("recommendationKey"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "beta": info.get("beta"),
            "description": info.get("longBusinessSummary"),
        }

    def fetch_quote(
        self,
        symbol: str,
        market: Optional[str] = None,
    ) -> Optional[Decimal]:
        return get_current_price(symbol, market)
