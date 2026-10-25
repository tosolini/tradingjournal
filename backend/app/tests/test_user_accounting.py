from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

import app.bootstrap as bootstrap
from app.api.admin import create_user, delete_user, get_settings, update_settings, update_user
from app.api.auth import login, register, update_me
from app.deps import get_current_user, get_session_user
from app.models import Exchange, User
from app.schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    AppSettingsUpdate,
    LoginRequest,
    PasswordPolicy,
    UserCreate,
    UserUpdate,
)
from app.security import create_access_token, hash_password
from app.services.password_policy import (
    get_policy,
    is_registration_open,
    set_policy,
    set_registration_open,
)
from app.tests.conftest import TestingSession

STRONG = "Victorious-Strong-Pass-1"


def req():
    return SimpleNamespace(headers={})


def code_of(exc_info):
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    return detail.get("code")


def make_user(db, username="alice", password=STRONG, role="user", **kwargs):
    user = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password=hash_password(password),
        role=role,
        **kwargs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# --- seed-if-empty ---------------------------------------------------------


def test_seed_creates_admin_on_empty_db(db, monkeypatch):
    monkeypatch.setattr(bootstrap, "SessionLocal", TestingSession)
    bootstrap.ensure_seed_admin()
    count = db.execute(select(func.count()).select_from(User)).scalar()
    assert count == 1
    admin = db.execute(select(User)).scalar_one()
    assert admin.role == "admin"
    assert admin.must_change_password is True
    assert admin.is_active is True


def test_seed_noop_when_users_exist(db, monkeypatch):
    existing = make_user(db, username="owner", password="Original-Pass-123")
    original_hash = existing.hashed_password
    monkeypatch.setattr(bootstrap, "SessionLocal", TestingSession)
    bootstrap.ensure_seed_admin()
    count = db.execute(select(func.count()).select_from(User)).scalar()
    assert count == 1
    db.refresh(existing)
    assert existing.hashed_password == original_hash


def test_seed_disabled_is_noop(db, monkeypatch):
    monkeypatch.setattr(bootstrap.settings, "seed_admin_enabled", False)
    bootstrap.ensure_seed_admin()
    count = db.execute(select(func.count()).select_from(User)).scalar()
    assert count == 0


# --- registration gate + policy --------------------------------------------


def test_register_closed_by_default(db):
    assert is_registration_open(db) is False
    with pytest.raises(HTTPException) as exc_info:
        register(
            UserCreate(email="n@n.co", username="newbie", password="Long-Enough-Pass-1"),
            req(),
            db,
        )
    assert exc_info.value.status_code == 403
    assert code_of(exc_info) == "errors.registration_closed"


def test_register_open_allows_signup(db):
    set_registration_open(db, True)
    user = register(
        UserCreate(email="n@n.co", username="newbie", password="Long-Enough-Pass-1"),
        req(),
        db,
    )
    assert user.username == "newbie"
    assert user.is_active is True
    assert user.must_change_password is False


def test_register_weak_password_rejected(db):
    set_registration_open(db, True)
    with pytest.raises(HTTPException) as exc_info:
        register(
            UserCreate(email="n@n.co", username="newbie", password="short12345"),
            req(),
            db,
        )
    assert exc_info.value.status_code == 400
    assert code_of(exc_info) == "errors.weak_password"


def test_policy_update_is_enforced(db):
    set_registration_open(db, True)
    set_policy(db, {"min_length": 20})
    assert get_policy(db)["min_length"] == 20
    with pytest.raises(HTTPException) as exc_info:
        register(
            UserCreate(email="n@n.co", username="newbie", password="Long-Enough-Pass-1"),
            req(),
            db,
        )
    assert code_of(exc_info) == "errors.weak_password"


# --- login accounting -------------------------------------------------------


