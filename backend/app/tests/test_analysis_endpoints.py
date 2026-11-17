"""Integration tests for asset analysis and coaching API handlers."""
from decimal import Decimal
import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.analysis import (
    delete_analysis_report,
    get_analysis_report,
    get_analysis_targets,
    list_analysis_history,
    purge_analysis_history,
    start_analysis_job,
)
from app.models import Account, AnalysisReport, Asset, Holding, Trade, TradeIdea, User
from app.schemas import AnalysisPurgeRequest, AnalysisRunRequest


@pytest.fixture
def test_user(db):
    user = User(
        email="test_analyst@example.com",
        username="test_analyst",
        hashed_password="hash",
    )
    db.add(user)
    db.flush()
    return user


def test_get_analysis_targets_from_holdings_and_ideas(db, test_user):
    account = Account(user_id=test_user.id, name="Test Account", base_currency="EUR")
    db.add(account)
    db.flush()

    asset = Asset(
        user_id=test_user.id,
        symbol="ENEL.MI",
        name="Enel S.p.A.",
        instrument_type="stock",
        exchange="Borsa Italiana",
    )
    db.add(asset)
    db.flush()

    holding = Holding(
        user_id=test_user.id,
        account_id=account.id,
        asset_id=asset.id,
        quantity=Decimal("100"),
        avg_cost=Decimal("6.50"),
        entry_date="2024-01-15",
    )
    db.add(holding)

    idea = TradeIdea(
        user_id=test_user.id,
        symbol="ISP.MI",
        market="Borsa Italiana",
        direction="long",
        initial_price=Decimal("3.20"),
        trigger_price=Decimal("3.10"),
        status="watching",
        stale_days=7,
        expire_days=10,
        stale_at="2026-11-20T00:00:00Z",
        expires_at="2026-11-25T00:00:00Z",
    )
    db.add(idea)

    trade = Trade(
        user_id=test_user.id,
        account_id=account.id,
        symbol="NVDA",
        market="NASDAQ",
        instrument_type="stock",
        side="long",
        status="open",
        target_price=Decimal("150.00"),
        stop_loss=Decimal("120.00"),
    )
    db.add(trade)
    db.commit()

    targets = get_analysis_targets(db=db, current_user=test_user)
    assert len(targets) == 3

    symbols = [t.symbol for t in targets]
    assert "ENEL.MI" in symbols
    assert "ISP.MI" in symbols
    assert "NVDA" in symbols

    trade_targets = [t for t in targets if t.target_source == "trade"]
    assert len(trade_targets) == 1
    assert trade_targets[0].trade_id == trade.id


def test_start_analysis_job_and_get_details(db, test_user):
    bg_tasks = BackgroundTasks()
    payload = AnalysisRunRequest(
        symbol="ENEL.MI",
        market="Borsa Italiana",
        language="it",
    )
    report = start_analysis_job(
        payload=payload,
        background_tasks=bg_tasks,
        db=db,
        current_user=test_user,
    )
    assert report.symbol == "ENEL.MI"
    assert report.status == "pending"

    detail = get_analysis_report(
        analysis_id=report.id,
        db=db,
        current_user=test_user,
    )
    assert detail.id == report.id
    assert detail.symbol == "ENEL.MI"


def test_list_history_and_delete(db, test_user):
    report = AnalysisReport(
        user_id=test_user.id,
        symbol="UCG.MI",
        market="Borsa Italiana",
        language="it",
        status="completed",
        overall_score=7,
    )
    db.add(report)
    db.commit()

    items = list_analysis_history(
        symbol=None,
        limit=20,
        db=db,
        current_user=test_user,
    )
    assert len(items) >= 1
    assert items[0].symbol == "UCG.MI"

    # Delete
    del_res = delete_analysis_report(
        analysis_id=report.id,
        db=db,
        current_user=test_user,
    )
    assert del_res == {"ok": True}

    # Verify not found raises 404
    with pytest.raises(HTTPException) as exc_info:
        get_analysis_report(
            analysis_id=report.id,
            db=db,
            current_user=test_user,
        )
    assert exc_info.value.status_code == 404


