"""Abstract base class for financial data providers."""
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Any, Optional
import pandas as pd


class BaseDataProvider(ABC):
    """Abstract interface for fetching price, historical OHLCV, and fundamental data."""

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        market: Optional[str] = None,
        period: str = "2y",
        interval: str = "1d",
    ) -> pd.DataFrame:
        """Fetch historical Open-High-Low-Close-Volume data.

        Returns DataFrame with DatetimeIndex and columns: Open, High, Low, Close, Volume.
        """
        pass

    @abstractmethod
    def fetch_fundamentals(
        self,
        symbol: str,
        market: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch fundamental company/instrument profile and key ratios."""
        pass

    @abstractmethod
    def fetch_quote(
        self,
        symbol: str,
        market: Optional[str] = None,
    ) -> Optional[Decimal]:
        """Fetch the latest spot / closing price."""
        pass
