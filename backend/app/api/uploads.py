import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings


def _resolve_media_path(path: str | Path) -> Path:
    media_root = Path(settings.media_root).resolve()
    candidate = Path(path).resolve()

    if media_root not in candidate.parents and candidate != media_root:
        raise ValueError(f"Path escapes media root: {path}")
    return candidate
from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error
from app.models import Trade, TradeImage, User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Images only, explicitly excluding scriptable types (SVG, HTML).
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


def _require_allowed_image_type(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type. Allowed: PNG, JPEG, GIF, WebP.",
        )


@router.post("/trade/{trade_id}")
def upload_trade_image(
    trade_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    _require_allowed_image_type(file)

    media_root = Path(settings.media_root)
    media_root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "upload.bin").suffix
    file_name = f"{uuid4().hex}{suffix}"
    destination = media_root / file_name

    with destination.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    image = TradeImage(
        trade_id=trade_id,
        original_path=str(destination),
        mime_type=file.content_type,
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    return {
        "id": image.id,
        "trade_id": image.trade_id,
        "original_path": image.original_path,
        "mime_type": image.mime_type,
    }


@router.post("/trade-images/{image_id}/annotated")
def save_annotated_trade_image(
    image_id: int,
    request: Request,
    file: UploadFile = File(...),
    annotations_json: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.get(TradeImage, image_id)
    if not image:
        raise localized_error(status_code=404, code="errors.image_not_found", request=request)

    trade = db.get(Trade, image.trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    _require_allowed_image_type(file)

    media_root = Path(settings.media_root)
    media_root.mkdir(parents=True, exist_ok=True)
    destination = media_root / f"{uuid4().hex}_annotated.png"

    with destination.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    if image.annotated_path:
        try:
            old_annotated = _resolve_media_path(image.annotated_path)
            if old_annotated.exists() and old_annotated != destination:
                old_annotated.unlink()
        except (ValueError, OSError):
            pass

    image.annotated_path = str(destination)
    if annotations_json is not None:
        image.annotations_json = annotations_json
    db.commit()
    db.refresh(image)

    return {
        "id": image.id,
        "trade_id": image.trade_id,
        "original_path": image.original_path,
        "annotated_path": image.annotated_path,
        "annotations_json": image.annotations_json,
        "mime_type": image.mime_type,
    }


@router.delete("/trade-images/{image_id}")
def delete_trade_image(
    image_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.get(TradeImage, image_id)
    if not image:
        raise localized_error(status_code=404, code="errors.image_not_found", request=request)

    trade = db.get(Trade, image.trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    for raw_path in (image.original_path, image.annotated_path):
        if not raw_path:
            continue
        try:
            file_path = _resolve_media_path(raw_path)
            if file_path.exists():
                file_path.unlink()
        except (ValueError, OSError):
            pass

    db.delete(image)
    db.commit()
    return {"deleted": True, "id": image_id}


@router.get("/trade-images/{image_id}/content")
def get_trade_image_content(
    image_id: int,
    request: Request,
    variant: str = Query(default="original"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.get(TradeImage, image_id)
    if not image:
        raise localized_error(status_code=404, code="errors.image_not_found", request=request)

    trade = db.get(Trade, image.trade_id)
    if not trade or trade.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.trade_not_found", request=request)

    if variant not in {"original", "annotated"}:
        raise localized_error(status_code=400, code="errors.invalid_variant", request=request)

    path = image.original_path if variant == "original" else image.annotated_path
    if not path:
        raise localized_error(status_code=404, code="errors.image_variant_not_found", request=request)

    try:
        file_path = _resolve_media_path(path)
    except ValueError:
        raise localized_error(status_code=404, code="errors.image_file_not_found", request=request)

    if not file_path.exists():
        raise localized_error(status_code=404, code="errors.image_file_not_found", request=request)

    if variant == "annotated":
        media_type = "image/png"
    elif image.mime_type in ALLOWED_IMAGE_TYPES:
        media_type = image.mime_type
    else:
        media_type = "application/octet-stream"

    headers = {"X-Content-Type-Options": "nosniff"}
    if media_type == "application/octet-stream":
        headers["Content-Disposition"] = f'attachment; filename="trade-image-{image_id}"'

    return FileResponse(path=file_path, media_type=media_type, headers=headers)
