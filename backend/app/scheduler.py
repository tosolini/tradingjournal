from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.services.portfolio import recompute_portfolio_snapshot
from app.services.snapshot import recompute_daily_snapshots

scheduler = BackgroundScheduler(timezone=settings.app_timezone)

# One snapshot run per calendar day, regardless of how the run time changes.
_last_snapshot_date = None


def _configured_snapshot_time() -> str:
    """Snapshot time from the first user's preferences, falling back to env default."""
    try:
        with SessionLocal() as db:
            user = db.execute(select(User).order_by(User.id)).scalars().first()
            if user and user.preferences:
                pref = user.preferences.get("snapshot_time")
                if isinstance(pref, str) and pref.strip():
                    return pref.strip()
    except Exception:
        pass
    return settings.snapshot_time


def run_daily_snapshot_job() -> None:
    global _last_snapshot_date
    now = datetime.now(ZoneInfo(settings.app_timezone))
    today = now.date()
    if _last_snapshot_date == today:
        return

    configured = _configured_snapshot_time()
    try:
        hour, minute = (int(part) for part in configured.split(":"))
    except (ValueError, AttributeError):
        hour, minute = 23, 55

    if (now.hour, now.minute) < (hour, minute):
        return

    _last_snapshot_date = today

    with SessionLocal() as db:
        recompute_daily_snapshots(db, today)
        for user in db.execute(select(User)).scalars().all():
            recompute_portfolio_snapshot(db, today, user.id)



def run_trade_ideas_evaluator_job() -> None:
    try:
        from app.services.trade_ideas import evaluate_active_trade_ideas
        with SessionLocal() as db:
            evaluate_active_trade_ideas(db)
    except Exception:
        pass

def start_scheduler() -> None:
    scheduler.add_job(
        run_daily_snapshot_job,
        trigger="interval",
        minutes=1,
        id="daily_mtm_snapshots",
        replace_existing=True,
    )
    scheduler.add_job(
        run_trade_ideas_evaluator_job,
        trigger="interval",
        minutes=15,
        id="trade_ideas_evaluator",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
