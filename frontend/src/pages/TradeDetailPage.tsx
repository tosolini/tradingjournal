import { zodResolverTyped } from "../lib/zod-resolver";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Account, Broker, Trade, TradeDetail, api, fetchTradeImageBlobUrl } from "../lib/api";
import { estimateExecutionFee, isGovernmentBond } from "../lib/fees";
import { TradingViewChart } from "../components/TradingViewChart";
import { TradingViewTechnicalAnalysis } from "../components/TradingViewTechnicalAnalysis";

const closeTradeSchema = z.object({
  executed_at: z.string().min(1),
  price: z.coerce.number().positive(),
  close_reason: z.enum(["manual", "take_profit", "stop_loss"]),
  note: z.string().optional(),
});

type CloseTradePayload = z.infer<typeof closeTradeSchema>;

function formatMetric(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return "-";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "-";
  }
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoney(value: string | number | undefined, currency?: string): string {
  if (value === undefined || value === null) {
    return "-";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "-";
  }
  const normalized = (currency || "").trim().toUpperCase();
  if (!normalized) {
    return formatMetric(n);
  }
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: normalized }).format(n);
  } catch {
    return `${formatMetric(n)} ${normalized}`;
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
    queryFn: () => api<Broker[]>('/api/brokers'),
  });
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chart" | "technical" | "close" | "executions" | "images">("chart");

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
      price: Number(data.trade.average_exit_price || data.trade.target_price || data.trade.average_entry_price || 0),
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
  const entryPrice = asNumber(tradeData?.average_entry_price);
  const openQty = asNumber(tradeData?.open_position_qty);
  const tpValue = asNumber(tradeData?.target_price);
  const slValue = asNumber(tradeData?.stop_loss);
  const account = accounts?.find((item) => item.id === tradeData?.account_id);
  const broker = account?.broker_id ? brokers?.find((item) => item.id === account.broker_id) : undefined;
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
  const estimatedCapitalGainTax = tpAbs === null || tpAbs <= 0 ? 0 : (tpAbs * capitalGainRate) / 100;
  const netTpAfterFees = tpAbs === null ? null : tpAbs - estimatedTpFee - estimatedCapitalGainTax;
  const netSlAfterFees = slAbs === null ? null : slAbs + estimatedSlFee;
  const closeSummary = data?.closure;
  const tpPct = tradeData ? computeTpPct(tradeData.side, entryPrice, tpValue) : null;
  const slPct = tradeData ? computeSlPct(tradeData.side, entryPrice, slValue) : null;
  const closeNetAfterTax = closeSummary
    ? closeSummary.capital_gain_tax_estimate === null || closeSummary.capital_gain_tax_estimate === undefined
      ? null
      : Number(closeSummary.net_pnl || 0) - Number(closeSummary.capital_gain_tax_estimate || 0)
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

  const sortedIds = allTrades ? [...allTrades].sort((a, b) => a.id - b.id).map((tr) => tr.id) : [];
  const currentIndex = sortedIds.indexOf(tradeId);
  const prevId = currentIndex > 0 ? sortedIds[currentIndex - 1] : null;
  const nextId = currentIndex !== -1 && currentIndex < sortedIds.length - 1 ? sortedIds[currentIndex + 1] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("trade_detail.title", { id: trade.id })}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-900">{t("trade_detail.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => prevId !== null && navigate(`/trades/${prevId}`)}
            disabled={prevId === null}
            title="Trade precedente"
            aria-label="Trade precedente"
            className="rounded bg-slate-700 p-2 text-slate-200 dark:text-slate-900 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => nextId !== null && navigate(`/trades/${nextId}`)}
            disabled={nextId === null}
            title="Trade successivo"
            aria-label="Trade successivo"
            className="rounded bg-slate-700 p-2 text-slate-200 dark:text-slate-900 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <Link to={`/trades/${trade.id}/edit`} className="rounded bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950">
            {t("trade_detail.edit")}
          </Link>
          <Link to={`/trades/${trade.id}/images`} className="rounded bg-indigo-500 px-3 py-2 text-sm font-semibold text-white">
            {t("trade_detail.images")}
          </Link>
        </div>
      </div>

      <section className="card grid gap-3 p-4 md:grid-cols-4">
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.symbol")}</div>
          <div className="font-semibold text-teal-200 dark:text-teal-900">{trade.symbol}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.direction")}</div>
          <div>{trade.side}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.status")}</div>
          <div>{trade.status}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.instrument_type", "Strumento")}</div>
          <div className="flex items-center gap-1.5">
            <span className="capitalize">{trade.instrument_type ? trade.instrument_type.replace('_', ' ') : "Stock"}</span>
            {isGovBond && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                12.5% Gov
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.account")}</div>
          <div>{trade.account_id}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.take_profit")}</div>
          <div className="text-emerald-300 dark:text-emerald-800">{formatMoney(trade.target_price, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.tp_pct")}</div>
          <div className="text-emerald-300 dark:text-emerald-800">{tpPct === null ? "-" : `${tpPct.toFixed(2)}%`}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.stop_loss")}</div>
          <div className="text-red-300 dark:text-red-600">{formatMoney(trade.stop_loss, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.sl_pct")}</div>
          <div className="text-red-300 dark:text-red-600">{slPct === null ? "-" : `${slPct.toFixed(2)}%`}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.tp_abs")}</div>
          <div className="text-emerald-300 dark:text-emerald-800">{tpAbs === null ? "-" : formatMoney(tpAbs, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.tp_net")}</div>
          <div className="text-emerald-300 dark:text-emerald-800">{netTpAfterFees === null ? "-" : formatMoney(netTpAfterFees, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.sl_abs")}</div>
          <div className="text-red-300 dark:text-red-600">{slAbs === null ? "-" : formatMoney(slAbs, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.sl_net")}</div>
          <div className="text-red-300 dark:text-red-600">{netSlAfterFees === null ? "-" : formatMoney(netSlAfterFees, trade.account_currency)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.return")}</div>
          <div className={Number(trade.net_return || 0) >= 0 ? "text-emerald-300 dark:text-emerald-800" : "text-red-400 dark:text-red-600"}>
            {formatMoney(trade.net_return, trade.account_currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.return_pct")}</div>
          <div className={Number(trade.return_pct || 0) >= 0 ? "text-emerald-300 dark:text-emerald-800" : "text-red-400 dark:text-red-600"}>
            {formatMetric(trade.return_pct)}%
          </div>
        </div>
      </section>

      {trade.status === "open" && data.current_price != null ? (
        <section className="card p-4 border border-teal-600/40">
          <h2 className="mb-3 text-lg font-semibold text-teal-300">{t("trade_detail.current_market")}</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">{t("trade_detail.fields.market_price")}</div>
              <div className="text-lg font-semibold">{formatMoney(data.current_price, trade.account_currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t("trade_detail.fields.market_value")}</div>
              <div>{data.pnl ? formatMoney((data.pnl as Record<string, unknown>).market_value as string | number | undefined, trade.account_currency) : "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t("trade_detail.fields.unrealized_pnl")}</div>
              <div className={Number((data.pnl as Record<string, unknown>)?.unrealized_pnl || 0) >= 0 ? "text-emerald-300" : "text-red-400"}>
                {data.pnl ? formatMoney((data.pnl as Record<string, unknown>).unrealized_pnl as string | number | undefined, trade.account_currency) : "-"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">{t("trade_detail.fields.current_return_pct")}</div>
              <div className={Number((data.pnl as Record<string, unknown>)?.return_pct || 0) >= 0 ? "text-emerald-300" : "text-red-400"}>
                {data.pnl ? formatMetric((data.pnl as Record<string, unknown>).return_pct as string | number | undefined) : "-"}%
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {trade.status === "close" && closeSummary ? (
        <section className="card p-4">
          <div className="mb-3 text-lg font-semibold">{t("trade_detail.close_summary")}</div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-900">{t("trade_detail.fields.closed_at")}</div>
              <div>{new Date(closeSummary.closed_at).toLocaleString()}</div>
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
                  <span className="ml-1 text-xs text-emerald-400 font-medium">({t("trade_detail.gov_bond_tag", "Titolo di Stato")})</span>
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
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "executions"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          {t("trade_detail.tab_executions")}
        </button>
        <button onClick={() => setActiveTab("images")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "images"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-700"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
          }`}
        >
          {t("trade_detail.tab_images")}
        </button>
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
                  title="Apri selettore data"
                  aria-label="Apri selettore data"
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
        <section className="card overflow-x-auto">
          <div className="border-b border-slate-700/80 px-4 py-3 text-lg font-semibold">{t("trade_detail.executions")}</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 dark:border-slate-300 text-left text-slate-400 dark:text-slate-900">
                <th className="px-3 py-2">{t("trade_detail.columns.date")}</th>
                <th className="px-3 py-2">{t("trade_detail.columns.action")}</th>
                <th className="px-3 py-2">{t("trade_detail.columns.qty")}</th>
                <th className="px-3 py-2">{t("trade_detail.columns.price")}</th>
                <th className="px-3 py-2">{t("trade_detail.columns.fee")}</th>
              </tr>
            </thead>
            <tbody>
              {executions.length ? (
                executions.map((execution) => (
                  <tr key={execution.id} className="border-b border-slate-800/80">
                    <td className="px-3 py-2">{new Date(execution.executed_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{execution.action}</td>
                    <td className="px-3 py-2">{formatMetric(execution.quantity)}</td>
                    <td className="px-3 py-2">{formatMoney(execution.price, execution.currency)}</td>
                    <td className="px-3 py-2">{formatMoney(execution.fee, execution.currency)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-slate-400 dark:text-slate-900">{t("trade_detail.no_executions")}</td>
                </tr>
              )}
            </tbody>
          </table>
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
