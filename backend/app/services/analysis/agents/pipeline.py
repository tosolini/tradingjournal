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

    # 1. Search for code fence specifically containing overall_score
    score_fence = re.search(
        r"```(?:json)?\s*(\{(?:(?!```)[\s\S])*?\"overall_score\"(?:(?!```)[\s\S])*?\})\s*```",
        text,
        re.IGNORECASE,
    )
    if score_fence:
        try:
            return json.loads(score_fence.group(1))
        except Exception:
            pass

    # 2. General code fences: try all matches, prefer one with overall_score
for m in re.finditer(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE):
        try:
            parsed = json.loads(m.group(1))
            if isinstance(parsed, dict) and "overall_score" in parsed:
                return parsed
        except Exception:
            pass

    # 3. Trailing raw JSON containing overall_score
    trailing = re.search(r"(\{\s*\"overall_score\"[\s\S]*\})\s*$", text, re.IGNORECASE)
    if trailing:
        try:
            return json.loads(trailing.group(1))
        except Exception:
            pass

    # 4. Fallback: search between first '{' and last '}'
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
        is_en = language.startswith("en")

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
            msg = (
                f"Analyze technical indicators and price action for {bundle.symbol}:\n{tech_input}"
                if is_en
                else f"Analizza i dati tecnici per {bundle.symbol}:\n{tech_input}"
            )
            return client.generate(prompts["technical"], msg)

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
            msg = (
                f"Analyze fundamentals or fixed income parameters for {bundle.symbol}:\n{fund_input}"
                if is_en
                else f"Analizza i fondamentali o parametri obbligazionari per {bundle.symbol}:\n{fund_input}"
            )
            return client.generate(prompts["fundamental"], msg)

        def run_cyclical():
            cyc_input = json.dumps(
                {
                    "symbol": bundle.symbol,
                    "cyclical_analysis": bundle_dict["cyclical"],
                },
                indent=2,
            )
            msg = (
                f"Analyze market cycles and fractal regime (Hurst Exponent) for {bundle.symbol}:\n{cyc_input}"
                if is_en
                else f"Analizza i cicli e il regime frattale (Hurst) per {bundle.symbol}:\n{cyc_input}"
            )
            return client.generate(prompts["cyclical"], msg)

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
        header_tech = "=== TECHNICAL REPORT ===" if is_en else "=== REPORT TECNICO ==="
        header_fund = "=== FUNDAMENTAL REPORT ===" if is_en else "=== REPORT FONDAMENTALE ==="
        header_cyc = "=== CYCLICAL REPORT ===" if is_en else "=== REPORT CICLICO ==="

        analyst_brief = (
            f"{header_tech}\n{state.technical_report}\n\n"
            f"{header_fund}\n{state.fundamental_report}\n\n"
            f"{header_cyc}\n{state.cyclical_report}\n"
        )

        def run_bull():
            msg = (
                f"Analytic data collected for {bundle.symbol}:\n{analyst_brief}\n"
                f"Formulate your best institutional bull thesis."
                if is_en
                else f"Dati analitici raccolti per {bundle.symbol}:\n{analyst_brief}\n"
                f"Formula la tua migliore tesi rialzista."
            )
            return client.generate(prompts["bull"], msg)

        def run_bear():
            msg = (
                f"Analytic data collected for {bundle.symbol}:\n{analyst_brief}\n"
                f"Formulate your best institutional bear thesis and key risks."
                if is_en
                else f"Dati analitici raccolti per {bundle.symbol}:\n{analyst_brief}\n"
                f"Formula la tua migliore tesi ribassista e i rischi."
            )
            return client.generate(prompts["bear"], msg)

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut_bull = executor.submit(run_bull)
            fut_bear = executor.submit(run_bear)

            state.bull_thesis = fut_bull.result()
            state.bear_thesis = fut_bear.result()

        # -------------------------------------------------------------
        # Stage 3: Lead Researcher Synthesis
        # -------------------------------------------------------------
        header_bull = "=== BULL THESIS ===" if is_en else "=== TESI BULL ==="
        header_bear = "=== BEAR THESIS ===" if is_en else "=== TESI BEAR ==="
        debate_brief = (
            f"{analyst_brief}\n"
            f"{header_bull}\n{state.bull_thesis}\n\n"
            f"{header_bear}\n{state.bear_thesis}\n"
        )
        lead_msg = (
            f"Synthesize the debate and committee findings for {bundle.symbol}:\n{debate_brief}"
            if is_en
            else f"Sintetizza il dibattito su {bundle.symbol}:\n{debate_brief}"
        )
        state.lead_synthesis = client.generate(prompts["lead"], lead_msg)

        # -------------------------------------------------------------
        # Stage 4: Personal Coach Guidance & JSON Extraction
        # -------------------------------------------------------------
        header_comm = (
            "=== INVESTMENT COMMITTEE SYNTHESIS ==="
            if is_en
            else "=== SINTESI DELLA COMMISSIONE D'INVESTIMENTO ==="
        )
        header_ctx = (
            "=== USER PERSONAL CONTEXT ON ASSET (OPEN TRADE / POSITION / HOLDING) ==="
            if is_en
            else "=== CONTESTO PERSONALE DELL'UTENTE SUL TITOLO (POSIZIONE APERTA / TRADE / HOLDING) ==="
        )
        coach_input = (
            f"{header_comm}\n{state.lead_synthesis}\n\n"
            f"{header_ctx}\n"
            f"{json.dumps({'trade_context': bundle_dict.get('trade_context'), 'holding_context': bundle_dict.get('holding_context'), 'idea_context': bundle_dict.get('trade_idea_context'), 'past_trades': bundle_dict.get('past_trades_summary')}, indent=2)}\n"
        )
        coach_msg = (
            f"Provide personalized trading coaching for {bundle.symbol}:\n{coach_input}"
            if is_en
            else f"Fornisci il coaching personalizzato per {bundle.symbol}:\n{coach_input}"
        )
        coaching_raw = client.generate(prompts["coach"], coach_msg)

        # Extract structured outputs
        parsed_json = _extract_json_block(coaching_raw)
        state.overall_score = parsed_json.get("overall_score")
        state.action_suggestions = parsed_json.get("action_suggestions", [])
        state.risk_warnings = parsed_json.get("risk_warnings", [])

        # Strip machine JSON block from coaching_report to keep the text clean:
        # specifically remove the overall_score block (both fenced and trailing raw JSON),
        # without deleting legitimate examples or code blocks.
        cleaned_coaching = re.sub(
            r"```(?:json)?\s*\{(?:(?!```)[\s\S])*?\"overall_score\"(?:(?!```)[\s\S])*?\}\s*```",
            "",
            coaching_raw,
            flags=re.IGNORECASE,
        ).strip()
        cleaned_coaching = re.sub(
            r"\{\s*\"overall_score\"[\s\S]*\}\s*$", "", cleaned_coaching, flags=re.IGNORECASE
        ).strip()
        state.coaching_report = cleaned_coaching if cleaned_coaching else coaching_raw

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
