from datetime import date, datetime, timezone
from decimal import Decimal

from app.api.dashboard import dashboard_kpis
from app.models import (
    Account,
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


def test_dashboard_portfolio_history_does_not_carry_stale_values_after_liquidation(db):
    user = User(
        email="liquidation@example.com",
        username="liquidation",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc_a = Account(name="A", user_id=user.id, base_currency="EUR")
    acc_b = Account(name="B", user_id=user.id, base_currency="EUR")
    db.add_all([acc_a, acc_b])
    db.commit()
    db.refresh(acc_a)
    db.refresh(acc_b)

    # Account A has a position on day 1 only (liquidated before day 2).
    pds_a_day_1 = PositionDailySnapshot(
        account_id=acc_a.id,
        symbol="AAA",
        snapshot_date=date(2026, 8, 1),
        position_qty=Decimal("1"),
        close_price=Decimal("100"),
        market_value=Decimal("100"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("10"),
    )
    # Account B has a different open position on day 2.
    pds_b_day_2 = PositionDailySnapshot(
        account_id=acc_b.id,
        symbol="BBB",
        snapshot_date=date(2026, 8, 2),
        position_qty=Decimal("1"),
        close_price=Decimal("50"),
        market_value=Decimal("50"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("10"),
    )
    db.add_all([pds_a_day_1, pds_b_day_2])
    db.commit()

    kpis = dashboard_kpis(db=db, current_user=user)
    history = kpis["portfolio_history"]

    day_1 = next(p for p in history if p["date"] == "2026-08-01")
    day_2 = next(p for p in history if p["date"] == "2026-08-02")

    assert day_1["value"] == 100.0
    assert day_1["cost"] == 90.0
    # Day 2 must include only account B, not stale account A carry-forward.
    assert day_2["value"] == 50.0
    assert day_2["cost"] == 40.0


def test_dashboard_portfolio_history_uses_live_quote_for_open_trades(db, monkeypatch):
    user = User(
        email="livequote@example.com",
        username="livequote",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="Live", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    trade = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="AAPL",
        market="NASDAQ",
        status="open",
        side="long",
        instrument_type="stock",
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)

    execution = TradeExecution(
        trade_id=trade.id,
        action="BUY",
        executed_at=datetime.now(timezone.utc),
        quantity=Decimal("10"),
        price=Decimal("100"),
        fee=Decimal("0"),
        currency="EUR",
    )
    db.add(execution)
    db.commit()

    monkeypatch.setattr(
        "app.api.dashboard.get_current_price",
        lambda *_args, **_kwargs: Decimal("120"),
    )

    kpis = dashboard_kpis(db=db, current_user=user)
    history = kpis["portfolio_history"]

    today_point = next(p for p in history if p["date"] == date.today().isoformat())
    assert today_point["cost"] == 1000.0
    assert today_point["value"] == 1200.0
