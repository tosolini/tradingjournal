import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ApiError, RecentExecution, Trade, api } from "../lib/api";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../contexts/ToastContext";
import { formatNumber, getNumberLocale } from "../lib/numbers";
import {
  EditIcon,
  EyeIcon as ViewIcon,
  ImageIcon,
  TrashIcon as DeleteIcon,
  XIcon as CloseIcon,
} from "../components/icons";

function asNumber(value: string | number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMetric(value: string | number | undefined, locale = "it-IT"): string {
  if (value === undefined) {
    return "-";
  }
  const n = asNumber(value);
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoney(value: string | number | undefined, currency?: string, locale = "it-IT"): string {
  if (value === undefined) {
    return "-";
  }
  const n = asNumber(value);
  const normalized = (currency || "").trim().toUpperCase();
  if (!normalized) {
    return formatMetric(n, locale);
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalized,
    }).format(n);
  } catch {
    return `${formatMetric(n, locale)} ${normalized}`;
  }
}

function formatHoldHours(value: string | number | undefined): string {
  if (value === undefined) {
    return "-";
  }
  const totalHours = Math.max(0, Math.floor(asNumber(value)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

function computeTpPct(side: string, entry: number, takeProfit: number): number | null {
  if (entry <= 0 || takeProfit <= 0) {
    return null;
  }
  if (side === "short") {
    return ((entry - takeProfit) / entry) * 100;
  }
  return ((takeProfit - entry) / entry) * 100;
}

function computeSlPct(side: string, entry: number, stopLoss: number): number | null {
  if (entry <= 0 || stopLoss <= 0) {
    return null;
  }
  if (side === "short") {
    return ((stopLoss - entry) / entry) * 100;
  }
  return ((entry - stopLoss) / entry) * 100;
}

function computeTpAbs(side: string, entry: number, takeProfit: number, qty: number): number | null {
  if (entry <= 0 || takeProfit <= 0 || qty <= 0) {
    return null;
  }
  if (side === "short") {
    return (entry - takeProfit) * qty;
  }
  return (takeProfit - entry) * qty;
}

function computeSlAbs(side: string, entry: number, stopLoss: number, qty: number): number | null {
  if (entry <= 0 || stopLoss <= 0 || qty <= 0) {
    return null;
  }
  if (side === "short") {
    return (stopLoss - entry) * qty;
  }
  return (entry - stopLoss) * qty;
}

type OptionalTradeColumnKey =
  | "avgEntry"
  | "avgExit"
  | "entryTotal"
  | "exitTotal"
  | "openQty"
  | "hold"
  | "return"
  | "returnPct"
  | "tpPct"
  | "slPct"
  | "tpAbs"
  | "slAbs";

type SortableTradeColumnKey = "date" | "symbol" | "status" | "side" | OptionalTradeColumnKey;
type SortableRecentExecutionColumnKey = "date" | "qty" | "price" | "fee";
type UserPreferencesPayload = {
  preferences?: {
    trades?: {
      visibleOptionalColumns?: Partial<Record<OptionalTradeColumnKey, boolean>>;
    };
  };
};

const OPTIONAL_TRADE_COLUMNS: Array<{ key: OptionalTradeColumnKey; label: string }> = [
  { key: "avgEntry", label: "Avg Entry" },
  { key: "avgExit", label: "Avg Exit" },
  { key: "entryTotal", label: "Entry Total" },
  { key: "exitTotal", label: "Exit Total" },
  { key: "openQty", label: "Open Qty" },
  { key: "hold", label: "Hold" },
  { key: "return", label: "Return" },
  { key: "returnPct", label: "Return %" },
  { key: "tpPct", label: "TP %" },
  { key: "slPct", label: "SL %" },
  { key: "tpAbs", label: "TP Assoluto" },
  { key: "slAbs", label: "SL Assoluto" },
];

const DEFAULT_VISIBLE_OPTIONAL_COLUMNS: Record<OptionalTradeColumnKey, boolean> = {
  avgEntry: true,
  avgExit: true,
  entryTotal: true,
  exitTotal: true,
  openQty: true,
  hold: true,
  return: true,
  returnPct: true,
  tpPct: true,
  slPct: true,
  tpAbs: true,
  slAbs: true,
};

const VISIBLE_COLUMNS_STORAGE_KEY = "trades.visibleOptionalColumns";

function hasStoredVisibleOptionalColumns(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return Boolean(window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY));
  } catch {
    return false;
  }
}

function loadVisibleOptionalColumns(): Record<OptionalTradeColumnKey, boolean> {
  if (typeof window === "undefined") {
    return DEFAULT_VISIBLE_OPTIONAL_COLUMNS;
  }
  try {
    const raw = window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VISIBLE_OPTIONAL_COLUMNS;
    }
    const parsed = JSON.parse(raw) as Partial<Record<OptionalTradeColumnKey, boolean>>;
    return {
      ...DEFAULT_VISIBLE_OPTIONAL_COLUMNS,
      ...Object.fromEntries(
        OPTIONAL_TRADE_COLUMNS.map((column) => [column.key, Boolean(parsed[column.key])])
      ),
    };
  } catch {
    return DEFAULT_VISIBLE_OPTIONAL_COLUMNS;
  }
}

