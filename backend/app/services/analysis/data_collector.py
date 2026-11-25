"""Data aggregator that builds a consolidated AnalysisDataBundle for agents."""
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Asset, BondDetail, Holding, Trade, TradeIdea
from app.services.analysis.cyclical import compute_cyclical_bundle
from app.services.analysis.data_providers.base import BaseDataProvider
from app.services.analysis.data_providers.yfinance_provider import YFinanceDataProvider
from app.services.analysis.technical import compute_technical_bundle


@dataclass
class HoldingContext:
    holding_id: int
    account_name: str
    quantity: Decimal
    avg_cost: Decimal
    entry_date: str
    current_market_value: Optional[Decimal] = None
    unrealized_pnl: Optional[Decimal] = None
    unrealized_pnl_pct: Optional[Decimal] = None


@dataclass
class BondContext:
    bond_type: str
    maturity_date: str
    annual_coupon_rate: Decimal
    coupon_frequency: int
    tax_rate: Decimal
    final_bonus_rate: Decimal = Decimal("0")


@dataclass
class TradeIdeaContext:
    idea_id: int
    direction: str
    trigger_price: Decimal
    stop_loss: Optional[Decimal]
    target_price: Optional[Decimal]
    thesis_notes: Optional[str]
    status: str


@dataclass
class TradeContext:
    trade_id: int
    account_name: str
    side: str
    status: str
    strategy_name: Optional[str]
    open_quantity: Decimal
    average_entry_price: Decimal
    current_price: Optional[Decimal]
    unrealized_pnl: Optional[Decimal]
    unrealized_pnl_pct: Optional[Decimal]
    target_price: Optional[Decimal]
    stop_loss: Optional[Decimal]
    confidence_score: Optional[int]
    journal_notes: Optional[str]


@dataclass
class AnalysisDataBundle:
    symbol: str
    market: str
    instrument_type: str
    current_price: Optional[Decimal]

    # Computed analytical bundles
    technical: dict[str, Any]
    cyclical: dict[str, Any]
    fundamentals: dict[str, Any]

    # User & portfolio context
    holding_context: Optional[HoldingContext] = None
    bond_context: Optional[BondContext] = None
    trade_idea_context: Optional[TradeIdeaContext] = None
    trade_context: Optional[TradeContext] = None
    past_trades_summary: list[dict[str, Any]] = field(default_factory=list)
    target_direction: Optional[str] = "both"

    def to_dict(self) -> dict[str, Any]:
        """Convert bundle to JSON-serializable dictionary for agent state."""
        return {
            "symbol": self.symbol,
            "market": self.market,
            "instrument_type": self.instrument_type,
            "current_price": float(self.current_price) if self.current_price is not None else None,
            "target_direction": self.target_direction,
            "technical": self.technical,
            "cyclical": self.cyclical,
            "fundamentals": self.fundamentals,
            "trade_context": {
                "trade_id": self.trade_context.trade_id,
                "account_name": self.trade_context.account_name,
                "side": self.trade_context.side,
                "status": self.trade_context.status,
                "strategy_name": self.trade_context.strategy_name,
                "open_quantity": float(self.trade_context.open_quantity),
                "average_entry_price": float(self.trade_context.average_entry_price),
                "current_price": float(self.trade_context.current_price)
                if self.trade_context.current_price is not None else None,
                "unrealized_pnl": float(self.trade_context.unrealized_pnl)
                if self.trade_context.unrealized_pnl is not None else None,
                "unrealized_pnl_pct": float(self.trade_context.unrealized_pnl_pct)
                if self.trade_context.unrealized_pnl_pct is not None else None,
                "target_price": float(self.trade_context.target_price)
                if self.trade_context.target_price is not None else None,
                "stop_loss": float(self.trade_context.stop_loss)
                if self.trade_context.stop_loss is not None else None,
                "confidence_score": self.trade_context.confidence_score,
                "journal_notes": self.trade_context.journal_notes,
            } if self.trade_context else None,
            "holding_context": {
                "holding_id": self.holding_context.holding_id,
                "account_name": self.holding_context.account_name,
                "quantity": float(self.holding_context.quantity),
                "avg_cost": float(self.holding_context.avg_cost),
                "entry_date": self.holding_context.entry_date,
                "current_market_value": float(self.holding_context.current_market_value)
                if self.holding_context.current_market_value is not None else None,
                "unrealized_pnl": float(self.holding_context.unrealized_pnl)
                if self.holding_context.unrealized_pnl is not None else None,
                "unrealized_pnl_pct": float(self.holding_context.unrealized_pnl_pct)
                if self.holding_context.unrealized_pnl_pct is not None else None,
            } if self.holding_context else None,
            "bond_context": {
                "bond_type": self.bond_context.bond_type,
                "maturity_date": self.bond_context.maturity_date,
                "annual_coupon_rate": float(self.bond_context.annual_coupon_rate),
                "coupon_frequency": self.bond_context.coupon_frequency,
                "tax_rate": float(self.bond_context.tax_rate),
                "final_bonus_rate": float(self.bond_context.final_bonus_rate),
            } if self.bond_context else None,
            "trade_idea_context": {
                "idea_id": self.trade_idea_context.idea_id,
                "direction": self.trade_idea_context.direction,
                "trigger_price": float(self.trade_idea_context.trigger_price),
                "stop_loss": float(self.trade_idea_context.stop_loss)
                if self.trade_idea_context.stop_loss is not None else None,
                "target_price": float(self.trade_idea_context.target_price)
                if self.trade_idea_context.target_price is not None else None,
                "thesis_notes": self.trade_idea_context.thesis_notes,
                "status": self.trade_idea_context.status,
            } if self.trade_idea_context else None,
            "past_trades_summary": self.past_trades_summary,
        }


