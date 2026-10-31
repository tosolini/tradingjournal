from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Account, PortfolioSnapshot, PositionDailySnapshot, User
from app.schemas import DailyPnlPoint, PortfolioSnapshotResponse, SnapshotResponse
from app.services.portfolio import get_daily_pnl_series, recompute_portfolio_snapshot
from app.services.snapshot import recompute_daily_snapshots

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


@router.post("/recompute")
def recompute_snapshots(
    snapshot_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = recompute_daily_snapshots(db, snapshot_date, user_id=current_user.id)
    return {"upserts": count, "snapshot_date": snapshot_date.isoformat()}


@router.get("", response_model=list[SnapshotResponse])
def list_snapshots(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return db.execute(
        select(PositionDailySnapshot)
        .join(Account, Account.id == PositionDailySnapshot.account_id)
        .where(Account.user_id == current_user.id)
        .order_by(PositionDailySnapshot.snapshot_date.desc())
    ).scalars().all()


@router.post("/portfolio/recompute")
def recompute_portfolio_snapshots(
    snapshot_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = recompute_portfolio_snapshot(db, snapshot_date, current_user.id)
    return {"upserts": count, "snapshot_date": snapshot_date.isoformat()}


@router.get("/portfolio", response_model=list[PortfolioSnapshotResponse])
def list_portfolio_snapshots(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return db.execute(
        select(PortfolioSnapshot)
        .join(Account, Account.id == PortfolioSnapshot.account_id)
        .where(Account.user_id == current_user.id)
        .order_by(PortfolioSnapshot.snapshot_date.desc())
    ).scalars().all()


@router.get("/daily/pnl", response_model=list[DailyPnlPoint])
def list_daily_pnl(
    account_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Day-by-day portfolio P&L series built from daily snapshots."""
    return get_daily_pnl_series(db, current_user.id, account_id)
