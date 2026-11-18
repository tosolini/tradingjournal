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
    for m in re.finditer(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, flags=re.IGNORECASE):
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

        has_trade = bundle_dict.get("trade_context") is not None
        has_holding = bundle_dict.get("holding_context") is not None
        has_idea = bundle_dict.get("trade_idea_context") is not None
        past_trades = bundle_dict.get("past_trades_summary")
        has_past = bool(past_trades)

        has_personal_context = has_trade or has_holding or has_idea or has_past
        target_dir = str(bundle_dict.get("target_direction") or "both").lower()
        if target_dir not in ("both", "long", "short"):
            target_dir = "both"

        if has_personal_context:
            header_ctx = (
                "=== USER PERSONAL CONTEXT ON ASSET (OPEN TRADE / POSITION / HOLDING) ==="
                if is_en
                else "=== CONTESTO PERSONALE DELL'UTENTE SUL TITOLO (POSIZIONE APERTA / TRADE / HOLDING) ==="
            )
            context_data = {}
            if has_trade:
                context_data["trade_context"] = bundle_dict["trade_context"]
            if has_holding:
                context_data["holding_context"] = bundle_dict["holding_context"]
            if has_idea:
                context_data["idea_context"] = bundle_dict["trade_idea_context"]
            if has_past:
                context_data["past_trades"] = past_trades

            ctx_text = f"{header_ctx}\n{json.dumps(context_data, indent=2)}\n"
        else:
            # Asset in exploration / watchlist (no personal context)
            if target_dir == "short":
                header_ctx = (
                    "=== USER POSITION STATUS: NOT IN PORTFOLIO (EXPLORATORY SHORT SETUP EVALUATION) ==="
                    if is_en
                    else "=== STATO POSIZIONE UTENTE: TITOLO NON IN PORTAFOGLIO (VALUTAZIONE PROSPETTICA SETUP SHORT / RIBASSISTA) ==="
                )
                ctx_text = (
                    f"{header_ctx}\n"
                    + (
                        "The user DOES NOT currently hold this asset and is exploring a potential SHORT (Bearish / Short Selling) setup.\n"
                        "Provide prospective SHORT coaching directly:\n"
                        "- Actionable short entry setup/triggers (e.g. breakdown below key support, bearish rejection at resistance);\n"
                        "- Invalidation / Stop Loss levels placed strictly ABOVE key technical resistance or recent swing highs;\n"
                        "- Downside profit targets and favorable Risk/Reward ratio calculation;\n"
                        "- Position sizing discipline and specific short-selling risks (e.g. short squeeze risk, borrowing/overnight fees, counter-trend risks)."
                        if is_en
                        else "L'utente NON possiede attualmente questo titolo e sta valutando un potenziale setup SHORT (Ribassista / Vendita allo scoperto).\n"
                        "Fornisci direttamente un coaching prospettico SHORT:\n"
                        "- Setup e trigger di ingresso short (es. rottura/breakdown di supporto chiave, rigetto ribassista o pullback verso resistenza);\n"
                        "- Livello di invalidazione / Stop Loss posizionato rigorosamente SOPRA la resistenza tecnica o massimo di swing recente;\n"
                        "- Target di profitto al ribasso e calcolo del rapporto Rischio/Rendimento (R:R);\n"
                        "- Linee guida di dimensionamento del rischio e avvertenze specifiche per lo short selling (es. rischio short squeeze, costi di prestito/mantenimento overnight, rischio contro-trend)."
                    )
                    + "\n"
                )
            elif target_dir == "long":
                header_ctx = (
                    "=== USER POSITION STATUS: NOT IN PORTFOLIO (EXPLORATORY LONG SETUP EVALUATION) ==="
                    if is_en
                    else "=== STATO POSIZIONE UTENTE: TITOLO NON IN PORTAFOGLIO (VALUTAZIONE PROSPETTICA SETUP LONG / RIALZISTA) ==="
                )
                ctx_text = (
                    f"{header_ctx}\n"
                    + (
                        "The user DOES NOT currently hold this asset and is exploring a potential LONG (Bullish / Buy) setup.\n"
                        "Provide prospective LONG coaching directly:\n"
                        "- Actionable entry setup/triggers (e.g. breakout above resistance with volume, confirmation pullback to support);\n"
                        "- Invalidation / Stop Loss levels placed strictly BELOW key technical supports or recent swing lows;\n"
                        "- Upside profit targets and Risk/Reward assessment;\n"
                        "- Position sizing discipline and emotional discipline (avoiding FOMO or chasing extended green candles)."
                        if is_en
                        else "L'utente NON possiede attualmente questo titolo e sta valutando un potenziale setup LONG (Rialzista / Acquisto).\n"
                        "Fornisci direttamente un coaching prospettico LONG:\n"
                        "- Setup e trigger di ingresso (es. breakout confermato di resistenza con volumi, pullback su supporto chiave);\n"
                        "- Livello di invalidazione / Stop Loss posizionato rigorosamente SOTTO i supporti tecnici o minimi di swing recenti;\n"
                        "- Target di profitto al rialzo e valutazione del rapporto Rischio/Rendimento (R:R);\n"
                        "- Dimensionamento disciplinato della posizione ed errori emotivi da evitare (es. FOMO o inseguire candele verdi estese)."
                    )
                    + "\n"
                )
            else:
                header_ctx = (
                    "=== USER POSITION STATUS: NOT IN PORTFOLIO (AGNOSTIC EXPLORATION: EVALUATE BOTH LONG & SHORT) ==="
                    if is_en
                    else "=== STATO POSIZIONE UTENTE: TITOLO NON IN PORTAFOGLIO (VALUTAZIONE AGNOSTICA: ESPLORA SIA LONG CHE SHORT) ==="
                )
                ctx_text = (
                    f"{header_ctx}\n"
                    + (
                        "The user DOES NOT currently hold this asset and has NO prior directional bias (agnostic / exploring both LONG and SHORT).\n"
                        "Based on the committee synthesis, fractal regime, and technical/fundamental indicators, determine the most favorable asymmetric setup:\n"
                        "- If the dominant evidence is Bullish: recommend a prospective LONG setup with entry triggers and stop loss below support;\n"
                        "- If the dominant evidence is Bearish: recommend a prospective SHORT setup with breakdown triggers and stop loss above resistance;\n"
                        "- If neutral/consolidating: outline dual boundary triggers (what would trigger a Long vs what would trigger a Short) or advise waiting."
                        if is_en
                        else "L'utente NON possiede attualmente questo titolo e non ha espresso un bias direzionale a priori (agnostico / valuta sia LONG che SHORT).\n"
                        "In base alla sintesi della commissione, al regime frattale/ciclico e agli indicatori tecnici/fondamentali, determina l'opportunità asimmetrica più favorevole:\n"
                        "- Se l'evidenza dominante è Rialzista: raccomanda un setup prospettico LONG con trigger di ingresso e stop loss sotto il supporto;\n"
                        "- Se l'evidenza dominante è Ribassista: raccomanda un setup prospettico SHORT con trigger di rottura e stop loss sopra la resistenza;\n"
                        "- Se la situazione è neutrale/in congestione: definisci i trigger per entrambi gli scenari (condizioni per il Long vs condizioni per lo Short) oppure consiglia di attendere una direzione chiara."
                    )
                    + "\n"
                )

        coach_input = f"{header_comm}\n{state.lead_synthesis}\n\n{ctx_text}"
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
        state.coaching_report = cleaned_coaching

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
