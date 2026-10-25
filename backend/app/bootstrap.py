import logging

from sqlalchemy import func, select

from app.config import settings
from app.database import SessionLocal
from app.models import Exchange, User
from app.security import hash_password

logger = logging.getLogger(__name__)


def ensure_seed_admin() -> None:
    """One-time bootstrap: create the initial admin only on an empty users table.

    All later user accounting lives in the database (admin UI / API).
    Changing SEED_* in .env afterwards has no effect by design; the seeded
    admin must rotate the bootstrap password at first login.
    """
    if not settings.seed_admin_enabled:
        return

    with SessionLocal() as db:
        user_count = db.execute(select(func.count()).select_from(User)).scalar() or 0
        if user_count > 0:
            return

        user = User(
            email=settings.seed_admin_email,
            username=settings.seed_admin_username,
            hashed_password=hash_password(settings.seed_admin_password),
            role="admin",
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        logger.warning(
            "Bootstrapped initial admin '%s' from SEED_* settings. "
            "A password change is enforced at first login; later SEED_* "
            "changes are ignored, manage users via the admin API.",
            user.username,
        )


def ensure_seed_exchanges(user_id: int) -> None:
    """Seed Directa exchanges for the given user if they have none."""
    from app.seeds.directa_exchanges import DIRECTA_EXCHANGES

    with SessionLocal() as db:
        existing_count = db.execute(
            select(Exchange).where(Exchange.user_id == user_id)
        ).scalars().first()
        if existing_count is not None:
            return

        for data in DIRECTA_EXCHANGES:
            exchange = Exchange(
                user_id=user_id,
                name=data["name"],
                mic=data.get("mic"),
                suffix=data.get("suffix"),
                country=data.get("country"),
                currency=data.get("currency", "EUR"),
                timezone=data.get("timezone"),
                open_time=data.get("open_time"),
                close_time=data.get("close_time"),
                closed_on_weekends=data.get("closed_on_weekends", True),
            )
            db.add(exchange)
        db.commit()
