"""State container for multi-agent asset analysis pipeline."""
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class AgentAnalysisState:
    """Consolidated state passed across all stages of the multi-agent debate."""

    symbol: str
    language: str = "it"
    data_bundle: dict[str, Any] = field(default_factory=dict)

    # Stage 1: Parallel Specialist Reports
    technical_report: Optional[str] = None
    fundamental_report: Optional[str] = None
    cyclical_report: Optional[str] = None

    # Stage 2: Adversarial Debate
    bull_thesis: Optional[str] = None
    bear_thesis: Optional[str] = None
    lead_synthesis: Optional[str] = None

    # Stage 3: Coaching & Actionable Synthesis
    coaching_report: Optional[str] = None
    overall_score: Optional[int] = None
    action_suggestions: list[str] = field(default_factory=list)
    risk_warnings: list[str] = field(default_factory=list)

    # Diagnostic metadata
    model_name: Optional[str] = None
    error: Optional[str] = None
