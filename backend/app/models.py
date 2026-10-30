from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Table, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    preferences: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    accounts: Mapped[list["Account"]] = relationship(back_populates="owner")
    brokers: Mapped[list["Broker"]] = relationship(back_populates="owner")
    assets: Mapped[list["Asset"]] = relationship(back_populates="owner")
    holdings: Mapped[list["Holding"]] = relationship(back_populates="owner")
    exchanges: Mapped[list["Exchange"]] = relationship(back_populates="owner")
    trade_ideas: Mapped[list["TradeIdea"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AppSetting(TimestampMixin, Base):
    """DB-backed application settings (password policy, registration toggle, ...)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[object] = mapped_column(JSONB, nullable=False)


class Exchange(TimestampMixin, Base):
    __tablename__ = "exchanges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    mic: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    suffix: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    open_time: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    close_time: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    closed_on_weekends: Mapped[bool] = mapped_column(default=True)

    owner: Mapped["User"] = relationship(back_populates="exchanges")
    brokers: Mapped[list["Broker"]] = relationship(secondary="broker_exchanges", back_populates="exchanges")

    @property
    def euronext_code(self) -> Optional[str]:
        from app.services.euronext import get_euronext_market_code
        return get_euronext_market_code(self.mic, self.name, self.country)


broker_exchanges = Table(
    "broker_exchanges",
    Base.metadata,
    Column("broker_id", Integer, ForeignKey("brokers.id", ondelete="CASCADE"), primary_key=True),
    Column("exchange_id", Integer, ForeignKey("exchanges.id", ondelete="CASCADE"), primary_key=True),
)


class Broker(TimestampMixin, Base):
    __tablename__ = "brokers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    broker_profile: Mapped[str] = mapped_column(String(32), default="custom")
    fee_mode: Mapped[str] = mapped_column(String(32), default="fixed")
    fee_value: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    fee_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    fee_max: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    fee_us_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    fee_currency: Mapped[str] = mapped_column(String(8), default="EUR")
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    fee_tier_override: Mapped[Optional[int]] = mapped_column(nullable=True)
    capital_gain_mode: Mapped[str] = mapped_column(String(16), default="immediate")
    capital_gain_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("26"))
    capital_gain_rate_gov: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("12.50"))

    owner: Mapped[User] = relationship(back_populates="brokers")
    accounts: Mapped[list["Account"]] = relationship(back_populates="broker")
    exchanges: Mapped[list["Exchange"]] = relationship(secondary="broker_exchanges", back_populates="brokers")


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    broker_id: Mapped[Optional[int]] = mapped_column(ForeignKey("brokers.id"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    base_currency: Mapped[str] = mapped_column(String(8), default="EUR")
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))

    owner: Mapped[User] = relationship(back_populates="accounts")
    broker: Mapped[Optional[Broker]] = relationship(back_populates="accounts")
    trades: Mapped[list["Trade"]] = relationship(back_populates="account")
    holdings: Mapped[list["Holding"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Trade(TimestampMixin, Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    ticker_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tickers.id"), nullable=True, index=True)
    market: Mapped[str] = mapped_column(String(80), default="Euronext")
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    isin: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    instrument_type: Mapped[str] = mapped_column(String(32), default="stock")
    side: Mapped[str] = mapped_column(String(10), default="long")
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    strategy_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    stop_loss: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    confidence_score: Mapped[Optional[int]] = mapped_column(nullable=True)
    journal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped[Account] = relationship(back_populates="trades")
    ticker: Mapped[Optional["Ticker"]] = relationship()
    executions: Mapped[list["TradeExecution"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan"
    )
    images: Mapped[list["TradeImage"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan"
    )


class TradeExecution(TimestampMixin, Base):
    __tablename__ = "trade_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id"), index=True)
    action: Mapped[str] = mapped_column(String(8))
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    price: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    fee: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    venue: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    trade: Mapped[Trade] = relationship(back_populates="executions")


class TradeImage(TimestampMixin, Base):
    __tablename__ = "trade_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    trade_id: Mapped[int] = mapped_column(ForeignKey("trades.id"), index=True)
    original_path: Mapped[str] = mapped_column(String(255))
    annotated_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    trade: Mapped[Trade] = relationship(back_populates="images")


class DailyNote(TimestampMixin, Base):
    __tablename__ = "daily_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note_date: Mapped[date] = mapped_column(Date, index=True)
    mood: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    market_condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    market_volatility: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    short_summary: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rich_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    symbol: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)


class PositionDailySnapshot(TimestampMixin, Base):
    __tablename__ = "position_daily_snapshots"
    __table_args__ = (
        UniqueConstraint("account_id", "symbol", "snapshot_date", name="uq_snapshot_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    position_qty: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    close_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    market_value: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))


class CashLedgerEntry(TimestampMixin, Base):
    __tablename__ = "cash_ledger_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    entry_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    holding_exit_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("holding_exits.id", ondelete="CASCADE"), nullable=True, index=True
    )


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_asset_user_symbol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255))
    isin: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    instrument_type: Mapped[str] = mapped_column(String(32), default="etf")
    exchange: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")

    owner: Mapped[User] = relationship(back_populates="assets")
    bond_detail: Mapped[Optional["BondDetail"]] = relationship(
        "BondDetail", back_populates="asset", uselist=False, cascade="all, delete-orphan"
    )


class BondDetail(TimestampMixin, Base):
    __tablename__ = "bond_details"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), unique=True, index=True
    )
    bond_type: Mapped[str] = mapped_column(String(32), default="fixed")
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    maturity_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    coupon_frequency: Mapped[int] = mapped_column(Integer, default=2)
    annual_coupon_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0.0000"))
    step_up_schedule: Mapped[Optional[list[dict[str, object]]]] = mapped_column(JSONB, nullable=True)
    final_bonus_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0.0000"))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("12.50"))
    day_count_convention: Mapped[str] = mapped_column(String(32), default="ACT/ACT ICMA")

    asset: Mapped["Asset"] = relationship("Asset", back_populates="bond_detail")

class Holding(TimestampMixin, Base):
    __tablename__ = "holdings"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    avg_cost: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    accrued_interest_in: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    eligible_for_bonus: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    fee_in: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"), server_default=text("0"))
    closed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner: Mapped[User] = relationship(back_populates="holdings")
    account: Mapped[Account] = relationship(back_populates="holdings")
    asset: Mapped[Asset] = relationship()
    exits: Mapped[list["HoldingExit"]] = relationship(
        back_populates="holding", cascade="all, delete-orphan"
    )


class HoldingExit(TimestampMixin, Base):
    __tablename__ = "holding_exits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    holding_id: Mapped[int] = mapped_column(
        ForeignKey("holdings.id", ondelete="CASCADE"), index=True
    )
    exit_date: Mapped[date] = mapped_column(Date, index=True)
    exit_type: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    quantity_before: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    quantity_after: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    clean_price: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    accrued_interest_out: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal("0"))
    fees: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    taxes: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    capital_gain_tax: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    interest_tax: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    tax_mode: Mapped[str] = mapped_column(String(16), default="immediate")
    fee_in_allocated: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    coupons_received: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    bonus_received: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    gross_proceeds: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    net_proceeds: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    cost_basis: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    realized_capital_gain: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    realized_interest_income: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    previous_exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    holding: Mapped[Holding] = relationship(back_populates="exits")
    account: Mapped[Account] = relationship()
    asset: Mapped[Asset] = relationship()


class PortfolioSnapshot(TimestampMixin, Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("account_id", "snapshot_date", name="uq_portfolio_snapshot_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    total_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    total_cost: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    total_return: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    total_return_pct: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=Decimal("0"))



class Ticker(Base):
    __tablename__ = "tickers"
    __table_args__ = (
        UniqueConstraint("symbol", "market", name="uq_ticker_symbol_market"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    isin: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[str] = mapped_column(String(128), index=True)
    currency: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)


class TradeIdea(TimestampMixin, Base):
    __tablename__ = "trade_ideas"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[str] = mapped_column(String(80), default="Euronext")
    direction: Mapped[str] = mapped_column(String(8), default="long")  # "long" | "short"
    initial_price: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    trigger_price: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    trigger_condition: Mapped[str] = mapped_column(String(8), default="<=")  # "<=" | ">="
    stop_loss: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    thesis_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(20), default="watching", index=True)
    stale_days: Mapped[int] = mapped_column(Integer, default=7)
    expire_days: Mapped[int] = mapped_column(Integer, default=10)
    stale_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    triggered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trade_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trades.id", ondelete="SET NULL"), nullable=True)

    user: Mapped["User"] = relationship(back_populates="trade_ideas")
    trade: Mapped[Optional["Trade"]] = relationship()
