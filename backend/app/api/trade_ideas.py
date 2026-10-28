from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error
from app.models import Trade, TradeIdea, User
from app.schemas import (
    TradeIdeaAlertsResponse,
    TradeIdeaConvertRequest,
    TradeIdeaCountsResponse,
    TradeIdeaCreate,
    TradeIdeaListResponse,
    TradeIdeaResponse,
    TradeIdeaUpdate,
)
from app.services.price_provider import get_current_price
from app.services.trade_ideas import compute_distance_pct, evaluate_active_trade_ideas

router = APIRouter(prefix="/api/trade-ideas", tags=["trade-ideas"])


def _get_user_default_days(user: User) -> tuple[int, int]:
    """Return (stale_days, expire_days) from user preferences or defaults."""
    stale_days = 7
    expire_days = 10
    if user.preferences and isinstance(user.preferences, dict):
        trade_ideas_pref = user.preferences.get("trade_ideas")
        if isinstance(trade_ideas_pref, dict):
            if "default_stale_days" in trade_ideas_pref and isinstance(trade_ideas_pref["default_stale_days"], int):
                stale_days = trade_ideas_pref["default_stale_days"]
            if "default_expire_days" in trade_ideas_pref and isinstance(trade_ideas_pref["default_expire_days"], int):
                expire_days = trade_ideas_pref["default_expire_days"]
    return stale_days, expire_days


def _serialize_idea(idea: TradeIdea, current_price: Optional[Decimal] = None) -> TradeIdeaResponse:
    if current_price is None and idea.status in ("watching", "triggered"):
        try:
            current_price = get_current_price(idea.symbol, idea.market)
        except Exception:
            current_price = None

    distance = compute_distance_pct(current_price, idea.trigger_price)

    return TradeIdeaResponse(
        id=idea.id,
        user_id=idea.user_id,
        symbol=idea.symbol,
        market=idea.market,
        direction=idea.direction,
        initial_price=idea.initial_price,
        trigger_price=idea.trigger_price,
        trigger_condition=idea.trigger_condition,
        stop_loss=idea.stop_loss,
        target_price=idea.target_price,
        thesis_notes=idea.thesis_notes,
        tags=idea.tags or [],
        status=idea.status,
        stale_days=idea.stale_days,
        expire_days=idea.expire_days,
        stale_at=idea.stale_at,
        expires_at=idea.expires_at,
        triggered_at=idea.triggered_at,
        triggered_price=idea.triggered_price,
        closed_at=idea.closed_at,
        trade_id=idea.trade_id,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
        current_price=current_price,
        distance_pct=distance,
    )


