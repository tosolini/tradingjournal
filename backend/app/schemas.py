from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    role: str
    timezone: Optional[str] = None
    is_active: bool = True
    must_change_password: bool = False
    last_login_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class UserPreferencesResponse(BaseModel):
    preferences: dict[str, Any] = Field(default_factory=dict)


class UserPreferencesUpdate(BaseModel):
    preferences: dict[str, Any] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    timezone: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8)


class AdminUserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=8)
    role: str = "user"
    must_change_password: bool = True


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[str] = None
    is_active: Optional[bool] = None
    must_change_password: Optional[bool] = None


class PasswordPolicy(BaseModel):
    min_length: int = Field(default=12, ge=1, le=128)
    max_length: int = Field(default=128, ge=1, le=1024)
    require_digit: bool = False
    require_uppercase: bool = False
    require_symbol: bool = False
    reject_common: bool = True


class AppSettingsResponse(BaseModel):
    registration_open: bool
    password_policy: PasswordPolicy


class AppSettingsUpdate(BaseModel):
    registration_open: Optional[bool] = None
    password_policy: Optional[PasswordPolicy] = None


class AccountCreate(BaseModel):
    name: str
    broker_id: int | None = None
    base_currency: str = "EUR"
    cash_balance: Decimal = Decimal("0")


class AccountUpdate(BaseModel):
    name: str | None = None
    broker_id: int | None = None
    base_currency: str | None = None
    cash_balance: Decimal | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    broker_id: int | None
    broker_name: str | None = None
    base_currency: str
    cash_balance: Decimal

    model_config = ConfigDict(from_attributes=True)


class CashLedgerCreate(BaseModel):
    account_id: int
    entry_type: str  # "deposit" | "withdrawal"
    amount: Decimal
    description: Optional[str] = None
    entry_date: Optional[date] = None


class CashLedgerUpdate(BaseModel):
    entry_type: Optional[str] = None
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    entry_date: Optional[date] = None


class CashLedgerResponse(BaseModel):
    id: int
    account_id: int
    entry_type: str
    amount: Decimal
    description: Optional[str] = None
    entry_date: date

    model_config = ConfigDict(from_attributes=True)


class BrokerCreate(BaseModel):
    name: str
    fee_mode: str = "fixed"
    fee_value: Decimal = Decimal("0")
    fee_currency: str = "EUR"
    capital_gain_mode: str = "immediate"
    capital_gain_rate: Decimal = Decimal("26")


class BrokerUpdate(BaseModel):
    name: str | None = None
    fee_mode: str | None = None
    fee_value: Decimal | None = None
    fee_currency: str | None = None
    capital_gain_mode: str | None = None
    capital_gain_rate: Decimal | None = None


class ExchangeCreate(BaseModel):
    name: str
    mic: str | None = None
    suffix: str | None = None
    country: str | None = None
    currency: str = "EUR"
    timezone: str | None = None
    open_time: str | None = None
    close_time: str | None = None
    closed_on_weekends: bool = True


class ExchangeUpdate(BaseModel):
    name: str | None = None
    mic: str | None = None
    suffix: str | None = None
    country: str | None = None
    currency: str | None = None
    timezone: str | None = None
    open_time: str | None = None
    close_time: str | None = None
    closed_on_weekends: bool | None = None


class ExchangeResponse(BaseModel):
    id: int
    name: str
    mic: str | None
    suffix: str | None
    country: str | None
    currency: str
    timezone: str | None
    open_time: str | None
    close_time: str | None
    closed_on_weekends: bool

    model_config = ConfigDict(from_attributes=True)


class BrokerResponse(BaseModel):
    id: int
    name: str
    fee_mode: str
    fee_value: Decimal
    fee_currency: str
    capital_gain_mode: str
    capital_gain_rate: Decimal
    exchanges: list["ExchangeResponse"] = []

    model_config = ConfigDict(from_attributes=True)


