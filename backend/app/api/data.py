from datetime import UTC, datetime, date
from decimal import Decimal
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Account, Asset, BondDetail, Broker, CashLedgerEntry, DailyNote, Exchange,
    Holding, PortfolioSnapshot, PositionDailySnapshot, Ticker, Trade,
    TradeExecution, TradeImage, User, broker_exchanges,
)
from app.deps import get_current_user

router = APIRouter(prefix="/api/data", tags=["data"])
logger = logging.getLogger(__name__)


# ── Serialisation helpers ──────────────────────────────────────────────

def _default_json(obj: Any) -> str:
    if isinstance(obj, (Decimal, date, datetime)):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serialisable")

def _parse_date(val: Any) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val).split("T")[0])


def _parse_datetime(val: Any) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(str(val))


def _entity_dict(instance: Any, skip_fields: set[str] | None = None) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a plain dict, excluding ORM
    relationship attributes and optional skip_fields."""
    skip = (skip_fields or set()) | {"_sa_instance_state"}
    data = {}
    for col in instance.__table__.columns:
        if col.key in skip:
            continue
        val = getattr(instance, col.key)
        data[col.key] = val
    return data


# ── Export ─────────────────────────────────────────────────────────────

@router.get("/export")
def export_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    # 1. Exchanges (owned by user)
    exchanges = db.execute(
        select(Exchange).where(Exchange.user_id == user_id)
    ).scalars().all()
    exchanges_data = [_entity_dict(e) for e in exchanges]
    exchange_ids = {e.id for e in exchanges}

    # 2. Brokers (owned by user)
    brokers = db.execute(
        select(Broker).where(Broker.user_id == user_id)
    ).scalars().all()
    brokers_data = [_entity_dict(b) for b in brokers]
    broker_ids = {b.id for b in brokers}

    # 3. broker_exchanges rows (through owned brokers)
    if broker_ids:
        be_rows = db.execute(
            select(broker_exchanges).where(
                broker_exchanges.c.broker_id.in_(broker_ids)
            )
        ).mappings().all()
        broker_exchanges_data = [dict(r) for r in be_rows]
    else:
        broker_exchanges_data = []

    # 4. Accounts (owned by user)
    accounts = db.execute(
        select(Account).where(Account.user_id == user_id)
    ).scalars().all()
    accounts_data = []
    for a in accounts:
        d = _entity_dict(a)
        # resolve broker_id → broker name
        if d["broker_id"] is not None:
            broker = db.get(Broker, d["broker_id"])
            d["broker_name"] = broker.name if broker else None
        else:
            d["broker_name"] = None
        del d["broker_id"]
        accounts_data.append(d)
    account_ids = {a.id for a in accounts}
    account_map = {a.id: a for a in accounts}  # id → account instance

    # 5. Tickers (global — all tickers)
    tickers = db.execute(select(Ticker)).scalars().all()
    tickers_data = [_entity_dict(t) for t in tickers]

    # 6. Trades (through account → user_id)
    trades = db.execute(
        select(Trade).where(Trade.user_id == user_id)
    ).scalars().all()
    trades_data = []
    for t in trades:
        d = _entity_dict(t)
        # account_id → account_name
        acc = account_map.get(t.account_id)
        d["account_name"] = acc.name if acc else None
        del d["account_id"]
        # ticker_id → symbol+market (already stored in symbol/market)
        del d["ticker_id"]
        trades_data.append(d)
    trade_ids = {t.id for t in trades}

    # 7. Executions (through trade → user_id)
    if trade_ids:
        executions = db.execute(
            select(TradeExecution).where(
                TradeExecution.trade_id.in_(trade_ids)
            )
        ).scalars().all()
    else:
        executions = []
    executions_data = [_entity_dict(e) for e in executions]

    # 8. Trade images (through trade → user_id)
    if trade_ids:
        images = db.execute(
            select(TradeImage).where(
                TradeImage.trade_id.in_(trade_ids)
            )
        ).scalars().all()
    else:
        images = []
    images_data = [_entity_dict(i) for i in images]

    # 9. Daily notes (owned by user)
    notes = db.execute(
        select(DailyNote).where(DailyNote.user_id == user_id)
    ).scalars().all()
    notes_data = [_entity_dict(n) for n in notes]

    # 10. Assets (owned by user)
    assets = db.execute(
        select(Asset).options(joinedload(Asset.bond_detail)).where(Asset.user_id == user_id)
    ).scalars().all()
    assets_data = []
    for a in assets:
        ad = _entity_dict(a)
        if a.bond_detail:
            ad["bond_detail"] = _entity_dict(a.bond_detail, skip_fields={"asset_id"})
        assets_data.append(ad)
    asset_map = {a.id: a for a in assets}

    # 11. Holdings (owned by user)
    holdings = db.execute(
        select(Holding).where(Holding.user_id == user_id)
    ).scalars().all()
    holdings_data = []
    for h in holdings:
        d = _entity_dict(h)
        # account_id → account_name
        acc = account_map.get(h.account_id)
        d["account_name"] = acc.name if acc else None
        del d["account_id"]
        # asset_id → asset_symbol
        ast = asset_map.get(h.asset_id)
        d["asset_symbol"] = ast.symbol if ast else None
        del d["asset_id"]
        holdings_data.append(d)

    # 12. Position daily snapshots (through account → user_id)
    if account_ids:
        snapshots = db.execute(
            select(PositionDailySnapshot).where(
                PositionDailySnapshot.account_id.in_(account_ids)
            )
        ).scalars().all()
    else:
        snapshots = []
    snapshots_data = []
    for s in snapshots:
        d = _entity_dict(s)
        acc = account_map.get(s.account_id)
        d["account_name"] = acc.name if acc else None
        del d["account_id"]
        snapshots_data.append(d)

    # 13. Cash ledger entries (through account → user_id)
    if account_ids:
        ledger = db.execute(
            select(CashLedgerEntry).where(
                CashLedgerEntry.account_id.in_(account_ids)
            )
        ).scalars().all()
    else:
        ledger = []
    ledger_data = []
    for e in ledger:
        d = _entity_dict(e)
        acc = account_map.get(e.account_id)
        d["account_name"] = acc.name if acc else None
        del d["account_id"]
        ledger_data.append(d)

    # 14. Portfolio snapshots (through account → user_id)
    if account_ids:
        portfolios = db.execute(
            select(PortfolioSnapshot).where(
                PortfolioSnapshot.account_id.in_(account_ids)
            )
        ).scalars().all()
    else:
        portfolios = []
    portfolios_data = []
    for p in portfolios:
        d = _entity_dict(p)
        acc = account_map.get(p.account_id)
        d["account_name"] = acc.name if acc else None
        del d["account_id"]
        portfolios_data.append(d)

    payload = {
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "exchanges": exchanges_data,
        "brokers": brokers_data,
        "broker_exchanges": broker_exchanges_data,
        "accounts": accounts_data,
        "tickers": tickers_data,
        "trades": trades_data,
        "executions": executions_data,
        "trade_images": images_data,
        "daily_notes": notes_data,
        "assets": assets_data,
        "holdings": holdings_data,
        "position_daily_snapshots": snapshots_data,
        "cash_ledger_entries": ledger_data,
        "portfolio_snapshots": portfolios_data,
    }

    body = json.dumps(payload, default=_default_json, ensure_ascii=False, indent=2)
    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="tradejournal-export-{today_str}.json"'},
    )


# ── Import ─────────────────────────────────────────────────────────────

def _resolve_account(
    db: Session, user_id: int, account_name: str
) -> int | None:
    acc = db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.name == account_name,
        )
    ).scalar_one_or_none()
    return acc.id if acc else None


def _resolve_broker(
    db: Session, user_id: int, broker_name: str
) -> int | None:
    broker = db.execute(
        select(Broker).where(
            Broker.user_id == user_id,
            Broker.name == broker_name,
        )
    ).scalar_one_or_none()
    return broker.id if broker else None


def _resolve_ticker(
    db: Session, symbol: str, market: str
) -> int | None:
    ticker = db.execute(
        select(Ticker).where(
            Ticker.symbol == symbol,
            Ticker.market == market,
        )
    ).scalar_one_or_none()
    return ticker.id if ticker else None


def _resolve_asset(
    db: Session, user_id: int, symbol: str
) -> int | None:
    asset = db.execute(
        select(Asset).where(
            Asset.user_id == user_id,
            Asset.symbol == symbol,
        )
    ).scalar_one_or_none()
    return asset.id if asset else None


@router.post("/import")
def import_data(
    request: Request,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    raw = file.file.read()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _import_error("Invalid JSON payload.")

    if data.get("version") != 1:
        return _import_error("Unsupported export version; expected version 1")

    # Track old-ID → new-ID mappings for FK resolution
    id_map: dict[str, dict[int, int]] = {
        "exchange": {},
        "broker": {},
        "account": {},
        "ticker": {},
        "trade": {},
        "asset": {},
    }

    try:
        # 1. Exchange — natural key (name, user_id)
        for item in data.get("exchanges", []):
            old_id = item.pop("id", None)
            existing = db.execute(
                select(Exchange).where(
                    Exchange.user_id == user_id,
                    Exchange.name == item["name"],
                )
            ).scalar_one_or_none()
            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
                new_id = existing.id
            else:
                item["user_id"] = user_id
                obj = Exchange(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id
            if old_id is not None:
                id_map["exchange"][old_id] = new_id

        # 2. Broker — natural key (name, user_id)
        for item in data.get("brokers", []):
            old_id = item.pop("id", None)
            existing = db.execute(
                select(Broker).where(
                    Broker.user_id == user_id,
                    Broker.name == item["name"],
                )
            ).scalar_one_or_none()
            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
                new_id = existing.id
            else:
                item["user_id"] = user_id
                obj = Broker(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id
            if old_id is not None:
                id_map["broker"][old_id] = new_id

        # 3. broker_exchanges
        # Delete existing links for owned brokers so we can re-insert
        broker_ids_owned = [
            bid for bid in id_map["broker"].values()
        ]
        if broker_ids_owned:
            db.execute(
                broker_exchanges.delete().where(
                    broker_exchanges.c.broker_id.in_(broker_ids_owned)
                )
            )
        for item in data.get("broker_exchanges", []):
            new_broker_id = id_map["broker"].get(item["broker_id"])
            new_exchange_id = id_map["exchange"].get(item["exchange_id"])
            if new_broker_id is None or new_exchange_id is None:
                continue
            # Check if already exists
            existing = db.execute(
                select(broker_exchanges).where(
                    broker_exchanges.c.broker_id == new_broker_id,
                    broker_exchanges.c.exchange_id == new_exchange_id,
                )
            ).first()
            if not existing:
                db.execute(
                    broker_exchanges.insert().values(
                        broker_id=new_broker_id,
                        exchange_id=new_exchange_id,
                    )
                )

        # 4. Account — natural key (name, user_id); broker_id via broker_name
        for item in data.get("accounts", []):
            old_id = item.pop("id", None)
            broker_name = item.pop("broker_name", None)
            existing = db.execute(
                select(Account).where(
                    Account.user_id == user_id,
                    Account.name == item["name"],
                )
            ).scalar_one_or_none()
            if broker_name:
                broker_id = _resolve_broker(db, user_id, broker_name)
                item["broker_id"] = broker_id
            else:
                item["broker_id"] = None
            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
                new_id = existing.id
            else:
                item["user_id"] = user_id
                obj = Account(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id
            if old_id is not None:
                id_map["account"][old_id] = new_id

        # 5. Ticker — natural key (symbol, market); global, no user_id
        for item in data.get("tickers", []):
            old_id = item.pop("id", None)
            existing = db.execute(
                select(Ticker).where(
                    Ticker.symbol == item["symbol"],
                    Ticker.market == item["market"],
                )
            ).scalar_one_or_none()
            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
                new_id = existing.id
            else:
                obj = Ticker(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id
            if old_id is not None:
                id_map["ticker"][old_id] = new_id

        # 6. Trade — FK: account_name, symbol+market for ticker
        for item in data.get("trades", []):
            old_id = item.pop("id", None)
            account_name = item.pop("account_name", None)
            ticker_symbol = item.get("symbol")
            ticker_market = item.get("market")
            item["user_id"] = user_id
            if "closed_at" in item:
                item["closed_at"] = _parse_datetime(item["closed_at"])
            if account_name:
                acc_id = _resolve_account(db, user_id, account_name)
                if acc_id is None:
                    raise ValueError(f"Account '{account_name}' not found for trade")
                item["account_id"] = acc_id
            if ticker_symbol and ticker_market:
                ticker_id = _resolve_ticker(db, ticker_symbol, ticker_market)
                item["ticker_id"] = ticker_id
            else:
                item["ticker_id"] = None

            # Try to match existing trade for upsert by (user_id, symbol, account_id, created_at)
            created_at_dt = _parse_datetime(item.get("created_at"))
            stmt = select(Trade).where(
                Trade.user_id == user_id,
                Trade.symbol == item["symbol"],
                Trade.account_id == item["account_id"],
            )
            if created_at_dt:
                stmt = stmt.where(Trade.created_at == created_at_dt)
            existing = db.execute(stmt).scalars().first()
            if existing:
                for k, v in item.items():
                    if k not in ("user_id", "account_id"):
                        setattr(existing, k, v)
                new_id = existing.id
            else:
                obj = Trade(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id
            if old_id is not None:
                id_map["trade"][old_id] = new_id

        # 7. Execution — FK: trade_id
        for item in data.get("executions", []):
            old_id = item.pop("id", None)
            old_trade_id = item.get("trade_id")
            new_trade_id = id_map["trade"].get(old_trade_id, old_trade_id)
            item["trade_id"] = new_trade_id
            if "executed_at" in item:
                item["executed_at"] = _parse_datetime(item["executed_at"])
            # No natural key; always create
            obj = TradeExecution(**item)
            db.add(obj)
            db.flush()

        # 8. TradeImage — FK: trade_id
        for item in data.get("trade_images", []):
            old_id = item.pop("id", None)
            old_trade_id = item.get("trade_id")
            new_trade_id = id_map["trade"].get(old_trade_id, old_trade_id)
            item["trade_id"] = new_trade_id
            obj = TradeImage(**item)
            db.add(obj)
            db.flush()

        # 9. DailyNote — natural key (note_date, user_id, symbol)
        for item in data.get("daily_notes", []):
            old_id = item.pop("id", None)
            item["user_id"] = user_id
            note_date = _parse_date(item["note_date"])
            item["note_date"] = note_date
            stmt = select(DailyNote).where(
                DailyNote.user_id == user_id,
                DailyNote.note_date == note_date,
            )
            if item.get("symbol"):
                stmt = stmt.where(DailyNote.symbol == item["symbol"])
            else:
                stmt = stmt.where(DailyNote.symbol.is_(None) | (DailyNote.symbol == ""))
            existing = db.execute(stmt).scalars().first()
            if existing:
                for k, v in item.items():
                    if k != "user_id":
                        setattr(existing, k, v)
            else:
                obj = DailyNote(**item)
                db.add(obj)

        # 10. Asset — natural key (symbol, user_id)
        for item in data.get("assets", []):
            old_id = item.pop("id", None)
            bond_detail_data = item.pop("bond_detail", None)
            item["user_id"] = user_id
            existing = db.execute(
                select(Asset).where(
                    Asset.user_id == user_id,
                    Asset.symbol == item["symbol"],
                )
            ).scalars().first()
            if existing:
                for k, v in item.items():
                    if k != "user_id":
                        setattr(existing, k, v)
                new_id = existing.id
            else:
                obj = Asset(**item)
                db.add(obj)
                db.flush()
                new_id = obj.id

            if bond_detail_data:
                bond_detail_data.pop("id", None)
                bond_detail_data["asset_id"] = new_id
                if "issue_date" in bond_detail_data:
                    bond_detail_data["issue_date"] = _parse_date(bond_detail_data["issue_date"])
                if "maturity_date" in bond_detail_data:
                    bond_detail_data["maturity_date"] = _parse_date(bond_detail_data["maturity_date"])
                existing_bd = db.execute(
                    select(BondDetail).where(BondDetail.asset_id == new_id)
                ).scalars().first()
                if existing_bd:
                    for k, v in bond_detail_data.items():
                        if k != "asset_id":
                            setattr(existing_bd, k, v)
                else:
                    db.add(BondDetail(**bond_detail_data))

            if old_id is not None:
                id_map["asset"][old_id] = new_id

        # 11. Holding — FK: account_name, asset_symbol
        for item in data.get("holdings", []):
            old_id = item.pop("id", None)
            account_name = item.pop("account_name", None)
            asset_symbol = item.pop("asset_symbol", None)
            item["user_id"] = user_id
            if "entry_date" in item:
                item["entry_date"] = _parse_date(item["entry_date"])
            if "exit_date" in item:
                item["exit_date"] = _parse_date(item["exit_date"])
            if account_name:
                acc_id = _resolve_account(db, user_id, account_name)
                if acc_id is None:
                    raise ValueError(f"Account '{account_name}' not found for holding")
                item["account_id"] = acc_id
            if asset_symbol:
                ast_id = _resolve_asset(db, user_id, asset_symbol)
                if ast_id is None:
                    raise ValueError(f"Asset '{asset_symbol}' not found for holding")
                item["asset_id"] = ast_id

            # Upsert by (account_id, asset_id) unique constraint
            existing = db.execute(
                select(Holding).where(
                    Holding.account_id == item["account_id"],
                    Holding.asset_id == item["asset_id"],
                )
            ).scalars().first()
            if existing:
                for k, v in item.items():
                    if k not in ("user_id", "account_id", "asset_id"):
                        setattr(existing, k, v)
            else:
                obj = Holding(**item)
                db.add(obj)

        # 12. PositionDailySnapshot — FK: account_name
        for item in data.get("position_daily_snapshots", []):
            old_id = item.pop("id", None)
            account_name = item.pop("account_name", None)
            if account_name:
                acc_id = _resolve_account(db, user_id, account_name)
                if acc_id is None:
                    raise ValueError(f"Account '{account_name}' not found for snapshot")
                item["account_id"] = acc_id

            snap_date = _parse_date(item["snapshot_date"])
            item["snapshot_date"] = snap_date
            existing = db.execute(
                select(PositionDailySnapshot).where(
                    PositionDailySnapshot.account_id == item["account_id"],
                    PositionDailySnapshot.symbol == item["symbol"],
                    PositionDailySnapshot.snapshot_date == snap_date,
                )
            ).scalars().first()
            if existing:
                for k, v in item.items():
                    if k not in ("account_id", "symbol", "snapshot_date"):
                        setattr(existing, k, v)
            else:
                obj = PositionDailySnapshot(**item)
                db.add(obj)

        # 13. CashLedgerEntry — FK: account_name; always create
        for item in data.get("cash_ledger_entries", []):
            old_id = item.pop("id", None)
            account_name = item.pop("account_name", None)
            if account_name:
                acc_id = _resolve_account(db, user_id, account_name)
                if acc_id is None:
                    raise ValueError(f"Account '{account_name}' not found for cash ledger entry")
                item["account_id"] = acc_id
            if "entry_date" in item:
                item["entry_date"] = _parse_date(item["entry_date"])
            obj = CashLedgerEntry(**item)
            db.add(obj)

        # 14. PortfolioSnapshot — FK: account_name
        for item in data.get("portfolio_snapshots", []):
            old_id = item.pop("id", None)
            account_name = item.pop("account_name", None)
            if account_name:
                acc_id = _resolve_account(db, user_id, account_name)
                if acc_id is None:
                    raise ValueError(f"Account '{account_name}' not found for portfolio snapshot")
                item["account_id"] = acc_id

            snap_date = _parse_date(item["snapshot_date"])
            item["snapshot_date"] = snap_date
            existing = db.execute(
                select(PortfolioSnapshot).where(
                    PortfolioSnapshot.account_id == item["account_id"],
                    PortfolioSnapshot.snapshot_date == snap_date,
                )
            ).scalars().first()
            if existing:
                for k, v in item.items():
                    if k not in ("account_id", "snapshot_date"):
                        setattr(existing, k, v)
            else:
                obj = PortfolioSnapshot(**item)
                db.add(obj)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Import failed")
        return _import_error("An error occurred while importing data.")

    # Build summary counts
    imported = {
        "exchanges": len(data.get("exchanges", [])),
        "brokers": len(data.get("brokers", [])),
        "broker_exchanges": len(data.get("broker_exchanges", [])),
        "accounts": len(data.get("accounts", [])),
        "tickers": len(data.get("tickers", [])),
        "trades": len(data.get("trades", [])),
        "executions": len(data.get("executions", [])),
        "trade_images": len(data.get("trade_images", [])),
        "daily_notes": len(data.get("daily_notes", [])),
        "assets": len(data.get("assets", [])),
        "holdings": len(data.get("holdings", [])),
        "position_daily_snapshots": len(data.get("position_daily_snapshots", [])),
        "cash_ledger_entries": len(data.get("cash_ledger_entries", [])),
        "portfolio_snapshots": len(data.get("portfolio_snapshots", [])),
    }
    return {"imported": imported, "errors": []}


def _import_error(detail: str) -> Response:
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=422,
        content={"detail": detail},
    )