function getTradeSortValue(trade: Trade, key: SortableTradeColumnKey): number | string | null {
  const entry = asNumber(trade.average_entry_price);
  const openQty = asNumber(trade.open_position_qty);
  const tp = asNumber(trade.target_price);
  const sl = asNumber(trade.stop_loss);

  const tpPct = computeTpPct(trade.side, entry, tp);
  const slPct = computeSlPct(trade.side, entry, sl);
  const tpAbs = computeTpAbs(trade.side, entry, tp, openQty);
  const slAbs = computeSlAbs(trade.side, entry, sl, openQty);

  switch (key) {
    case "date":
      return new Date(trade.created_at).getTime();
    case "symbol":
      return trade.symbol.toLowerCase();
    case "status":
      return trade.status.toLowerCase();
    case "side":
      return trade.side.toLowerCase();
    case "avgEntry":
      return trade.average_entry_price === undefined ? null : asNumber(trade.average_entry_price);
    case "avgExit":
      return trade.average_exit_price === undefined ? null : asNumber(trade.average_exit_price);
    case "entryTotal":
      return trade.entry_total === undefined ? null : asNumber(trade.entry_total);
    case "exitTotal":
      return trade.exit_total === undefined ? null : asNumber(trade.exit_total);
    case "openQty":
      return trade.open_position_qty === undefined ? null : asNumber(trade.open_position_qty);
    case "hold":
      return trade.hold_duration_hours === undefined ? null : asNumber(trade.hold_duration_hours);
    case "return":
      return trade.net_return === undefined ? null : asNumber(trade.net_return);
    case "returnPct":
      return trade.return_pct === undefined ? null : asNumber(trade.return_pct);
    case "tpPct":
      return tpPct === null ? null : tpPct;
    case "slPct":
      return slPct === null ? null : slPct;
    case "tpAbs":
      return tpAbs === null ? null : tpAbs;
    case "slAbs":
      return slAbs === null ? null : slAbs;
    default:
      return null;
  }
}

