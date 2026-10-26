from datetime import datetime, timezone
from decimal import Decimal

from app.api.trades import _compute_execution_fee, _capital_gain_tax
from app.models import Account, Broker, Trade, TradeExecution, User


def test_fineco_conto_trading_percentage_min_max():
    broker = Broker(
        name="Fineco Trading",
        broker_profile="fineco_trading",
        fee_mode="percent_min_max",
        fee_value=Decimal("0.19"),
        fee_min=Decimal("2.95"),
        fee_max=Decimal("19.00"),
        fee_currency="EUR",
    )
    account = Account(name="Test Acc", broker=broker, base_currency="EUR")
    trade = Trade(account=account, symbol="ENI.MI", market="XMIL")

    # Small order: notional 500 € * 0.19% = 0.95 € -> capped at min 2.95 €
    fee_small = _compute_execution_fee(trade, quantity=Decimal("50"), price=Decimal("10.00"))
    assert fee_small == Decimal("2.950000")

    # Medium order: notional 5,000 € * 0.19% = 9.50 € -> between 2.95 and 19.00
    fee_med = _compute_execution_fee(trade, quantity=Decimal("500"), price=Decimal("10.00"))
    assert fee_med == Decimal("9.500000")

    # Large order: notional 20,000 € * 0.19% = 38.00 € -> capped at max 19.00 €
    fee_large = _compute_execution_fee(trade, quantity=Decimal("2000"), price=Decimal("10.00"))
    assert fee_large == Decimal("19.000000")


def test_fineco_conto_trading_under_30():
    broker = Broker(
        name="Fineco Under 30",
        broker_profile="fineco_trading_under30",
        fee_mode="under_30",
        fee_value=Decimal("2.95"),
        fee_us_value=Decimal("3.95"),
        fee_currency="EUR",
    )
    account = Account(name="Test Acc", broker=broker, base_currency="EUR")

    # European market / EUR currency
    trade_eu = Trade(account=account, symbol="ISP.MI", market="XMIL")
    fee_eu = _compute_execution_fee(trade_eu, quantity=Decimal("100"), price=Decimal("2.50"))
    assert fee_eu == Decimal("2.950000")

    # US market / USD
    trade_us = Trade(account=account, symbol="AAPL", market="NASDAQ")
    fee_us = _compute_execution_fee(trade_us, quantity=Decimal("10"), price=Decimal("180.00"), currency="USD")
    assert fee_us == Decimal("3.950000")


def test_fineco_tiered_volume_with_override():
    broker = Broker(
        name="Fineco Classic",
        broker_profile="fineco_classic",
        fee_mode="tiered_volume",
        fee_tier_override=3,  # Tier 3
        monthly_fee=Decimal("3.95"),
        fee_currency="EUR",
    )
    account = Account(name="Test Acc", broker=broker, base_currency="EUR")

    # EUR order on Tier 3 should be 6.95 €
    trade_eu = Trade(account=account, symbol="ENEL.MI", market="XMIL")
    fee_eu = _compute_execution_fee(trade_eu, quantity=Decimal("100"), price=Decimal("6.00"))
    assert fee_eu == Decimal("6.950000")

    # USD order on Tier 3 should be 8.95 $
    trade_us = Trade(account=account, symbol="MSFT", market="NASDAQ")
    fee_us = _compute_execution_fee(trade_us, quantity=Decimal("5"), price=Decimal("400.00"), currency="USD")
    assert fee_us == Decimal("8.950000")


def test_fineco_tiered_volume_monthly_auto_calculation(db):
    user = User(email="tiered@example.com", username="tiereduser", hashed_password="pw")
    db.add(user)
    db.flush()

    broker = Broker(
        user_id=user.id,
        name="Fineco One",
        broker_profile="fineco_one",
        fee_mode="tiered_volume",
        fee_tier_override=None,  # Auto based on monthly volume
        fee_currency="EUR",
    )
    db.add(broker)
    db.flush()

    account = Account(user_id=user.id, broker_id=broker.id, name="Fineco Acc", base_currency="EUR")
    db.add(account)
    db.flush()

    trade1 = Trade(user_id=user.id, account_id=account.id, symbol="ENI.MI", market="XMIL")
    db.add(trade1)
    db.flush()

    now = datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc)

    # 1. At start of month with 0 fees, should be Tier 1 (< 99 € -> 19 € EUR / 12.95 $ USD)
    fee1 = _compute_execution_fee(trade1, quantity=Decimal("10"), price=Decimal("14.00"), executed_at=now, db=db)
    assert fee1 == Decimal("19.000000")

    # Add an execution with 150 € fee in October
    ex1 = TradeExecution(
        trade_id=trade1.id,
        action="BUY",
        executed_at=now,
        quantity=Decimal("100"),
        price=Decimal("14.00"),
        fee=Decimal("150.00"),
    )
    db.add(ex1)
    db.commit()

    # Now monthly fees = 150 € -> Tier 2 (100 € - 1,499 € -> 9.95 € EUR / 9.95 $ USD)
    fee2 = _compute_execution_fee(trade1, quantity=Decimal("10"), price=Decimal("14.00"), executed_at=now, db=db)
    assert fee2 == Decimal("9.950000")

    # Add another execution bringing monthly fees to 1,600 € -> Tier 3 (1,500 € - 2,499 € -> 6.95 € EUR / 8.95 $ USD)
    ex2 = TradeExecution(
        trade_id=trade1.id,
        action="BUY",
        executed_at=now,
        quantity=Decimal("100"),
        price=Decimal("14.00"),
        fee=Decimal("1450.00"),
    )
    db.add(ex2)
    db.commit()

    fee3 = _compute_execution_fee(trade1, quantity=Decimal("10"), price=Decimal("14.00"), executed_at=now, db=db)
    assert fee3 == Decimal("6.950000")

    # Add another execution bringing monthly fees over 2,500 € -> Tier 4 (>= 2,500 € -> 2.95 € EUR / 3.95 $ USD)
    ex3 = TradeExecution(
        trade_id=trade1.id,
        action="BUY",
        executed_at=now,
        quantity=Decimal("100"),
        price=Decimal("14.00"),
        fee=Decimal("1000.00"),
    )
    db.add(ex3)
    db.commit()

    fee4 = _compute_execution_fee(trade1, quantity=Decimal("10"), price=Decimal("14.00"), executed_at=now, db=db)
    assert fee4 == Decimal("2.950000")


