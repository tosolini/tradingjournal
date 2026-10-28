import i18n from "./i18n";

const rawApiBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const normalizedApiBase = rawApiBase.replace(/\/+$/, "");
export const API_BASE = normalizedApiBase.endsWith("/api") ? normalizedApiBase.slice(0, -4) : normalizedApiBase;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorPayload = {
  detail?: string | { code?: string; message?: string };
};

async function parseApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as ErrorPayload;
    if (typeof parsed.detail === "string") {
      return new ApiError(parsed.detail, status);
    }
    if (parsed.detail && typeof parsed.detail === "object") {
      const message = parsed.detail.message || "API error";
      return new ApiError(message, status, parsed.detail.code);
    }
  } catch {
    // Keep plain-text fallback when response body is not JSON.
  }

  return new ApiError(text || "API error", status);
}

export type Trade = {
  id: number;
  account_id: number;
  ticker_id?: number | null;
  symbol: string;
  isin?: string | null;
  instrument_type?: string;
  market: string;
  side: string;
  status: string;
  account_currency?: string;
  strategy_name?: string;
  target_price?: string;
  stop_loss?: string;
  created_at: string;
  average_entry_price?: string;
  average_exit_price?: string;
  entry_total?: string;
  exit_total?: string;
  open_position_qty?: string;
  hold_duration_hours?: string;
  net_return?: string;
  return_pct?: string;
};

export type Execution = {
  id: number;
  trade_id: number;
  action: string;
  executed_at: string;
  quantity: string;
  price: string;
  fee: string;
  currency: string;
};

export type TradeImage = {
  id: number;
  trade_id: number;
  original_path: string;
  annotated_path?: string | null;
  mime_type?: string | null;
};

export type TradeDetail = {
  trade: Trade;
  executions: Execution[];
  images: TradeImage[];
  pnl: Record<string, unknown> | null;
  current_price?: number | null;
  closure?: {
    closed_at: string;
    close_reason?: string | null;
    exit_action: string;
    exit_price: string;
    exit_fee: string;
    exit_currency: string;
    gross_pnl: string;
    net_pnl: string;
    capital_gain_mode: string;
    capital_gain_rate: string;
    capital_gain_tax_estimate?: string | null;
    tax_note?: string | null;
    total_fees: string;
    instrument_type?: string | null;
  } | null;
};

export type RecentExecution = {
  id: number;
  trade_id: number;
  trade_symbol: string;
  action: string;
  executed_at: string;
  quantity: string;
  price: string;
  fee: string;
  currency: string;
};

export type Account = {
  id: number;
  name: string;
  broker_id: number | null;
  broker_name: string | null;
  base_currency: string;
  cash_balance: string;
};

export type Exchange = {
  id: number;
  name: string;
  mic: string | null;
  suffix: string | null;
  country: string | null;
  currency: string;
  timezone: string | null;
  open_time: string | null;
  close_time: string | null;
  closed_on_weekends: boolean;
  euronext_code?: string | null;
};

export type FeeMode = "fixed" | "percent" | "percent_min_max" | "tiered_volume" | "under_30";

export type BrokerProfile =
  | "custom"
  | "directa_semplice"
  | "directa_variabile"
  | "fineco_trading"
  | "fineco_trading_under30"
  | "fineco_one"
  | "fineco_classic"
  | "fineco_max";

export type Broker = {
  id: number;
  name: string;
  broker_profile?: BrokerProfile | string;
  fee_mode: FeeMode;
  fee_value: string;
  fee_min?: string | null;
  fee_max?: string | null;
  fee_us_value?: string | null;
  fee_currency: string;
  monthly_fee: string;
  fee_tier_override?: number | null;
  capital_gain_mode: "immediate" | "year_end";
  capital_gain_rate: string;
  capital_gain_rate_gov: string;
  exchanges: Exchange[];
};

function parseXhrError(xhr: XMLHttpRequest): ApiError {
  const status = xhr.status;
  const text = xhr.responseText;
  try {
    const parsed = JSON.parse(text) as ErrorPayload;
    if (typeof parsed.detail === "string") {
      return new ApiError(parsed.detail, status);
    }
    if (parsed.detail && typeof parsed.detail === "object") {
      const message = parsed.detail.message || "API error";
      return new ApiError(message, status, parsed.detail.code);
    }
  } catch {
    // Keep plain-text fallback when response body is not JSON.
  }
  return new ApiError(text || "API error", status);
}

