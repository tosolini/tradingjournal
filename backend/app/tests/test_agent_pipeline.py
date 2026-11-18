"""Tests for the multi-agent debate and coaching pipeline."""
from decimal import Decimal
import pytest

from app.services.analysis.agents.llm_factory import MockChatClient
from app.services.analysis.agents.pipeline import _extract_json_block, run_agentic_analysis
from app.services.analysis.data_collector import AnalysisDataBundle


def _make_dummy_bundle() -> AnalysisDataBundle:
    return AnalysisDataBundle(
        symbol="ENEL.MI",
        market="Borsa Italiana",
        instrument_type="stock",
        current_price=Decimal("6.85"),
        technical={
            "available": True,
            "rsi_14": 58.4,
            "macd": {"histogram": 0.05},
            "supports": [6.50],
            "resistances": [7.10],
            "trend": {"trend": "bullish"},
        },
        cyclical={
            "available": True,
            "hurst_exponent": 0.62,
            "regime": "trending",
            "dominant_cycles": [{"period_trading_days": 42.0}],
        },
        fundamentals={
            "shortName": "Enel S.p.A.",
            "trailingPE": 11.2,
            "dividendYield": 0.065,
        },
    )


def test_extract_json_block_markdown():
    text = """
    ## Riflessione Coach
    Il titolo mostra buone conferme.
    ```json
    {
        "overall_score": 8,
        "action_suggestions": ["Mantenere posizione", "Proteggere con trailing stop"],
        "risk_warnings": ["Possibile resistenza a 7.10"]
    }
    ```
    Cordiali saluti.
    """
    data = _extract_json_block(text)
    assert data["overall_score"] == 8
    assert len(data["action_suggestions"]) == 2
    assert "Possibile resistenza a 7.10" in data["risk_warnings"]


def test_run_agentic_analysis_with_mock():
    bundle = _make_dummy_bundle()
    mock_responses = {
        "technical": "Trend positivo con medie mobili rialziste.",
        "fundamental": "Bilancio solido e ottimo dividendo.",
        "cyclical": "Regime persistente Hurst H=0.62.",
        "bull": "Tesi rialzista forte con catalizzatori energetici.",
        "bear": "Attenzione ai rischi regolatori.",
        "lead": "Sintesi: probabilità a favore del trend.",
        "coach": """
            Coaching: mantieni la calma e rispetta il piano.
            Esempio di alert:
            ```json
            {
                "alert": "price > 7.00"
            }
            ```
            Procedi con cautela.
            ```json
            {
                "overall_score": 8,
                "action_suggestions": ["Monitorare area 7.10"],
                "risk_warnings": ["Rifiutare overtrading"]
            }
            ```
        """,
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)

    assert state.error is None
    assert state.technical_report is not None
    assert state.fundamental_report is not None
    assert state.cyclical_report is not None
    assert state.bull_thesis is not None
    assert state.bear_thesis is not None
    assert state.lead_synthesis is not None
    assert state.coaching_report is not None
    assert "overall_score" not in state.coaching_report
    assert "alert" in state.coaching_report
    assert "Coaching: mantieni la calma" in state.coaching_report
    assert state.overall_score == 8
    assert "Monitorare area 7.10" in state.action_suggestions
    assert "Rifiutare overtrading" in state.risk_warnings


def test_coaching_strips_trailing_raw_json():
    bundle = _make_dummy_bundle()
    mock_responses = {
        "coach": """
            Coaching text without markdown code fences for machine json.
            {
                "overall_score": 9,
                "action_suggestions": ["Take profit"],
                "risk_warnings": ["High volatility"]
            }
        """,
        "technical": "Tech report",
        "fundamental": "Fund report",
        "cyclical": "Cyc report",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)

    assert state.error is None
    assert state.overall_score == 9
    assert "overall_score" not in state.coaching_report
    assert "Coaching text without markdown code fences" in state.coaching_report
    assert "Take profit" in state.action_suggestions