@router.post("", response_model=TradeIdeaResponse)
def create_trade_idea(
    payload: TradeIdeaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    default_stale, default_expire = _get_user_default_days(current_user)

    stale_days = payload.stale_days if payload.stale_days is not None else default_stale
    expire_days = payload.expire_days if payload.expire_days is not None else default_expire
    if expire_days < stale_days:
        expire_days = stale_days

    symbol = payload.symbol.strip().upper()
    market = (payload.market or "Euronext").strip()

    initial_price = payload.initial_price
    if initial_price is None:
        try:
            initial_price = get_current_price(symbol, market)
        except Exception:
            initial_price = None
        if initial_price is None:
            initial_price = payload.trigger_price

    stale_at = now + timedelta(days=stale_days)
    expires_at = now + timedelta(days=expire_days)

    idea = TradeIdea(
        user_id=current_user.id,
        symbol=symbol,
        market=market,
        direction=payload.direction,
        initial_price=initial_price,
        trigger_price=payload.trigger_price,
        trigger_condition=payload.trigger_condition,
        stop_loss=payload.stop_loss,
        target_price=payload.target_price,
        thesis_notes=payload.thesis_notes.strip() if payload.thesis_notes else None,
        tags=payload.tags,
        status="watching",
        stale_days=stale_days,
        expire_days=expire_days,
        stale_at=stale_at,
        expires_at=expires_at,
    )

    db.add(idea)
    db.commit()
    db.refresh(idea)

    # Initial evaluation: maybe it already triggers immediately
    try:
        cur_p = get_current_price(symbol, market)
    except Exception:
        cur_p = initial_price

    if cur_p is not None:
        if (idea.trigger_condition == "<=" and cur_p <= idea.trigger_price) or (
            idea.trigger_condition == ">=" and cur_p >= idea.trigger_price
        ):
            idea.status = "triggered"
            idea.triggered_at = now
            idea.triggered_price = cur_p
            db.commit()
            db.refresh(idea)

    return _serialize_idea(idea, cur_p)


@router.get("", response_model=TradeIdeaListResponse)
def list_trade_ideas(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Calculate counts for each status
    counts_query = (
        select(TradeIdea.status, func.count(TradeIdea.id))
        .where(TradeIdea.user_id == current_user.id)
        .group_by(TradeIdea.status)
    )
    raw_counts = dict(db.execute(counts_query).all())
    counts = TradeIdeaCountsResponse(
        all=sum(raw_counts.values()),
        watching=raw_counts.get("watching", 0),
        triggered=raw_counts.get("triggered", 0),
        stale=raw_counts.get("stale", 0),
        closed=raw_counts.get("closed", 0),
        converted=raw_counts.get("converted", 0),
    )

    stmt = select(TradeIdea).where(TradeIdea.user_id == current_user.id)
    if status and status.lower() != "all":
        stmt = stmt.where(TradeIdea.status == status.lower())

    if search:
        search_pattern = f"%{search.strip().upper()}%"
        stmt = stmt.where(
            or_(
                TradeIdea.symbol.ilike(search_pattern),
                TradeIdea.thesis_notes.ilike(f"%{search.strip()}%"),
            )
        )

    ideas = db.execute(stmt.order_by(TradeIdea.created_at.desc())).scalars().all()

    # Pre-fetch prices
    price_cache: dict[tuple[str, str], Optional[Decimal]] = {}
    for idea in ideas:
        if idea.status in ("watching", "triggered"):
            key = (idea.symbol.upper(), (idea.market or "Euronext").strip())
            if key not in price_cache:
                try:
                    price_cache[key] = get_current_price(idea.symbol, idea.market)
                except Exception:
                    price_cache[key] = None

    items: list[TradeIdeaResponse] = []
    for idea in ideas:
        key = (idea.symbol.upper(), (idea.market or "Euronext").strip())
        cp = price_cache.get(key)
        items.append(_serialize_idea(idea, cp))

    return TradeIdeaListResponse(items=items, counts=counts)


@router.get("/alerts", response_model=TradeIdeaAlertsResponse)
def get_trade_idea_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(TradeIdea)
        .where(
            TradeIdea.user_id == current_user.id,
            TradeIdea.status == "triggered",
        )
        .order_by(TradeIdea.triggered_at.desc().nulls_last())
        .limit(10)
    )
    ideas = db.execute(stmt).scalars().all()
    items = [_serialize_idea(i) for i in ideas]
    return TradeIdeaAlertsResponse(unread_count=len(items), items=items)


@router.post("/refresh-prices")
def refresh_trade_idea_prices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stats = evaluate_active_trade_ideas(db, user_id=current_user.id)
    return {"ok": True, "stats": stats}


@router.get("/{idea_id}", response_model=TradeIdeaResponse)
def get_trade_idea(
    idea_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)
    return _serialize_idea(idea)


@router.put("/{idea_id}", response_model=TradeIdeaResponse)
def update_trade_idea(
    idea_id: int,
    payload: TradeIdeaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)

    updates = payload.model_dump(exclude_unset=True)

    if "symbol" in updates and updates["symbol"]:
        idea.symbol = updates["symbol"].strip().upper()
    if "market" in updates and updates["market"]:
        idea.market = updates["market"].strip()
    if "direction" in updates and updates["direction"]:
        idea.direction = updates["direction"]
    if "trigger_price" in updates and updates["trigger_price"] is not None:
        idea.trigger_price = updates["trigger_price"]
    if "trigger_condition" in updates and updates["trigger_condition"]:
        idea.trigger_condition = updates["trigger_condition"]
    if "stop_loss" in updates:
        idea.stop_loss = updates["stop_loss"]
    if "target_price" in updates:
        idea.target_price = updates["target_price"]
    if "thesis_notes" in updates:
        idea.thesis_notes = updates["thesis_notes"].strip() if updates["thesis_notes"] else None
    if "tags" in updates and updates["tags"] is not None:
        idea.tags = updates["tags"]

    now = datetime.now(timezone.utc)
    if "stale_days" in updates and updates["stale_days"]:
        idea.stale_days = updates["stale_days"]
        idea.stale_at = now + timedelta(days=idea.stale_days)
    if "expire_days" in updates and updates["expire_days"]:
        idea.expire_days = updates["expire_days"]
        idea.expires_at = now + timedelta(days=idea.expire_days)

    db.commit()
    db.refresh(idea)
    return _serialize_idea(idea)


@router.post("/{idea_id}/renew", response_model=TradeIdeaResponse)
def renew_trade_idea(
    idea_id: int,
    request: Request,
    days: Optional[int] = Query(default=None, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)

    now = datetime.now(timezone.utc)
    renew_days = days or idea.stale_days
    idea.stale_days = renew_days
    idea.stale_at = now + timedelta(days=renew_days)
    idea.expires_at = now + timedelta(days=renew_days + max(3, idea.expire_days - idea.stale_days))
    idea.status = "watching"
    idea.closed_at = None

    db.commit()
    db.refresh(idea)
    return _serialize_idea(idea)


@router.post("/{idea_id}/close", response_model=TradeIdeaResponse)
def close_trade_idea(
    idea_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)

    idea.status = "closed"
    idea.closed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(idea)
    return _serialize_idea(idea)


@router.post("/{idea_id}/convert", response_model=TradeIdeaResponse)
def convert_trade_idea(
    idea_id: int,
    payload: TradeIdeaConvertRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)

    # Validate trade exists for user
    trade = db.execute(
        select(Trade).where(
            Trade.id == payload.trade_id,
            Trade.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not trade:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    idea.trade_id = trade.id
    idea.status = "converted"
    idea.closed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(idea)
    return _serialize_idea(idea)


@router.delete("/{idea_id}")
def delete_trade_idea(
    idea_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    idea = db.execute(
        select(TradeIdea).where(
            TradeIdea.id == idea_id,
            TradeIdea.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not idea:
        raise localized_error(status_code=404, code="errors.trade_idea_not_found", request=request)

    db.delete(idea)
    db.commit()
    return {"ok": True}
