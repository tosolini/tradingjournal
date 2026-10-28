from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error
from app.models import Broker, Exchange, User
from app.schemas import ExchangeCreate, ExchangeResponse, ExchangeUpdate, TickerImportResult

router = APIRouter(prefix="/api/exchanges", tags=["exchanges"])


@router.get("", response_model=list[ExchangeResponse])
def list_exchanges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.execute(select(Exchange).where(Exchange.user_id == current_user.id)).scalars().all()


@router.post("", response_model=ExchangeResponse)
def create_exchange(
    payload: ExchangeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise localized_error(status_code=400, code="errors.exchange_name_required", request=request)
    exchange = Exchange(
        user_id=current_user.id,
        name=name,
        mic=(payload.mic or "").strip().upper() or None,
        suffix=(payload.suffix or "").strip().upper() or None,
        country=(payload.country or "").strip().upper() or None,
        currency=(payload.currency or "EUR").strip().upper(),
        timezone=(payload.timezone or "").strip() or None,
        open_time=(payload.open_time or "").strip() or None,
        close_time=(payload.close_time or "").strip() or None,
    )
    db.add(exchange)
    db.commit()
    db.refresh(exchange)
    return exchange


@router.patch("/{exchange_id}", response_model=ExchangeResponse)
def update_exchange(
    exchange_id: int,
    payload: ExchangeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exchange = db.get(Exchange, exchange_id)
    if not exchange or exchange.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.exchange_not_found", request=request)

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = str(updates["name"] or "").strip()
        if not name:
            raise localized_error(status_code=400, code="errors.exchange_name_required", request=request)
        exchange.name = name
    for field in ("mic", "suffix", "country"):
        if field in updates:
            val = (updates[field] or "").strip().upper() or None
            setattr(exchange, field, val)
    if "currency" in updates and updates["currency"]:
        exchange.currency = updates["currency"].strip().upper()
    for field in ("timezone", "open_time", "close_time"):
        if field in updates:
            val = (updates[field] or "").strip() or None
            setattr(exchange, field, val)

    db.commit()
    db.refresh(exchange)
    return exchange


@router.delete("/{exchange_id}")
def delete_exchange(
    exchange_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exchange = db.get(Exchange, exchange_id)
    if not exchange or exchange.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.exchange_not_found", request=request)
    db.delete(exchange)
    db.commit()
    return {"deleted": True, "exchange_id": exchange_id}


@router.post("/{exchange_id}/sync-tickers", response_model=TickerImportResult)
def sync_exchange_tickers(
    exchange_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download and synchronize equity tickers from Euronext for this exchange."""
    exchange = db.get(Exchange, exchange_id)
    if not exchange or exchange.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.exchange_not_found", request=request)

    market_code = exchange.euronext_code
    if not market_code:
        raise localized_error(
            status_code=400,
            code="errors.exchange_not_euronext",
            request=request,
            default=f"Il mercato '{exchange.name}' non è un mercato azionario Euronext supportato.",
        )

    try:
        from app.services.euronext import sync_euronext_equities
        result = sync_euronext_equities(market_code=market_code, db=db)
        return TickerImportResult(**result)
    except Exception as exc:
        raise localized_error(
            status_code=502,
            code="errors.euronext_sync_failed",
            request=request,
            default=f"Errore durante la sincronizzazione con Euronext: {exc}",
        )


@router.post("/seed/directa", response_model=list[ExchangeResponse])
def seed_directa_exchanges(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import the Directa exchange list for the current user (skips if already present)."""
    from app.seeds.directa_exchanges import DIRECTA_EXCHANGES

    existing = db.execute(select(Exchange).where(Exchange.user_id == current_user.id)).scalars().all()
    existing_by_name = {e.name: e for e in existing}

    added = []
    for data in DIRECTA_EXCHANGES:
        cow = data.get("closed_on_weekends", True)
        if data["name"] in existing_by_name:
            # Always sync closed_on_weekends so re-seeding fixes stale values
            ex = existing_by_name[data["name"]]
            if ex.closed_on_weekends != cow:
                ex.closed_on_weekends = cow
            continue
        exchange = Exchange(
            user_id=current_user.id,
            name=data["name"],
            mic=data.get("mic"),
            suffix=data.get("suffix"),
            country=data.get("country"),
            currency=data.get("currency", "EUR"),
            timezone=data.get("timezone"),
            open_time=data.get("open_time"),
            close_time=data.get("close_time"),
            closed_on_weekends=cow,
        )
        db.add(exchange)
        added.append(exchange)

    db.commit()
    for ex in added:
        db.refresh(ex)

    return db.execute(select(Exchange).where(Exchange.user_id == current_user.id)).scalars().all()


# --- Broker <-> Exchange link endpoints ---
broker_router = APIRouter(prefix="/api/brokers", tags=["brokers"])


@broker_router.post("/{broker_id}/exchanges/{exchange_id}", response_model=list[ExchangeResponse])
def link_exchange_to_broker(
    broker_id: int,
    exchange_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    broker = db.execute(
        select(Broker).options(selectinload(Broker.exchanges)).where(Broker.id == broker_id)
    ).scalar_one_or_none()
    if not broker or broker.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.broker_not_found", request=request)

    exchange = db.get(Exchange, exchange_id)
    if not exchange or exchange.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.exchange_not_found", request=request)

    if exchange not in broker.exchanges:
        broker.exchanges.append(exchange)
        db.commit()

    db.refresh(broker)
    return broker.exchanges


@broker_router.delete("/{broker_id}/exchanges/{exchange_id}")
def unlink_exchange_from_broker(
    broker_id: int,
    exchange_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    broker = db.execute(
        select(Broker).options(selectinload(Broker.exchanges)).where(Broker.id == broker_id)
    ).scalar_one_or_none()
    if not broker or broker.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.broker_not_found", request=request)

    exchange = db.get(Exchange, exchange_id)
    if not exchange or exchange.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.exchange_not_found", request=request)

    if exchange in broker.exchanges:
        broker.exchanges.remove(exchange)
        db.commit()

    return {"unlinked": True}
