from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error
from app.models import Broker, User
from app.schemas import BrokerCreate, BrokerResponse, BrokerUpdate

router = APIRouter(prefix="/api/brokers", tags=["brokers"])


VALID_FEE_MODES = {"fixed", "percent", "percent_min_max", "tiered_volume", "under_30"}
VALID_BROKER_PROFILES = {
    "custom",
    "directa_semplice",
    "directa_variabile",
    "fineco_trading",
    "fineco_trading_under30",
    "fineco_one",
    "fineco_classic",
    "fineco_max",
}


def _normalize_fee_mode(mode: str | None, request: Request | None = None) -> str:
    value = str(mode or "fixed").strip().lower()
    if value not in VALID_FEE_MODES:
        raise localized_error(status_code=400, code="errors.fee_mode_invalid", request=request)
    return value


def _normalize_broker_profile(profile: str | None) -> str:
    value = str(profile or "custom").strip().lower()
    return value if value in VALID_BROKER_PROFILES else "custom"


def _normalize_currency(value: str | None, request: Request | None = None) -> str:
    currency = str(value or "EUR").strip().upper()
    if not currency:
        raise localized_error(status_code=400, code="errors.fee_currency_required", request=request)
    if len(currency) > 8:
        raise localized_error(status_code=400, code="errors.fee_currency_too_long", request=request)
    return currency


def _normalize_capital_gain_mode(mode: str | None, request: Request | None = None) -> str:
    value = str(mode or "immediate").strip().lower()
    if value not in {"immediate", "year_end"}:
        raise localized_error(status_code=400, code="errors.capital_gain_mode_invalid", request=request)
    return value


@router.post("", response_model=BrokerResponse)
def create_broker(
    payload: BrokerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise localized_error(status_code=400, code="errors.broker_name_required", request=request)

    broker_profile = _normalize_broker_profile(payload.broker_profile)
    fee_mode = _normalize_fee_mode(payload.fee_mode, request=request)
    fee_value = payload.fee_value
    fee_min = payload.fee_min
    fee_max = payload.fee_max
    fee_us_value = payload.fee_us_value
    fee_currency = _normalize_currency(payload.fee_currency, request=request)
    monthly_fee = payload.monthly_fee
    fee_tier_override = payload.fee_tier_override
    capital_gain_mode = _normalize_capital_gain_mode(payload.capital_gain_mode, request=request)
    capital_gain_rate = payload.capital_gain_rate
    capital_gain_rate_gov = payload.capital_gain_rate_gov

    if fee_value < 0 or (fee_min is not None and fee_min < 0) or (fee_max is not None and fee_max < 0) or (fee_us_value is not None and fee_us_value < 0):
        raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
    if monthly_fee < 0:
        raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
    if fee_tier_override is not None and fee_tier_override not in {1, 2, 3, 4}:
        raise localized_error(status_code=400, code="errors.fee_tier_invalid", request=request)
    if capital_gain_rate < 0 or capital_gain_rate_gov < 0:
        raise localized_error(status_code=400, code="errors.capital_gain_rate_negative", request=request)

    broker = Broker(
        user_id=current_user.id,
        name=name,
        broker_profile=broker_profile,
        fee_mode=fee_mode,
        fee_value=fee_value,
        fee_min=fee_min,
        fee_max=fee_max,
        fee_us_value=fee_us_value,
        fee_currency=fee_currency,
        monthly_fee=monthly_fee,
        fee_tier_override=fee_tier_override,
        capital_gain_mode=capital_gain_mode,
        capital_gain_rate=capital_gain_rate,
        capital_gain_rate_gov=capital_gain_rate_gov,
    )

    db.add(broker)
    db.commit()
    db.refresh(broker)
    broker = db.execute(select(Broker).options(selectinload(Broker.exchanges)).where(Broker.id == broker.id)).scalar_one()
    return broker


@router.get("", response_model=list[BrokerResponse])
def list_brokers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.execute(
        select(Broker).options(selectinload(Broker.exchanges)).where(Broker.user_id == current_user.id)
    ).scalars().all()


@router.patch("/{broker_id}", response_model=BrokerResponse)
def update_broker(
    broker_id: int,
    payload: BrokerUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    broker = db.get(Broker, broker_id)
    if not broker or broker.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.broker_not_found", request=request)

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = str(updates["name"] or "").strip()
        if not name:
            raise localized_error(status_code=400, code="errors.broker_name_required", request=request)
        broker.name = name
    if "broker_profile" in updates and updates["broker_profile"] is not None:
        broker.broker_profile = _normalize_broker_profile(updates["broker_profile"])
    if "fee_mode" in updates and updates["fee_mode"] is not None:
        broker.fee_mode = _normalize_fee_mode(updates["fee_mode"], request=request)
    if "fee_value" in updates and updates["fee_value"] is not None:
        fee_value = updates["fee_value"]
        if fee_value < 0:
            raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
        broker.fee_value = fee_value
    if "fee_min" in updates:
        fee_min = updates["fee_min"]
        if fee_min is not None and fee_min < 0:
            raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
        broker.fee_min = fee_min
    if "fee_max" in updates:
        fee_max = updates["fee_max"]
        if fee_max is not None and fee_max < 0:
            raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
        broker.fee_max = fee_max
    if "fee_us_value" in updates:
        fee_us_value = updates["fee_us_value"]
        if fee_us_value is not None and fee_us_value < 0:
            raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
        broker.fee_us_value = fee_us_value
    if "monthly_fee" in updates and updates["monthly_fee"] is not None:
        monthly_fee = updates["monthly_fee"]
        if monthly_fee < 0:
            raise localized_error(status_code=400, code="errors.fee_value_negative", request=request)
        broker.monthly_fee = monthly_fee
    if "fee_tier_override" in updates:
        tier = updates["fee_tier_override"]
        if tier is not None and tier not in {1, 2, 3, 4}:
            raise localized_error(status_code=400, code="errors.fee_tier_invalid", request=request)
        broker.fee_tier_override = tier
    if "fee_currency" in updates and updates["fee_currency"] is not None:
        broker.fee_currency = _normalize_currency(updates["fee_currency"], request=request)
    if "capital_gain_mode" in updates and updates["capital_gain_mode"] is not None:
        broker.capital_gain_mode = _normalize_capital_gain_mode(updates["capital_gain_mode"], request=request)
    if "capital_gain_rate" in updates and updates["capital_gain_rate"] is not None:
        capital_gain_rate = updates["capital_gain_rate"]
        if capital_gain_rate < 0:
            raise localized_error(status_code=400, code="errors.capital_gain_rate_negative", request=request)
        broker.capital_gain_rate = capital_gain_rate
    if "capital_gain_rate_gov" in updates and updates["capital_gain_rate_gov"] is not None:
        capital_gain_rate_gov = updates["capital_gain_rate_gov"]
        if capital_gain_rate_gov < 0:
            raise localized_error(status_code=400, code="errors.capital_gain_rate_negative", request=request)
        broker.capital_gain_rate_gov = capital_gain_rate_gov

    db.commit()
    db.refresh(broker)
    broker = db.execute(select(Broker).options(selectinload(Broker.exchanges)).where(Broker.id == broker.id)).scalar_one()
    return broker


@router.delete("/{broker_id}")
def delete_broker(
    broker_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    broker = db.get(Broker, broker_id)
    if not broker or broker.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.broker_not_found", request=request)

    if broker.accounts:
        raise localized_error(
            status_code=400,
            code="errors.broker_has_accounts",
            request=request,
        )

    db.delete(broker)
    db.commit()
    return {"deleted": True, "broker_id": broker_id}