def collect_analysis_data(
    db: Session,
    user_id: int,
    symbol: str,
    market: str = "Euronext",
    holding_id: Optional[int] = None,
    trade_idea_id: Optional[int] = None,
    trade_id: Optional[int] = None,
    target_direction: Optional[str] = "both",
    provider: Optional[BaseDataProvider] = None,
) -> AnalysisDataBundle:
    """Consolidate market data, math indicators, and DB portfolio context."""
    if provider is None:
        provider = YFinanceDataProvider()

    # 1. Fetch OHLCV and spot quote
    ohlcv = provider.fetch_ohlcv(symbol, market=market, period="2y", interval="1d")
    current_price = provider.fetch_quote(symbol, market=market)

    if current_price is None and not ohlcv.empty and "Close" in ohlcv.columns:
        current_price = Decimal(str(ohlcv["Close"].iloc[-1]))

    # 2. Compute Technical and Cyclical bundles
    technical_data = compute_technical_bundle(ohlcv)
    cyclical_data = compute_cyclical_bundle(ohlcv)
    fundamentals_data = provider.fetch_fundamentals(symbol, market=market)

    # 3. Retrieve DB context
    holding_ctx = None
    if holding_id:
        holding = db.execute(
            select(Holding).where(Holding.id == holding_id, Holding.user_id == user_id)
        ).scalar_one_or_none()
        if holding:
            market_val = (
                holding.quantity * current_price if current_price is not None else None
            )
            cost_basis = holding.quantity * holding.avg_cost
            unrealized_pnl = (market_val - cost_basis) if market_val is not None else None
            unrealized_pnl_pct = (
                (unrealized_pnl / cost_basis * Decimal("100"))
                if unrealized_pnl is not None and cost_basis > Decimal("0")
                else None
            )
            holding_ctx = HoldingContext(
                holding_id=holding.id,
                account_name=holding.account.name if holding.account else "Default",
                quantity=holding.quantity,
                avg_cost=holding.avg_cost,
                entry_date=holding.entry_date.isoformat(),
                current_market_value=market_val,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_pct=unrealized_pnl_pct,
            )

    # Check for Bond Details
    bond_ctx = None
    asset = db.execute(
        select(Asset).where(Asset.symbol == symbol, Asset.user_id == user_id)
    ).scalar_one_or_none()
    instrument_type = asset.instrument_type if asset else "stock"

    if asset and asset.bond_detail:
        bd = asset.bond_detail
        bond_ctx = BondContext(
            bond_type=bd.bond_type,
            maturity_date=bd.maturity_date.isoformat(),
            annual_coupon_rate=bd.annual_coupon_rate,
            coupon_frequency=bd.coupon_frequency,
            tax_rate=bd.tax_rate,
            final_bonus_rate=bd.final_bonus_rate,
        )

    # Check for TradeIdea context
    idea_ctx = None
    if trade_idea_id:
        idea = db.execute(
            select(TradeIdea).where(TradeIdea.id == trade_idea_id, TradeIdea.user_id == user_id)
        ).scalar_one_or_none()
        if idea:
            idea_ctx = TradeIdeaContext(
                idea_id=idea.id,
                direction=idea.direction,
                trigger_price=idea.trigger_price,
                stop_loss=idea.stop_loss,
                target_price=idea.target_price,
                thesis_notes=idea.thesis_notes,
                status=idea.status,
            )

    # Check for active Trade context
    trade_ctx = None
    if trade_id:
        trade = db.execute(
            select(Trade).where(Trade.id == trade_id, Trade.user_id == user_id)
        ).scalar_one_or_none()
        if trade:
            executions = trade.executions or []
            buys_qty = sum(e.quantity for e in executions if (e.action or "").lower() in ("buy", "buy_to_cover"))
            buys_val = sum(e.quantity * e.price for e in executions if (e.action or "").lower() in ("buy", "buy_to_cover"))
            sells_qty = sum(e.quantity for e in executions if (e.action or "").lower() in ("sell", "sell_short"))
            open_qty = buys_qty - sells_qty
            avg_entry = (buys_val / buys_qty) if buys_qty > Decimal("0") else Decimal("0")

            unrealized_pnl = None
            unrealized_pnl_pct = None
            if current_price is not None and open_qty > Decimal("0") and avg_entry > Decimal("0"):
                if trade.side == "long":
                    unrealized_pnl = (current_price - avg_entry) * open_qty
                    unrealized_pnl_pct = ((current_price - avg_entry) / avg_entry) * Decimal("100")
                else:
                    unrealized_pnl = (avg_entry - current_price) * open_qty
                    unrealized_pnl_pct = ((avg_entry - current_price) / avg_entry) * Decimal("100")

            trade_ctx = TradeContext(
                trade_id=trade.id,
                account_name=trade.account.name if trade.account else "Default",
                side=trade.side,
                status=trade.status,
                strategy_name=trade.strategy_name,
                open_quantity=open_qty,
                average_entry_price=avg_entry,
                current_price=current_price,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_pct=unrealized_pnl_pct,
                target_price=trade.target_price,
                stop_loss=trade.stop_loss,
                confidence_score=trade.confidence_score,
                journal_notes=trade.journal_notes,
            )

    # Check past closed trades for this user on this symbol
    past_trades = db.execute(
        select(Trade).where(
            Trade.user_id == user_id,
            Trade.symbol == symbol,
            Trade.status.in_(["close", "closed"]),
        )
    ).scalars().all()

    past_trades_summary = []
    for pt in past_trades[:5]:
        past_trades_summary.append({
            "id": pt.id,
            "side": pt.side,
            "strategy": pt.strategy_name,
            "closed_at": pt.closed_at.isoformat() if pt.closed_at else None,
            "close_reason": pt.close_reason,
        })

    # Resolve target direction bias
    resolved_direction = (target_direction or "both").lower()
    if trade_ctx:
        resolved_direction = (trade_ctx.side or "long").lower()
    elif idea_ctx:
        resolved_direction = (idea_ctx.direction or "long").lower()
    elif holding_ctx:
        resolved_direction = "long"
    elif resolved_direction not in ("both", "long", "short"):
        resolved_direction = "both"

    return AnalysisDataBundle(
        symbol=symbol,
        market=market,
        instrument_type=instrument_type,
        current_price=current_price,
        technical=technical_data,
        cyclical=cyclical_data,
        fundamentals=fundamentals_data,
        holding_context=holding_ctx,
        bond_context=bond_ctx,
        trade_idea_context=idea_ctx,
        trade_context=trade_ctx,
        past_trades_summary=past_trades_summary,
        target_direction=resolved_direction,
    )
