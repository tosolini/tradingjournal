import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models import Ticker, User
from app.schemas import TickerImportResult, TickerResponse

router = APIRouter(prefix="/api/tickers", tags=["tickers"])

# Columns in the Euronext CSV (semicolon-separated, first 4 rows are metadata)
_COL_NAME = 0
_COL_ISIN = 1
_COL_SYMBOL = 2
_COL_MARKET = 3
_COL_CURRENCY = 4


@router.post("/import", response_model=TickerImportResult)
async def import_tickers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Import tickers from a Euronext-style semicolon-separated CSV file."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)

    # Skip metadata rows: row 0 = header, rows 1-3 = metadata lines
    data_rows = rows[4:]

    imported = 0
    updated = 0
    skipped = 0

    for row in data_rows:
        if len(row) < 5:
            skipped += 1
            continue

        name = row[_COL_NAME].strip().strip('"')
        isin = row[_COL_ISIN].strip().strip('"') or None
        symbol = row[_COL_SYMBOL].strip().strip('"')
        market = row[_COL_MARKET].strip().strip('"')
        currency = row[_COL_CURRENCY].strip().strip('"') or None

        if not symbol or not market:
            skipped += 1
            continue

        # Upsert: insert or update on (symbol, market) conflict
        stmt = (
            pg_insert(Ticker)
            .values(name=name, isin=isin, symbol=symbol, market=market, currency=currency)
            .on_conflict_do_update(
                constraint="uq_ticker_symbol_market",
                set_=dict(name=name, isin=isin, currency=currency),
            )
        )
        result = db.execute(stmt)
        # rowcount=1 means inserted; returning nothing from on_conflict means updated
        if result.rowcount == 1:
            imported += 1
        else:
            updated += 1

    db.commit()
    total = db.execute(select(func.count()).select_from(Ticker)).scalar() or 0

    return TickerImportResult(
        imported=imported,
        updated=updated,
        skipped=skipped,
        total=total,
    )


@router.get("/search", response_model=list[TickerResponse])
def search_tickers(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Autocomplete search: match symbol prefix first, then name contains."""
    if not q.strip():
        return []

    term = q.strip().upper()

    # Symbol prefix matches first, then name contains
    results = (
        db.execute(
            select(Ticker)
            .where(
                or_(
                    func.upper(Ticker.symbol).like(f"{term}%"),
                    func.upper(Ticker.name).like(f"%{term}%"),
                )
            )
            .order_by(
                # Exact symbol match first, then prefix, then name
                (func.upper(Ticker.symbol) == term).desc(),
                func.upper(Ticker.symbol).like(f"{term}%").desc(),
                Ticker.symbol,
            )
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return results


@router.get("/count")
def get_ticker_count(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return total number of tickers in the database."""
    total = db.execute(select(func.count()).select_from(Ticker)).scalar() or 0
    return {"total": total}


@router.delete("", status_code=204)
def clear_tickers(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Delete all tickers (for re-import)."""
    db.query(Ticker).delete()
    db.commit()


@router.get("/euronext-markets")
def list_euronext_markets(
    _current_user: User = Depends(get_current_user),
):
    """Return available Euronext equity markets for synchronization."""
    from app.services.euronext import EURONEXT_MARKETS
    return [
        {"code": code, "name": info["name"]}
        for code, info in EURONEXT_MARKETS.items()
    ]


@router.post("/sync-euronext", response_model=TickerImportResult)
def sync_euronext(
    market: str = Query("milan", description="Euronext market code (e.g. milan, paris, amsterdam, all)"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Download and synchronize equity tickers directly from Euronext."""
    try:
        from app.services.euronext import sync_euronext_equities
        result = sync_euronext_equities(market_code=market, db=db)
        return TickerImportResult(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