export function TradesPage() {
  const { t, i18n } = useTranslation();
  const locale = getNumberLocale(i18n.resolvedLanguage);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);
  const [quickCloseTradeId, setQuickCloseTradeId] = useState<number | null>(null);
  const [quickClosePrice, setQuickClosePrice] = useState<string>("");
  const [quickCloseReason, setQuickCloseReason] = useState<"manual" | "take_profit" | "stop_loss">("manual");
  const [quickCloseNote, setQuickCloseNote] = useState("");
  const [quickCloseError, setQuickCloseError] = useState<string | null>(null);
  const [recentSearch, setRecentSearch] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7d" | "month" | "ytd">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "win" | "loss">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [recentSortConfig, setRecentSortConfig] = useState<{ key: SortableRecentExecutionColumnKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<Record<OptionalTradeColumnKey, boolean>>(
    loadVisibleOptionalColumns
  );
  const [sortConfig, setSortConfig] = useState<{ key: SortableTradeColumnKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [hasLocalVisibleColumns] = useState(hasStoredVisibleOptionalColumns);

  const { data } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api<Trade[]>("/api/trades"),
  });
  const { data: recentExecutions } = useQuery({
    queryKey: ["recent-executions"],
    queryFn: () => api<RecentExecution[]>("/api/trades/executions/recent?limit=12"),
  });
  const { data: userPreferences, isFetched: userPreferencesFetched } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: () => api<UserPreferencesPayload>("/api/auth/preferences"),
  });

  const deleteTrade = useMutation({
    mutationFn: (tradeId: number) => api(`/api/trades/${tradeId}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteError(null);
      qc.invalidateQueries({ queryKey: ["trades"] });
      toast.success(t("trades.deleted_success", "Trade eliminato con successo"));
    },
  });

  const closeTrade = useMutation({
    mutationFn: (payload: { tradeId: number; price: number; close_reason: "manual" | "take_profit" | "stop_loss"; note?: string }) =>
      api(`/api/trades/${payload.tradeId}/close`, {
        method: "POST",
        body: JSON.stringify({
          executed_at: new Date().toISOString(),
          price: payload.price,
          close_reason: payload.close_reason,
          note: payload.note || null,
        }),
      }),
    onSuccess: () => {
      setQuickCloseTradeId(null);
      setQuickClosePrice("");
      setQuickCloseReason("manual");
      setQuickCloseNote("");
      setQuickCloseError(null);
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["recent-executions"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      toast.success(t("trades.closed_success", "Trade chiuso con successo"));
    },
  });

  const savePreferences = useMutation({
    mutationFn: (payload: UserPreferencesPayload) =>
      api<UserPreferencesPayload>("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  });

  const parseApiError = (err: unknown): string => {
    if (err instanceof ApiError) {
      return err.message || t("trades.request_failed");
    }
    if (!(err instanceof Error)) {
      return t("trades.request_failed");
    }
    return err.message || t("trades.request_failed");
  };

  const filteredRecentExecutions = useMemo(() => {
    const term = recentSearch.trim().toLowerCase();
    if (!recentExecutions?.length || !term) {
      return recentExecutions ?? [];
    }
    return recentExecutions.filter((execution) => {
      const haystack = `${execution.trade_id} ${execution.trade_symbol} ${execution.action}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [recentExecutions, recentSearch]);

  const sortedRecentExecutions = useMemo(() => {
    const result = [...filteredRecentExecutions];
    result.sort((a, b) => {
      let aValue: number;
      let bValue: number;
      switch (recentSortConfig.key) {
        case "date":
          aValue = new Date(a.executed_at).getTime();
          bValue = new Date(b.executed_at).getTime();
          break;
        case "qty":
          aValue = asNumber(a.quantity);
          bValue = asNumber(b.quantity);
          break;
        case "price":
          aValue = asNumber(a.price);
          bValue = asNumber(b.price);
          break;
        case "fee":
          aValue = asNumber(a.fee);
          bValue = asNumber(b.fee);
          break;
        default:
          aValue = 0;
          bValue = 0;
      }
      const comparison = aValue - bValue;
      return recentSortConfig.direction === "asc" ? comparison : -comparison;
    });
    return result;
  }, [filteredRecentExecutions, recentSortConfig]);

  const filteredTrades = useMemo(() => {
    if (!data?.length) {
      return [];
    }

    const term = tradeSearch.trim().toLowerCase();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentYearPrefix = `${now.getFullYear()}`;

    return data.filter((trade) => {
      if (statusFilter !== "all" && trade.status !== statusFilter) {
        return false;
      }
      if (outcomeFilter === "win" && asNumber(trade.net_return) <= 0) {
        return false;
      }
      if (outcomeFilter === "loss" && asNumber(trade.net_return) >= 0) {
        return false;
      }
      if (dateFilter === "today" && !trade.created_at.startsWith(todayStr)) {
        return false;
      }
      if (dateFilter === "7d" && trade.created_at < sevenDaysAgo) {
        return false;
      }
      if (dateFilter === "month" && !trade.created_at.startsWith(currentMonthPrefix)) {
        return false;
      }
      if (dateFilter === "ytd" && !trade.created_at.startsWith(currentYearPrefix)) {
        return false;
      }
      if (!term) {
        return true;
      }
      const haystack = `${trade.id} ${trade.symbol} ${trade.side} ${trade.status}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [data, statusFilter, tradeSearch, dateFilter, outcomeFilter]);

  const quickCloseTrade = useMemo(() => {
    if (!quickCloseTradeId || !data?.length) {
      return null;
    }
    return data.find((trade) => trade.id === quickCloseTradeId) ?? null;
  }, [data, quickCloseTradeId]);

  useEffect(() => {
    if (!showColumnsMenu) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!columnsMenuRef.current) {
        return;
      }
      if (!columnsMenuRef.current.contains(event.target as Node)) {
        setShowColumnsMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowColumnsMenu(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showColumnsMenu]);

  useEffect(() => {
    if (!userPreferencesFetched || preferencesHydrated) {
      return;
    }
    const profileColumns = userPreferences?.preferences?.trades?.visibleOptionalColumns;
    if (!hasLocalVisibleColumns && profileColumns && typeof profileColumns === "object") {
      setVisibleOptionalColumns((current) => ({
        ...current,
        ...Object.fromEntries(
          OPTIONAL_TRADE_COLUMNS.map((column) => [
            column.key,
            profileColumns[column.key] === undefined ? current[column.key] : Boolean(profileColumns[column.key]),
          ])
        ),
      }));
    }
    setPreferencesHydrated(true);
  }, [hasLocalVisibleColumns, preferencesHydrated, userPreferences, userPreferencesFetched]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }
    try {
      window.localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleOptionalColumns));
    } catch {
      // Ignore localStorage failures and keep runtime state.
    }
    savePreferences.mutate({
      preferences: {
        trades: {
          visibleOptionalColumns,
        },
      },
    });
  }, [preferencesHydrated, savePreferences, visibleOptionalColumns]);

  const visibleOptionalCount = useMemo(
    () => OPTIONAL_TRADE_COLUMNS.filter((column) => visibleOptionalColumns[column.key]).length,
    [visibleOptionalColumns]
  );

  const sortedTrades = useMemo(() => {
    const result = [...filteredTrades];
    result.sort((a, b) => {
      const aValue = getTradeSortValue(a, sortConfig.key);
      const bValue = getTradeSortValue(b, sortConfig.key);

      if (aValue === null && bValue === null) {
        return 0;
      }
      if (aValue === null) {
        return 1;
      }
      if (bValue === null) {
        return -1;
      }

      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue), "it");
      }
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
    return result;
  }, [filteredTrades, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedTrades.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedTrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTrades.slice(start, start + pageSize);
  }, [sortedTrades, currentPage, pageSize]);

  const toggleSort = (key: SortableTradeColumnKey) => {
    setSortConfig((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key,
        direction: key === "date" ? "desc" : "asc",
      };
    });
  };

  const sortIndicator = (key: SortableTradeColumnKey): string => {
    if (sortConfig.key !== key) {
      return "";
    }
    return sortConfig.direction === "asc" ? " ↑" : " ↓";
  };

  const toggleRecentSort = (key: SortableRecentExecutionColumnKey) => {
    setRecentSortConfig((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }
      return {
        key,
        direction: key === "date" ? "desc" : "asc",
      };
    });
  };

  const recentSortIndicator = (key: SortableRecentExecutionColumnKey): string => {
    if (recentSortConfig.key !== key) {
      return "";
    }
    return recentSortConfig.direction === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("trades.title")}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-900">{t("trades.subtitle")}</p>
      </div>

      <section className="card overflow-x-auto">
        <div className="flex flex-col gap-2 border-b border-slate-700/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-semibold">{t("trades.recent_executions")}</div>
          <input
            value={recentSearch}
            onChange={(event) => setRecentSearch(event.target.value)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm md:max-w-xs"
            placeholder={t("trades.search_recent_placeholder")}
          />
        </div>
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-xs shadow-xs">
            <tr className="border-b border-slate-700 dark:border-slate-300 text-left text-slate-400 dark:text-slate-900">
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleRecentSort("date")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.date")}{recentSortIndicator("date")}
                </button>
              </th>
              <th className="px-3 py-2">{t("trades.columns.trade")}</th>
              <th className="px-3 py-2">{t("trades.columns.action")}</th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleRecentSort("qty")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.qty")}{recentSortIndicator("qty")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleRecentSort("price")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.price")}{recentSortIndicator("price")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleRecentSort("fee")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.fee")}{recentSortIndicator("fee")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRecentExecutions.length ? (
              sortedRecentExecutions.map((execution) => (
                <tr key={execution.id} className="border-b border-slate-800/80">
                  <td className="px-3 py-2">{new Date(execution.executed_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/trades/${execution.trade_id}`)}
                      className="text-teal-200 dark:text-teal-900 underline-offset-2 hover:underline"
                    >
                      #{execution.trade_id} - {execution.trade_symbol}
                    </button>
                  </td>
                  <td className="px-3 py-2">{execution.action}</td>
                  <td className="px-3 py-2">{formatMetric(execution.quantity)}</td>
                  <td className="px-3 py-2">{formatMoney(execution.price, execution.currency)}</td>
                  <td className="px-3 py-2">{formatMoney(execution.fee, execution.currency)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-2 text-slate-400 dark:text-slate-900">
                  {t("trades.no_recent_executions")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-col gap-2 border-b border-slate-700/80 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-lg font-bold">{t("trades.title")}</div>
            {/* Quick date range presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
              {[
                { key: "all", label: "Tutti" },
                { key: "today", label: "Oggi" },
                { key: "7d", label: "7 giorni" },
                { key: "month", label: "Questo mese" },
                { key: "ytd", label: "YTD" },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setDateFilter(preset.key as "all" | "today" | "7d" | "month" | "ytd");
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    dateFilter === preset.key
                      ? "bg-teal-500 text-slate-950 shadow-xs"
                      : "border border-slate-700/80 bg-slate-900/60 text-slate-400 hover:text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-600"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <input
              value={tradeSearch}
              onChange={(event) => {
                setTradeSearch(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-1.5 text-sm md:w-56"
              placeholder={t("trades.search_placeholder")}
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">{t("trades.all_statuses")}</option>
              <option value="open">{t("trades.status.open")}</option>
              <option value="partial">{t("trades.status.partial")}</option>
              <option value="close">{t("trades.status.close")}</option>
            </select>
            <select
              value={outcomeFilter}
              onChange={(event) => {
                setOutcomeFilter(event.target.value as "all" | "win" | "loss");
                setPage(1);
              }}
              className="rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">Esito: Tutti</option>
              <option value="win">Solo Win (+)</option>
              <option value="loss">Solo Loss (-)</option>
            </select>
            <div className="relative" ref={columnsMenuRef}>
              <button
                type="button"
                onClick={() => setShowColumnsMenu((value) => !value)}
                className="rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm text-slate-200 dark:text-slate-900"
              >
                {t("trades.visible_columns")}
              </button>
              {showColumnsMenu ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white p-3 shadow-2xl">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-900">{t("trades.show_hide")}</div>
                  <div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2">
                    {OPTIONAL_TRADE_COLUMNS.map((column) => (
                      <label key={column.key} className="flex items-center gap-2 text-xs text-slate-200 dark:text-slate-900">
                        <input
                          type="checkbox"
                          checked={visibleOptionalColumns[column.key]}
                          onChange={(event) =>
                            setVisibleOptionalColumns((current) => ({
                              ...current,
                              [column.key]: event.target.checked,
                            }))
                          }
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {quickCloseTrade ? (
          <div className="border-b border-slate-700/80 bg-slate-900/40 px-4 py-3">
            <div className="mb-2 text-sm font-semibold text-amber-200 dark:text-amber-800">
              {t("trades.quick_close_title", { id: quickCloseTrade.id, symbol: quickCloseTrade.symbol })}
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
              <input
                type="number"
                step="0.000001"
                value={quickClosePrice}
                onChange={(event) => setQuickClosePrice(event.target.value)}
                className="rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
                placeholder={t("trades.exit_price")}
              />
              <select
                value={quickCloseReason}
                onChange={(event) => setQuickCloseReason(event.target.value as "manual" | "take_profit" | "stop_loss")}
                className="rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
              >
                <option value="manual">{t("trades.manual")}</option>
                <option value="take_profit">{t("trades.status.take_profit")}</option>
                <option value="stop_loss">{t("trades.status.stop_loss")}</option>
              </select>
              <input
                value={quickCloseNote}
                onChange={(event) => setQuickCloseNote(event.target.value)}
                className="rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
                placeholder={t("trades.note_optional")}
              />
              <button
                type="button"
                onClick={async () => {
                  setQuickCloseError(null);
                  const parsedPrice = Number(quickClosePrice);
                  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                    setQuickCloseError(t("trades.invalid_exit_price"));
                    return;
                  }
                  try {
                    await closeTrade.mutateAsync({
                      tradeId: quickCloseTrade.id,
                      price: parsedPrice,
                      close_reason: quickCloseReason,
                      note: quickCloseNote,
                    });
                  } catch (err) {
                    setQuickCloseError(parseApiError(err));
                  }
                }}
                disabled={closeTrade.isPending}
                className="rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
              >
                {closeTrade.isPending ? t("trades.closing") : t("trades.confirm_close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickCloseTradeId(null);
                  setQuickCloseError(null);
                }}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
              >
                {t("common.cancel")}
              </button>
            </div>
            {quickCloseError ? <div className="mt-2 text-sm text-red-400 dark:text-red-600">{quickCloseError}</div> : null}
          </div>
        ) : null}
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900/95 dark:bg-slate-100/95 backdrop-blur-xs shadow-xs">
            <tr className="border-b border-slate-700 dark:border-slate-300 text-left text-slate-400 dark:text-slate-900">
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleSort("date")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.date")}{sortIndicator("date")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleSort("symbol")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.symbol")}{sortIndicator("symbol")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleSort("status")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.status")}{sortIndicator("status")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => toggleSort("side")} className="text-left hover:text-slate-200 dark:text-slate-900">
                  {t("trades.columns.side")}{sortIndicator("side")}
                </button>
              </th>
              {visibleOptionalColumns.avgEntry ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("avgEntry")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Avg Entry{sortIndicator("avgEntry")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.avgExit ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("avgExit")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Avg Exit{sortIndicator("avgExit")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.entryTotal ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("entryTotal")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Entry Total{sortIndicator("entryTotal")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.exitTotal ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("exitTotal")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Exit Total{sortIndicator("exitTotal")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.openQty ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("openQty")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Open Qty{sortIndicator("openQty")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.hold ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("hold")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Hold{sortIndicator("hold")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.return ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("return")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Return{sortIndicator("return")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.returnPct ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("returnPct")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    Return %{sortIndicator("returnPct")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.tpPct ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("tpPct")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    TP %{sortIndicator("tpPct")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.slPct ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("slPct")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    SL %{sortIndicator("slPct")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.tpAbs ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("tpAbs")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    TP Assoluto{sortIndicator("tpAbs")}
                  </button>
                </th>
              ) : null}
              {visibleOptionalColumns.slAbs ? (
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("slAbs")} className="text-left hover:text-slate-200 dark:text-slate-900">
                    SL Assoluto{sortIndicator("slAbs")}
                  </button>
                </th>
              ) : null}
              <th className="px-3 py-2">{t("trades.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedTrades.map((trade) => {
              const entry = asNumber(trade.average_entry_price);
              const openQty = asNumber(trade.open_position_qty);
              const tp = asNumber(trade.target_price);
              const sl = asNumber(trade.stop_loss);

              const tpPct = computeTpPct(trade.side, entry, tp);
              const slPct = computeSlPct(trade.side, entry, sl);
              const tpAbs = computeTpAbs(trade.side, entry, tp, openQty);
              const slAbs = computeSlAbs(trade.side, entry, sl, openQty);

              return (
              <tr key={trade.id} className="border-b border-slate-800/80 hover:bg-slate-800/30 transition">
                <td
                  className="cursor-pointer px-3 py-2.5 hover:text-teal-300 dark:text-teal-900 tabular-nums text-xs"
                  onClick={() => navigate(`/trades/${trade.id}`)}
                  title={t("trades.view_trade") ?? "Visualizza trade"}
                >
                  {new Date(trade.created_at).toLocaleDateString()}
                </td>
                <td
                  className="cursor-pointer px-3 py-2.5 font-bold text-teal-300 dark:text-teal-800 hover:underline text-sm"
                  onClick={() => navigate(`/trades/${trade.id}`)}
                  title={t("trades.view_trade") ?? "Visualizza trade"}
                >
                  {trade.symbol}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      trade.status === "open"
                        ? "bg-teal-500/15 border-teal-500/30 text-teal-300 dark:bg-teal-50 dark:border-teal-300 dark:text-teal-900"
                        : trade.status === "partial"
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-300 dark:bg-amber-50 dark:border-amber-300 dark:text-amber-800"
                        : "bg-slate-800/80 border-slate-700 text-slate-400 dark:bg-slate-100 dark:border-slate-300 dark:text-slate-600"
                    }`}
                  >
                    {trade.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 uppercase font-semibold text-xs">{trade.side}</td>
                {visibleOptionalColumns.avgEntry ? <td className="px-3 py-2.5 tabular-nums">{formatMoney(trade.average_entry_price, trade.account_currency)}</td> : null}
                {visibleOptionalColumns.avgExit ? <td className="px-3 py-2.5 tabular-nums">{formatMoney(trade.average_exit_price, trade.account_currency)}</td> : null}
                {visibleOptionalColumns.entryTotal ? <td className="px-3 py-2.5 tabular-nums">{formatMoney(trade.entry_total, trade.account_currency)}</td> : null}
                {visibleOptionalColumns.exitTotal ? <td className="px-3 py-2.5 tabular-nums">{formatMoney(trade.exit_total, trade.account_currency)}</td> : null}
                {visibleOptionalColumns.openQty ? <td className="px-3 py-2.5 tabular-nums">{formatMetric(trade.open_position_qty)}</td> : null}
                {visibleOptionalColumns.hold ? <td className="px-3 py-2.5 tabular-nums">{formatHoldHours(trade.hold_duration_hours)}</td> : null}
                {visibleOptionalColumns.return ? (
                  <td
                    className={`px-3 py-2.5 font-bold tabular-nums ${
                      trade.net_return === undefined
                        ? "text-slate-300 dark:text-slate-900"
                        : asNumber(trade.net_return) >= 0
                          ? "text-emerald-400 dark:text-emerald-700"
                          : "text-red-400 dark:text-red-600"
                    }`}
                  >
                    {formatMoney(trade.net_return, trade.account_currency)}
                  </td>
                ) : null}
                {visibleOptionalColumns.returnPct ? (
                  <td
                    className={`px-3 py-2.5 font-bold tabular-nums ${
                      trade.return_pct === undefined
                        ? "text-slate-300 dark:text-slate-900"
                        : asNumber(trade.return_pct) >= 0
                          ? "text-emerald-400 dark:text-emerald-700"
                          : "text-red-400 dark:text-red-600"
                    }`}
                  >
                    {formatMetric(trade.return_pct, locale)}%
                  </td>
                ) : null}
                {visibleOptionalColumns.tpPct ? <td className="px-3 py-2.5 text-emerald-400 dark:text-emerald-700 tabular-nums">{tpPct === null ? "-" : `${formatNumber(tpPct, { minDecimals: 2, maxDecimals: 2, locale })}%`}</td> : null}
                {visibleOptionalColumns.slPct ? <td className="px-3 py-2.5 text-red-400 dark:text-red-600 tabular-nums">{slPct === null ? "-" : `${formatNumber(slPct, { minDecimals: 2, maxDecimals: 2, locale })}%`}</td> : null}
                {visibleOptionalColumns.tpAbs ? <td className="px-3 py-2.5 text-emerald-400 dark:text-emerald-700 tabular-nums">{tpAbs === null ? "-" : formatMoney(tpAbs, trade.account_currency, locale)}</td> : null}
                {visibleOptionalColumns.slAbs ? <td className="px-3 py-2.5 text-red-400 dark:text-red-600 tabular-nums">{slAbs === null ? "-" : formatMoney(slAbs, trade.account_currency, locale)}</td> : null}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/trades/${trade.id}`)}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/80 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200"
                      title={t("trades.view_detail")}
                      aria-label={t("trades.view_detail")}
                    >
                      <ViewIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/trades/${trade.id}/edit`)}
                      className="rounded-lg border border-sky-500/30 bg-sky-500/15 p-1.5 text-sky-300 transition hover:bg-sky-500/30 dark:border-sky-300 dark:bg-sky-50 dark:text-sky-800"
                      title={t("trades.edit_trade")}
                      aria-label={t("trades.edit_trade")}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/trades/${trade.id}/images`)}
                      className="rounded-lg border border-indigo-500/30 bg-indigo-500/15 p-1.5 text-indigo-300 transition hover:bg-indigo-500/30 dark:border-indigo-300 dark:bg-indigo-50 dark:text-indigo-800"
                      title={t("trades.manage_images")}
                      aria-label={t("trades.manage_images")}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickCloseError(null);
                        setQuickCloseTradeId(trade.id);
                        setQuickCloseReason("manual");
                        setQuickCloseNote("");
                        const suggestedPrice = asNumber(trade.target_price) > 0 ? asNumber(trade.target_price) : asNumber(trade.average_entry_price);
                        setQuickClosePrice(suggestedPrice > 0 ? String(suggestedPrice) : "");
                      }}
                      disabled={trade.status === "close"}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/15 p-1.5 text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-300 dark:bg-amber-50 dark:text-amber-800"
                      title={t("trades.quick_close")}
                      aria-label={t("trades.quick_close")}
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeletePendingId(trade.id);
                      }}
                      className="rounded-lg border border-red-500/30 bg-red-500/15 p-1.5 text-red-400 transition hover:bg-red-500/30 dark:border-red-300 dark:bg-red-50 dark:text-red-700"
                      title={t("trades.delete_trade")}
                      aria-label={t("trades.delete_trade")}
                    >
                      <DeleteIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );})}
            {!filteredTrades.length ? (
              <tr>
                <td colSpan={5 + visibleOptionalCount} className="px-3 py-6 text-center text-slate-400 dark:text-slate-600">
                  {t("trades.no_trades")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {sortedTrades.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/80 px-4 py-3 text-xs text-slate-400 dark:border-slate-300 dark:text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Visualizzati{" "}
                <strong className="text-slate-200 dark:text-slate-900 font-semibold">
                  {(currentPage - 1) * pageSize + 1}
                </strong>{" "}
                -{" "}
                <strong className="text-slate-200 dark:text-slate-900 font-semibold">
                  {Math.min(currentPage * pageSize, sortedTrades.length)}
                </strong>{" "}
                di{" "}
                <strong className="text-slate-200 dark:text-slate-900 font-semibold">{sortedTrades.length}</strong>{" "}
                trade
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 dark:border-slate-300 dark:bg-white dark:text-slate-800"
              >
                <option value={10}>10 per pagina</option>
                <option value={15}>15 per pagina</option>
                <option value={25}>25 per pagina</option>
                <option value={50}>50 per pagina</option>
                <option value={100}>100 per pagina</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800"
              >
                ← Precedente
              </button>
              <span className="px-2 font-medium">
                Pagina {currentPage} di {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800"
              >
                Successiva →
              </button>
            </div>
          </div>
        )}
        {deleteError ? <div className="p-3 text-sm text-red-400 dark:text-red-600">{deleteError}</div> : null}
      </section>
      {deletePendingId !== null && (() => {
        const trade = data?.find((tr) => tr.id === deletePendingId);
        return (
          <ConfirmModal
            message={t("trades.delete_confirm", { id: deletePendingId, symbol: trade?.symbol ?? "" })}
            onConfirm={async () => {
              try {
                await deleteTrade.mutateAsync(deletePendingId);
                qc.invalidateQueries({ queryKey: ["recent-executions"] });
              } catch (err) {
                setDeleteError(parseApiError(err));
              } finally {
                setDeletePendingId(null);
              }
            }}
            onCancel={() => setDeletePendingId(null)}
            isPending={deleteTrade.isPending}
          />
        );
      })()}
    </div>
  );
}