class TradeCreate(BaseModel):
    account_id: int
    market: str = "Euronext"
    symbol: str
    isin: Optional[str] = None
    ticker_id: Optional[int] = None
    instrument_type: str = "stock"
    side: str = "long"
    status: str = "open"
    strategy_name: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    target_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None
    confidence_score: Optional[int] = None
    journal_notes: Optional[str] = None


class TradeUpdate(BaseModel):
    account_id: Optional[int] = None
    market: Optional[str] = None
    symbol: Optional[str] = None
    isin: Optional[str] = None
    ticker_id: Optional[int] = None
    instrument_type: Optional[str] = None
    side: Optional[str] = None
    status: Optional[str] = None
    strategy_name: Optional[str] = None
    tags: Optional[list[str]] = None
    target_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None
    confidence_score: Optional[int] = None
    journal_notes: Optional[str] = None


class TradeResponse(BaseModel):
    id: int
    account_id: int
    ticker_id: Optional[int] = None
    market: str
    symbol: str
    isin: Optional[str] = None
    side: str
    status: str
    strategy_name: Optional[str]
    tags: list[str]
    target_price: Optional[Decimal]
    stop_loss: Optional[Decimal]
    confidence_score: Optional[int]
    journal_notes: Optional[str]
    account_currency: Optional[str] = None
    close_reason: Optional[str] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    average_entry_price: Optional[Decimal] = None
    average_exit_price: Optional[Decimal] = None
    entry_total: Optional[Decimal] = None
    exit_total: Optional[Decimal] = None
    open_position_qty: Optional[Decimal] = None
    hold_duration_hours: Optional[Decimal] = None
    net_return: Optional[Decimal] = None
    return_pct: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class ExecutionCreate(BaseModel):
    action: str
    executed_at: datetime
    quantity: Decimal
    price: Decimal
    fee: Decimal = Decimal("0")
    currency: str = "EUR"
    venue: Optional[str] = None
    note: Optional[str] = None


class ExecutionUpdate(BaseModel):
    action: Optional[str] = None
    executed_at: Optional[datetime] = None
    quantity: Optional[Decimal] = None
    price: Optional[Decimal] = None
    fee: Optional[Decimal] = None
    currency: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None


class ExecutionResponse(BaseModel):
    id: int
    trade_id: int
    action: str
    executed_at: datetime
    quantity: Decimal
    price: Decimal
    fee: Decimal
    currency: str

    model_config = ConfigDict(from_attributes=True)


class TradeCloseRequest(BaseModel):
    executed_at: datetime
    price: Decimal
    close_reason: str = "manual"
    note: Optional[str] = None


class TradeClosureSummary(BaseModel):
    closed_at: datetime
    close_reason: Optional[str]
    exit_action: str
    exit_price: Decimal
    exit_fee: Decimal
    exit_currency: str
    gross_pnl: Decimal
    net_pnl: Decimal
    capital_gain_mode: str
    capital_gain_rate: Decimal
    capital_gain_tax_estimate: Optional[Decimal] = None
    tax_note: Optional[str] = None
    total_fees: Decimal


class TradeImageResponse(BaseModel):
    id: int
    trade_id: int
    original_path: str
    annotated_path: Optional[str]
    mime_type: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class RecentExecutionResponse(BaseModel):
    id: int
    trade_id: int
    trade_symbol: str
    action: str
    executed_at: datetime
    quantity: Decimal
    price: Decimal
    fee: Decimal
    currency: str


class TradeDetailResponse(BaseModel):
    trade: TradeResponse
    executions: list[ExecutionResponse]
    images: list[TradeImageResponse]
    pnl: dict | None
    closure: TradeClosureSummary | None = None
    current_price: Decimal | None = None


class DailyNoteCreate(BaseModel):
    note_date: date
    mood: Optional[str] = None
    market_condition: Optional[str] = None
    market_volatility: Optional[str] = None
    short_summary: Optional[str] = None
    rich_text: Optional[str] = None
    symbol: Optional[str] = None


class DailyNoteUpdate(BaseModel):
    note_date: Optional[date] = None
    mood: Optional[str] = None
    market_condition: Optional[str] = None
    market_volatility: Optional[str] = None
    short_summary: Optional[str] = None
    rich_text: Optional[str] = None
    symbol: Optional[str] = None


