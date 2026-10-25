from datetime import date, datetime, timezone
from decimal import Decimal

from app.api.dashboard import dashboard_kpis
from app.models import (
    Account,
    Asset,
    Holding,
    PortfolioSnapshot,
    PositionDailySnapshot,
    Trade,
    TradeExecution,
    User,
)
from app.security import hash_password


def test_dashboard_portfolio_history_combines_trades_and_holdings(db):
    user = User(
        email="trader@example.com",
        username="trader",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 2 accounts: one for stocks, one for ETFs
    acc_stocks = Account(name="Stocks", user_id=user.id, base_currency="EUR")
    acc_etf = Account(name="ETF", user_id=user.id, base_currency="EUR")
    db.add_all([acc_stocks, acc_etf])
    db.commit()
    db.refresh(acc_stocks)
    db.refresh(acc_etf)

    # Historical snapshots:
    # 2026-08-01: Stocks position (cost 1000, market value 1100)
    pds = PositionDailySnapshot(
        account_id=acc_stocks.id,
        symbol="AAPL",
        snapshot_date=date(2026, 8, 1),
        position_qty=Decimal("10"),
        close_price=Decimal("110"),
        market_value=Decimal("1100"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("100"),
    )
    # 2026-08-01: ETF portfolio snapshot (cost 5000, value 5200)
    ps = PortfolioSnapshot(
        account_id=acc_etf.id,
        snapshot_date=date(2026, 8, 1),
        total_value=Decimal("5200"),
        total_cost=Decimal("5000"),
        total_return=Decimal("200"),
        total_return_pct=Decimal("4"),
    )
    db.add_all([pds, ps])
    db.commit()

    # Call dashboard KPIs
    kpis = dashboard_kpis(db=db, current_user=user)
    history = kpis["portfolio_history"]

    assert len(history) >= 1
    # Check 2026-08-01 point
    pt = next(p for p in history if p["date"] == "2026-08-01")
    # Cost should be 1000 (stock) + 5000 (etf) = 6000
    assert pt["cost"] == 6000.0
    # Value should be 1100 (stock) + 5200 (etf) = 6300
    assert pt["value"] == 6300.0
    assert round(pt["return_pct"], 2) == 5.0
