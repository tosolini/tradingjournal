from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.i18n import localized_error
from app.models import Account, CashLedgerEntry, User
from app.schemas import CashLedgerCreate, CashLedgerResponse, CashLedgerUpdate

router = APIRouter(prefix="/api/ledger", tags=["ledger"])

VALID_ENTRY_TYPES = {
    "deposit",
    "withdrawal",
    "coupon",
    "bond_bonus",
    "bond_redemption",
    "dividend",
    "asset_sale",
}


def _get_owned_entry(
    db: Session, entry_id: int, user_id: int
) -> CashLedgerEntry:
    entry = db.execute(
        select(CashLedgerEntry)
        .join(Account, Account.id == CashLedgerEntry.account_id)
        .where(
            CashLedgerEntry.id == entry_id,
            Account.user_id == user_id,
        )
    ).scalar_one_or_none()
    if not entry:
        raise localized_error(status_code=404, code="errors.ledger_entry_not_found")
    return entry


@router.get("", response_model=list[CashLedgerResponse])
def list_ledger(
    account_id: int | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(CashLedgerEntry)
        .join(Account, Account.id == CashLedgerEntry.account_id)
        .where(Account.user_id == current_user.id)
    )
    if account_id is not None:
        query = query.where(CashLedgerEntry.account_id == account_id)
    if from_date:
        query = query.where(CashLedgerEntry.entry_date >= from_date)
    if to_date:
        query = query.where(CashLedgerEntry.entry_date <= to_date)
    return db.execute(
        query.order_by(CashLedgerEntry.entry_date.desc(), CashLedgerEntry.id.desc())
    ).scalars().all()


@router.post("", response_model=CashLedgerResponse)
def create_ledger_entry(
    payload: CashLedgerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = db.get(Account, payload.account_id)
    if not account or account.user_id != current_user.id:
        raise localized_error(status_code=404, code="errors.account_not_found", request=request)

    entry_type = payload.entry_type.strip().lower()
    if entry_type not in VALID_ENTRY_TYPES:
        raise localized_error(status_code=422, code="errors.invalid_ledger_type", request=request)

    entry = CashLedgerEntry(
        account_id=payload.account_id,
        entry_type=entry_type,
        amount=abs(payload.amount),
        description=payload.description,
        entry_date=payload.entry_date or date.today(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=CashLedgerResponse)
def update_ledger_entry(
    entry_id: int,
    payload: CashLedgerUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = _get_owned_entry(db, entry_id, current_user.id)

    updates = payload.model_dump(exclude_unset=True)
    if "entry_type" in updates:
        entry_type = updates["entry_type"].strip().lower()
        if entry_type not in VALID_ENTRY_TYPES:
            raise localized_error(status_code=422, code="errors.invalid_ledger_type", request=request)
        updates["entry_type"] = entry_type
    if "amount" in updates and updates["amount"] is not None:
        updates["amount"] = abs(updates["amount"])

    for field, value in updates.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
def delete_ledger_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = _get_owned_entry(db, entry_id, current_user.id)
    db.delete(entry)
    db.commit()
    return {"ok": True}