def test_coaching_only_machine_json_does_not_fallback():
    bundle = _make_dummy_bundle()
    mock_responses = {
        "coach": """
            ```JSON
            {
                "overall_score": 7,
                "action_suggestions": ["Pazienza"],
                "risk_warnings": ["Nessuno"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)

    assert state.error is None
    assert state.overall_score == 7
    # Verify that coaching_report is empty and does not fall back to raw JSON
    assert state.coaching_report == ""
    assert "overall_score" not in state.coaching_report


def test_coaching_input_without_personal_context_omits_null_keys_it():
    bundle = _make_dummy_bundle()
    assert bundle.trade_context is None
    assert bundle.holding_context is None

    mock_responses = {
        "coach": """
            Coaching prospettico: attendi pullback verso 6.50.
            ```json
            {
                "overall_score": 7,
                "action_suggestions": ["Impostare alert su 6.50"],
                "risk_warnings": ["Evitare FOMO su breakout non confermato"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)
    assert state.error is None
    assert state.overall_score == 7

    # Find the call to coach in client.call_history
    coach_calls = [c for c in client.call_history if "personalizzato" in c["user"]]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "TITOLO NON IN PORTAFOGLIO" in user_prompt
    assert '"trade_context": null' not in user_prompt
    assert '"holding_context": null' not in user_prompt
    assert '"idea_context": null' not in user_prompt
    assert '"past_trades": null' not in user_prompt


def test_coaching_input_without_personal_context_omits_null_keys_en():
    bundle = _make_dummy_bundle()
    mock_responses = {
        "coach": """
            Prospective coaching: watch for consolidation.
            ```json
            {
                "overall_score": 6,
                "action_suggestions": ["Wait for confirmation"],
                "risk_warnings": ["Do not chase"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="en", client=client)
    assert state.error is None
    assert state.overall_score == 6

    coach_calls = [c for c in client.call_history if "personalized" in c["user"].lower()]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "NOT IN PORTFOLIO" in user_prompt
    assert '"trade_context": null' not in user_prompt
    assert '"holding_context": null' not in user_prompt


def test_coaching_input_with_personal_context_includes_only_active_context():
    from app.services.analysis.data_collector import TradeContext

    bundle = _make_dummy_bundle()
    bundle.trade_context = TradeContext(
        trade_id=42,
        account_name="Trading Account",
        side="LONG",
        status="OPEN",
        strategy_name="Trend Following",
        open_quantity=Decimal("100"),
        average_entry_price=Decimal("6.50"),
        current_price=Decimal("6.85"),
        unrealized_pnl=Decimal("35.00"),
        unrealized_pnl_pct=Decimal("5.38"),
        target_price=Decimal("7.50"),
        stop_loss=Decimal("6.20"),
        confidence_score=4,
        journal_notes="Test trade",
    )

    mock_responses = {
        "coach": """
            Coaching posizione aperta: mantieni stop loss a 6.20.
            ```json
            {
                "overall_score": 8,
                "action_suggestions": ["Alzare trailing stop"],
                "risk_warnings": ["Proteggere profitto"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)
    assert state.error is None
    assert state.overall_score == 8

    coach_calls = [c for c in client.call_history if "personalizzato" in c["user"]]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "CONTESTO PERSONALE DELL'UTENTE" in user_prompt
    assert '"trade_context"' in user_prompt
    assert '"average_entry_price": 6.5' in user_prompt
    assert '"holding_context"' not in user_prompt
    assert '"idea_context"' not in user_prompt


def test_coaching_exploratory_short_setup():
    bundle = _make_dummy_bundle()
    bundle.target_direction = "short"

    mock_responses = {
        "coach": """
            Coaching short: vendi alla rottura di 6.50 con stop a 6.95.
            ```json
            {
                "overall_score": 7,
                "action_suggestions": ["Sell stop sotto 6.50", "Stop loss a 6.95"],
                "risk_warnings": ["Rischio rimbalzo su supporto"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)
    assert state.error is None
    assert state.overall_score == 7

    coach_calls = [c for c in client.call_history if "personalizzato" in c["user"]]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "SETUP SHORT / RIBASSISTA" in user_prompt
    assert "SOPRA la resistenza" in user_prompt
    assert "short squeeze" in user_prompt


def test_coaching_exploratory_long_setup():
    bundle = _make_dummy_bundle()
    bundle.target_direction = "long"

    mock_responses = {
        "coach": """
            Coaching long: compra su pullback a 6.60.
            ```json
            {
                "overall_score": 8,
                "action_suggestions": ["Buy limit a 6.60"],
                "risk_warnings": ["Stop loss a 6.30"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)
    assert state.error is None
    assert state.overall_score == 8

    coach_calls = [c for c in client.call_history if "personalizzato" in c["user"]]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "SETUP LONG / RIALZISTA" in user_prompt
    assert "SOTTO i supporti" in user_prompt


def test_coaching_exploratory_agnostic_setup():
    bundle = _make_dummy_bundle()
    bundle.target_direction = "both"

    mock_responses = {
        "coach": """
            Coaching agnostico: mercato in compressione.
            ```json
            {
                "overall_score": 6,
                "action_suggestions": ["Attendere rottura 7.10 per long o 6.50 per short"],
                "risk_warnings": ["Non anticipare il breakout"]
            }
            ```
        """,
        "technical": "Tech",
        "fundamental": "Fund",
        "cyclical": "Cyc",
        "bull": "Bull",
        "bear": "Bear",
        "lead": "Lead",
    }
    client = MockChatClient(responses=mock_responses)

    state = run_agentic_analysis(bundle, language="it", client=client)
    assert state.error is None
    assert state.overall_score == 6

    coach_calls = [c for c in client.call_history if "personalizzato" in c["user"]]
    assert len(coach_calls) == 1
    user_prompt = coach_calls[0]["user"]

    assert "VALUTAZIONE AGNOSTICA: ESPLORA SIA LONG CHE SHORT" in user_prompt

