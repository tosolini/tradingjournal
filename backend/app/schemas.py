from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


def _parse_locale_decimal(v: Any) -> Any:
    if isinstance(v, str):
        cleaned = v.strip().replace(" ", "").replace("'", "")
        if not cleaned:
            return Decimal("0")
        if "," in cleaned and "." in cleaned:
            last_comma = cleaned.rfind(",")
            last_dot = cleaned.rfind(".")
            if last_comma > last_dot:
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        return Decimal(cleaned)
    return v


def _parse_optional_locale_decimal(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return _parse_locale_decimal(v)


LocaleDecimal = Annotated[Decimal, BeforeValidator(_parse_locale_decimal)]
OptionalLocaleDecimal = Annotated[Optional[Decimal], BeforeValidator(_parse_optional_locale_decimal)]

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
    entry_type: str  # "deposit" | "withdrawal" | "coupon" | "bond_bonus" | "bond_redemption" | "dividend" | "asset_sale"
    amount: LocaleDecimal
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
    broker_profile: str = "custom"
    fee_mode: str = "fixed"
    fee_value: Decimal = Decimal("0")
    fee_min: Decimal | None = None
    fee_max: Decimal | None = None
    fee_us_value: Decimal | None = None
    fee_currency: str = "EUR"
    monthly_fee: Decimal = Decimal("0")
    fee_tier_override: int | None = None
    capital_gain_mode: str = "immediate"
    capital_gain_rate: Decimal = Decimal("26")
    capital_gain_rate_gov: Decimal = Decimal("12.50")


class BrokerUpdate(BaseModel):
    name: str | None = None
    broker_profile: str | None = None
    fee_mode: str | None = None
    fee_value: Decimal | None = None
    fee_min: Decimal | None = None
    fee_max: Decimal | None = None
    fee_us_value: Decimal | None = None
    fee_currency: str | None = None
    monthly_fee: Decimal | None = None
    fee_tier_override: int | None = None
    capital_gain_mode: str | None = None
    capital_gain_rate: Decimal | None = None
    capital_gain_rate_gov: Decimal | None = None


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
    euronext_code: str | None = None

    model_config = ConfigDict(from_attributes=True)


class BrokerResponse(BaseModel):
    id: int
    name: str
    broker_profile: str = "custom"
    fee_mode: str
    fee_value: Decimal
    fee_min: Decimal | None = None
    fee_max: Decimal | None = None
    fee_us_value: Decimal | None = None
    fee_currency: str
    monthly_fee: Decimal = Decimal("0")
    fee_tier_override: int | None = None
    capital_gain_mode: str
    capital_gain_rate: Decimal
    capital_gain_rate_gov: Decimal = Decimal("12.50")
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
    target_price: OptionalLocaleDecimal = None
    stop_loss: OptionalLocaleDecimal = None
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
    target_price: OptionalLocaleDecimal = None
    stop_loss: OptionalLocaleDecimal = None
    confidence_score: Optional[int] = None
    journal_notes: Optional[str] = None


class TradeResponse(BaseModel):
    id: int
    account_id: int
    ticker_id: Optional[int] = None
    market: str
    symbol: str
    isin: Optional[str] = None
    instrument_type: str = "stock"
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
    quantity: LocaleDecimal
    price: LocaleDecimal
    fee: LocaleDecimal = Decimal("0")
    currency: str = "EUR"
    venue: Optional[str] = None
    note: Optional[str] = None


class ExecutionUpdate(BaseModel):
    action: Optional[str] = None
    executed_at: Optional[datetime] = None
    quantity: OptionalLocaleDecimal = None
    price: OptionalLocaleDecimal = None
    fee: OptionalLocaleDecimal = None
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
    instrument_type: str = "stock"
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


class BondDetailCreate(BaseModel):
    bond_type: str = "fixed"
    issue_date: date | None = None
    maturity_date: date
    coupon_frequency: int = 2
    annual_coupon_rate: LocaleDecimal = Decimal("0")
    step_up_schedule: list[dict[str, Any]] | None = None
    final_bonus_rate: LocaleDecimal = Decimal("0")
    tax_rate: LocaleDecimal = Decimal("12.50")
    day_count_convention: str = "ACT/ACT ICMA"


class BondDetailUpdate(BaseModel):
    bond_type: str | None = None
    issue_date: date | None = None
    maturity_date: date | None = None
    coupon_frequency: int | None = None
    annual_coupon_rate: OptionalLocaleDecimal = None
    step_up_schedule: list[dict[str, Any]] | None = None
    final_bonus_rate: OptionalLocaleDecimal = None
    tax_rate: OptionalLocaleDecimal = None
    day_count_convention: str | None = None


class BondDetailResponse(BaseModel):
    id: int
    bond_type: str
    issue_date: date | None = None
    maturity_date: date
    coupon_frequency: int
    annual_coupon_rate: Decimal
    step_up_schedule: list[dict[str, Any]] | None = None
    final_bonus_rate: Decimal
    tax_rate: Decimal
    day_count_convention: str

    model_config = ConfigDict(from_attributes=True)


class AssetCreate(BaseModel):
    symbol: str
    name: str
    isin: str | None = None
    instrument_type: str = "etf"
    exchange: str | None = None
    currency: str = "EUR"
    bond_detail: BondDetailCreate | None = None


class AssetUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    isin: str | None = None
    instrument_type: str | None = None
    exchange: str | None = None
    currency: str | None = None
    bond_detail: BondDetailUpdate | None = None


class AssetResponse(BaseModel):
    id: int
    symbol: str
    name: str
    isin: str | None
    instrument_type: str
    exchange: str | None
    currency: str
    bond_detail: BondDetailResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class HoldingCreate(BaseModel):
    account_id: int
    asset_id: int
    quantity: LocaleDecimal
    avg_cost: LocaleDecimal = Decimal("0")
    entry_date: date
    exit_date: date | None = None
    accrued_interest_in: LocaleDecimal = Decimal("0")
    eligible_for_bonus: bool = False
    fee_in: LocaleDecimal = Decimal("0")


class HoldingUpdate(BaseModel):
    quantity: OptionalLocaleDecimal = None
    avg_cost: OptionalLocaleDecimal = None
    entry_date: date | None = None
    exit_date: date | None = None
    accrued_interest_in: OptionalLocaleDecimal = None
    eligible_for_bonus: bool | None = None
    fee_in: OptionalLocaleDecimal = None


class HoldingResponse(BaseModel):
    id: int
    account_id: int
    asset_id: int
    quantity: Decimal
    avg_cost: Decimal
    entry_date: date
    exit_date: date | None = None
    accrued_interest_in: Decimal = Decimal("0")
    eligible_for_bonus: bool = False
    fee_in: Decimal = Decimal("0")
    closed_at: date | None = None

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
    accrued_interest_in: Decimal = Decimal("0")
    eligible_for_bonus: bool = False
    accrued_interest: Decimal | None = None
    dirty_price: Decimal | None = None
    ytm_gross: Decimal | None = None
    ytm_net: Decimal | None = None
    fee_in: Decimal = Decimal("0")
    closed_at: date | None = None


class HoldingSingleDetailResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    asset_id: int
    asset_symbol: str
    asset_name: str
    isin: str | None = None
    instrument_type: str
    exchange: str | None = None
    asset_currency: str = "EUR"
    quantity: Decimal
    avg_cost: Decimal
    entry_date: date
    exit_date: date | None = None
    hold_duration_days: int | None = None
    remaining_days: int | None = None
    accrued_interest_in: Decimal = Decimal("0")
    eligible_for_bonus: bool = False
    current_price: Decimal = Decimal("0")
    cost_basis: Decimal = Decimal("0")
    market_value: Decimal = Decimal("0")
    return_value: Decimal = Decimal("0")
    return_pct: Decimal = Decimal("0")
    accrued_interest: Decimal | None = None
    dirty_price: Decimal | None = None
    ytm_gross: Decimal | None = None
    ytm_net: Decimal | None = None
    nominal_yield: Decimal | None = None
    current_yield: Decimal | None = None
    yield_spread: Decimal | None = None
    price_spread: Decimal | None = None
    bond_detail: BondDetailResponse | None = None
    tranche_count: int = 1
    all_eligible_for_bonus: bool = False
    has_eligible_for_bonus: bool = False
    tranches: list[HoldingDetailResponse] = Field(default_factory=list)
    fee_in: Decimal = Decimal("0")
    closed_at: date | None = None


class HoldingExitCreate(BaseModel):
    exit_type: str = "market_sale"
    exit_date: date | None = None
    quantity: OptionalLocaleDecimal = None
    clean_price: OptionalLocaleDecimal = None
    accrued_interest_out: OptionalLocaleDecimal = None
    fees: LocaleDecimal = Decimal("0")
    taxes: OptionalLocaleDecimal = None
    coupons_received: OptionalLocaleDecimal = None
    bonus_received: OptionalLocaleDecimal = None
    notes: str | None = None


class HoldingExitPreviewResponse(BaseModel):
    exit_type: str
    exit_date: date
    quantity: Decimal
    quantity_before: Decimal
    quantity_after: Decimal
    clean_price: Decimal
    accrued_interest_out: Decimal
    fees: Decimal
    taxes: Decimal
    capital_gain_tax: Decimal = Decimal("0")
    interest_tax: Decimal = Decimal("0")
    tax_mode: str
    fee_in_allocated: Decimal
    coupons_received: Decimal
    bonus_received: Decimal
    gross_proceeds: Decimal
    net_proceeds: Decimal
    cost_basis: Decimal
    realized_capital_gain: Decimal
    realized_interest_income: Decimal
    realized_pnl: Decimal
    currency: str
    warnings: list[str] = Field(default_factory=list)


class HoldingExitResponse(HoldingExitPreviewResponse):
    id: int
    holding_id: int
    account_id: int
    account_name: str
    asset_id: int
    asset_symbol: str
    asset_name: str
    previous_exit_date: date | None = None
    notes: str | None = None
    created_at: datetime | None = None


class HoldingPriceHistoryPoint(BaseModel):
    date: str
    market_price: Decimal
    nominal_price: Decimal = Decimal("100.00")
    avg_cost: Decimal
    is_projection: bool = False


class HoldingPriceHistoryResponse(BaseModel):
    symbol: str
    name: str
    instrument_type: str
    nominal_price: Decimal = Decimal("100.00")
    avg_cost: Decimal
    current_price: Decimal
    points: list[HoldingPriceHistoryPoint]

class BondCalendarItem(BaseModel):
    holding_id: int
    asset_symbol: str
    asset_name: str
    account_name: str
    date: date
    flow_type: str
    rate: Decimal
    gross_amount: Decimal
    tax_amount: Decimal
    net_amount: Decimal


class BondPortfolioMetrics(BaseModel):
    total_nominal: Decimal
    total_market_value: Decimal
    weighted_ytm_gross: Decimal
    weighted_ytm_net: Decimal
    estimated_annual_income_net: Decimal
    bonds_count: int


class BondLookupRequest(BaseModel):
    query: str


class BondLookupResponse(BaseModel):
    symbol: str
    name: str
    isin: str | None = None
    exchange: str = "MOT"
    currency: str = "EUR"
    instrument_type: str = "bond"
    live_price: Decimal | None = None
    issue_price: Decimal | None = None
    bond_detail: BondDetailCreate
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
    investment_inflows: Decimal = Decimal("0")
    total_wealth: Decimal = Decimal("0")


class AllAssetsPnlPoint(BaseModel):
    date: str
    holdings_value: Decimal
    trades_value: Decimal
    total_value: Decimal
    day_pnl: Decimal
    day_pnl_pct: Decimal
    cumulative_pnl: Decimal
    net_cash_flow: Decimal = Decimal("0")
    investment_inflows: Decimal = Decimal("0")
    total_wealth: Decimal = Decimal("0")


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


class TradeIdeaCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    market: str = Field(default="Euronext", max_length=80)
    direction: str = Field(default="long", pattern="^(long|short)$")
    initial_price: OptionalLocaleDecimal = None
    trigger_price: LocaleDecimal
    trigger_condition: str = Field(default="<=", pattern="^(<=|>=)$")
    stop_loss: OptionalLocaleDecimal = None
    target_price: OptionalLocaleDecimal = None
    thesis_notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    stale_days: Optional[int] = Field(default=None, ge=1, le=365)
    expire_days: Optional[int] = Field(default=None, ge=1, le=365)


class TradeIdeaUpdate(BaseModel):
    symbol: Optional[str] = Field(default=None, min_length=1, max_length=32)
    market: Optional[str] = Field(default=None, max_length=80)
    direction: Optional[str] = Field(default=None, pattern="^(long|short)$")
    trigger_price: OptionalLocaleDecimal = None
    trigger_condition: Optional[str] = Field(default=None, pattern="^(<=|>=)$")
    stop_loss: OptionalLocaleDecimal = None
    target_price: OptionalLocaleDecimal = None
    thesis_notes: Optional[str] = None
    tags: Optional[list[str]] = None
    stale_days: Optional[int] = Field(default=None, ge=1, le=365)
    expire_days: Optional[int] = Field(default=None, ge=1, le=365)


class TradeIdeaConvertRequest(BaseModel):
    trade_id: int


class TradeIdeaResponse(BaseModel):
    id: int
    user_id: int
    symbol: str
    market: str
    direction: str
    initial_price: Decimal
    trigger_price: Decimal
    trigger_condition: str
    stop_loss: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    thesis_notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    status: str
    stale_days: int
    expire_days: int
    stale_at: datetime
    expires_at: datetime
    triggered_at: Optional[datetime] = None
    triggered_price: Optional[Decimal] = None
    closed_at: Optional[datetime] = None
    trade_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    current_price: Optional[Decimal] = None
    distance_pct: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class TradeIdeaCountsResponse(BaseModel):
    all: int = 0
    watching: int = 0
    triggered: int = 0
    stale: int = 0
    closed: int = 0
    converted: int = 0


class TradeIdeaListResponse(BaseModel):
    items: list[TradeIdeaResponse]
    counts: TradeIdeaCountsResponse


class TradeIdeaAlertsResponse(BaseModel):
    unread_count: int
    items: list[TradeIdeaResponse]
