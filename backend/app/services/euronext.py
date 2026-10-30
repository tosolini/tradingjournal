import base64
import binascii
import csv
from datetime import date, datetime
from decimal import Decimal
import hashlib
import io
import json
import logging
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Optional

from bs4 import BeautifulSoup
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from app.services.bond_rates import (
    PERIODIC_RATE_MAX,
    annualize_periodic_rate,
    extract_rate_from_name,
)

logger = logging.getLogger(__name__)

# In-memory quote cache: {isin_mic: (timestamp, price_decimal)}
_euronext_quote_cache: dict[str, tuple[float, Optional[Decimal]]] = {}
CACHE_TTL = 300  # 5 minutes

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _evp_bytes_to_key(password: str, salt: bytes, key_len: int = 32, iv_len: int = 16) -> tuple[bytes, bytes]:
    """Derive key and IV using OpenSSL / CryptoJS EVP_BytesToKey."""
    d: list[bytes] = []
    d_i = b""
    while len(b"".join(d)) < (key_len + iv_len):
        h = hashlib.md5(d_i + password.encode("utf-8") + salt)
        d_i = h.digest()
        d.append(d_i)
    total = b"".join(d)
    return total[:key_len], total[key_len:key_len + iv_len]


def parse_euronext_bond_query(query: str) -> tuple[str, str]:
    """Parse URL, ISIN-MIC, or bare ISIN into (isin, mic).

    Examples:
        - "https://live.euronext.com/en/product/bonds/IT0005611741-MOTX" -> ("IT0005611741", "MOTX")
        - "IT0005611741-MOTX" -> ("IT0005611741", "MOTX")
        - "IT0005611741" -> ("IT0005611741", "MOTX")
    """
    q = query.strip()
    # Match URL pattern
    url_match = re.search(r"/product/bonds/([A-Z0-9]{12})(?:-([A-Z0-9]+))?", q, re.I)
    if url_match:
        isin = url_match.group(1).upper()
        mic = (url_match.group(2) or "MOTX").upper()
        return isin, mic

    # Match ISIN-MIC or ISIN:MIC
    dash_match = re.search(r"^([A-Z0-9]{12})[-:]([A-Z0-9]+)$", q, re.I)
    if dash_match:
        return dash_match.group(1).upper(), dash_match.group(2).upper()

    # Match bare ISIN
    isin_match = re.search(r"^([A-Z0-9]{12})$", q, re.I)
    if isin_match:
        return isin_match.group(1).upper(), "MOTX"

    raise ValueError(f"Formato non riconosciuto per query Euronext: '{query}'. Inserisci un ISIN o URL Euronext.")


def _parse_dmy_date(d_str: str) -> Optional[date]:
    """Parse DD/MM/YYYY into date object."""
    if not d_str:
        return None
    try:
        dt = datetime.strptime(d_str.strip(), "%d/%m/%Y")
        return dt.date()
    except Exception:
        return None


def _add_years(value: date, years: int) -> date:
    """Add years to a date, clamping 29 February on non-leap target years."""
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(year=value.year + years, day=28)


