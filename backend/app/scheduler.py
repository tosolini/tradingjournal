from datetime import datetime, timedelta, timezone
import threading
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.services.holding_exits import auto_record_matured_holdings
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
            preferences = user.preferences or {}
            portfolio_prefs = (
                preferences.get("portfolio", {})
                if isinstance(preferences, dict)
                else {}
            )
            if (
                isinstance(portfolio_prefs, dict)
                and portfolio_prefs.get("auto_record_maturity") is True
            ):
                recorded = auto_record_matured_holdings(db, user.id)
                if recorded:
                    recompute_portfolio_snapshot(db, today, user.id)



def run_trade_ideas_evaluator_job() -> None:
    try:
        from app.services.trade_ideas import evaluate_active_trade_ideas
        with SessionLocal() as db:
            evaluate_active_trade_ideas(db)
    except Exception:
        pass


def run_scheduled_portfolio_coaching_job() -> None:
    """Periodic watchdog that analyzes active holdings for users with scheduled coaching enabled."""
    try:
        from app.models import AnalysisReport, Holding
        from app.api.analysis import _execute_analysis_background

        with SessionLocal() as db:
            users = db.execute(select(User)).scalars().all()
            for user in users:
                prefs = user.preferences or {}
                analysis_prefs = prefs.get("analysis", {}) if isinstance(prefs, dict) else {}
                if not analysis_prefs.get("scheduled_enabled", False):
                    continue

                # Check active holdings
                holdings = db.execute(
                    select(Holding).where(
                        Holding.user_id == user.id,
                        Holding.closed_at.is_(None),
                    )
                ).scalars().all()

                recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=20)

                for h in holdings:
                    asset = h.asset
                    if not asset:
                        continue

                    # Avoid redundant analyses if a report was completed or started recently
                    recent_exists = db.execute(
                        select(AnalysisReport.id).where(
                            AnalysisReport.user_id == user.id,
                            AnalysisReport.symbol == asset.symbol,
                            AnalysisReport.created_at >= recent_cutoff,
                            AnalysisReport.status.in_(["pending", "running", "completed"]),
                        )
                    ).scalar_one_or_none()
                    if recent_exists:
                        continue

                    report = AnalysisReport(
                        user_id=user.id,
                        symbol=asset.symbol,
                        market=asset.exchange or "Euronext",
                        holding_id=h.id,
                        language=analysis_prefs.get("language", "it"),
                        trigger_mode="scheduled",
                        status="pending",
                    )
                    db.add(report)
                    db.commit()
                    db.refresh(report)
                    threading.Thread(
                        target=_execute_analysis_background,
                        args=(report.id,),
                        daemon=True,
                    ).start()
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
    scheduler.add_job(
        run_scheduled_portfolio_coaching_job,
        trigger="interval",
        hours=24,
        id="scheduled_portfolio_coaching",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
