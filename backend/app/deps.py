from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.i18n import localized_error
from app.models import User
from app.security import ALGORITHM


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _resolve_user(
    token: str, db: Session, enforce_password_current: bool
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        if subject is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.execute(
        select(User).where(or_(User.username == subject, User.email == subject))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exception
    if enforce_password_current and user.must_change_password:
        raise localized_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="errors.password_change_required",
        )
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Authenticated, active user with onboarding (password change) completed."""
    return _resolve_user(token, db, enforce_password_current=True)


def get_session_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    """Authenticated, active user allowed to complete onboarding (/me only)."""
    return _resolve_user(token, db, enforce_password_current=False)


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user