def test_titoli_di_stato_tax_vs_standard_tax():
    broker = Broker(
        name="Directa",
        capital_gain_mode="immediate",
        capital_gain_rate=Decimal("26.00"),
        capital_gain_rate_gov=Decimal("12.50"),
    )

    # 1. Standard stock gain: 1,000 € net profit @ 26% = 260 €
    mode, rate, tax_stock, note = _capital_gain_tax(
        net_pnl=Decimal("1000.00"),
        broker=broker,
        instrument_type="stock",
    )
    assert rate == Decimal("26.00")
    assert tax_stock == Decimal("260.000000")

    # 2. Government bond gain (BTP): 1,000 € net profit @ 12.5% = 125 €
    mode, rate, tax_gov, note = _capital_gain_tax(
        net_pnl=Decimal("1000.00"),
        broker=broker,
        instrument_type="government_bond",
    )
    assert rate == Decimal("12.50")
    assert tax_gov == Decimal("125.000000")


def test_dashboard_capital_gain_cross_compensation(db):
    from app.api.dashboard import dashboard_kpis

    user = User(email="taxcross@example.com", username="taxcrossuser", hashed_password="pw")
    db.add(user)
    db.flush()

    broker = Broker(
        user_id=user.id,
        name="Directa Tax",
        capital_gain_mode="immediate",
        capital_gain_rate=Decimal("26.00"),
        capital_gain_rate_gov=Decimal("12.50"),
    )
    db.add(broker)
    db.flush()

    account = Account(user_id=user.id, broker_id=broker.id, name="Tax Acc", base_currency="EUR")
    db.add(account)
    db.flush()

    now = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

    # 1. Government bond closed with 1,000 € loss: Buy 100 @ 100, Sell 100 @ 90
    trade_btp = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="BTP-2030",
        market="MOT",
        instrument_type="government_bond",
        status="close",
        closed_at=now,
    )
    db.add(trade_btp)
    db.flush()
    ex_btp_buy = TradeExecution(trade_id=trade_btp.id, action="BUY", executed_at=now, quantity=Decimal("100"), price=Decimal("100"), fee=Decimal("0"))
    ex_btp_sell = TradeExecution(trade_id=trade_btp.id, action="SELL", executed_at=now, quantity=Decimal("100"), price=Decimal("90"), fee=Decimal("0"))
    db.add_all([ex_btp_buy, ex_btp_sell])

    # 2. Stock closed with 1,000 € profit: Buy 100 @ 10, Sell 100 @ 20
    trade_stock = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="ENI.MI",
        market="XMIL",
        instrument_type="stock",
        status="close",
        closed_at=now,
    )
    db.add(trade_stock)
    db.flush()
    ex_stock_buy = TradeExecution(trade_id=trade_stock.id, action="BUY", executed_at=now, quantity=Decimal("100"), price=Decimal("10"), fee=Decimal("0"))
    ex_stock_sell = TradeExecution(trade_id=trade_stock.id, action="SELL", executed_at=now, quantity=Decimal("100"), price=Decimal("20"), fee=Decimal("0"))
    db.add_all([ex_stock_buy, ex_stock_sell])

    db.commit()

    kpis = dashboard_kpis(db=db, current_user=user)

    # Stock tax: 1,000 € * 26% = 260 €
    assert kpis["capital_gain_tax_estimate"] == "260.00"
    assert kpis["capital_gain_tax_standard"] == "260.00"
    assert kpis["capital_gain_tax_gov"] == "0.00"

    # Gov bond loss: 1,000 € nominal loss
    assert kpis["capital_gain_loss_nominal"] == "1000.00"
    assert kpis["capital_gain_loss_gov"] == "1000.00"
    # Weighted loss offset in 26% basket: 1,000 * (12.5 / 26) = 480.77 €
    assert kpis["capital_gain_loss_offset"] == "480.77"