def test_login_inactive_user_rejected(db):
    make_user(db, is_active=False)
    with pytest.raises(HTTPException) as exc_info:
        login(LoginRequest(username_or_email="alice", password=STRONG), req(), db)
    assert exc_info.value.status_code == 401
    assert code_of(exc_info) == "errors.invalid_credentials"


def test_login_sets_last_login_and_flag(db):
    make_user(db, must_change_password=True)
    token = login(LoginRequest(username_or_email="alice", password=STRONG), req(), db)
    assert token.must_change_password is True
    user = db.execute(select(User).where(User.username == "alice")).scalar_one()
    assert user.last_login_at is not None


# --- onboarding enforcement -------------------------------------------------


def test_current_user_blocks_pending_onboarding(db):
    make_user(db, must_change_password=True)
    token = create_access_token("alice")
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token, db)
    assert exc_info.value.status_code == 403
    assert code_of(exc_info) == "errors.password_change_required"
    assert get_session_user(token, db).username == "alice"


def test_current_user_blocks_inactive(db):
    user = make_user(db)
    token = create_access_token("alice")
    user.is_active = False
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token, db)
    assert exc_info.value.status_code == 401


def test_update_me_clears_flag(db):
    user = make_user(db, must_change_password=True)
    update_me(
        UserUpdate(current_password=STRONG, new_password="Brand-New-Pass-99"),
        req(),
        db,
        user,
    )
    assert user.must_change_password is False
    assert user.password_changed_at is not None
    token = login(
        LoginRequest(username_or_email="alice", password="Brand-New-Pass-99"), req(), db
    )
    assert token.must_change_password is False


def test_update_me_weak_password_rejected(db):
    user = make_user(db)
    with pytest.raises(HTTPException) as exc_info:
        update_me(
            UserUpdate(current_password=STRONG, new_password="short12345"),
            req(),
            db,
            user,
        )
    assert code_of(exc_info) == "errors.weak_password"


# --- admin accounting -------------------------------------------------------


def test_admin_create_tracks_creator_and_flag(db):
    admin = make_user(db, username="root", role="admin")
    created = create_user(
        AdminUserCreate(email="b@b.co", username="bob", password="Bob-Strong-Pass-1"),
        req(),
        db,
        admin,
    )
    assert created.must_change_password is True
    assert created.created_by_id == admin.id


def test_admin_reset_forces_change_unless_opted_out(db):
    admin = make_user(db, username="root", role="admin")
    target = make_user(db, username="carol", must_change_password=False)
    update_user(
        target.id,
        AdminUserUpdate(new_password="Carol-Reset-Pass-1"),
        req(),
        db,
        admin,
    )
    assert target.must_change_password is True
    update_user(
        target.id,
        AdminUserUpdate(new_password="Carol-Second-Pass-2", must_change_password=False),
        req(),
        db,
        admin,
    )
    assert target.must_change_password is False


def test_admin_cannot_deactivate_self(db):
    admin = make_user(db, username="root", role="admin")
    with pytest.raises(HTTPException) as exc_info:
        update_user(admin.id, AdminUserUpdate(is_active=False), req(), db, admin)
    assert code_of(exc_info) == "errors.cannot_deactivate_self"


def test_delete_user_with_data_refused(db):
    admin = make_user(db, username="root", role="admin")
    owner = make_user(db, username="dave")
    db.add(Exchange(user_id=owner.id, name="Owned Exchange"))
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        delete_user(owner.id, db, admin)
    assert code_of(exc_info) == "errors.user_has_data"
    assert delete_user(make_user(db, username="erin").id, db, admin) is None


def test_settings_get_and_patch(db):
    admin = make_user(db, username="root", role="admin")
    current = get_settings(db, admin)
    assert current.registration_open is False
    assert current.password_policy.min_length == 12
    updated = update_settings(
        AppSettingsUpdate(
            registration_open=True, password_policy=PasswordPolicy(min_length=16)
        ),
        db,
        admin,
    )
    assert updated.registration_open is True
    assert updated.password_policy.min_length == 16