function xhrRequest<T>(method: string, path: string, body?: string | FormData): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem("token");
    const locale = i18n.resolvedLanguage || i18n.language || "en";
    const url = API_BASE + path;
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    // Don't set Content-Type for FormData — browser sets it automatically with boundary
    if (!(body instanceof FormData)) {
      xhr.setRequestHeader("Content-Type", "application/json");
    }
    xhr.setRequestHeader("Accept-Language", locale);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status === 401) {
        localStorage.removeItem("token");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.replace("/login");
        }
        reject(parseXhrError(xhr));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve(xhr.responseText as unknown as T);
        }
      } else {
        reject(parseXhrError(xhr));
      }
    };
    xhr.onerror = () => reject(new Error("XHR failed: " + url));
    if (body) xhr.send(body);
    else xhr.send();
  });
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method || "GET";
  const body = options?.body as string | FormData | undefined;
  return xhrRequest<T>(method, path, body);
}

export async function login(username_or_email: string, password: string) {
  return api<{ access_token: string; must_change_password?: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username_or_email, password }),
  });
}

export type User = {
  id: number;
  email: string;
  username: string;
  role: string;
  timezone?: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
};

export type UserUpdate = {
  email?: string;
  username?: string;
  timezone?: string | null;
  current_password?: string;
  new_password?: string;
};

export function getMe() {
  return api<User>("/api/auth/me");
}

