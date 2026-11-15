from datetime import UTC, datetime
from decimal import Decimal

from app.api.calendar import journal_month
from app.models import Account, Trade, TradeExecution, User
from app.security import hash_password


def test_calendar_journal_month_breakdown(db):
    user = User(
        email="cal_user@example.com",
        username="cal_user",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    account = Account(name="Main", user_id=user.id, base_currency="EUR")
    db.add(account)
    db.commit()
    db.refresh(account)

    # 1. Closed stock trade in Nov 2026: AAPL (profit +100)
    stock_trade = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="AAPL",
        instrument_type="stock",
        side="long",
        status="close",
        closed_at=datetime(2026, 11, 10, 15, 30, tzinfo=UTC),
    )
    db.add(stock_trade)
    db.commit()
    db.refresh(stock_trade)

    exec_stock_buy = TradeExecution(
        trade_id=stock_trade.id,
        action="BUY",
        executed_at=datetime(2026, 11, 10, 10, 0, tzinfo=UTC),
        quantity=Decimal("10"),
        price=Decimal("150"),
        fee=Decimal("0"),
        currency="EUR",
    )
    exec_stock_sell = TradeExecution(
        trade_id=stock_trade.id,
        action="SELL",
        executed_at=datetime(2026, 11, 10, 15, 30, tzinfo=UTC),
        quantity=Decimal("10"),
        price=Decimal("160"),
        fee=Decimal("0"),
        currency="EUR",
    )
    db.add_all([exec_stock_buy, exec_stock_sell])

    # 2. Closed ETF trade in Nov 2026: VWCE (profit +50)
    etf_trade = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="VWCE",
        instrument_type="etf",
        side="long",
        status="close",
        closed_at=datetime(2026, 11, 12, 14, 0, tzinfo=UTC),
    )
    db.add(etf_trade)
    db.commit()
    db.refresh(etf_trade)

    exec_etf_buy = TradeExecution(
        trade_id=etf_trade.id,
        action="BUY",
        executed_at=datetime(2026, 11, 12, 9, 30, tzinfo=UTC),
        quantity=Decimal("5"),
        price=Decimal("100"),
        fee=Decimal("0"),
        currency="EUR",
    )
    exec_etf_sell = TradeExecution(
        trade_id=etf_trade.id,
        action="SELL",
        executed_at=datetime(2026, 11, 12, 14, 0, tzinfo=UTC),
        quantity=Decimal("5"),
        price=Decimal("110"),
        fee=Decimal("0"),
        currency="EUR",
    )
    db.add_all([exec_etf_buy, exec_etf_sell])
    db.commit()

    res = journal_month(year=2026, month=11, db=db, current_user=user)

    assert res["year"] == 2026
    assert res["month"] == 11
    assert "month_pnl" in res
    assert res["month_pnl"]["stock"] == 100.0
    assert res["month_pnl"]["etf"] == 50.0
    assert res["month_pnl"]["total"] == 150.0

    days_by_date = {d["date"]: d for d in res["days"]}
    assert "2026-11-10" in days_by_date
    assert days_by_date["2026-11-10"]["pnl"]["stock"] == 100.0
    assert days_by_date["2026-11-10"]["pnl"]["etf"] == 0.0
    assert days_by_date["2026-11-10"]["pnl"]["total"] == 100.0

    assert "2026-11-12" in days_by_date
    assert days_by_date["2026-11-12"]["pnl"]["stock"] == 0.0
    assert days_by_date["2026-11-12"]["pnl"]["etf"] == 50.0
    assert days_by_date["2026-11-12"]["pnl"]["total"] == 50.0

    # Check that executions have instrument_type
    exec_10 = days_by_date["2026-11-10"]["executions"]
    assert len(exec_10) > 0
    assert exec_10[0]["instrument_type"] == "stock"

    exec_12 = days_by_date["2026-11-12"]["executions"]
    assert len(exec_12) > 0
    assert exec_12[0]["instrument_type"] == "etf"
