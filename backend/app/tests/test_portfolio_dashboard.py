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

def test_dashboard_portfolio_history_breakdown_holdings_and_trades(db, monkeypatch):
    user = User(
        email="breakdown@example.com",
        username="breakdown",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = Account(name="Main", user_id=user.id, base_currency="EUR")
    db.add(acc)
    db.commit()
    db.refresh(acc)

    # Historical snapshot: ETF holding
    ps = PortfolioSnapshot(
        account_id=acc.id,
        snapshot_date=date(2026, 9, 1),
        total_value=Decimal("4200"),
        total_cost=Decimal("4000"),
        total_return=Decimal("200"),
        total_return_pct=Decimal("5"),
    )
    # Historical snapshot: Stock position
    pds = PositionDailySnapshot(
        account_id=acc.id,
        symbol="TSLA",
        snapshot_date=date(2026, 9, 1),
        position_qty=Decimal("5"),
        close_price=Decimal("210"),
        market_value=Decimal("1050"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("50"),
    )
    db.add_all([ps, pds])
    db.commit()

    kpis = dashboard_kpis(db=db, current_user=user)
    history = kpis["portfolio_history"]

    pt = next(p for p in history if p["date"] == "2026-09-01")
    # Holdings (ETF & obbligazioni)
    assert pt["holdings_value"] == 4200.0
    assert pt["holdings_cost"] == 4000.0
    assert pt["holdings_return_pct"] == 5.0
    # Trades (azionario)
    assert pt["trades_value"] == 1050.0
    assert pt["trades_cost"] == 1000.0
    assert pt["trades_return_pct"] == 5.0
    # Cumulato
    assert pt["value"] == 5250.0
    assert pt["cost"] == 5000.0
    assert pt["return_pct"] == 5.0

def test_dashboard_chart_asset_filter_preference(db):
    from app.api.auth import update_preferences, get_preferences
    from app.schemas import UserPreferencesUpdate

    user = User(
        email="pref_test@example.com",
        username="pref_test",
        hashed_password=hash_password("Password123!"),
        role="user",
        preferences={},
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Update preference to "portfolio"
    update_payload = UserPreferencesUpdate(
        preferences={"dashboard": {"chart_asset_filter": "portfolio"}}
    )
    res = update_preferences(payload=update_payload, db=db, current_user=user)
    assert res.preferences["dashboard"]["chart_asset_filter"] == "portfolio"

    # Read preference back
    read_res = get_preferences(current_user=user)
    assert read_res.preferences["dashboard"]["chart_asset_filter"] == "portfolio"

    # Update preference to "trades"
    update_payload_2 = UserPreferencesUpdate(
        preferences={"dashboard": {"chart_asset_filter": "trades"}}
    )
    res_2 = update_preferences(payload=update_payload_2, db=db, current_user=user)
    assert res_2.preferences["dashboard"]["chart_asset_filter"] == "trades"

def test_dashboard_portfolio_history_forward_fills_stocks_on_weekends_and_market_holidays(db):
    user = User(
        email="weekend_test@example.com",
        username="weekend_test",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc_stocks = Account(name="Stocks", user_id=user.id, base_currency="EUR")
    acc_etf = Account(name="ETF", user_id=user.id, base_currency="EUR")
    db.add_all([acc_stocks, acc_etf])
    db.commit()
    db.refresh(acc_stocks)
    db.refresh(acc_etf)

    # Open trade created on Friday 2026-08-07
    trade = Trade(
        user_id=user.id,
        account_id=acc_stocks.id,
        symbol="SAN",
        market="BME",
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
        executed_at=datetime(2026, 8, 7, 10, 0, tzinfo=timezone.utc),
        quantity=Decimal("100"),
        price=Decimal("10"),
        fee=Decimal("0"),
        currency="EUR",
    )
    db.add(execution)

    # Friday 2026-08-07: stock snapshot
    pds_fri = PositionDailySnapshot(
        account_id=acc_stocks.id,
        symbol="SAN",
        snapshot_date=date(2026, 8, 7),
        position_qty=Decimal("100"),
        close_price=Decimal("10.5"),
        market_value=Decimal("1050"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("50"),
    )
    # Friday 2026-08-07: ETF snapshot
    ps_fri = PortfolioSnapshot(
        account_id=acc_etf.id,
        snapshot_date=date(2026, 8, 7),
        total_value=Decimal("5000"),
        total_cost=Decimal("5000"),
        total_return=Decimal("0"),
        total_return_pct=Decimal("0"),
    )
    # Saturday 2026-08-08: ETF snapshot recorded, but stock market was closed (no PDS)
    ps_sat = PortfolioSnapshot(
        account_id=acc_etf.id,
        snapshot_date=date(2026, 8, 8),
        total_value=Decimal("5000"),
        total_cost=Decimal("5000"),
        total_return=Decimal("0"),
        total_return_pct=Decimal("0"),
    )
    # Sunday 2026-08-09: ETF snapshot recorded, but stock market was closed (no PDS)
    ps_sun = PortfolioSnapshot(
        account_id=acc_etf.id,
        snapshot_date=date(2026, 8, 9),
        total_value=Decimal("5000"),
        total_cost=Decimal("5000"),
        total_return=Decimal("0"),
        total_return_pct=Decimal("0"),
    )
    db.add_all([pds_fri, ps_fri, ps_sat, ps_sun])
    db.commit()

    kpis = dashboard_kpis(db=db, current_user=user)
    history = kpis["portfolio_history"]

    fri_pt = next(p for p in history if p["date"] == "2026-08-07")
    sat_pt = next(p for p in history if p["date"] == "2026-08-08")
    sun_pt = next(p for p in history if p["date"] == "2026-08-09")

    # Friday: 1050 value, 1000 cost
    assert fri_pt["trades_value"] == 1050.0
    assert fri_pt["trades_cost"] == 1000.0
    assert fri_pt["value"] == 6050.0

    # Saturday (weekend): must NOT drop to 0, should forward-fill Friday's value
    assert sat_pt["trades_value"] == 1050.0
    assert sat_pt["trades_cost"] == 1000.0
    assert sat_pt["value"] == 6050.0

    # Sunday (weekend): must NOT drop to 0, should forward-fill Friday's value
    assert sun_pt["trades_value"] == 1050.0
    assert sun_pt["trades_cost"] == 1000.0
    assert sun_pt["value"] == 6050.0

def test_portfolio_history_does_not_double_count_today_holdings(db, monkeypatch):
    from app.api.portfolio import portfolio_history
    from app.models import Asset, Holding

    user = User(
        email="today_holdings@example.com",
        username="today_holdings",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = Account(name="Investments", user_id=user.id, base_currency="EUR")
    asset = Asset(user_id=user.id, symbol="SWDA.MI", name="MSCI World", instrument_type="etf")
    db.add_all([acc, asset])
    db.commit()
    db.refresh(acc)
    db.refresh(asset)

    # Holding entered TODAY with cost 100 * 50 = 5000
    today = date.today()
    h = Holding(
        user_id=user.id,
        account_id=acc.id,
        asset_id=asset.id,
        quantity=Decimal("100"),
        avg_cost=Decimal("50"),
        entry_date=today,
    )
    db.add(h)
    db.commit()

    monkeypatch.setattr(
        "app.services.portfolio.get_current_price",
        lambda *_args, **_kwargs: Decimal("55"),
    )

    history = portfolio_history(db=db, current_user=user)
    today_str = today.isoformat()
    today_pt = next(p for p in history if p.date == today_str)

    # Cost should be 5000.0, NOT double-counted to 10000.0
    assert today_pt.cost == 5000.0
    # Value should be 100 * 55 = 5500.0, NOT 5500 + 5000 = 10500.0
    assert today_pt.value == 5500.0


def test_dashboard_live_holdings_cost_is_bond_aware(db, monkeypatch):
    """Regression: live cost must use the per-tranche cost basis, not price * quantity.

    For bonds avg_cost is a price on a 100 nominal basis, so ``avg_cost * quantity``
    inflates the cost by ~100x. Multiple tranches made the error even larger.
    """
    from app.models import Asset, BondDetail, Holding

    user = User(
        email="bond_cost@example.com",
        username="bond_cost",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    acc = Account(name="Bonds", user_id=user.id, base_currency="EUR")
    asset = Asset(
        user_id=user.id,
        symbol="IT0005583486",
        name="BTP Valore Mar 2030",
        instrument_type="bond",
        currency="EUR",
    )
    db.add_all([acc, asset])
    db.commit()
    db.refresh(acc)
    db.refresh(asset)

    db.add(
        BondDetail(
            asset_id=asset.id,
            bond_type="fixed",
            issue_date=date(2023, 3, 5),
            maturity_date=date(2030, 3, 5),
            coupon_frequency=4,
            annual_coupon_rate=Decimal("3.2500"),
            tax_rate=Decimal("12.50"),
            final_bonus_rate=Decimal("0.8000"),
        )
    )
    db.add_all(
        [
            Holding(
                user_id=user.id,
                account_id=acc.id,
                asset_id=asset.id,
                quantity=Decimal("15000.00"),
                avg_cost=Decimal("100.00"),
                entry_date=date(2024, 5, 14),
                eligible_for_bonus=True,
            ),
            Holding(
                user_id=user.id,
                account_id=acc.id,
                asset_id=asset.id,
                quantity=Decimal("10000.00"),
                avg_cost=Decimal("100.00"),
                entry_date=date(2026, 10, 26),
                eligible_for_bonus=True,
            ),
        ]
    )
    db.commit()

    monkeypatch.setattr(
        "app.services.portfolio.get_current_price",
        lambda *_args, **_kwargs: Decimal("100.00"),
    )
    monkeypatch.setattr(
        "app.api.dashboard.get_current_price",
        lambda *_args, **_kwargs: Decimal("100.00"),
    )

    kpis = dashboard_kpis(db=db, current_user=user)
    today_pt = kpis["portfolio_history"][-1]

    # 25,000 nominal at 100 => 25,000 cost (not 2,500,000).
    assert today_pt["holdings_cost"] == 25000.0
    assert today_pt["holdings_value"] > 25000.0
    assert today_pt["holdings_value"] < 26000.0


def test_dashboard_equity_curve_is_scoped_per_user(db):
    user_a = User(
        email="equity-a@example.com",
        username="equity_a",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    user_b = User(
        email="equity-b@example.com",
        username="equity_b",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add_all([user_a, user_b])
    db.commit()
    db.refresh(user_a)
    db.refresh(user_b)

    account_a = Account(name="A", user_id=user_a.id, base_currency="EUR")
    account_b = Account(name="B", user_id=user_b.id, base_currency="EUR")
    db.add_all([account_a, account_b])
    db.commit()
    db.refresh(account_a)
    db.refresh(account_b)

    db.add_all(
        [
            PositionDailySnapshot(
                account_id=account_a.id,
                symbol="AAA",
                snapshot_date=date(2026, 1, 1),
                market_value=Decimal("100"),
            ),
            PositionDailySnapshot(
                account_id=account_b.id,
                symbol="BBB",
                snapshot_date=date(2026, 1, 1),
                market_value=Decimal("200"),
            ),
        ]
    )
    db.commit()

    kpis = dashboard_kpis(db=db, current_user=user_a)
    assert [point["value"] for point in kpis["equity_curve"]] == [100.0]
