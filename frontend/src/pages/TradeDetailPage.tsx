import { zodResolverTyped } from "../lib/zod-resolver";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  Account,
  Broker,
  Trade,
  TradeDetail,
  analysisApi,
  api,
  fetchTradeImageBlobUrl,
} from "../lib/api";
import { estimateExecutionFee, isGovernmentBond } from "../lib/fees";
import { getActiveLocale } from "../lib/numbers";
import { TradingViewChart } from "../components/TradingViewChart";
import { TradingViewTechnicalAnalysis } from "../components/TradingViewTechnicalAnalysis";
import { ReportViewer } from "../components/analysis/ReportViewer";

const closeTradeSchema = z.object({
  executed_at: z.string().min(1),
  price: z.coerce.number().positive(),
  close_reason: z.enum(["manual", "take_profit", "stop_loss"]),
  note: z.string().optional(),
});

type CloseTradePayload = z.infer<typeof closeTradeSchema>;

function formatMetric(value: string | number | undefined, locale = getActiveLocale()): string {
  if (value === undefined || value === null) {
    return "-";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "-";
  }
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoney(
  value: string | number | undefined,
  currency?: string,
  locale = getActiveLocale(),
): string {
  if (value === undefined || value === null) {
    return "-";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "-";
  }
  const normalized = (currency || "").trim().toUpperCase();
  if (!normalized) {
    return formatMetric(n, locale);
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: normalized }).format(n);
  } catch {
    return `${formatMetric(n, locale)} ${normalized}`;
  }
}

