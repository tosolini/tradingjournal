import io
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.exchanges import sync_exchange_tickers
from app.api.tickers import list_euronext_markets, sync_euronext
from app.models import Exchange, Ticker, User
from app.schemas import ExchangeResponse
from app.security import hash_password
from app.services.euronext import (
    EURONEXT_MARKETS,
    get_euronext_market_code,
    sync_euronext_equities,
)


def _make_dummy_request():
    return Request({"type": "http", "method": "POST", "url": "http://testserver", "headers": []})


def test_get_euronext_market_code_mapping():
    # Milan equity markets
    assert get_euronext_market_code("XMIL", "MTA Euronext Milan") == "milan"
    assert get_euronext_market_code("XMIL", "Euronext STAR Milan") == "milan"
    assert get_euronext_market_code("XMIL", "Euronext Growth Milan (EGM)") == "milan"
    assert get_euronext_market_code("ETLX", "EuroTLX") == "milan"
    assert get_euronext_market_code("MTAA", "Borsa Italiana MTA") == "milan"

    # Paris & Amsterdam
    assert get_euronext_market_code("XPAR", "Euronext Paris") == "paris"
    assert get_euronext_market_code("XAMS", "Euronext Amsterdam") == "amsterdam"

    # Non-equity or non-Euronext markets should return None
    assert get_euronext_market_code("XMIL", "SEDEX") is None
    assert get_euronext_market_code("XMIL", "ETF Plus") is None
    assert get_euronext_market_code("XMOT", "MOT (Mercato Obbligazioni Telematico)") is None
    assert get_euronext_market_code("XIDEM", "IDEM (Futures FTSE MIB)") is None
    assert get_euronext_market_code("XNYS", "NYSE") is None
    assert get_euronext_market_code("XETR", "XETRA") is None


def test_exchange_response_euronext_code_field(db):
    user = User(
        email="eurouser@example.com",
        username="eurouser",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()

    milan_ex = Exchange(
        user_id=user.id,
        name="MTA Euronext Milan",
        mic="XMIL",
        suffix="MI",
        country="IT",
        currency="EUR",
    )
    nyse_ex = Exchange(
        user_id=user.id,
        name="NYSE",
        mic="XNYS",
        suffix="",
        country="US",
        currency="USD",
    )
    db.add_all([milan_ex, nyse_ex])
    db.commit()

    milan_resp = ExchangeResponse.model_validate(milan_ex)
    assert milan_resp.euronext_code == "milan"

    nyse_resp = ExchangeResponse.model_validate(nyse_ex)
    assert nyse_resp.euronext_code is None


def test_sync_euronext_equities_csv_parsing_and_upsert(db):
    sample_csv = (
        'Name;ISIN;Symbol;Market;Currency;"Open Price";"High Price";"low Price";"last Price"\n'
        '"European Equities"\n'
        '"26 Oct 2026"\n'
        '"Metadata note"\n'
        '"ENEL";IT0003128367;ENEL;"Euronext Milan";EUR;6.80;6.85;6.78;6.82\n'
        '"ENI";IT0003132476;ENI;"Euronext Milan";EUR;14.20;14.35;14.15;14.30\n'
        '"STELLANTIS";NL00150001Q9;STLAM;"Euronext Milan";EUR;12.50;12.60;12.40;12.55\n'
    ).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = sample_csv
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res1 = sync_euronext_equities("milan", db)
        assert res1["imported"] == 3
        assert res1["updated"] == 0
        assert res1["skipped"] == 0
        assert res1["total"] >= 3

        # Second sync with modified name should update, not insert duplicates
        sample_csv_update = (
            'Name;ISIN;Symbol;Market;Currency;"Open Price"\n'
            '"European Equities"\n'
            '"27 Oct 2026"\n'
            '"Metadata note"\n'
            '"ENEL SPA";IT0003128367;ENEL;"Euronext Milan";EUR;6.90\n'
            '"FERRARI";NL0011585146;RACE;"Euronext Milan";EUR;380.00\n'
        ).encode("utf-8")

        mock_resp_update = MagicMock()
        mock_resp_update.read.return_value = sample_csv_update
        mock_resp_update.__enter__.return_value = mock_resp_update
        mock_resp_update.__exit__.return_value = None

        with patch("urllib.request.urlopen", return_value=mock_resp_update):
            res2 = sync_euronext_equities("milan", db)
            assert res2["imported"] == 1  # RACE is new
            assert res2["updated"] == 1   # ENEL updated
            assert res2["skipped"] == 0

        # Verify DB content
        enel = db.query(Ticker).filter(Ticker.symbol == "ENEL", Ticker.market == "Euronext Milan").first()
        assert enel is not None
        assert enel.name == "ENEL SPA"


def test_sync_exchange_tickers_endpoint(db):
    user = User(
        email="exuser@example.com",
        username="exuser",
        hashed_password=hash_password("Pass123!"),
        role="user",
    )
    db.add(user)
    db.commit()

    milan_ex = Exchange(
        user_id=user.id,
        name="MTA Euronext Milan",
        mic="XMIL",
        suffix="MI",
        country="IT",
        currency="EUR",
    )
    db.add(milan_ex)
    db.commit()

    sample_csv = (
        'Name;ISIN;Symbol;Market;Currency\n'
        '"Header 1"\n'
        '"Header 2"\n'
        '"Header 3"\n'
        '"UNICREDIT";IT0005239360;UCG;"Euronext Milan";EUR\n'
    ).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = sample_csv
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    req = _make_dummy_request()
    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = sync_exchange_tickers(exchange_id=milan_ex.id, request=req, db=db, current_user=user)
        assert res.imported == 1
        assert res.total >= 1

    # Calling on non-Euronext exchange should fail with 400
    nyse_ex = Exchange(
        user_id=user.id,
        name="NYSE",
        mic="XNYS",
        country="US",
        currency="USD",
    )
    db.add(nyse_ex)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        sync_exchange_tickers(exchange_id=nyse_ex.id, request=req, db=db, current_user=user)
    assert exc.value.status_code == 400


def test_list_euronext_markets():
    user = User(email="u@example.com", username="u", role="user")
    markets = list_euronext_markets(_current_user=user)
    codes = [m["code"] for m in markets]
    assert "milan" in codes
    assert "paris" in codes
    assert "amsterdam" in codes
    assert "all" in codes
