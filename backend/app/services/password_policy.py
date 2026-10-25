"""DB-backed password policy and registration toggle.

Rules live in the ``app_settings`` table so admins can change them at
runtime without touching ``.env`` or redeploying. Missing rows fall back
to secure defaults (policy defaults, registration closed).
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import localized_error
from app.models import AppSetting

PASSWORD_POLICY_KEY = "password_policy"
REGISTRATION_OPEN_KEY = "registration_open"

DEFAULT_POLICY: dict[str, Any] = {
    "min_length": 12,
    "max_length": 128,
    "require_digit": False,
    "require_uppercase": False,
    "require_symbol": False,
    "reject_common": True,
}

COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password123",
        "password1",
        "changeme",
        "change-me",
        "admin",
        "administrator",
        "letmein",
        "welcome",
        "welcome123",
        "qwerty",
        "qwerty123",
        "12345678",
        "123456789",
        "11111111",
        "abc12345",
        "tradejournal",
        "trading123",
    }
)


def _get_row(db: Session, key: str) -> AppSetting | None:
    return db.execute(select(AppSetting).where(AppSetting.key == key)).scalar_one_or_none()


def get_policy(db: Session) -> dict[str, Any]:
    """Return the effective password policy (DB row merged over defaults)."""
    policy = dict(DEFAULT_POLICY)
    row = _get_row(db, PASSWORD_POLICY_KEY)
    if row and isinstance(row.value, dict):
        for field in DEFAULT_POLICY:
            if field in row.value:
                policy[field] = row.value[field]
    try:
        policy["min_length"] = max(1, int(policy["min_length"]))
    except (TypeError, ValueError):
        policy["min_length"] = DEFAULT_POLICY["min_length"]
    try:
        policy["max_length"] = max(
            policy["min_length"], int(policy["max_length"])
        )
    except (TypeError, ValueError):
        policy["max_length"] = DEFAULT_POLICY["max_length"]
    return policy


def _fails(password: str, policy: dict[str, Any]) -> str | None:
    """Return a machine-readable reason when the password violates policy."""
    if not isinstance(password, str):
        return "not_a_string"
    if len(password) > policy["max_length"]:
        return "too_long"
    if len(password) < policy["min_length"]:
        return "too_short"
    if policy.get("reject_common") and password.strip().lower() in COMMON_PASSWORDS:
        return "too_common"
    if policy.get("require_digit") and not any(ch.isdigit() for ch in password):
        return "digit_required"
    if policy.get("require_uppercase") and not any(ch.isupper() for ch in password):
        return "uppercase_required"
    if policy.get("require_symbol") and not any(
        not ch.isalnum() for ch in password
    ):
        return "symbol_required"
    return None


def validate_password(
    password: str, db: Session, request: Request | None = None
) -> None:
    """Raise a localized 400 error when the password violates the DB policy."""
    reason = _fails(password, get_policy(db))
    if reason is not None:
        raise localized_error(
            status_code=400, code="errors.weak_password", request=request
        )


def is_registration_open(db: Session) -> bool:
    """Public self-registration is closed unless explicitly enabled in DB."""
    row = _get_row(db, REGISTRATION_OPEN_KEY)
    if row is None:
        return False
    value = row.value
    if isinstance(value, bool):
        return value
    if isinstance(value, dict):
        return bool(value.get("open", False))
    return False


def set_registration_open(db: Session, value: bool) -> bool:
    row = _get_row(db, REGISTRATION_OPEN_KEY)
    if row is None:
        row = AppSetting(key=REGISTRATION_OPEN_KEY, value=bool(value))
        db.add(row)
    else:
        row.value = bool(value)
    db.commit()
    db.refresh(row)
    return bool(row.value)


def set_policy(db: Session, policy: dict[str, Any]) -> dict[str, Any]:
    cleaned = {field: policy[field] for field in DEFAULT_POLICY if field in policy}
    row = _get_row(db, PASSWORD_POLICY_KEY)
    if row is None:
        row = AppSetting(key=PASSWORD_POLICY_KEY, value=cleaned)
        db.add(row)
    else:
        row.value = cleaned
    db.commit()
    db.refresh(row)
    return get_policy(db)