def fetch_euronext_live_price(isin: str, mic: str = "MOTX") -> Optional[Decimal]:
    """Fetch live quote (corso secco base 100) from Euronext for a bond."""
    cache_key = f"{isin}-{mic}".upper()
    now = time.monotonic()
    cached = _euronext_quote_cache.get(cache_key)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1]

    try:
        url_main = f"https://live.euronext.com/en/product/bonds/{cache_key}"
        headers = {"User-Agent": USER_AGENT}
        req_main = urllib.request.Request(url_main, headers=headers)
        with urllib.request.urlopen(req_main, timeout=10) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        kye_match = re.search(r'\"ajax_secure\":\{\"kye\":\"([^\"]+)\"\}', html)
        if not kye_match:
            _euronext_quote_cache[cache_key] = (now, None)
            return None
        kye = kye_match.group(1)

        q_url = f"https://live.euronext.com/en/ajax/getDetailedQuote/{cache_key}"
        q_req = urllib.request.Request(q_url, headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"})
        with urllib.request.urlopen(q_req, timeout=10) as resp:
            q_data = json.loads(resp.read().decode("utf-8"))

        salt = binascii.unhexlify(q_data["s"])
        iv = binascii.unhexlify(q_data["iv"])
        ct = base64.b64decode(q_data["ct"])

        key, _ = _evp_bytes_to_key(kye, salt, 32, 16)
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded = decryptor.update(ct) + decryptor.finalize()
        pad_len = padded[-1]
        decrypted = padded[:-pad_len].decode("utf-8")
        raw_html = json.loads(decrypted)

        price_m = re.search(r'id=\"header-instrument-price\">([^<]+)</span>', raw_html)
        if price_m:
            price_val = Decimal(price_m.group(1).replace(",", "").strip())
            _euronext_quote_cache[cache_key] = (now, price_val)
            return price_val

    except Exception as e:
        logger.warning("Errore nel recupero quotazione Euronext per %s: %s", cache_key, e)

    _euronext_quote_cache[cache_key] = (now, None)
    return None


def fetch_euronext_bond_details(query: str) -> dict[str, Any]:
    """Fetch complete bond characteristics and live price from Euronext MOT.

    Accepts an Euronext URL or an ISIN.
    Returns a dictionary formatted for AssetCreate and BondDetailCreate.
    """
    isin, mic = parse_euronext_bond_query(query)
    isin_mic = f"{isin}-{mic}"

    headers = {"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"}

    # 1. Fetch factsheet blocks
    blocks = ["fs_info_block", "fs_instrumentinfo_block", "fs_couponinfo_block", "fs_issuerinfo_block"]
    raw_data: dict[str, str] = {}

    for blk in blocks:
        url = f"https://live.euronext.com/en/ajax/getFactsheetInfoBlock/BONDS/{isin_mic}/{blk}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                soup = BeautifulSoup(resp.read().decode("utf-8", errors="ignore"), "html.parser")
                for tr in soup.find_all("tr"):
                    tds = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                    if len(tds) >= 2:
                        raw_data[tds[0].strip()] = tds[1].strip()
        except Exception as e:
            logger.warning("Errore blocco %s per %s: %s", blk, isin_mic, e)

    # 2. Fetch main page to retrieve name and live price
    clean_name = f"BTP {isin}"
    try:
        url_main = f"https://live.euronext.com/en/product/bonds/{isin_mic}"
        req_main = urllib.request.Request(url_main, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req_main, timeout=10) as resp:
            main_html = resp.read().decode("utf-8", errors="ignore")

        soup_main = BeautifulSoup(main_html, "html.parser")
        for s in soup_main.find_all("script", type="application/json"):
            try:
                dt = json.loads(s.string)
                if "custom" in dt and "instrument" in dt["custom"]:
                    inst = dt["custom"]["instrument"]
                    if inst.get("name"):
                        clean_name = inst["name"].strip()
                        break
            except Exception:
                pass
    except Exception as e:
        logger.warning("Errore caricamento pagina principale %s: %s", isin_mic, e)

    # 3. Live price
    live_price = fetch_euronext_live_price(isin, mic)

    # 4. Process parameters
    sub_type = raw_data.get("Sub type", "").strip()
    is_btp_valore = "valore" in sub_type.lower() or "valore" in clean_name.lower()
    is_bot = "bot" in sub_type.lower() or "bot" in clean_name.lower()

    # Coupon frequency
    freq_str = raw_data.get("Interest rate frequency", "").lower()
    if "quarterly" in freq_str or is_btp_valore:
        coupon_frequency = 4
    elif "half" in freq_str or "semiannual" in freq_str:
        coupon_frequency = 2
    elif "annual" in freq_str or "yearly" in freq_str:
        coupon_frequency = 1
    elif is_bot or "not fed" in freq_str:
        coupon_frequency = 0 if is_bot else 2
    else:
        coupon_frequency = 2

    # Coupon rate extraction
    rate_str = raw_data.get("Interest Rate", "").replace("%", "").strip()
    try:
        raw_rate = Decimal(rate_str) if rate_str else Decimal("0.0000")
    except Exception:
        raw_rate = Decimal("0.0000")

    # 1. Detect annual rate from title/name if available (e.g. "BTP TF 3,85% DC29" -> 3.85%, "BTP 4.3% OCT54 EUR" -> 4.30%)
    name_rate = extract_rate_from_name(clean_name)
    if name_rate is not None:
        annual_coupon_rate = name_rate
    elif is_btp_valore:
        # Euronext reports the quarterly coupon rate (e.g. 0.812% for 3.25% annual or 0.8375% for 3.35%)
        # Multiply by 4 to get annual coupon rate, rounding to nearest 0.05%
        annual_coupon_rate = annualize_periodic_rate(raw_rate, 4)
    elif coupon_frequency == 4 and Decimal("0") < raw_rate < PERIODIC_RATE_MAX:
        # Periodic quarterly coupon reported instead of annual
        annual_coupon_rate = annualize_periodic_rate(raw_rate, 4, snap=False)
    elif coupon_frequency == 2 and Decimal("0") < raw_rate < PERIODIC_RATE_MAX:
        # Periodic semiannual coupon reported instead of annual
        annual_coupon_rate = annualize_periodic_rate(raw_rate, 2, snap=False)
    else:
        annual_coupon_rate = raw_rate

    # Dates
    issue_date = _parse_dmy_date(raw_data.get("Issue Date", ""))
    maturity_date = _parse_dmy_date(raw_data.get("Repayment date", ""))
    if not maturity_date:
        # Fallback if Repayment date is missing: estimate from issue date + 5 years
        maturity_date = _add_years(issue_date or date.today(), 5)

    # Bond structure
    if is_btp_valore:
        bond_type = "step_up"
        final_bonus_rate = Decimal("0.8000")
        total_years = (maturity_date.year - issue_date.year) if (issue_date and maturity_date) else 6
        step_split = 3 if total_years >= 5 else 2
        if annual_coupon_rate == Decimal("3.35"):
            step2_rate = 3.90
        elif annual_coupon_rate == Decimal("4.10"):
            step2_rate = 4.50
        else:
            step2_rate = float(annual_coupon_rate) + 0.75 if annual_coupon_rate > 0 else 4.00
        step_up_schedule = [
            {"from_year": 1, "to_year": step_split, "rate": float(annual_coupon_rate) if annual_coupon_rate > 0 else 3.25},
            {"from_year": step_split + 1, "to_year": total_years, "rate": round(step2_rate, 4)},
        ]
    elif is_bot or (annual_coupon_rate == Decimal("0") and coupon_frequency == 0):
        bond_type = "zero_coupon"
        final_bonus_rate = Decimal("0.0000")
        step_up_schedule = None
    else:
        bond_type = "fixed"
        final_bonus_rate = Decimal("0.0000")
        step_up_schedule = None

    # Issue price
    issue_price_str = raw_data.get("Issue Price", "").replace(",", "").strip()
    try:
        issue_price = Decimal(issue_price_str) if issue_price_str else Decimal("100.00")
    except Exception:
        issue_price = Decimal("100.00")

    market_name = raw_data.get("Market", "MOT").strip()

    return {
        "symbol": isin,
        "name": clean_name,
        "isin": isin,
        "exchange": market_name,
        "currency": "EUR",
        "instrument_type": "bond",
        "live_price": live_price or issue_price,
        "issue_price": issue_price,
        "bond_detail": {
            "bond_type": bond_type,
            "issue_date": issue_date,
            "maturity_date": maturity_date,
            "coupon_frequency": coupon_frequency,
            "annual_coupon_rate": annual_coupon_rate,
            "step_up_schedule": step_up_schedule,
            "final_bonus_rate": final_bonus_rate,
            "tax_rate": Decimal("12.50"),
            "day_count_convention": "ACT/ACT ICMA",
        },
    }


BOND_INSTRUMENT_TYPES = {"bond", "government_bond"}


class EuronextSyncError(Exception):
    """Raised when an asset cannot be synchronized from Euronext."""


def apply_euronext_bond_data(asset: Any) -> None:
    """Fetch bond characteristics from Euronext and apply them to ``asset``.

    Shared by the asset and holding sync endpoints. The caller owns the
    transaction (commit/rollback) and the response payload.
    """
    from app.models import BondDetail

    instrument_type = (getattr(asset, "instrument_type", "") or "").strip().lower()
    if instrument_type not in BOND_INSTRUMENT_TYPES:
        raise EuronextSyncError(
            "L'asset non è un'obbligazione: sincronizzazione Euronext non disponibile"
        )

    query = getattr(asset, "isin", None) or getattr(asset, "symbol", None)
    if not query:
        raise EuronextSyncError("Asset has no ISIN or symbol for Euronext lookup")

    try:
        data = fetch_euronext_bond_details(query)
    except Exception as e:
        raise EuronextSyncError(f"Errore Euronext: {e}") from e

    bd_data = data.get("bond_detail")
    if not bd_data:
        raise EuronextSyncError("Nessun dato obbligazionario trovato su Euronext")

    if not asset.bond_detail:
        asset.bond_detail = BondDetail(asset_id=asset.id)

    for key, value in bd_data.items():
        setattr(asset.bond_detail, key, value)

    if data.get("name") and (not asset.name or asset.name.startswith("BTP ")):
        asset.name = data["name"]
    if data.get("exchange") and not asset.exchange:
        asset.exchange = data["exchange"]


EURONEXT_MARKETS: dict[str, dict[str, Any]] = {
    "milan": {
        "code": "milan",
        "name": "Euronext Milan",
        "url": "https://live.euronext.com/product_directory/data/stocks-milan/download?mics=BGEM,ETLX,EXGM,MIVX,MTAA,MTAH",
        "referer": "https://live.euronext.com/en/markets/milan/equities/list",
        "mics": ["XMIL", "MTAA", "MTAH", "ETLX", "BGEM", "EXGM", "MIVX"],
    },
    "paris": {
        "code": "paris",
        "name": "Euronext Paris",
        "url": "https://live.euronext.com/product_directory/data/stocks-paris/download?mics=ALXP,XMLI,XPAR,XPMC",
        "referer": "https://live.euronext.com/en/markets/paris/equities/list",
        "mics": ["XPAR", "ALXP", "XMLI", "XPMC"],
    },
    "amsterdam": {
        "code": "amsterdam",
        "name": "Euronext Amsterdam",
        "url": "https://live.euronext.com/product_directory/data/stocks-amsterdam/download?mics=TNLA,XAMC,XAMS",
        "referer": "https://live.euronext.com/en/markets/amsterdam/equities/list",
        "mics": ["XAMS", "TNLA", "XAMC"],
    },
    "brussels": {
        "code": "brussels",
        "name": "Euronext Brussels",
        "url": "https://live.euronext.com/product_directory/data/stocks-brussels/download?mics=ALXB,ENXB,MLXB,TNLB,XBRU",
        "referer": "https://live.euronext.com/en/markets/brussels/equities/list",
        "mics": ["XBRU", "ALXB", "ENXB", "MLXB", "TNLB"],
    },
    "lisbon": {
        "code": "lisbon",
        "name": "Euronext Lisbon",
        "url": "https://live.euronext.com/product_directory/data/stocks-lisbon/download?mics=ALXL,ENXL,XLIS",
        "referer": "https://live.euronext.com/en/markets/lisbon/equities/list",
        "mics": ["XLIS", "ALXL", "ENXL"],
    },
    "dublin": {
        "code": "dublin",
        "name": "Euronext Dublin",
        "url": "https://live.euronext.com/product_directory/data/stocks-dublin/download?mics=XACD,XATL,XESM,XMSM",
        "referer": "https://live.euronext.com/en/markets/dublin/equities/list",
        "mics": ["XMSM", "XESM", "XACD", "XATL"],
    },
    "oslo": {
        "code": "oslo",
        "name": "Euronext Oslo",
        "url": "https://live.euronext.com/product_directory/data/stocks-oslo/download?mics=MERK,XOAS,XOSL",
        "referer": "https://live.euronext.com/en/markets/oslo/equities/list",
        "mics": ["XOSL", "MERK", "XOAS"],
    },
    "all": {
        "code": "all",
        "name": "Tutti i mercati Euronext",
        "url": "https://live.euronext.com/product_directory/data/stocks-all-places/download?mics=ALXB,ALXL,ALXP,BGEM,ENXB,ENXL,ETLX,EXGM,MERK,MIVX,MLXB,MTAA,MTAH,TNLA,TNLB,XAMC,XAMS,XATL,XBRU,XESM,XLDN,XLIS,XMLI,XMSM,XOAS,XOSL,XPAR,XPMC",
        "referer": "https://live.euronext.com/en/products/equities/list",
        "mics": [],
    },
}


def get_euronext_market_code(mic: Optional[str], name: Optional[str], country: Optional[str] = None) -> Optional[str]:
    """Determine Euronext equity market code (e.g. 'milan', 'paris') from exchange attributes."""
    mic_clean = (mic or "").strip().upper()
    name_clean = (name or "").strip().lower()

    # Exclude non-equity / derivatives / bond / fund / fx markets
    non_equity_keywords = [
        "mot", "idem", "sedex", "cert-x", "etf", "forex", "cripto", "cfd", "commodit", "future", "option", "bonds",
    ]
    if any(k in name_clean for k in non_equity_keywords):
        return None

    if mic_clean in ("MTAA", "MTAH", "BGEM", "EXGM", "MIVX", "ETLX"):
        return "milan"
    if mic_clean == "XMIL":
        return "milan"
    if mic_clean in ("XPAR", "ALXP", "XMLI", "XPMC"):
        return "paris"
    if mic_clean in ("XAMS", "TNLA", "XAMC"):
        return "amsterdam"
    if mic_clean in ("XBRU", "ALXB", "ENXB", "MLXB", "TNLB"):
        return "brussels"
    if mic_clean in ("XLIS", "ALXL", "ENXL"):
        return "lisbon"
    if mic_clean in ("XMSM", "XESM", "XACD", "XATL"):
        return "dublin"
    if mic_clean in ("XOSL", "MERK", "XOAS"):
        return "oslo"

    if "milan" in name_clean or "milano" in name_clean:
        return "milan"
    if "paris" in name_clean or "parigi" in name_clean:
        return "paris"
    if "amsterdam" in name_clean:
        return "amsterdam"
    if "brussel" in name_clean or "bruxelles" in name_clean:
        return "brussels"
    if "lisbon" in name_clean or "lisbona" in name_clean:
        return "lisbon"
    if "dublin" in name_clean or "dublino" in name_clean:
        return "dublin"
    if "oslo" in name_clean:
        return "oslo"

    return None


def sync_euronext_equities(market_code: str, db: Any) -> dict[str, int]:
    """Download live equities CSV from Euronext and upsert into tickers table."""
    code = (market_code or "").strip().lower()
    if code not in EURONEXT_MARKETS:
        valid_codes = ", ".join(EURONEXT_MARKETS.keys())
        raise ValueError(f"Codice mercato Euronext non valido '{market_code}'. Valori supportati: {valid_codes}")

    market_info = EURONEXT_MARKETS[code]
    url = market_info["url"]
    referer = market_info.get("referer", "https://live.euronext.com")

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": referer,
            "Accept": "text/csv,text/plain,*/*",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
    except Exception as exc:
        logger.error(f"Failed to download Euronext equities CSV from {url}: {exc}")
        raise RuntimeError(f"Impossibile scaricare i dati da Euronext ({market_info['name']}): {exc}") from exc

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)

    if not rows or len(rows) < 5:
        return {"imported": 0, "updated": 0, "skipped": 0, "total": 0}

    header = [c.strip().strip('"').lower() for c in rows[0]]
    col_name = header.index("name") if "name" in header else 0
    col_isin = header.index("isin") if "isin" in header else 1
    col_symbol = header.index("symbol") if "symbol" in header else 2
    col_market = header.index("market") if "market" in header else 3
    col_currency = header.index("currency") if "currency" in header else 4

    data_rows = rows[4:]
    tickers_dict: dict[tuple[str, str], dict[str, Any]] = {}
    skipped = 0

    max_idx = max(col_name, col_isin, col_symbol, col_market, col_currency)
    for row in data_rows:
        if len(row) <= max_idx:
            skipped += 1
            continue

        name = row[col_name].strip().strip('"')
        isin = row[col_isin].strip().strip('"') or None
        symbol = row[col_symbol].strip().strip('"')
        market = row[col_market].strip().strip('"')
        currency = row[col_currency].strip().strip('"') or None

        if not symbol or not market:
            skipped += 1
            continue

        tickers_dict[(symbol, market)] = {
            "name": name,
            "isin": isin,
            "symbol": symbol,
            "market": market,
            "currency": currency,
        }

    from app.models import Ticker
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy import literal_column, select, func

    imported = 0
    updated = 0
    items = list(tickers_dict.values())
    batch_size = 500

    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        stmt = (
            pg_insert(Ticker)
            .values(batch)
            .on_conflict_do_update(
                constraint="uq_ticker_symbol_market",
                set_=dict(
                    name=pg_insert(Ticker).excluded.name,
                    isin=pg_insert(Ticker).excluded.isin,
                    currency=pg_insert(Ticker).excluded.currency,
                ),
            )
            .returning(literal_column("xmax = 0").label("inserted"))
        )
        res = db.execute(stmt).fetchall()
        for r in res:
            if r.inserted:
                imported += 1
            else:
                updated += 1

    db.commit()
    total = db.execute(select(func.count()).select_from(Ticker)).scalar() or 0

    return {
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "total": total,
    }
