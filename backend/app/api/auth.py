from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_session_user
from app.i18n import localized_error
from app.models import User
from app.schemas import (
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserPreferencesResponse,
    UserPreferencesUpdate,
    UserResponse,
    UserUpdate,
)
from app.security import create_access_token, hash_password, verify_password
from app.services.password_policy import is_registration_open, validate_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _merge_preferences(current: dict, updates: dict) -> dict:
    merged = dict(current)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_preferences(merged[key], value)
        else:
            merged[key] = value
    return merged


@router.post("/register", response_model=UserResponse)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    if not is_registration_open(db):
        raise localized_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="errors.registration_closed",
            request=request,
        )
    validate_password(payload.password, db, request=request)
    existing = db.execute(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    ).scalar_one_or_none()
    if existing:
        raise localized_error(status_code=400, code="errors.user_already_exists")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role="user",
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(
            or_(
                User.email == payload.username_or_email,
                User.username == payload.username_or_email,
            )
        )
    ).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise localized_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="errors.invalid_credentials",
            request=request,
        )
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.username),
        must_change_password=user.must_change_password,
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_session_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_session_user),
):
    if payload.new_password:
        if not payload.current_password:
            raise localized_error(status_code=400, code="errors.current_password_required")
        if not verify_password(payload.current_password, current_user.hashed_password):
            raise localized_error(status_code=400, code="errors.invalid_credentials", request=request)
        validate_password(payload.new_password, db, request=request)
        current_user.hashed_password = hash_password(payload.new_password)
        current_user.password_changed_at = datetime.now(timezone.utc)
        current_user.must_change_password = False

    if payload.email and payload.email != current_user.email:
        conflict = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
        if conflict:
            raise localized_error(status_code=400, code="errors.user_already_exists")
        current_user.email = payload.email

    if payload.username and payload.username != current_user.username:
        conflict = db.execute(select(User).where(User.username == payload.username)).scalar_one_or_none()
        if conflict:
            raise localized_error(status_code=400, code="errors.user_already_exists")
        current_user.username = payload.username

    if payload.timezone is not None:
        current_user.timezone = payload.timezone or None

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/preferences", response_model=UserPreferencesResponse)
def get_preferences(current_user: User = Depends(get_current_user)):
    preferences = current_user.preferences or {}
    return UserPreferencesResponse(preferences=preferences)


@router.patch("/preferences", response_model=UserPreferencesResponse)
def update_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = current_user.preferences or {}
    current_user.preferences = _merge_preferences(existing, payload.preferences)
    db.commit()
    db.refresh(current_user)
    return UserPreferencesResponse(preferences=current_user.preferences or {})
