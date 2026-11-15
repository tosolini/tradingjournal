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
    assert "```json" not in state.coaching_report
    assert "Coaching: mantieni la calma" in state.coaching_report
    assert state.overall_score == 8
    assert "Monitorare area 7.10" in state.action_suggestions
    assert "Rifiutare overtrading" in state.risk_warnings
