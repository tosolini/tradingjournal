from datetime import date, datetime, timezone
from decimal import Decimal
import io
import json
from unittest.mock import MagicMock

from fastapi import UploadFile
from sqlalchemy import select

from app.api.data import export_data, import_data
from app.models import (
    Account, Asset, BondDetail, Broker, CashLedgerEntry, DailyNote, Exchange,
    Holding, PortfolioSnapshot, PositionDailySnapshot, Ticker, Trade,
    TradeExecution, User, broker_exchanges,
)
from app.security import hash_password


def test_export_and_import_all_entities_up_to_v019(db):
    # 1. Create a user
    user = User(
        email="export_user@example.com",
        username="export_user",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 2. Exchange & Broker with 0.1.9 Fineco / Tax fields
    exchange = Exchange(
        user_id=user.id,
        name="MOT / Euronext Milan",
        mic="XMIL",
        suffix="MI",
        country="IT",
        currency="EUR",
    )
    db.add(exchange)
    db.commit()
    db.refresh(exchange)

    broker = Broker(
        user_id=user.id,
        name="Fineco Bank",
        broker_profile="fineco_trading",
        fee_mode="percent_min_max",
        fee_value=Decimal("0.190000"),
        fee_min=Decimal("2.950000"),
        fee_max=Decimal("19.000000"),
        fee_us_value=Decimal("3.950000"),
        fee_currency="EUR",
        monthly_fee=Decimal("0.00"),
        fee_tier_override=None,
        capital_gain_mode="immediate",
        capital_gain_rate=Decimal("26.00"),
        capital_gain_rate_gov=Decimal("12.50"),
    )
    db.add(broker)
    db.commit()
    db.refresh(broker)

    # Link broker <-> exchange
    db.execute(
        broker_exchanges.insert().values(
            broker_id=broker.id,
            exchange_id=exchange.id,
        )
    )
    db.commit()

    # 3. Account
    account = Account(
        user_id=user.id,
        broker_id=broker.id,
        name="Conto Trading",
        base_currency="EUR",
        cash_balance=Decimal("25000.00"),
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    # 4. Global Ticker
    ticker = Ticker(
        name="BTP Valore MZ30",
        isin="IT0005583486",
        symbol="IT0005583486",
        market="MOT",
        currency="EUR",
    )
    db.add(ticker)
    db.commit()
    db.refresh(ticker)

    # 5. Trade & Execution
    now_utc = datetime(2026, 10, 26, 10, 0, 0, tzinfo=timezone.utc)
    trade = Trade(
        user_id=user.id,
        account_id=account.id,
        ticker_id=ticker.id,
        market="MOT",
        symbol="IT0005583486",
        isin="IT0005583486",
        instrument_type="bond",
        side="long",
        status="open",
        strategy_name="Buy and Hold",
        tags=["fixed_income", "btp"],
        confidence_score=5,
        journal_notes="Collocamento primario con premio fedeltà",
        created_at=now_utc,
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)

    execution = TradeExecution(
        trade_id=trade.id,
        action="BUY",
        executed_at=now_utc,
        quantity=Decimal("10000.000000"),
        price=Decimal("100.000000"),
        fee=Decimal("0.000000"),
        currency="EUR",
    )
    db.add(execution)
    db.commit()

    # 6. Daily Note
    note = DailyNote(
        user_id=user.id,
        note_date=date(2026, 10, 26),
        mood="optimistic",
        market_condition="Rally BTP",
        market_volatility="low",
        short_summary="Asta BTP Valore conclusa",
        rich_text="<p>Ottima domanda retail.</p>",
        symbol="IT0005583486",
    )
    db.add(note)
    db.commit()

    # 7. Asset with 0.1.9 BondDetail
    asset = Asset(
        user_id=user.id,
        symbol="IT0005583486",
        name="BTP VALORE MZ30",
        isin="IT0005583486",
        instrument_type="bond",
        exchange="MOT",
        currency="EUR",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    bond_detail = BondDetail(
        asset_id=asset.id,
        bond_type="step_up",
        issue_date=date(2024, 3, 5),
        maturity_date=date(2030, 3, 5),
        coupon_frequency=4,
        annual_coupon_rate=Decimal("0.0000"),
        step_up_schedule=[
            {"from_year": 1, "to_year": 3, "rate": 3.25},
            {"from_year": 4, "to_year": 6, "rate": 4.00},
        ],
        final_bonus_rate=Decimal("0.8000"),
        tax_rate=Decimal("12.50"),
        day_count_convention="ACT/ACT ICMA",
    )
    db.add(bond_detail)
    db.commit()

    # 8. Holding with 0.1.9 Accrued Interest & CUM Bonus
    holding = Holding(
        user_id=user.id,
        account_id=account.id,
        asset_id=asset.id,
        quantity=Decimal("10000.000000"),
        avg_cost=Decimal("100.000000"),
        entry_date=date(2024, 3, 5),
        exit_date=date(2030, 3, 5),
        accrued_interest_in=Decimal("50.250000"),
        eligible_for_bonus=True,
    )
    db.add(holding)
    db.commit()

    # 9. Cash ledger entry with 0.1.9 entry_type 'coupon'
    ledger_entry = CashLedgerEntry(
        account_id=account.id,
        entry_type="coupon",
        amount=Decimal("81.25"),
        description="Cedola trimestrale BTP Valore",
        entry_date=date(2026, 6, 5),
    )
    db.add(ledger_entry)
    db.commit()

    # 10. Position and portfolio snapshots
    pos_snapshot = PositionDailySnapshot(
        account_id=account.id,
        symbol="IT0005583486",
        snapshot_date=date(2026, 10, 26),
        position_qty=Decimal("10000.000000"),
        close_price=Decimal("101.500000"),
        market_value=Decimal("10150.000000"),
        realized_pnl=Decimal("0.000000"),
        unrealized_pnl=Decimal("150.000000"),
    )
    db.add(pos_snapshot)

    port_snapshot = PortfolioSnapshot(
        account_id=account.id,
        snapshot_date=date(2026, 10, 26),
        total_value=Decimal("35150.00"),
        total_cost=Decimal("35000.00"),
        total_return=Decimal("150.00"),
        total_return_pct=Decimal("0.4286"),
    )
    db.add(port_snapshot)
    db.commit()

    # ── EXPORT VERIFICATION ──────────────────────────────────────────
    response = export_data(request=MagicMock(), db=db, current_user=user)
    assert response.status_code == 200
    assert response.media_type == "application/json"
    assert "tradejournal-export-" in response.headers["content-disposition"]

    payload = json.loads(response.body.decode("utf-8"))
    assert payload["version"] == 1

    # Exchanges & Brokers
    assert len(payload["exchanges"]) == 1
    assert payload["exchanges"][0]["name"] == "MOT / Euronext Milan"

    assert len(payload["brokers"]) == 1
    exported_broker = payload["brokers"][0]
    assert exported_broker["name"] == "Fineco Bank"
    assert exported_broker["broker_profile"] == "fineco_trading"
    assert exported_broker["fee_min"] == "2.950000"
    assert exported_broker["fee_max"] == "19.000000"
    assert exported_broker["capital_gain_rate_gov"] == "12.50"

    assert len(payload["broker_exchanges"]) == 1

    # Accounts
    assert len(payload["accounts"]) == 1
    assert payload["accounts"][0]["broker_name"] == "Fineco Bank"

    # Tickers
    assert any(t["symbol"] == "IT0005583486" for t in payload["tickers"])

    # Trades & Executions
    assert len(payload["trades"]) == 1
    exported_trade = payload["trades"][0]
    assert exported_trade["symbol"] == "IT0005583486"
    assert exported_trade["account_name"] == "Conto Trading"
    assert exported_trade["tags"] == ["fixed_income", "btp"]

    assert len(payload["executions"]) == 1
    assert payload["executions"][0]["action"] == "BUY"

    # Daily Notes
    assert len(payload["daily_notes"]) == 1
    assert payload["daily_notes"][0]["symbol"] == "IT0005583486"
    assert payload["daily_notes"][0]["note_date"] == "2026-10-26"

    # Assets & Bond Details
    assert len(payload["assets"]) == 1
    exported_asset = payload["assets"][0]
    assert exported_asset["symbol"] == "IT0005583486"
    assert "bond_detail" in exported_asset
    assert exported_asset["bond_detail"]["bond_type"] == "step_up"
    assert exported_asset["bond_detail"]["final_bonus_rate"] == "0.8000"
    assert len(exported_asset["bond_detail"]["step_up_schedule"]) == 2

    # Holdings
    assert len(payload["holdings"]) == 1
    exported_holding = payload["holdings"][0]
    assert exported_holding["asset_symbol"] == "IT0005583486"
    assert exported_holding["account_name"] == "Conto Trading"
    assert exported_holding["accrued_interest_in"] == "50.250000"
    assert exported_holding["eligible_for_bonus"] is True
    assert exported_holding["entry_date"] == "2024-03-05"

    # Ledger
    assert len(payload["cash_ledger_entries"]) == 1
    assert payload["cash_ledger_entries"][0]["entry_type"] == "coupon"
    assert payload["cash_ledger_entries"][0]["amount"] == "81.25"

    # Snapshots
    assert len(payload["position_daily_snapshots"]) == 1
    assert payload["position_daily_snapshots"][0]["symbol"] == "IT0005583486"
    assert len(payload["portfolio_snapshots"]) == 1
    assert payload["portfolio_snapshots"][0]["total_value"] == "35150.00"

    # ── IMPORT ROUND-TRIP VERIFICATION ───────────────────────────────
    # Now import into a second fresh user
    second_user = User(
        email="import_user@example.com",
        username="import_user",
        hashed_password=hash_password("Password123!"),
        role="user",
    )
    db.add(second_user)
    db.commit()
    db.refresh(second_user)

    upload = UploadFile(
        file=io.BytesIO(response.body),
        filename="backup.json",
    )
    import_res = import_data(request=MagicMock(), file=upload, db=db, current_user=second_user)
    assert "imported" in import_res
    assert import_res["errors"] == []
    assert import_res["imported"]["assets"] == 1
    assert import_res["imported"]["holdings"] == 1
    assert import_res["imported"]["trades"] == 1
    assert import_res["imported"]["cash_ledger_entries"] == 1

    # Verify second user has imported assets with bond details
    imported_asset = db.execute(
        select(Asset).where(Asset.user_id == second_user.id, Asset.symbol == "IT0005583486")
    ).scalar_one()
    assert imported_asset.bond_detail is not None
    assert imported_asset.bond_detail.bond_type == "step_up"
    assert imported_asset.bond_detail.final_bonus_rate == Decimal("0.8000")

    # Verify second user has holding with bond fields
    imported_holding = db.execute(
        select(Holding).where(Holding.user_id == second_user.id, Holding.asset_id == imported_asset.id)
    ).scalar_one()
    assert imported_holding.accrued_interest_in == Decimal("50.250000")
    assert imported_holding.eligible_for_bonus is True
    assert imported_holding.entry_date == date(2024, 3, 5)