export function updateMe(payload: UserUpdate) {
  return api<User>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type AdminUserCreate = {
  email: string;
  username: string;
  password: string;
  role?: string;
  must_change_password?: boolean;
};

export type AdminUserUpdate = {
  email?: string;
  username?: string;
  new_password?: string;
  role?: string;
  is_active?: boolean;
  must_change_password?: boolean;
};

export function adminListUsers() {
  return api<User[]>("/api/admin/users");
}

export function adminCreateUser(payload: AdminUserCreate) {
  return api<User>("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
}

export function adminUpdateUser(id: number, payload: AdminUserUpdate) {
  return api<User>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function adminDeleteUser(id: number) {
  return api<void>(`/api/admin/users/${id}`, { method: "DELETE" });
}

// ── Admin settings (password policy, registration) ──
export type PasswordPolicy = {
  min_length: number;
  max_length: number;
  require_digit: boolean;
  require_uppercase: boolean;
  require_symbol: boolean;
  reject_common: boolean;
};

export type AppSettings = {
  registration_open: boolean;
  password_policy: PasswordPolicy;
};

export function adminGetSettings() {
  return api<AppSettings>("/api/admin/settings");
}

export function adminUpdateSettings(payload: {
  registration_open?: boolean;
  password_policy?: PasswordPolicy;
}) {
  return api<AppSettings>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ── Brokers / Accounts (used by onboarding wizard) ──
export function listBrokers() {
  return api<Broker[]>("/api/brokers");
}

export function createBroker(payload: {
  name: string;
  broker_profile?: BrokerProfile | string;
  fee_mode?: FeeMode;
  fee_value?: number;
  fee_min?: number | null;
  fee_max?: number | null;
  fee_us_value?: number | null;
  fee_currency?: string;
  monthly_fee?: number;
  fee_tier_override?: number | null;
  capital_gain_mode?: "immediate" | "year_end";
  capital_gain_rate?: number;
  capital_gain_rate_gov?: number;
}) {
  return api<Broker>("/api/brokers", { method: "POST", body: JSON.stringify(payload) });
}

export function createAccount(payload: {
  name: string;
  broker_id?: number | null;
  base_currency?: string;
  cash_balance?: number | string;
}) {
  return api<Account>("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      cash_balance: payload.cash_balance !== undefined ? String(payload.cash_balance) : "0",
    }),
  });
}

export type StepUpPoint = {
  from_year: number;
  to_year: number;
  rate: number;
};

export type BondDetail = {
  id?: number;
  bond_type: string;
  issue_date?: string | null;
  maturity_date: string;
  coupon_frequency: number;
  annual_coupon_rate: number | string;
  step_up_schedule?: StepUpPoint[] | null;
  final_bonus_rate: number | string;
  tax_rate: number | string;
  day_count_convention: string;
};

export type Asset = {
  id: number;
  symbol: string;
  name: string;
  isin?: string | null;
  instrument_type: string;
  exchange?: string | null;
  currency: string;
  bond_detail?: BondDetail | null;
};

export type Holding = {
  id: number;
  account_id: number;
  asset_id: number;
  quantity: string;
  avg_cost: string;
  entry_date: string;
  exit_date: string | null;
  accrued_interest_in: string;
  eligible_for_bonus: boolean;
};

export type HoldingDetail = {
  id: number;
  account_id: number;
  asset_id: number;
  asset_symbol: string;
  asset_name: string;
  instrument_type: string;
  asset_currency: string;
  quantity: string;
  avg_cost: string;
  entry_date: string;
  exit_date: string | null;
  hold_duration_days: number | null;
  current_price: string;
  market_value: string;
  return_value: string;
  return_pct: string;
  accrued_interest_in: string;
  eligible_for_bonus: boolean;
  accrued_interest?: string | null;
  dirty_price?: string | null;
  ytm_gross?: string | null;
  ytm_net?: string | null;
};

export type HoldingSingleDetail = {
  id: number;
  account_id: number;
  account_name: string;
  asset_id: number;
  asset_symbol: string;
  asset_name: string;
  isin?: string | null;
  instrument_type: string;
  exchange?: string | null;
  asset_currency: string;
  quantity: string;
  avg_cost: string;
  entry_date: string;
  exit_date?: string | null;
  hold_duration_days?: number | null;
  remaining_days?: number | null;
  accrued_interest_in: string;
  eligible_for_bonus: boolean;
  current_price: string;
  cost_basis: string;
  market_value: string;
  return_value: string;
  return_pct: string;
  accrued_interest?: string | null;
  dirty_price?: string | null;
  ytm_gross?: string | null;
  ytm_net?: string | null;
  nominal_yield?: string | null;
  current_yield?: string | null;
  yield_spread?: string | null;
  price_spread?: string | null;
  bond_detail?: BondDetail | null;
};

export type HoldingPriceHistoryPoint = {
  date: string;
  market_price: string | number;
  nominal_price: string | number;
  avg_cost: string | number;
  is_projection: boolean;
};

export type HoldingPriceHistory = {
  symbol: string;
  name: string;
  instrument_type: string;
  nominal_price: string | number;
  avg_cost: string | number;
  current_price: string | number;
  points: HoldingPriceHistoryPoint[];
};

export type BondCalendarItem = {
  holding_id: number;
  asset_symbol: string;
  asset_name: string;
  account_name: string;
  date: string;
  flow_type: string;
  rate: string;
  gross_amount: string;
  tax_amount: string;
  net_amount: string;
};

export type BondPortfolioMetrics = {
  total_nominal: string;
  total_market_value: string;
  weighted_ytm_gross: string;
  weighted_ytm_net: string;
  estimated_annual_income_net: string;
  bonds_count: number;
};

export type BondLookupResponse = {
  symbol: string;
  name: string;
  isin?: string | null;
  exchange: string;
  currency: string;
  instrument_type: string;
  live_price?: string | number | null;
  issue_price?: string | number | null;
  bond_detail: BondDetail;
};

export type PortfolioSummary = {
  account_id: number;
  account_name: string;
  total_value: string;
  total_cost: string;
  total_return: string;
  total_return_pct: string;
  holdings_count: number;
};

export type PortfolioHistoryPoint = {
  date: string;
  value: number;
  cost: number;
  return_pct: number;
};

export async function fetchTradeImageBlobUrl(imageId: number, variant: "original" | "annotated" = "original") {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE}/api/uploads/trade-images/${imageId}/content?variant=${variant}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ── Assets ──────────────────────────────────────────
export function fetchAssets(): Promise<Asset[]> {
  return api("/api/assets");
}

export function createAsset(payload: Partial<Asset>): Promise<Asset> {
  return api("/api/assets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAsset(id: number, payload: Partial<Asset>): Promise<Asset> {
  return api(`/api/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAsset(id: number): Promise<void> {
  return api(`/api/assets/${id}`, { method: "DELETE" });
}

// ── Accounts ────────────────────────────────────────
export function fetchAccounts(): Promise<Account[]> {
  return api("/api/accounts");
}

// ── Holdings ────────────────────────────────────────
export function fetchHoldings(accountId?: number): Promise<Holding[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/holdings${params}`);
}

export function createHolding(payload: {
  account_id: number;
  asset_id: number;
  quantity: string;
  avg_cost: string;
  entry_date: string;
  exit_date?: string | null;
  accrued_interest_in?: string;
  eligible_for_bonus?: boolean;
}): Promise<Holding> {
  return api("/api/holdings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchBondCalendar(accountId?: number, fromDate?: string, toDate?: string): Promise<BondCalendarItem[]> {
  const params = new URLSearchParams();
  if (accountId) params.set("account_id", String(accountId));
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  const q = params.toString();
  return api(`/api/bonds/calendar${q ? `?${q}` : ""}`);
}

export function fetchBondMetrics(accountId?: number): Promise<BondPortfolioMetrics> {
  const params = new URLSearchParams();
  if (accountId) params.set("account_id", String(accountId));
  const q = params.toString();
  return api(`/api/bonds/metrics${q ? `?${q}` : ""}`);
}

export function lookupBond(query: string): Promise<BondLookupResponse> {
  return api("/api/bonds/lookup", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}
export function updateHolding(id: number, payload: Partial<Holding>): Promise<Holding> {
  return api(`/api/holdings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteHolding(id: number): Promise<void> {
  return api(`/api/holdings/${id}`, { method: "DELETE" });
}

// ── Exchanges ───────────────────────────────────────
export const exchangesApi = {
  list: () => api<Exchange[]>("/api/exchanges"),
  create: (payload: Omit<Exchange, "id">) =>
    api<Exchange>("/api/exchanges", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: Partial<Omit<Exchange, "id">>) =>
    api<Exchange>(`/api/exchanges/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (id: number) =>
    api<{ deleted: boolean }>(`/api/exchanges/${id}`, { method: "DELETE" }),
  linkToBroker: (brokerId: number, exchangeId: number) =>
    api<Exchange[]>(`/api/brokers/${brokerId}/exchanges/${exchangeId}`, { method: "POST" }),
  unlinkFromBroker: (brokerId: number, exchangeId: number) =>
    api<{ unlinked: boolean }>(`/api/brokers/${brokerId}/exchanges/${exchangeId}`, { method: "DELETE" }),
  seedDirecta: () =>
    api<Exchange[]>("/api/exchanges/seed/directa", { method: "POST" }),
  syncTickers: (exchangeId: number) =>
    api<TickerImportResult>(`/api/exchanges/${exchangeId}/sync-tickers`, { method: "POST" }),
};

// ── Portfolio ───────────────────────────────────────
export function fetchPortfolioDetails(accountId?: number): Promise<HoldingDetail[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/portfolio/details${params}`);
}

export function fetchPortfolioSummary(accountId?: number): Promise<PortfolioSummary[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/portfolio/summary${params}`);
}

export function fetchPortfolioHistory(accountId?: number): Promise<PortfolioHistoryPoint[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/portfolio/history${params}`);
}

export function fetchHoldingDetail(holdingId: number | string): Promise<HoldingSingleDetail> {
  return api(`/api/portfolio/holdings/${holdingId}`);
}

export function fetchHoldingPriceHistory(holdingId: number | string): Promise<HoldingPriceHistory> {
  return api(`/api/portfolio/holdings/${holdingId}/price-history`);
}

export function fetchHoldingCalendar(holdingId: number | string): Promise<BondCalendarItem[]> {
  return api(`/api/portfolio/holdings/${holdingId}/calendar`);
}

// ── Tickers ─────────────────────────────────────────
export type Ticker = {
  id: number;
  name: string;
  isin: string | null;
  symbol: string;
  market: string;
  currency: string | null;
};

export type TickerImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
};

export const tickersApi = {
  search: (q: string, limit = 10): Promise<Ticker[]> =>
    api(`/api/tickers/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  count: (): Promise<{ total: number }> =>
    api("/api/tickers/count"),

  import: (file: File): Promise<TickerImportResult> => {
    const form = new FormData();
    form.append("file", file);
    return api("/api/tickers/import", { method: "POST", body: form });
  },

  clear: (): Promise<void> =>
    api("/api/tickers", { method: "DELETE" }),
  syncEuronext: (market = "milan"): Promise<TickerImportResult> =>
    api(`/api/tickers/sync-euronext?market=${encodeURIComponent(market)}`, { method: "POST" }),

  listEuronextMarkets: (): Promise<Array<{ code: string; name: string }>> =>
    api("/api/tickers/euronext-markets"),
};

// ── Dashboard ───────────────────────────────────────
export type TradeStat = {
  symbol: string;
  side: string;
  status: string;
  net_pnl: string;
  return_pct: number;
  closed_date: string | null;
};

export type MonthlyPnlPoint = {
  month: string; // "YYYY-MM"
  realized: string;
  count: number;
};

export type WeeklyPnlPoint = {
  week: string; // "YYYY-Www"
  realized: string;
  count: number;
};

export type DashboardAllocation = {
  symbol: string;
  name: string;
  instrument_type: string;
  market_value: string;
  weight_pct: number;
};

export type DashboardKpis = {
  trade_count: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number;
  profit_factor: number;
  gross_wins: string;
  gross_losses: string;
  avg_win: string;
  avg_loss: string;
  best_trade: TradeStat | null;
  worst_trade: TradeStat | null;
  top_trades: TradeStat[];
  monthly_pnl: MonthlyPnlPoint[];
  weekly_pnl?: WeeklyPnlPoint[];
  open_positions: number;
  realized_pnl: string;
  unrealized_pnl: string;
  total_pnl: string;
  kpi_currency: string;
  capital_gain_tax_estimate: string;
  capital_gain_tax_standard?: string;
  capital_gain_tax_gov?: string;
  capital_gain_loss_offset: string;
  capital_gain_loss_standard?: string;
  capital_gain_loss_gov?: string;
  capital_gain_loss_nominal?: string;
  capital_gain_currency: string;
  equity_curve: { date: string; value: number }[];
  portfolio_history: PortfolioHistoryPoint[];
  all_assets_daily_pnl: AllAssetsPnlPoint[];
  asset_allocation: DashboardAllocation[];
  asset_classes: DashboardAllocation[];
};

export function dashboardKpis(): Promise<DashboardKpis> {
  return api("/api/dashboard/kpis");
}

// ── Data Export / Import ────────────────────────────
export async function exportAllData(): Promise<Blob> {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE}/api/data/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw await parseApiError(response);
  return response.blob();
}

export async function importAllData(file: File): Promise<{ imported: Record<string, number> }> {
  const formData = new FormData();
  formData.append("file", file);
  return api("/api/data/import", {
    method: "POST",
    body: formData,
  });
}

// ── Performance / Daily P&L ─────────────────────────
export type DailyPnlPoint = {
  date: string;
  total_value: string;
  total_cost: string;
  total_return: string;
  day_pnl: string;
  day_pnl_pct: string;
  cumulative_pnl: string;
  net_cash_flow: string;
};

export function fetchDailyPnl(accountId?: number): Promise<DailyPnlPoint[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/snapshots/daily/pnl${params}`);
}

export type AllAssetsPnlPoint = {
  date: string;
  holdings_value: string;
  trades_value: string;
  total_value: string;
  day_pnl: string;
  day_pnl_pct: string;
  cumulative_pnl: string;
  net_cash_flow: string;
};

// ── Cash Ledger ──────────────────────────────────────
export type CashLedgerEntry = {
  id: number;
  account_id: number;
  entry_type: "deposit" | "withdrawal";
  amount: string;
  description: string | null;
  entry_date: string;
};

export function fetchLedgerEntries(accountId?: number): Promise<CashLedgerEntry[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return api(`/api/ledger${params}`);
}

export function createLedgerEntry(payload: {
  account_id: number;
  entry_type: "deposit" | "withdrawal";
  amount: string;
  description?: string | null;
  entry_date?: string;
}): Promise<CashLedgerEntry> {
  return api("/api/ledger", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLedgerEntry(
  id: number,
  payload: Partial<Omit<CashLedgerEntry, "id" | "account_id">>
): Promise<CashLedgerEntry> {
  return api(`/api/ledger/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteLedgerEntry(id: number): Promise<{ ok: boolean }> {
  return api(`/api/ledger/${id}`, { method: "DELETE" });
}
