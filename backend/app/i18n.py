from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

DEFAULT_LOCALE = "en"
SUPPORTED_LOCALES = {"en", "it"}
LOCALE_DIR = Path(__file__).resolve().parent.parent / "locale"

_catalog_cache: dict[str, dict[str, str]] = {}


def _normalize_locale(value: str | None) -> str:
    if not value:
        return DEFAULT_LOCALE

    candidate = value.split(",", 1)[0].strip().lower().replace("_", "-")
    if not candidate:
        return DEFAULT_LOCALE

    if candidate in SUPPORTED_LOCALES:
        return candidate

    base = candidate.split("-", 1)[0]
    if base in SUPPORTED_LOCALES:
        return base

    return DEFAULT_LOCALE


def get_request_locale(request: Request | None) -> str:
    if request is None:
        return DEFAULT_LOCALE
    return _normalize_locale(request.headers.get("Accept-Language"))


def _po_value(raw: str) -> str:
    raw = raw.strip()
    if not raw or not raw.startswith('"'):
        return ""
    return str(ast.literal_eval(raw))


def _load_po_catalog(locale: str) -> dict[str, str]:
    po_path = LOCALE_DIR / locale / "LC_MESSAGES" / "messages.po"
    if not po_path.exists():
        return {}

    catalog: dict[str, str] = {}
    current_id: str | None = None
    current_str: str | None = None
    mode: str | None = None

    def flush() -> None:
        nonlocal current_id, current_str, mode
        if current_id is not None and current_id != "" and current_str is not None:
            catalog[current_id] = current_str
        current_id = None
        current_str = None
        mode = None

    for line in po_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("msgid "):
            flush()
            current_id = _po_value(stripped[5:])
            current_str = ""
            mode = "msgid"
            continue

        if stripped.startswith("msgstr "):
            current_str = _po_value(stripped[6:])
            mode = "msgstr"
            continue

        if stripped.startswith('"'):
            if mode == "msgid" and current_id is not None:
                current_id += _po_value(stripped)
            elif mode == "msgstr" and current_str is not None:
                current_str += _po_value(stripped)

    flush()
    return catalog


def _get_catalog(locale: str) -> dict[str, str]:
    if locale not in _catalog_cache:
        _catalog_cache[locale] = _load_po_catalog(locale)
    return _catalog_cache[locale]


def translate(key: str, request: Request | None = None, **kwargs: Any) -> str:
    locale = get_request_locale(request)
    catalog = _get_catalog(locale)
    fallback_catalog = _get_catalog(DEFAULT_LOCALE)

    template = catalog.get(key) or fallback_catalog.get(key) or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template


def translate_locale(locale: str, key: str, **kwargs: Any) -> str:
    """Translate a key for an explicit locale (no request object needed)."""
    normalized = _normalize_locale(locale)
    catalog = _get_catalog(normalized)
    fallback_catalog = _get_catalog(DEFAULT_LOCALE)

    template = catalog.get(key) or fallback_catalog.get(key) or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template


def localized_error(status_code: int, code: str, request: Request | None = None, **kwargs: Any) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": translate(code, request=request, **kwargs),
        },
    )
