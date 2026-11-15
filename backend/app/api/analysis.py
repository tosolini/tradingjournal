"""REST API endpoints for multi-agent asset analysis and coaching."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import get_current_user
from app.models import AnalysisReport, Asset, Holding, Trade, TradeIdea, User
from app.schemas import (
    AnalysisReportDetail,
    AnalysisReportSummary,
    AnalysisRunRequest,
    AnalysisTargetItem,
)
from app.services.analysis.agents.pipeline import run_agentic_analysis
from app.services.analysis.data_collector import collect_analysis_data

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _execute_analysis_background(report_id: int):
    """Background task executing data collection and agentic pipeline."""
    with SessionLocal() as db:
        report = db.execute(
            select(AnalysisReport).where(AnalysisReport.id == report_id)
        ).scalar_one_or_none()
        if not report:
            return

        try:
            report.status = "running"
            db.commit()

            # 1. Collect data bundle
            bundle = collect_analysis_data(
                db=db,
                user_id=report.user_id,
                symbol=report.symbol,
                market=report.market,
                holding_id=report.holding_id,
                trade_idea_id=report.trade_idea_id,
                trade_id=report.trade_id,
            )

            # 2. Run multi-agent pipeline
            state = run_agentic_analysis(bundle, language=report.language)

            if state.error:
                report.status = "failed"
                report.error_message = state.error
            else:
                report.status = "completed"
                report.completed_at = datetime.now(timezone.utc)
                report.technical_report = state.technical_report
                report.fundamental_report = state.fundamental_report
                report.cyclical_report = state.cyclical_report
                report.bull_thesis = state.bull_thesis
                report.bear_thesis = state.bear_thesis
                report.lead_synthesis = state.lead_synthesis
                report.coaching_report = state.coaching_report
                report.overall_score = state.overall_score
                report.action_suggestions = state.action_suggestions
                report.risk_warnings = state.risk_warnings
                report.data_snapshot = state.data_bundle
                report.llm_model_used = state.model_name

            db.commit()
        except Exception as exc:
            db.rollback()
            report = db.execute(
                select(AnalysisReport).where(AnalysisReport.id == report_id)
            ).scalar_one_or_none()
            if report:
                report.status = "failed"
                report.error_message = str(exc)
                db.commit()


@router.get("/targets", response_model=list[AnalysisTargetItem])
def get_analysis_targets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List distinct user assets eligible for analysis (active holdings & open trade ideas)."""
    targets: list[AnalysisTargetItem] = []
    seen_keys: set[str] = set()

    # 1. Active holdings
    holdings = db.execute(
        select(Holding).where(
            Holding.user_id == current_user.id,
            Holding.closed_at.is_(None),
            Holding.quantity > Decimal("0"),
        )
    ).scalars().all()

    for h in holdings:
        asset = h.asset
        if not asset:
            continue
        key = f"holding:{asset.symbol}"
        if key not in seen_keys:
            targets.append(
                AnalysisTargetItem(
                    symbol=asset.symbol,
                    name=asset.name or asset.symbol,
                    instrument_type=asset.instrument_type or "stock",
                    market=asset.exchange or "Euronext",
                    holding_id=h.id,
                    quantity=h.quantity,
                    avg_cost=h.avg_cost,
                    target_source="holding",
                )
            )
            seen_keys.add(key)

    # 2. Watching or triggered trade ideas
    ideas = db.execute(
        select(TradeIdea).where(
            TradeIdea.user_id == current_user.id,
            TradeIdea.status.in_(["watching", "triggered"]),
        )
    ).scalars().all()

    for idea in ideas:
        key = f"idea:{idea.symbol}"
        if key not in seen_keys:
            targets.append(
                AnalysisTargetItem(
                    symbol=idea.symbol,
                    name=idea.symbol,
                    instrument_type="stock",
                    market=idea.market or "Euronext",
                    trade_idea_id=idea.id,
                    quantity=None,
                    avg_cost=idea.initial_price,
                    target_source="trade_idea",
                )
            )
            seen_keys.add(key)

    # 3. Active open trades (trading positions)
    open_trades = db.execute(
        select(Trade).where(
            Trade.user_id == current_user.id,
            Trade.status == "open",
        )
    ).scalars().all()

    for tr in open_trades:
        key = f"trade:{tr.id}"
        if key not in seen_keys:
            executions = tr.executions or []
            buys_qty = sum(e.quantity for e in executions if e.action in ("buy", "buy_to_cover"))
            buys_val = sum(e.quantity * e.price for e in executions if e.action in ("buy", "buy_to_cover"))
            sells_qty = sum(e.quantity for e in executions if e.action in ("sell", "sell_short"))
            open_qty = buys_qty - sells_qty
            avg_price = (buys_val / buys_qty) if buys_qty > Decimal("0") else Decimal("0")

            targets.append(
                AnalysisTargetItem(
                    symbol=tr.symbol,
                    name=f"Trade {tr.side.upper()} #{tr.id} ({tr.symbol})",
                    instrument_type=tr.instrument_type or "stock",
                    market=tr.market or "Euronext",
                    trade_id=tr.id,
                    quantity=open_qty,
                    avg_cost=avg_price,
                    side=tr.side,
                    stop_loss=tr.stop_loss,
                    target_price=tr.target_price,
                    target_source="trade",
                )
            )
            seen_keys.add(key)

    return targets


@router.post("/run", response_model=AnalysisReportSummary)
def start_analysis_job(
    payload: AnalysisRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Launch asynchronous multi-agent asset coaching analysis."""
    report = AnalysisReport(
        user_id=current_user.id,
        symbol=payload.symbol.strip().upper(),
        market=payload.market,
        holding_id=payload.holding_id,
        trade_idea_id=payload.trade_idea_id,
        trade_id=payload.trade_id,
        language=payload.language.lower() if payload.language in ("it", "en") else "it",
        trigger_mode="manual",
        status="pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    background_tasks.add_task(_execute_analysis_background, report.id)
    return report


@router.get("/history", response_model=list[AnalysisReportSummary])
def list_analysis_history(
    symbol: Optional[str] = None,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve historical analysis reports for the current user."""
    stmt = (
        select(AnalysisReport)
        .where(AnalysisReport.user_id == current_user.id)
        .order_by(desc(AnalysisReport.created_at))
        .limit(limit)
    )
    if symbol:
        stmt = stmt.where(AnalysisReport.symbol == symbol.strip().upper())

    return db.execute(stmt).scalars().all()


@router.get("/{analysis_id}", response_model=AnalysisReportDetail)
def get_analysis_report(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full multi-agent analysis report by ID."""
    report = db.execute(
        select(AnalysisReport).where(
            AnalysisReport.id == analysis_id,
            AnalysisReport.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Analysis report not found")
    return report


@router.delete("/{analysis_id}")
def delete_analysis_report(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an analysis report."""
    report = db.execute(
        select(AnalysisReport).where(
            AnalysisReport.id == analysis_id,
            AnalysisReport.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Analysis report not found")
    db.delete(report)
    db.commit()
    return {"ok": True}