def test_purge_analysis_history(db, test_user):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)

    # 1. Old report (40 days ago)
    old_report = AnalysisReport(
        user_id=test_user.id,
        symbol="OLD.MI",
        market="Borsa Italiana",
        language="it",
        status="completed",
        overall_score=6,
        created_at=now - timedelta(days=40),
    )
    # 2. Recent report (2 days ago)
    recent_report = AnalysisReport(
        user_id=test_user.id,
        symbol="NEW.MI",
        market="Borsa Italiana",
        language="it",
        status="completed",
        overall_score=8,
        created_at=now - timedelta(days=2),
    )
    # 3. Failed report
    failed_report = AnalysisReport(
        user_id=test_user.id,
        symbol="ERR.MI",
        market="NASDAQ",
        language="it",
        status="failed",
        error_message="Simulated error",
        created_at=now - timedelta(days=5),
    )
    db.add_all([old_report, recent_report, failed_report])
    db.commit()

    # Purge only failed
    res_failed = purge_analysis_history(
        payload=AnalysisPurgeRequest(only_failed=True),
        db=db,
        current_user=test_user,
    )
    assert res_failed.deleted_count == 1

    # Verify failed report deleted
    items = list_analysis_history(symbol=None, limit=10, db=db, current_user=test_user)
    symbols = [item.symbol for item in items]
    assert "ERR.MI" not in symbols
    assert "OLD.MI" in symbols
    assert "NEW.MI" in symbols

    # Purge older than 30 days
    res_old = purge_analysis_history(
        payload=AnalysisPurgeRequest(older_than_days=30),
        db=db,
        current_user=test_user,
    )
    assert res_old.deleted_count == 1

    items_after_old = list_analysis_history(symbol=None, limit=10, db=db, current_user=test_user)
    symbols_after = [item.symbol for item in items_after_old]
    assert "OLD.MI" not in symbols_after
    assert "NEW.MI" in symbols_after

    # Purge all
    res_all = purge_analysis_history(
        payload=AnalysisPurgeRequest(all_reports=True),
        db=db,
        current_user=test_user,
    )
    assert res_all.deleted_count == 1

    items_empty = list_analysis_history(symbol=None, limit=10, db=db, current_user=test_user)
    assert len(items_empty) == 0


def test_list_analysis_history_filter_by_trade_id(db, test_user):
    account = Account(
        user_id=test_user.id,
        name="Test Account For Trade Filter",
        base_currency="EUR",
    )
    db.add(account)
    db.commit()

    trade_1 = Trade(
        user_id=test_user.id,
        account_id=account.id,
        symbol="ENI",
        market="Euronext Milan",
        instrument_type="stock",
        side="long",
        status="open",
    )
    trade_2 = Trade(
        user_id=test_user.id,
        account_id=account.id,
        symbol="ENI",
        market="Euronext Milan",
        instrument_type="stock",
        side="long",
        status="open",
    )
    db.add_all([trade_1, trade_2])
    db.commit()

    rep_trade_1 = AnalysisReport(
        user_id=test_user.id,
        symbol="ENI",
        market="Euronext Milan",
        language="it",
        status="completed",
        overall_score=7,
        trade_id=trade_1.id,
    )
    rep_trade_2 = AnalysisReport(
        user_id=test_user.id,
        symbol="ENI",
        market="Euronext Milan",
        language="it",
        status="completed",
        overall_score=9,
        trade_id=trade_2.id,
    )
    rep_no_trade = AnalysisReport(
        user_id=test_user.id,
        symbol="ENI",
        market="Euronext Milan",
        language="it",
        status="completed",
        overall_score=5,
        trade_id=None,
    )
    db.add_all([rep_trade_1, rep_trade_2, rep_no_trade])
    db.commit()

    # Query with trade_id=trade_2.id
    items_trade_2 = list_analysis_history(symbol=None, limit=20, trade_id=trade_2.id, db=db, current_user=test_user)
    assert len(items_trade_2) == 1
    assert items_trade_2[0].id == rep_trade_2.id
    assert items_trade_2[0].trade_id == trade_2.id
    assert items_trade_2[0].overall_score == 9

    # Query without trade_id
    items_all = list_analysis_history(symbol="ENI", limit=20, db=db, current_user=test_user)
    assert len(items_all) == 3