function asNumber(value: string | number | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHoldHours(value: string | number | undefined): string {
  if (value === undefined || value === null) {
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

function datetimeLocalNow(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export function TradeDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ tradeId: string }>();
  const tradeId = Number(params.tradeId || 0);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const executedAtInputRef = useRef<HTMLInputElement | null>(null);
  const openDateTimePicker = () => {
    const input = executedAtInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") pickerInput.showPicker();
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["trade-detail", tradeId],
    queryFn: () => api<TradeDetail>(`/api/trades/${tradeId}`),
    enabled: tradeId > 0,
  });
  const { data: allTrades } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api<Trade[]>("/api/trades"),
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/api/accounts"),
  });
  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: () => api<Broker[]>("/api/brokers"),
  });
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "chart" | "technical" | "close" | "executions" | "images" | "coaching"
  >("chart");

  const currentTrade = data?.trade;

  // Query historical AI coaching analyses for this specific trade and symbol
  const { data: analysisHistory = [] } = useQuery({
    queryKey: ["analysisHistory", "trade", tradeId, currentTrade?.symbol],
    queryFn: () => analysisApi.getHistory(currentTrade?.symbol, 10, "completed", tradeId),
    enabled: tradeId > 0 && !!currentTrade?.symbol,
  });

  // Filter strictly so that the report's symbol matches the trade's symbol (case-insensitive)
  const matchingReports = useMemo(() => {
    if (!currentTrade?.symbol) return [];
    const normalizedTradeSymbol = currentTrade.symbol.trim().toUpperCase();
    return analysisHistory.filter(
      (rep) =>
        rep.status === "completed" &&
        rep.symbol &&
        rep.symbol.trim().toUpperCase() === normalizedTradeSymbol
    );
  }, [analysisHistory, currentTrade?.symbol]);

  // Prefer exact trade_id match first, otherwise the latest matching symbol report
  const latestAnalysisSummary = useMemo(() => {
    if (!matchingReports.length) return null;
    const exactTradeMatch = matchingReports.find((r) => r.trade_id === tradeId);
    return exactTradeMatch || matchingReports[0];
  }, [matchingReports, tradeId]);

  const { data: latestAnalysisReport, isLoading: isAnalysisLoading } = useQuery({
    queryKey: ["analysisReport", latestAnalysisSummary?.id],
    queryFn: () => analysisApi.get(latestAnalysisSummary!.id),
    enabled: !!latestAnalysisSummary?.id,
  });

  const hasCoaching = useMemo(() => {
    if (!latestAnalysisSummary || !currentTrade?.symbol) return false;
    return (
      latestAnalysisSummary.symbol.trim().toUpperCase() === currentTrade.symbol.trim().toUpperCase()
    );
  }, [latestAnalysisSummary, currentTrade?.symbol]);

  const closeForm = useForm<CloseTradePayload>({
    resolver: zodResolverTyped(closeTradeSchema),
    defaultValues: {
      executed_at: datetimeLocalNow(),
      price: 0,
      close_reason: "manual",
      note: "",
    },
  });

  const closeTrade = useMutation({
    mutationFn: async (values: CloseTradePayload) =>
      api(`/api/trades/${tradeId}/close`, {
        method: "POST",
        body: JSON.stringify({
          executed_at: datetimeLocalToIso(values.executed_at),
          price: values.price,
          close_reason: values.close_reason,
          note: values.note,
        }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["trade-detail", tradeId] });
      await qc.invalidateQueries({ queryKey: ["trades"] });
      await qc.invalidateQueries({ queryKey: ["recent-executions"] });
    },
  });

  useEffect(() => {
    if (!data || data.trade.status === "close") {
      return;
    }
    closeForm.reset({
      executed_at: datetimeLocalNow(),
      price: Number(
        data.trade.average_exit_price ||
          data.trade.target_price ||
          data.trade.average_entry_price ||
          0
      ),
      close_reason: "manual",
      note: "",
    });
  }, [closeForm, data]);

  useEffect(() => {
    const previousUrls = Object.values(thumbnailUrls);
    let cancelled = false;

    const loadThumbnails = async () => {
      if (!data?.images.length) {
        setThumbnailUrls({});
        return;
      }

      const entries = await Promise.all(
        data.images.map(async (image) => {
          const variant = image.annotated_path ? "annotated" : "original";
          try {
            const url = await fetchTradeImageBlobUrl(image.id, variant);
            return [image.id, url] as const;
          } catch {
            return [image.id, ""] as const;
          }
        })
      );

      if (cancelled) {
        for (const [, url] of entries) {
          if (url) {
            URL.revokeObjectURL(url);
          }
        }
        return;
      }

      const next: Record<number, string> = {};
      for (const [id, url] of entries) {
        if (url) {
          next[id] = url;
        }
      }
      setThumbnailUrls(next);

      for (const url of previousUrls) {
        URL.revokeObjectURL(url);
      }
    };

    loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [data?.images]);

  const tradeData = data?.trade;
  const executionsList = data?.executions ?? [];

  // Sort executions chronologically
  const sortedExecutions = useMemo(() => {
    return [...executionsList].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime() || a.id - b.id
    );
  }, [executionsList]);

  // Separate entries (buys) and exits (sells)
  const entryExecutions = useMemo(() => {
    return sortedExecutions.filter((ex) => ex.action.toUpperCase() === "BUY");
  }, [sortedExecutions]);

  const exitExecutions = useMemo(() => {
    return sortedExecutions.filter((ex) => ex.action.toUpperCase() === "SELL");
  }, [sortedExecutions]);

  const firstEntry = entryExecutions[0] ?? null;
  const firstEntryPrice = firstEntry ? asNumber(firstEntry.price) : 0;
  const rawEntryPrice = asNumber(tradeData?.average_entry_price);
  const pmc = rawEntryPrice > 0 ? rawEntryPrice : firstEntryPrice;
  const entryPrice = pmc;
  const hasMultipleEntries = entryExecutions.length > 1;

  const totalEntryQty = useMemo(() => {
    return entryExecutions.reduce((sum, ex) => sum + asNumber(ex.quantity), 0);
  }, [entryExecutions]);

  const totalEntryValue = useMemo(() => {
    return (
      asNumber(tradeData?.entry_total) ||
      entryExecutions.reduce(
        (sum, ex) => sum + asNumber(ex.quantity) * asNumber(ex.price),
        0
      )
    );
  }, [tradeData?.entry_total, entryExecutions]);

  const totalEntryFees = useMemo(() => {
    return entryExecutions.reduce((sum, ex) => sum + asNumber(ex.fee), 0);
  }, [entryExecutions]);

  const totalAllFees = useMemo(() => {
    return sortedExecutions.reduce((sum, ex) => sum + asNumber(ex.fee), 0);
  }, [sortedExecutions]);

  const analyzedExecutions = useMemo(() => {
    let buyCounter = 0;
    return sortedExecutions.map((ex) => {
      const isBuy = ex.action.toUpperCase() === "BUY";
      const price = asNumber(ex.price);
      const qty = asNumber(ex.quantity);
      const totalAmount = price * qty;
      let role: "first_entry" | "scale_in" | "close" | "exit";
      let roleIndex = 0;
      let deltaFromFirstPct: number | null = null;
      let deltaFromPmcPct: number | null = null;

      if (isBuy) {
        buyCounter++;
        if (buyCounter === 1) {
          role = "first_entry";
        } else {
          role = "scale_in";
          roleIndex = buyCounter - 1;
          if (firstEntryPrice > 0) {
            deltaFromFirstPct = ((price - firstEntryPrice) / firstEntryPrice) * 100;
          }
          if (pmc > 0) {
            deltaFromPmcPct = ((price - pmc) / pmc) * 100;
          }
        }
      } else {
        role = tradeData?.status === "close" ? "close" : "exit";
      }

      return {
        ...ex,
        role,
        roleIndex,
        totalAmount,
        deltaFromFirstPct,
        deltaFromPmcPct,
        isBuy,
      };
    });
  }, [sortedExecutions, firstEntryPrice, pmc, tradeData?.status]);

  const openQty = asNumber(tradeData?.open_position_qty);
  const tpValue = asNumber(tradeData?.target_price);
  const slValue = asNumber(tradeData?.stop_loss);
  const account = accounts?.find((item) => item.id === tradeData?.account_id);
  const broker = account?.broker_id
    ? brokers?.find((item) => item.id === account.broker_id)
    : undefined;
  const isGovBond = isGovernmentBond(tradeData?.instrument_type);
  const capitalGainRate = isGovBond
    ? asNumber(broker?.capital_gain_rate_gov ?? 12.5)
    : asNumber(broker?.capital_gain_rate ?? 26);
  const closeReasonLabel = {
    manual: t("trade_detail.close_reason.manual"),
    take_profit: t("trade_detail.close_reason.take_profit"),
    stop_loss: t("trade_detail.close_reason.stop_loss"),
  } as const;

  const estimatedTpFee = useMemo(
    () =>
      estimateExecutionFee({
        broker,
        quantity: openQty,
        price: tpValue,
        currency: tradeData?.account_currency,
      }).value,
    [broker, openQty, tpValue, tradeData?.account_currency]
  );
  const estimatedSlFee = useMemo(
    () =>
      estimateExecutionFee({
        broker,
        quantity: openQty,
        price: slValue,
        currency: tradeData?.account_currency,
      }).value,
    [broker, openQty, slValue, tradeData?.account_currency]
  );
  const tpAbs = tradeData ? computeTpAbs(tradeData.side, entryPrice, tpValue, openQty) : null;
  const slAbs = tradeData ? computeSlAbs(tradeData.side, entryPrice, slValue, openQty) : null;
  const estimatedCapitalGainTax =
    tpAbs === null || tpAbs <= 0 ? 0 : (tpAbs * capitalGainRate) / 100;
  const netTpAfterFees =
    tpAbs === null ? null : tpAbs - estimatedTpFee - estimatedCapitalGainTax;
  const netSlAfterFees = slAbs === null ? null : slAbs + estimatedSlFee;
  const closeSummary = data?.closure;
  const tpPct = tradeData ? computeTpPct(tradeData.side, entryPrice, tpValue) : null;
  const slPct = tradeData ? computeSlPct(tradeData.side, entryPrice, slValue) : null;
  const closeNetAfterTax = closeSummary
    ? closeSummary.capital_gain_tax_estimate === null ||
      closeSummary.capital_gain_tax_estimate === undefined
      ? null
      : Number(closeSummary.net_pnl || 0) -
        Number(closeSummary.capital_gain_tax_estimate || 0)
    : null;

  const rrRatio = useMemo(() => {
    if (tpPct !== null && slPct !== null && slPct > 0) {
      return (tpPct / slPct).toFixed(2);
    }
    if (tpAbs !== null && slAbs !== null && slAbs > 0) {
      return (tpAbs / slAbs).toFixed(2);
    }
    return null;
  }, [tpPct, slPct, tpAbs, slAbs]);

  const currentPrice = data?.current_price != null ? asNumber(data.current_price) : null;
  const priceDeltaAbs =
    currentPrice !== null && pmc > 0
      ? tradeData?.side === "short"
        ? pmc - currentPrice
        : currentPrice - pmc
      : null;
  const priceDeltaPct =
    currentPrice !== null && pmc > 0
      ? tradeData?.side === "short"
        ? ((pmc - currentPrice) / pmc) * 100
        : ((currentPrice - pmc) / pmc) * 100
      : null;

  const pnlObj = data?.pnl as Record<string, unknown> | null | undefined;
  const unrealizedPnl =
    pnlObj?.unrealized_pnl != null
      ? asNumber(pnlObj.unrealized_pnl as number | string)
      : null;
  const currentReturnPct =
    pnlObj?.return_pct != null
      ? asNumber(pnlObj.return_pct as number | string)
      : asNumber(tradeData?.return_pct);
  const currentMarketValue =
    pnlObj?.market_value != null
      ? asNumber(pnlObj.market_value as number | string)
      : currentPrice !== null && openQty > 0
        ? currentPrice * openQty
        : null;

  if (!tradeId) {
    return <div className="text-sm text-red-400 dark:text-red-600">{t("trade_detail.invalid_trade")}</div>;
  }

  if (isLoading) {
    return <div className="text-sm text-slate-400 dark:text-slate-900">{t("trade_detail.loading")}</div>;
  }

  if (error || !data) {
    return <div className="text-sm text-red-400 dark:text-red-600">{t("trade_detail.unavailable")}</div>;
  }

  const trade = data.trade;
  const executions = data.executions;

  const sortedIds = allTrades
    ? [...allTrades].sort((a, b) => a.id - b.id).map((tr) => tr.id)
    : [];
  const currentIndex = sortedIds.indexOf(tradeId);
  const prevId = currentIndex > 0 ? sortedIds[currentIndex - 1] : null;
  const nextId =
    currentIndex !== -1 && currentIndex < sortedIds.length - 1 ? sortedIds[currentIndex + 1] : null;

  return (
    <div className="space-y-5">
      {/* Header bar: Symbol, direction, status, actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/80 dark:border-slate-300/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-white dark:text-slate-950 font-mono">
              {trade.symbol}
            </h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                trade.side.toLowerCase() === "long"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
              }`}
            >
              {trade.side.toLowerCase() === "long"
                ? `↗ ${t("trade_detail.side_long").toUpperCase()}`
                : `↘ ${t("trade_detail.side_short").toUpperCase()}`}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                trade.status === "open"
                  ? "bg-teal-500/15 border border-teal-500/30 text-teal-300"
                  : "bg-slate-700/50 border border-slate-600/50 text-slate-300 dark:text-slate-700"
              }`}
            >
              {trade.status === "open" && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
              )}
              {trade.status === "open" ? t("trade_detail.status_open") : t("trade_detail.status_closed")}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 dark:text-slate-600">
            <span className="rounded bg-slate-800/70 dark:bg-slate-200/80 px-2 py-0.5 font-medium text-slate-300 dark:text-slate-800">
              {trade.market || t("trade_detail.fallback_market")}
            </span>
            <span className="rounded bg-slate-800/70 dark:bg-slate-200/80 px-2 py-0.5 font-medium capitalize text-slate-300 dark:text-slate-800">
              {trade.instrument_type ? trade.instrument_type.replace("_", " ") : t("trade_detail.fallback_stock")}
            </span>
            {isGovBond && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400 border border-emerald-500/20">
                {t("trade_detail.gov_bond_badge")}
              </span>
            )}
            <span className="text-slate-500 dark:text-slate-400">•</span>
            <span>
              {t("trade_detail.account_label")}: <strong className="text-slate-200 dark:text-slate-900">{account?.name || trade.account_id}</strong>
              {account?.broker_id && broker?.name ? <span> ({broker.name})</span> : null}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => prevId !== null && navigate(`/trades/${prevId}`)}
            disabled={prevId === null}
            title={t("trade_detail.previous_trade")}
            aria-label={t("trade_detail.previous_trade")}
            className="rounded bg-slate-800 hover:bg-slate-700 p-2 text-slate-200 dark:text-slate-900 disabled:opacity-30 transition-colors border border-slate-700/50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => nextId !== null && navigate(`/trades/${nextId}`)}
            disabled={nextId === null}
            title={t("trade_detail.next_trade")}
            aria-label={t("trade_detail.next_trade")}
            className="rounded bg-slate-800 hover:bg-slate-700 p-2 text-slate-200 dark:text-slate-900 disabled:opacity-30 transition-colors border border-slate-700/50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <Link
            to={`/trades/${trade.id}/edit`}
            className="rounded bg-sky-500 hover:bg-sky-400 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors"
          >
            {t("trade_detail.edit")}
          </Link>
          <Link
            to={`/trades/${trade.id}/images`}
            className="rounded bg-indigo-500 hover:bg-indigo-400 px-3 py-2 text-sm font-semibold text-white transition-colors"
          >
            {t("trade_detail.images")}
          </Link>
          <Link
            to={`/analysis?symbol=${encodeURIComponent(trade.symbol)}${trade.market ? `&market=${encodeURIComponent(trade.market)}` : ""}&tradeId=${trade.id}`}
            className="rounded bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors flex items-center gap-1.5 shadow-sm"
            title={t("trade_detail.ai_coaching_title")}
          >
            <span>🤖</span>
            <span>{t("trade_detail.ai_coaching")}</span>
          </Link>
        </div>
      </div>

      {/* Main Trade Cockpit: 3 Financial Pillars */}
      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Pillar 1: Cost Basis & Position */}
          <div className="rounded-xl border border-teal-500/25 bg-gradient-to-b from-teal-500/[0.07] to-slate-900/40 dark:to-slate-100/40 p-4 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-400 dark:text-teal-700 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-teal-400"></span>
                  {t("trade_detail.cost_basis_title")}
                </span>
                {hasMultipleEntries ? (
                  <span className="rounded-full bg-teal-500/20 border border-teal-500/35 px-2 py-0.5 text-[11px] font-semibold text-teal-300 dark:text-teal-800">
                    {t("trade_detail.multiple_entries_badge", { count: entryExecutions.length })}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-700/40 border border-slate-600/40 px-2 py-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-600">
                    {t("trade_detail.single_entry_badge")}
                  </span>
                )}
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600 font-medium">
                  {hasMultipleEntries ? t("trade_detail.average_entry_price") : t("trade_detail.entry_price")}
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-slate-950 font-mono mt-0.5">
                  {formatMoney(pmc, trade.account_currency)}
                </div>
              </div>

              {hasMultipleEntries && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-teal-950/30 dark:bg-teal-50/60 border border-teal-500/20 px-2.5 py-1 text-xs">
                  <span className="text-slate-400 dark:text-slate-600">{t("trade_detail.first_entry_price")}:</span>
                  <strong className="text-teal-300 dark:text-teal-800 font-mono font-semibold">
                    {formatMoney(firstEntryPrice, trade.account_currency)}
                  </strong>
                  {firstEntry?.executed_at && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">
                      {new Date(firstEntry.executed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-700/60 dark:border-slate-300/60 text-xs">
              <div>
                <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.open_quantity")}</div>
                <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMetric(openQty > 0 ? openQty : totalEntryQty)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.total_invested")}</div>
                <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMoney(totalEntryValue, trade.account_currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.total_entry_fees")}</div>
                <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMoney(totalEntryFees, trade.account_currency)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.hold_duration")}</div>
                <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatHoldHours(trade.hold_duration_hours)}
                </div>
              </div>
            </div>
          </div>

          {/* Pillar 2: Market & PnL */}
          <div
            className={`rounded-xl border p-4 flex flex-col justify-between shadow-sm bg-gradient-to-b ${
              (trade.status === "open" ? (unrealizedPnl ?? 0) : Number(trade.net_return || 0)) >= 0
                ? "border-emerald-500/25 from-emerald-500/[0.07] to-slate-900/40 dark:to-slate-100/40"
                : "border-rose-500/25 from-rose-500/[0.07] to-slate-900/40 dark:to-slate-100/40"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    (trade.status === "open" ? (unrealizedPnl ?? 0) : Number(trade.net_return || 0)) >= 0
                      ? "text-emerald-400 dark:text-emerald-700"
                      : "text-rose-400 dark:text-rose-700"
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      (trade.status === "open" ? (unrealizedPnl ?? 0) : Number(trade.net_return || 0)) >= 0
                        ? "bg-emerald-400"
                        : "bg-rose-400"
                    }`}
                  ></span>
                  {trade.status === "open" ? t("trade_detail.current_market_title") : t("trade_detail.close_summary")}
                </span>
                {trade.status === "open" && data.current_price != null && (
                  <span className="rounded-full bg-slate-800/60 dark:bg-slate-200/80 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-300 dark:text-slate-700">
                    {t("trade_detail.live_badge")}
                  </span>
                )}
              </div>

              {trade.status === "open" ? (
                <div>
                  <div className="text-xs text-slate-400 dark:text-slate-600 font-medium">
                    {t("trade_detail.fields.market_price")}
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-slate-950 font-mono mt-0.5">
                    {data.current_price != null ? formatMoney(data.current_price, trade.account_currency) : "-"}
                  </div>

                  {priceDeltaPct !== null && priceDeltaAbs !== null && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                      <span className={priceDeltaPct >= 0 ? "text-emerald-400 dark:text-emerald-700" : "text-rose-400 dark:text-rose-700"}>
                        {priceDeltaPct >= 0 ? "+" : ""}{formatMoney(priceDeltaAbs, trade.account_currency)} ({priceDeltaPct >= 0 ? "+" : ""}{priceDeltaPct.toFixed(2)}% vs PMC)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-xs text-slate-400 dark:text-slate-600 font-medium">
                    {t("trade_detail.fields.net_pnl_after_fees")}
                  </div>
                  <div
                    className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-mono mt-0.5 ${
                      Number(trade.net_return || 0) >= 0 ? "text-emerald-400 dark:text-emerald-700" : "text-rose-400 dark:text-rose-700"
                    }`}
                  >
                    {formatMoney(trade.net_return, trade.account_currency)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
                    {t("trade_detail.fields.exit_price")}:{" "}
                    <strong className="text-slate-200 dark:text-slate-900 font-mono">
                      {formatMoney(trade.average_exit_price || closeSummary?.exit_price, trade.account_currency)}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-700/60 dark:border-slate-300/60 text-xs">
              {trade.status === "open" ? (
                <>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.unrealized_pnl")}</div>
                    <div
                      className={`font-semibold font-mono mt-0.5 ${
                        (unrealizedPnl ?? 0) >= 0 ? "text-emerald-400 dark:text-emerald-700" : "text-rose-400 dark:text-rose-700"
                      }`}
                    >
                      {unrealizedPnl != null ? formatMoney(unrealizedPnl, trade.account_currency) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.current_return_pct")}</div>
                    <div
                      className={`font-semibold font-mono mt-0.5 ${
                        (currentReturnPct ?? 0) >= 0 ? "text-emerald-400 dark:text-emerald-700" : "text-rose-400 dark:text-rose-700"
                      }`}
                    >
                      {currentReturnPct != null ? `${currentReturnPct >= 0 ? "+" : ""}${formatMetric(currentReturnPct)}%` : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.market_value")}</div>
                    <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                      {currentMarketValue != null ? formatMoney(currentMarketValue, trade.account_currency) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.account")}</div>
                    <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                      {trade.account_currency || "EUR"}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.return_pct")}</div>
                    <div
                      className={`font-semibold font-mono mt-0.5 ${
                        Number(trade.return_pct || 0) >= 0 ? "text-emerald-400 dark:text-emerald-700" : "text-rose-400 dark:text-rose-700"
                      }`}
                    >
                      {formatMetric(trade.return_pct)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.total_fees")}</div>
                    <div className="font-semibold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                      {closeSummary ? formatMoney(closeSummary.total_fees, trade.account_currency) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.reason")}</div>
                    <div className="font-semibold text-slate-200 dark:text-slate-900 mt-0.5 capitalize">
                      {closeSummary?.close_reason
                        ? closeReasonLabel[closeSummary.close_reason as keyof typeof closeReasonLabel] ?? closeSummary.close_reason
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-slate-600">{t("trade_detail.fields.closed_at")}</div>
                    <div className="font-semibold text-slate-200 dark:text-slate-900 mt-0.5">
                      {closeSummary?.closed_at ? new Date(closeSummary.closed_at).toLocaleDateString() : "-"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Pillar 3: Targets & Risk Plan */}
          <div className="rounded-xl border border-indigo-500/25 bg-gradient-to-b from-indigo-500/[0.07] to-slate-900/40 dark:to-slate-100/40 p-4 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 dark:text-indigo-700 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-400"></span>
                  {t("trade_detail.risk_plan_title")}
                </span>
                {rrRatio && (
                  <span className="rounded-full bg-indigo-500/20 border border-indigo-500/35 px-2 py-0.5 text-[11px] font-bold text-indigo-300 dark:text-indigo-800">
                    R:R 1 : {rrRatio}
                  </span>
                )}
              </div>

              {/* Take Profit Mini-Card */}
              <div className="rounded-lg bg-emerald-950/20 dark:bg-emerald-50/60 border border-emerald-500/20 p-2.5 flex items-center justify-between mb-2">
                <div>
                  <div className="text-[11px] text-emerald-400/90 dark:text-emerald-700 font-medium flex items-center gap-1">
                    <span>🎯</span> {t("trade_detail.fields.take_profit")}
                  </div>
                  <div className="text-base font-bold font-mono text-emerald-300 dark:text-emerald-800">
                    {formatMoney(trade.target_price, trade.account_currency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-emerald-400 dark:text-emerald-700 font-mono">
                    {tpPct !== null ? `+${tpPct.toFixed(2)}%` : "-"}
                  </div>
                  {netTpAfterFees !== null && (
                    <div className="text-[10px] text-emerald-300/80 dark:text-emerald-700 font-mono">
                      +{formatMoney(netTpAfterFees, trade.account_currency)}
                    </div>
                  )}
                </div>
              </div>

              {/* Stop Loss Mini-Card */}
              <div className="rounded-lg bg-rose-950/20 dark:bg-rose-50/60 border border-rose-500/20 p-2.5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-rose-400/90 dark:text-rose-700 font-medium flex items-center gap-1">
                    <span>🛡️</span> {t("trade_detail.fields.stop_loss")}
                  </div>
                  <div className="text-base font-bold font-mono text-rose-300 dark:text-rose-800">
                    {formatMoney(trade.stop_loss, trade.account_currency)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-rose-400 dark:text-rose-700 font-mono">
                    {slPct !== null ? `-${slPct.toFixed(2)}%` : "-"}
                  </div>
                  {netSlAfterFees !== null && (
                    <div className="text-[10px] text-rose-300/80 dark:text-rose-700 font-mono">
                      -{formatMoney(netSlAfterFees, trade.account_currency)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* R:R Visual Gauge */}
            {tpPct !== null && slPct !== null && slPct > 0 && tpPct > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-700/60 dark:border-slate-300/60 text-xs">
                <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-600 mb-1">
                  <span>
                    {t("trade_detail.gauge_risk")}: {slPct.toFixed(1)}%
                  </span>
                  <span>
                    {t("trade_detail.gauge_reward")}: {tpPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 dark:bg-slate-200 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, Math.max(10, (slPct / (slPct + tpPct)) * 100))}%` }}
                    className="bg-rose-500"
                    title={`${t("trade_detail.gauge_risk")}: ${slPct.toFixed(2)}%`}
                  />
                  <div
                    style={{ width: `${Math.min(100, Math.max(10, (tpPct / (slPct + tpPct)) * 100))}%` }}
                    className="bg-emerald-500"
                    title={`${t("trade_detail.gauge_target")}: ${tpPct.toFixed(2)}%`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible details for secondary metadata */}
        <details className="group border-t border-slate-800/80 dark:border-slate-300/60 pt-3 text-xs">
          <summary className="flex items-center justify-between cursor-pointer text-slate-400 dark:text-slate-600 hover:text-slate-200 dark:hover:text-slate-900 select-none py-1">
            <span className="font-semibold flex items-center gap-1.5">
              <span>ℹ️</span> {t("trade_detail.details_accordion")}
            </span>
            <span className="transition-transform group-open:rotate-180 text-slate-500">▼</span>
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 pb-1">
            <div>
              <div className="text-slate-500 dark:text-slate-400">{t("trade_detail.isin_label")}</div>
              <div className="font-mono text-slate-300 dark:text-slate-800 font-medium">{trade.isin || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">{t("trade_detail.strategy_label")}</div>
              <div className="text-slate-300 dark:text-slate-800 font-medium">{trade.strategy_name || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">{t("trade_detail.fields.account")}</div>
              <div className="text-slate-300 dark:text-slate-800 font-medium">#{trade.account_id}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">{t("trade_detail.fields.capital_gain")}</div>
              <div className="text-slate-300 dark:text-slate-800 font-medium">{capitalGainRate}%</div>
            </div>
          </div>
        </details>
      </section>

      {trade.status === "close" && closeSummary ? (
        <section className="card p-4">
          <div className="mb-3 text-lg font-semibold">{t("trade_detail.close_summary")}</div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.closed_at")}</div>
              <div>{new Date(closeSummary.closed_at).toLocaleString(getActiveLocale())}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.reason")}</div>
              <div>{closeReasonLabel[(closeSummary.close_reason || "manual") as keyof typeof closeReasonLabel] ?? closeSummary.close_reason ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.exit_action")}</div>
              <div>{closeSummary.exit_action}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.exit_price")}</div>
              <div>{formatMoney(closeSummary.exit_price, closeSummary.exit_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.exit_fee")}</div>
              <div>{formatMoney(closeSummary.exit_fee, closeSummary.exit_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.gross_pnl")}</div>
              <div className="text-teal-200 dark:text-teal-900">{formatMoney(closeSummary.gross_pnl, trade.account_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.total_fees")}</div>
              <div>{formatMoney(closeSummary.total_fees, trade.account_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.net_pnl_after_fees")}</div>
              <div className={Number(closeSummary.net_pnl || 0) >= 0 ? "text-emerald-300 dark:text-emerald-800" : "text-red-300"}>
                {formatMoney(closeSummary.net_pnl, trade.account_currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.capital_gain")}</div>
              <div>
                {closeSummary.capital_gain_mode} {Number(closeSummary.capital_gain_rate || 0).toFixed(2)}%
                {closeSummary.instrument_type === "government_bond" || closeSummary.instrument_type === "titolo_di_stato" ? (
                  <span className="ml-1 text-xs text-emerald-400 font-medium">({t("trade_detail.gov_bond_tag")})</span>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.tax_estimate")}</div>
              <div>{closeSummary.capital_gain_tax_estimate === null || closeSummary.capital_gain_tax_estimate === undefined ? "-" : formatMoney(closeSummary.capital_gain_tax_estimate, trade.account_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.net_pnl_after_tax")}</div>
              <div className={closeNetAfterTax === null ? "" : closeNetAfterTax >= 0 ? "text-emerald-300 dark:text-emerald-800" : "text-red-300"}>
                {closeNetAfterTax === null ? "-" : formatMoney(closeNetAfterTax, trade.account_currency)}
              </div>
            </div>
          </div>
          {closeSummary.tax_note ? <div className="mt-3 text-sm text-slate-400 dark:text-slate-900">{closeSummary.tax_note}</div> : null}
        </section>
      ) : null}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-700/60 dark:border-slate-300/30">
        <button onClick={() => setActiveTab("chart")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "chart"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          {t("trade_detail.tab_chart")}
        </button>
        <button onClick={() => setActiveTab("technical")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "technical"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          {t("trade_detail.tab_technical")}
        </button>
        <button onClick={() => setActiveTab("close")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "close"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          {t("trade_detail.tab_close")}
        </button>
        <button onClick={() => setActiveTab("executions")}
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "executions"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          <span>{t("trade_detail.tab_executions")}</span>
          <span className="rounded-full bg-slate-800 dark:bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-300 dark:text-slate-700">
            {executions.length}
          </span>
        </button>
        <button onClick={() => setActiveTab("images")}
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "images"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          <span>{t("trade_detail.tab_images")}</span>
          {data.images.length > 0 && (
            <span className="rounded-full bg-slate-800 dark:bg-slate-200 px-1.5 py-0.2 text-[10px] font-semibold text-slate-300 dark:text-slate-700">
              {data.images.length}
            </span>
          )}
        </button>
        {hasCoaching && (
          <button
            onClick={() => setActiveTab("coaching")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "coaching"
                ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("trade_detail.tab_coaching")}
          </button>
        )}
      </div>

      {/* Chart Tab */}
      {activeTab === "chart" && (
        <section className="card p-4">
          <TradingViewChart symbol={trade.symbol} market={trade.market || undefined} />
          <div className="mt-2 text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.chart_symbol_hint")}</div>
        </section>
      )}

      {/* Technical Analysis Tab */}
      {activeTab === "technical" && (
        <section className="card p-4">
          <TradingViewTechnicalAnalysis symbol={trade.symbol} market={trade.market || undefined} />
        </section>
      )}

      {/* Close Tab */}
      {activeTab === "close" && trade.status !== "close" ? (
        <section className="card p-4">
          <div className="mb-3 text-lg font-semibold">{t("trade_detail.close_trade")}</div>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={closeForm.handleSubmit((values) => closeTrade.mutate(values))}>
            <label className="text-sm text-slate-300 dark:text-slate-900">
              {t("trade_detail.exit_datetime")}
              <div className="relative mt-1">
                <input
                  type="datetime-local"
                  {...closeForm.register("executed_at")}
                  ref={(el) => { closeForm.register("executed_at").ref(el); executedAtInputRef.current = el; }}
                  className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 pr-11"
                />
                <button
                  type="button"
                  onClick={openDateTimePicker}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-slate-800 dark:bg-slate-100 px-2 py-1 text-xs text-slate-200 dark:text-slate-900 hover:bg-slate-700"
                  title={t("trade_detail.open_date_picker")}
                  aria-label={t("trade_detail.open_date_picker")}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
            </label>
            <label className="text-sm text-slate-300 dark:text-slate-900">
              {t("trade_detail.exit_price")}
              <input type="number" step="0.000001" {...closeForm.register("price")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" />
            </label>
            <label className="text-sm text-slate-300 dark:text-slate-900">
              {t("trade_detail.close_reason_label")}
              <select {...closeForm.register("close_reason")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2">
                <option value="manual">{t("trade_detail.close_reason.manual")}</option>
                <option value="take_profit">{t("trade_detail.close_reason.take_profit")}</option>
                <option value="stop_loss">{t("trade_detail.close_reason.stop_loss")}</option>
              </select>
            </label>
            <label className="text-sm text-slate-300 dark:text-slate-900">
              {t("trade_detail.note")}
              <input {...closeForm.register("note")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" placeholder={t("trade_detail.optional")} />
            </label>
            <div className="md:col-span-4 flex justify-end gap-2">
              <button
                type="submit"
                disabled={closeTrade.isPending}
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                {closeTrade.isPending ? t("trade_detail.closing") : t("trade_detail.close_trade")}
              </button>
            </div>
          </form>
          {closeTrade.error ? <div className="mt-3 text-sm text-red-300 dark:text-red-600">{t("trade_detail.close_failed")}</div> : null}
          <div className="mt-3 text-xs text-slate-400 dark:text-slate-900">
            {t("trade_detail.close_hint")}
          </div>
        </section>
      ) : activeTab === "close" ? (
        <section className="card p-4">
          <div className="text-sm text-slate-400 dark:text-slate-900">{t("trade_detail.tab_close_closed")}</div>
        </section>
      ) : null}

      {/* Executions Tab */}
      {activeTab === "executions" && (
        <section className="card overflow-hidden">
          {/* Executive Summary Strip */}
          <div className="border-b border-slate-700/80 dark:border-slate-300/60 bg-slate-900/40 dark:bg-slate-100/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white dark:text-slate-950 flex items-center gap-2">
                <span>📑</span> {t("trade_detail.executions_summary")}
              </h2>
              {hasMultipleEntries && (
                <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-2.5 py-0.5 text-xs font-semibold text-teal-300 dark:text-teal-800">
                  {t("trade_detail.multiple_entries_badge", { count: entryExecutions.length })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="rounded-xl bg-teal-500/10 border border-teal-500/25 p-3">
                <div className="text-[11px] font-medium text-teal-300/80 dark:text-teal-700">
                  {t("trade_detail.average_entry_price")}
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-teal-300 dark:text-teal-800 mt-0.5">
                  {formatMoney(pmc, trade.account_currency)}
                </div>
              </div>

              {hasMultipleEntries && (
                <div className="rounded-xl bg-sky-500/10 border border-sky-500/25 p-3">
                  <div className="text-[11px] font-medium text-sky-300/80 dark:text-sky-700">
                    {t("trade_detail.first_entry_price")}
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-sky-300 dark:text-sky-800 mt-0.5">
                    {formatMoney(firstEntryPrice, trade.account_currency)}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-slate-800/40 dark:bg-white/60 border border-slate-700/50 dark:border-slate-300/60 p-3">
                <div className="text-[11px] font-medium text-slate-400 dark:text-slate-600">
                  {t("trade_detail.total_entry_qty")}
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMetric(totalEntryQty)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/40 dark:bg-white/60 border border-slate-700/50 dark:border-slate-300/60 p-3">
                <div className="text-[11px] font-medium text-slate-400 dark:text-slate-600">
                  {t("trade_detail.total_invested")}
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMoney(totalEntryValue, trade.account_currency)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/40 dark:bg-white/60 border border-slate-700/50 dark:border-slate-300/60 p-3">
                <div className="text-[11px] font-medium text-slate-400 dark:text-slate-600">
                  {t("trade_detail.fields.total_fees")}
                </div>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-200 dark:text-slate-900 mt-0.5">
                  {formatMoney(totalAllFees, trade.account_currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/80 dark:border-slate-300 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600 bg-slate-900/60 dark:bg-slate-100/60">
                  <th className="px-4 py-3">{t("trade_detail.columns.date")}</th>
                  <th className="px-4 py-3">{t("trade_detail.columns.role")}</th>
                  <th className="px-4 py-3">{t("trade_detail.columns.action")}</th>
                  <th className="px-4 py-3 text-right">{t("trade_detail.columns.qty")}</th>
                  <th className="px-4 py-3 text-right">{t("trade_detail.columns.price")}</th>
                  <th className="px-4 py-3 text-right">{t("trade_detail.columns.total")}</th>
                  <th className="px-4 py-3 text-right">{t("trade_detail.columns.fee")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 dark:divide-slate-200/60">
                {analyzedExecutions.length ? (
                  analyzedExecutions.map((execution) => (
                    <tr
                      key={execution.id}
                      className={`transition-colors hover:bg-slate-800/30 dark:hover:bg-slate-100/50 ${
                        execution.isBuy ? "bg-emerald-500/[0.02]" : "bg-rose-500/[0.02]"
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-300 dark:text-slate-700 whitespace-nowrap">
                        {new Date(execution.executed_at).toLocaleString(getActiveLocale())}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {execution.role === "first_entry" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-400 dark:text-emerald-700">
                            ★ {t("trade_detail.role_first_entry")}
                          </span>
                        ) : execution.role === "scale_in" ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span className="rounded bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-xs font-semibold text-teal-300 dark:text-teal-800">
                              {t("trade_detail.role_scale_in", { index: execution.roleIndex })}
                            </span>
                            {execution.deltaFromFirstPct !== null && (
                              <span
                                className={`text-[11px] font-mono font-medium ${
                                  execution.deltaFromFirstPct >= 0
                                    ? "text-amber-400 dark:text-amber-700"
                                    : "text-emerald-400 dark:text-emerald-700"
                                }`}
                                title={`${t("trade_detail.delta_from_first")}: ${execution.deltaFromFirstPct.toFixed(2)}%`}
                              >
                                ({execution.deltaFromFirstPct >= 0 ? "+" : ""}
                                {execution.deltaFromFirstPct.toFixed(2)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-xs font-semibold text-rose-300 dark:text-rose-700">
                            {trade.status === "close"
                              ? t("trade_detail.role_close")
                              : t("trade_detail.role_exit")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-bold uppercase rounded ${
                            execution.isBuy
                              ? "bg-emerald-500/15 text-emerald-400 dark:text-emerald-700"
                              : "bg-rose-500/15 text-rose-400 dark:text-rose-700"
                          }`}
                        >
                          {execution.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-200 dark:text-slate-800 whitespace-nowrap">
                        {formatMetric(execution.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200 dark:text-slate-900 whitespace-nowrap">
                        {formatMoney(execution.price, execution.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-200 dark:text-slate-900 whitespace-nowrap">
                        {formatMoney(execution.totalAmount, execution.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400 dark:text-slate-600 whitespace-nowrap">
                        {formatMoney(execution.fee, execution.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-600">
                      {t("trade_detail.no_executions")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Images Tab */}
      {activeTab === "images" && (
        <section className="card p-4">
          <div className="mb-3 text-lg font-semibold">{t("trade_detail.trade_images")}</div>
          {data.images.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={async () => {
                    if (zoomImageUrl) {
                      URL.revokeObjectURL(zoomImageUrl);
                    }
                    const variant = image.annotated_path ? "annotated" : "original";
                    try {
                      const zoomUrl = await fetchTradeImageBlobUrl(image.id, variant);
                      setZoomImageUrl(zoomUrl);
                    } catch {
                      setZoomImageUrl(null);
                    }
                  }}
                  className="overflow-hidden rounded border border-slate-700 dark:border-slate-300 text-left"
                >
                  <div className="aspect-video bg-slate-900 dark:bg-white">
                    {thumbnailUrls[image.id] ? (
                      <img
                        src={thumbnailUrls[image.id]}
                        alt={`Trade image ${image.id}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400">{t("trade_detail.preview_unavailable")}</div>
                    )}
                  </div>
                  <div className="px-2 py-1 text-xs text-slate-300 dark:text-slate-900">
                    #{image.id} {image.annotated_path ? t("trade_detail.annotated") : t("trade_detail.original")}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400 dark:text-slate-900">{t("trade_detail.no_images")}</div>
          )}
        </section>
      )}

      {/* Coaching AI Tab */}
      {activeTab === "coaching" && hasCoaching && (
        <section className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-700/80 dark:border-slate-300/60">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <h2 className="text-lg font-bold text-white dark:text-slate-950 flex items-center gap-2">
                  <span>{t("trade_detail.tab_coaching")}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300 dark:text-violet-700 font-mono">
                    #{latestAnalysisSummary?.id}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-600">
                  {latestAnalysisSummary?.completed_at
                    ? new Date(latestAnalysisSummary.completed_at).toLocaleString(getActiveLocale())
                    : latestAnalysisSummary?.created_at
                      ? new Date(latestAnalysisSummary.created_at).toLocaleString(getActiveLocale())
                      : ""}
                  {latestAnalysisSummary?.llm_model_used ? ` • ${latestAnalysisSummary.llm_model_used}` : ""}
                </p>
              </div>
            </div>
            <Link
              to={`/analysis?symbol=${encodeURIComponent(trade.symbol)}${trade.market ? `&market=${encodeURIComponent(trade.market)}` : ""}&tradeId=${trade.id}`}
              className="rounded bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-sm"
              title={t("trade_detail.ai_coaching_title")}
            >
              <span>⚡</span>
              <span>{t("trade_detail.re_run_coaching")}</span>
            </Link>
          </div>

          {isAnalysisLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {t("trade_detail.coaching_loading")}
            </div>
          ) : latestAnalysisReport &&
            latestAnalysisReport.symbol?.trim().toUpperCase() === trade.symbol.trim().toUpperCase() ? (
            <ReportViewer report={latestAnalysisReport} />
          ) : null}
        </section>
      )}

      {zoomImageUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="relative w-full max-w-6xl">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(zoomImageUrl);
                setZoomImageUrl(null);
              }}
              className="absolute right-2 top-2 rounded bg-slate-800 dark:bg-slate-100 px-3 py-2 text-sm text-white"
            >
              {t("common.close")}
            </button>
            <img src={zoomImageUrl} alt="Zoom trade image" className="max-h-[88vh] w-full rounded object-contain" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
