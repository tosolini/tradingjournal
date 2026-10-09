from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_admin_user
from app.i18n import localized_error
from app.models import Account, Asset, Broker, Exchange, Holding, User
from app.schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    AppSettingsResponse,
    AppSettingsUpdate,
    PasswordPolicy,
    UserResponse,
)
from app.security import hash_password
from app.services.password_policy import (
    get_policy,
    is_registration_open,
    set_policy,
    set_registration_open,
    validate_password,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    return db.execute(select(User).order_by(User.id)).scalars().all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
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
        role=payload.role if payload.role in ("admin", "user") else "user",
        must_change_password=payload.must_change_password,
        password_changed_at=None,
        created_by_id=admin.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    target = db.get(User, user_id)
    if not target:
        raise localized_error(status_code=404, code="errors.not_found")

    if payload.email and payload.email != target.email:
        conflict = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
        if conflict:
            raise localized_error(status_code=400, code="errors.user_already_exists")
        target.email = payload.email

    if payload.username and payload.username != target.username:
        conflict = db.execute(select(User).where(User.username == payload.username)).scalar_one_or_none()
        if conflict:
            raise localized_error(status_code=400, code="errors.user_already_exists")
        target.username = payload.username

    if payload.new_password:
        validate_password(payload.new_password, db, request=request)
        target.hashed_password = hash_password(payload.new_password)
        target.password_changed_at = datetime.now(timezone.utc)
        # An admin-issued password must be rotated by the user on next login,
        # unless the admin explicitly opted out.
        target.must_change_password = (
            payload.must_change_password
            if payload.must_change_password is not None
            else True
        )
    elif payload.must_change_password is not None:
        target.must_change_password = payload.must_change_password

    if payload.is_active is not None:
        if target.id == admin.id and not payload.is_active:
            raise localized_error(status_code=400, code="errors.cannot_deactivate_self")
        target.is_active = payload.is_active

    if payload.role and payload.role in ("admin", "user"):
        # prevent admin from removing their own admin role
        if target.id != admin.id:
            target.role = payload.role

    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if user_id == admin.id:
        raise localized_error(status_code=400, code="errors.cannot_delete_self")

    target = db.get(User, user_id)
    if not target:
        raise localized_error(status_code=404, code="errors.not_found")

    if _owns_data(db, user_id):
        raise localized_error(status_code=400, code="errors.user_has_data")

    db.delete(target)
    db.commit()


@router.get("/settings", response_model=AppSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    return AppSettingsResponse(
        registration_open=is_registration_open(db),
        password_policy=PasswordPolicy(**get_policy(db)),
    )


@router.patch("/settings", response_model=AppSettingsResponse)
def update_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    if payload.registration_open is not None:
        set_registration_open(db, payload.registration_open)
    if payload.password_policy is not None:
        set_policy(db, payload.password_policy.model_dump())
    return AppSettingsResponse(
        registration_open=is_registration_open(db),
        password_policy=PasswordPolicy(**get_policy(db)),
    )


def _owns_data(db: Session, user_id: int) -> bool:
    """True when the user owns any business data (disable instead of delete)."""
    for model in (Account, Broker, Asset, Holding, Exchange):
        count = db.execute(
            select(func.count()).select_from(model).where(model.user_id == user_id)
        ).scalar()
        if count:
            return True
    return False
