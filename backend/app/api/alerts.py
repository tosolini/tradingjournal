from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import (
    AlertAcknowledgeAllRequest,
    AlertAcknowledgeRequest,
    AlertAcknowledgeResponse,
    UnifiedAlertsResponse,
)
from app.services.alerts import (
    acknowledge_alert,
    acknowledge_all_alerts,
    get_unified_alerts,
    unacknowledge_alert,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=UnifiedAlertsResponse)
def list_alerts(
    target_date: Optional[date] = Query(default=None),
    include_acknowledged: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve consolidated alerts: open trades TP/SL, today coupons, bond maturities, and scouting."""
    return get_unified_alerts(
        db=db,
        user=current_user,
        target_date=target_date,
        include_acknowledged=include_acknowledged,
    )


@router.post("/acknowledge", response_model=AlertAcknowledgeResponse)
def mark_alert_as_acknowledged(
    payload: AlertAcknowledgeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Acknowledge a single alert by its alert_key."""
    acknowledge_alert(db=db, user=current_user, alert_key=payload.alert_key)
    return AlertAcknowledgeResponse(success=True, acknowledged_keys=[payload.alert_key])


@router.post("/acknowledge-all", response_model=AlertAcknowledgeResponse)
def mark_all_alerts_as_acknowledged(
    payload: Optional[AlertAcknowledgeAllRequest] = None,
    target_date: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Acknowledge multiple or all currently active alerts."""
    keys = payload.alert_keys if payload else None
    acknowledged = acknowledge_all_alerts(
        db=db,
        user=current_user,
        alert_keys=keys,
        target_date=target_date,
    )
    return AlertAcknowledgeResponse(success=True, acknowledged_keys=acknowledged)


@router.delete("/acknowledge/{alert_key}", response_model=AlertAcknowledgeResponse)
def unmark_alert_as_acknowledged(
    alert_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo acknowledgment of a specific alert_key."""
    unacknowledge_alert(db=db, user=current_user, alert_key=alert_key)
    return AlertAcknowledgeResponse(success=True, acknowledged_keys=[alert_key])
