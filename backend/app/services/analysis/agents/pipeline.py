"""Pipeline orchestrator for the multi-agent coaching and asset analysis system."""
import json
import logging
import re
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from app.services.analysis.agents.llm_factory import BaseChatClient, get_llm_client
from app.services.analysis.agents.prompts import SYSTEM_PROMPTS
from app.services.analysis.agents.state import AgentAnalysisState
from app.services.analysis.data_collector import AnalysisDataBundle

logger = logging.getLogger(__name__)


def _extract_json_block(text: str) -> dict:
    """Robust extractor of JSON objects inside Markdown code fences or raw text."""
    if not text:
        return {}
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # Fallback: search for first '{' and last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    return {}


def run_agentic_analysis(
    bundle: AnalysisDataBundle,
    language: str = "it",
    client: Optional[BaseChatClient] = None,
    max_workers: int = 3,
) -> AgentAnalysisState:
    """Execute the multi-agent debate and coaching pipeline."""
    lang = language.lower() if language.lower() in ("it", "en") else "it"
    prompts = SYSTEM_PROMPTS.get(lang, SYSTEM_PROMPTS["it"])

    if client is None:
        client = get_llm_client()

    state = AgentAnalysisState(
        symbol=bundle.symbol,
        language=lang,
        data_bundle=bundle.to_dict(),
        model_name=getattr(client, "model", "generic-llm"),
    )

    try:
        # -------------------------------------------------------------
        # Stage 1: Parallel Specialist Analysts
        # -------------------------------------------------------------
        bundle_dict = bundle.to_dict()

        def run_technical():
            tech_input = json.dumps(
                {
                    "symbol": bundle.symbol,
                    "market": bundle.market,
                    "current_price": bundle_dict["current_price"],
                    "technical_indicators": bundle_dict["technical"],
                },
                indent=2,
            )
            return client.generate(
                prompts["technical"],
                f"Analizza i dati tecnici per {bundle.symbol}:\n{tech_input}",
            )

        def run_fundamental():
            fund_input = json.dumps(
                {
                    "symbol": bundle.symbol,
                    "instrument_type": bundle.instrument_type,
                    "fundamentals": bundle_dict["fundamentals"],
                    "bond_details": bundle_dict["bond_context"],
                },
                indent=2,
            )
            return client.generate(
                prompts["fundamental"],
                f"Analizza i fondamentali o parametri obbligazionari per {bundle.symbol}:\n{fund_input}",
            )

        def run_cyclical():
            cyc_input = json.dumps(
                {
                    "symbol": bundle.symbol,
                    "cyclical_analysis": bundle_dict["cyclical"],
                },
                indent=2,
            )
            return client.generate(
                prompts["cyclical"],
                f"Analizza i cicli e il regime frattale (Hurst) per {bundle.symbol}:\n{cyc_input}",
            )

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            fut_tech = executor.submit(run_technical)
            fut_fund = executor.submit(run_fundamental)
            fut_cyc = executor.submit(run_cyclical)

            state.technical_report = fut_tech.result()
            state.fundamental_report = fut_fund.result()
            state.cyclical_report = fut_cyc.result()

        # -------------------------------------------------------------
        # Stage 2: Adversarial Debate (Bull vs Bear)
        # -------------------------------------------------------------
        analyst_brief = (
            f"=== REPORT TECNICO ===\n{state.technical_report}\n\n"
            f"=== REPORT FONDAMENTALE ===\n{state.fundamental_report}\n\n"
            f"=== REPORT CICLICO ===\n{state.cyclical_report}\n"
        )

        def run_bull():
            return client.generate(
                prompts["bull"],
                f"Dati analitici raccolti per {bundle.symbol}:\n{analyst_brief}\n"
                f"Formula la tua migliore tesi rialzista.",
            )

        def run_bear():
            return client.generate(
                prompts["bear"],
                f"Dati analitici raccolti per {bundle.symbol}:\n{analyst_brief}\n"
                f"Formula la tua migliore tesi ribassista e i rischi.",
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_bull = executor.submit(run_bull)
            fut_bear = executor.submit(run_bear)

            state.bull_thesis = fut_bull.result()
            state.bear_thesis = fut_bear.result()

        # -------------------------------------------------------------
        # Stage 3: Lead Researcher Synthesis
        # -------------------------------------------------------------
        debate_brief = (
            f"{analyst_brief}\n"
            f"=== TESI BULL ===\n{state.bull_thesis}\n\n"
            f"=== TESI BEAR ===\n{state.bear_thesis}\n"
        )
        state.lead_synthesis = client.generate(
            prompts["lead"],
            f"Sintetizza il dibattito su {bundle.symbol}:\n{debate_brief}",
        )

        # -------------------------------------------------------------
        # Stage 4: Personal Coach Guidance & JSON Extraction
        # -------------------------------------------------------------
        coach_input = (
            f"=== SINTESI DELLA COMMISSIONE D'INVESTIMENTO ===\n{state.lead_synthesis}\n\n"
            f"=== CONTESTO PERSONALE DELL'UTENTE SUL TITOLO ===\n"
            f"{json.dumps({'holding': bundle_dict['holding_context'], 'idea': bundle_dict['trade_idea_context'], 'past_trades': bundle_dict['past_trades_summary']}, indent=2)}\n"
        )
        coaching_raw = client.generate(
            prompts["coach"],
            f"Fornisci il coaching personalizzato per {bundle.symbol}:\n{coach_input}",
        )
        state.coaching_report = coaching_raw

        # Extract structured outputs
        parsed_json = _extract_json_block(coaching_raw)
        state.overall_score = parsed_json.get("overall_score")
        state.action_suggestions = parsed_json.get("action_suggestions", [])
        state.risk_warnings = parsed_json.get("risk_warnings", [])

        # Fallback score if parser missed it
        if state.overall_score is None:
            score_match = re.search(r"(?:score|voto|rating)\s*[:=]\s*(\d+)", coaching_raw, re.IGNORECASE)
            if score_match:
                state.overall_score = min(10, max(1, int(score_match.group(1))))
            else:
                state.overall_score = 6

    except Exception as exc:
        logger.exception("Error executing agent analysis pipeline for %s", bundle.symbol)
        state.error = str(exc)

    return state
