"""Integration tests for asset analysis and coaching API handlers."""
from decimal import Decimal
import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.analysis import (
    delete_analysis_report,
    get_analysis_report,
    get_analysis_targets,
    list_analysis_history,
    start_analysis_job,
)
from app.models import Account, AnalysisReport, Asset, Holding, Trade, TradeIdea, User
from app.schemas import AnalysisRunRequest


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
