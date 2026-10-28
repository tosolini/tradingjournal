from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TradeIdea
from app.services.price_provider import get_current_price


def compute_distance_pct(current_price: Optional[Decimal], trigger_price: Decimal) -> Optional[Decimal]:
    """Calculate the percentage distance from current price to trigger price.

    Positive means current price is above trigger price.
    Negative means current price is below trigger price.
    """
    if current_price is None or trigger_price is None or trigger_price == Decimal("0"):
        return None
    delta = ((current_price - trigger_price) / trigger_price) * Decimal("100")
    return delta.quantize(Decimal("0.01"))


def evaluate_single_idea(
    idea: TradeIdea,
    current_price: Optional[Decimal],
    now: Optional[datetime] = None,
) -> bool:
    """Evaluate an idea against current market price and expiration timestamps.

    Returns True if the state changed.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Ensure tz-aware comparison
    if idea.expires_at.tzinfo is None:
        idea_expires_at = idea.expires_at.replace(tzinfo=timezone.utc)
    else:
        idea_expires_at = idea.expires_at

    if idea.stale_at.tzinfo is None:
        idea_stale_at = idea.stale_at.replace(tzinfo=timezone.utc)
    else:
        idea_stale_at = idea.stale_at

    state_changed = False

    # 1. Check expiration (auto-close after expire_days)
    if now >= idea_expires_at and idea.status in ("watching", "stale"):
        idea.status = "closed"
        idea.closed_at = now
        return True

    # 2. Check price trigger if currently watching
    if idea.status == "watching" and current_price is not None:
        condition_met = False
        if idea.trigger_condition == "<=" and current_price <= idea.trigger_price:
            condition_met = True
        elif idea.trigger_condition == ">=" and current_price >= idea.trigger_price:
            condition_met = True

        if condition_met:
            idea.status = "triggered"
            idea.triggered_at = now
            idea.triggered_price = current_price
            return True

    # 3. Check stale status (after stale_days without trigger)
    if idea.status == "watching" and now >= idea_stale_at:
        idea.status = "stale"
        return True

    return state_changed


def evaluate_active_trade_ideas(
    db: Session,
    user_id: Optional[int] = None,
    now: Optional[datetime] = None,
) -> dict[str, int]:
    """Evaluates active ideas against live prices and timestamps."""
    if now is None:
        now = datetime.now(timezone.utc)

    stmt = select(TradeIdea).where(TradeIdea.status.in_(["watching", "stale"]))
    if user_id is not None:
        stmt = stmt.where(TradeIdea.user_id == user_id)

    ideas = db.execute(stmt).scalars().all()

    # Pre-fetch prices for unique (symbol, market) pairs
    price_cache: dict[tuple[str, str], Optional[Decimal]] = {}
    for idea in ideas:
        key = (idea.symbol.upper(), (idea.market or "Euronext").strip())
        if key not in price_cache:
            try:
                price_cache[key] = get_current_price(idea.symbol, idea.market)
            except Exception:
                price_cache[key] = None

    stats = {
        "evaluated": len(ideas),
        "triggered": 0,
        "stale": 0,
        "closed": 0,
        "unchanged": 0,
    }

    changed = False
    for idea in ideas:
        prev_status = idea.status
        key = (idea.symbol.upper(), (idea.market or "Euronext").strip())
        current_price = price_cache.get(key)

        was_changed = evaluate_single_idea(idea, current_price, now)
        if was_changed:
            changed = True
            if idea.status == "triggered":
                stats["triggered"] += 1
            elif idea.status == "stale":
                stats["stale"] += 1
            elif idea.status == "closed":
                stats["closed"] += 1
        else:
            stats["unchanged"] += 1

    if changed:
        db.commit()

    return stats