class MarketConditionTagRenameRequest(BaseModel):
    old_tag: str
    new_tag: str


class MarketConditionTagDeleteRequest(BaseModel):
    tag: str


class DailyNoteResponse(BaseModel):
    id: int
    note_date: date
    mood: Optional[str]
    market_condition: Optional[str]
    market_volatility: Optional[str]
    short_summary: Optional[str]
    rich_text: Optional[str]
    symbol: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class SnapshotResponse(BaseModel):
    id: int
    account_id: int
    symbol: str
    snapshot_date: date
    position_qty: Decimal
    close_price: Decimal
    market_value: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal

    model_config = ConfigDict(from_attributes=True)


class AssetCreate(BaseModel):
    symbol: str
    name: str
    isin: str | None = None
    instrument_type: str = "etf"
    exchange: str | None = None
    currency: str = "EUR"


class AssetUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    isin: str | None = None
    instrument_type: str | None = None
    exchange: str | None = None
    currency: str | None = None


class AssetResponse(BaseModel):
    id: int
    symbol: str
    name: str
    isin: str | None
    instrument_type: str
    exchange: str | None
    currency: str

    model_config = ConfigDict(from_attributes=True)


class HoldingCreate(BaseModel):
    account_id: int
    asset_id: int
    quantity: Decimal
    avg_cost: Decimal = Decimal("0")
    entry_date: date
    exit_date: date | None = None


class HoldingUpdate(BaseModel):
    quantity: Decimal | None = None
    avg_cost: Decimal | None = None
    entry_date: date | None = None
    exit_date: date | None = None


class HoldingResponse(BaseModel):
    id: int
    account_id: int
    asset_id: int
    quantity: Decimal
    avg_cost: Decimal
    entry_date: date
    exit_date: date | None = None

    model_config = ConfigDict(from_attributes=True)


class HoldingDetailResponse(BaseModel):
    id: int
    account_id: int
    asset_id: int
    asset_symbol: str
    asset_name: str
    instrument_type: str
    asset_currency: str
    quantity: Decimal
    avg_cost: Decimal
    entry_date: date
    exit_date: date | None = None
    hold_duration_days: int | None = None
    current_price: Decimal = Decimal("0")
    market_value: Decimal = Decimal("0")
    return_value: Decimal = Decimal("0")
    return_pct: Decimal = Decimal("0")


class PortfolioSummaryResponse(BaseModel):
    account_id: int
    account_name: str
    total_value: Decimal = Decimal("0")
    total_cost: Decimal = Decimal("0")
    total_return: Decimal = Decimal("0")
    total_return_pct: Decimal = Decimal("0")
    holdings_count: int = 0


class PortfolioSnapshotResponse(BaseModel):
    id: int
    account_id: int
    snapshot_date: date
    total_value: Decimal
    total_cost: Decimal
    total_return: Decimal
    total_return_pct: Decimal

    model_config = ConfigDict(from_attributes=True)


class PortfolioHistoryPoint(BaseModel):
    date: str
    value: float
    cost: float
    return_pct: float


class DailyPnlPoint(BaseModel):
    date: str
    total_value: Decimal
    total_cost: Decimal
    total_return: Decimal
    day_pnl: Decimal
    day_pnl_pct: Decimal
    cumulative_pnl: Decimal
    net_cash_flow: Decimal = Decimal("0")


class AllAssetsPnlPoint(BaseModel):
    date: str
    holdings_value: Decimal
    trades_value: Decimal
    total_value: Decimal
    day_pnl: Decimal
    day_pnl_pct: Decimal
    cumulative_pnl: Decimal
    net_cash_flow: Decimal = Decimal("0")


class TickerResponse(BaseModel):
    id: int
    name: str
    isin: Optional[str] = None
    symbol: str
    market: str
    currency: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TickerImportResult(BaseModel):
    imported: int
    updated: int
    skipped: int
    total: int
