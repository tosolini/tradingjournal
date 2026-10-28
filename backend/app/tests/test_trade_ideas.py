from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.api.trade_ideas import (
    close_trade_idea,
    convert_trade_idea,
    create_trade_idea,
    delete_trade_idea,
    get_trade_idea_alerts,
    list_trade_ideas,
    renew_trade_idea,
)
from app.security import hash_password
from app.models import Account, Broker, Trade, TradeIdea, User
from app.schemas import TradeIdeaConvertRequest, TradeIdeaCreate
from app.services.trade_ideas import compute_distance_pct, evaluate_single_idea


def req():
    return SimpleNamespace(headers={})


def test_compute_distance_pct():
    assert compute_distance_pct(Decimal("22.00"), Decimal("20.00")) == Decimal("10.00")
    assert compute_distance_pct(Decimal("18.00"), Decimal("20.00")) == Decimal("-10.00")
    assert compute_distance_pct(Decimal("20.00"), Decimal("20.00")) == Decimal("0.00")
    assert compute_distance_pct(None, Decimal("20.00")) is None


def test_evaluate_single_idea_price_trigger():
    now = datetime.now(timezone.utc)
    idea = TradeIdea(
        user_id=1,
        symbol="XYZ",
        market="Euronext",
        direction="long",
        initial_price=Decimal("22.00"),
        trigger_price=Decimal("20.03"),
        trigger_condition="<=",
        status="watching",
        stale_days=7,
        expire_days=10,
        stale_at=now + timedelta(days=7),
        expires_at=now + timedelta(days=10),
    )

    # Price still above trigger: not triggered
    changed = evaluate_single_idea(idea, Decimal("21.00"), now)
    assert not changed
    assert idea.status == "watching"

    # Price reaches trigger: triggers!
    changed = evaluate_single_idea(idea, Decimal("20.03"), now)
    assert changed
    assert idea.status == "triggered"
    assert idea.triggered_price == Decimal("20.03")
    assert idea.triggered_at == now


def test_evaluate_single_idea_stale_and_expired():
    base_time = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    idea = TradeIdea(
        user_id=1,
        symbol="XYZ",
        market="Euronext",
        direction="short",
        initial_price=Decimal("25.00"),
        trigger_price=Decimal("28.00"),
        trigger_condition=">=",
        status="watching",
        stale_days=7,
        expire_days=10,
        stale_at=base_time + timedelta(days=7),
        expires_at=base_time + timedelta(days=10),
    )

    # Day 5: still watching
    evaluate_single_idea(idea, Decimal("26.00"), base_time + timedelta(days=5))
    assert idea.status == "watching"

    # Day 8: becomes stale
    changed = evaluate_single_idea(idea, Decimal("26.00"), base_time + timedelta(days=8))
    assert changed
    assert idea.status == "stale"

    # Day 11: expires / auto-closed
    changed = evaluate_single_idea(idea, Decimal("26.00"), base_time + timedelta(days=11))
    assert changed
    assert idea.status == "closed"
    assert idea.closed_at is not None


def test_trade_ideas_api_lifecycle(db):
    user = User(
        email="ideatester@example.com",
        username="ideatester",
        hashed_password=hash_password("StrongPass123!"),
        role="user",
        preferences={"trade_ideas": {"default_stale_days": 7, "default_expire_days": 10}},
    )
    db.add(user)
    db.flush()

    # 1. Create Trade Idea
    created = create_trade_idea(
        payload=TradeIdeaCreate(
            symbol="ENI",
            market="Milan",
            direction="short",
            initial_price=Decimal("14.50"),
            trigger_price=Decimal("14.00"),
            trigger_condition="<=",
            stop_loss=Decimal("14.80"),
            target_price=Decimal("13.20"),
            thesis_notes="Sotto EMA 60, breakout ribassista",
            tags=["ema60", "breakout"],
            stale_days=7,
            expire_days=10,
        ),
        db=db,
        current_user=user,
    )
    assert created.symbol == "ENI"
    assert created.direction == "short"
    assert created.status in ("watching", "triggered")
    idea_id = created.id

    # 2. List Trade Ideas
    list_res = list_trade_ideas(status=None, search=None, tag=None, db=db, current_user=user)
    assert len(list_res.items) == 1
    assert list_res.counts.all == 1

    # 3. Renew Idea
    renewed = renew_trade_idea(
        idea_id=idea_id,
        request=req(),
        days=14,
        db=db,
        current_user=user,
    )
    assert renewed.stale_days == 14
    assert renewed.status == "watching"

    # 4. Create a Trade to test Convert
    broker = Broker(name="TestBroker", user_id=user.id)
    db.add(broker)
    db.flush()
    account = Account(name="TestAccount", user_id=user.id, broker_id=broker.id)
    db.add(account)
    db.flush()
    trade = Trade(
        user_id=user.id,
        account_id=account.id,
        symbol="ENI",
        market="Milan",
    )
    db.add(trade)
    db.commit()

    # 5. Convert Idea
    converted = convert_trade_idea(
        idea_id=idea_id,
        payload=TradeIdeaConvertRequest(trade_id=trade.id),
        request=req(),
        db=db,
        current_user=user,
    )
    assert converted.status == "converted"
    assert converted.trade_id == trade.id

    # 6. Delete Idea
    del_res = delete_trade_idea(
        idea_id=idea_id,
        request=req(),
        db=db,
        current_user=user,
    )
    assert del_res["ok"] is True

    empty_list = list_trade_ideas(status=None, search=None, tag=None, db=db, current_user=user)
    assert len(empty_list.items) == 0
