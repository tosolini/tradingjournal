import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BaselineSeries, createChart, LineSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { useChartLabels } from "../lib/useChartLabels";
import {
  deleteHolding,
  deleteHoldingExit,
  downloadBondCalendarIcs,
  fetchHoldingCalendar,
  fetchHoldingDetail,
  fetchHoldingExits,
  fetchHoldingPriceHistory,
  HoldingDetail,
  HoldingExit,
  HoldingPriceHistory,
  HoldingPriceHistoryPoint,
  HoldingSingleDetail,
  syncHoldingEuronext,
} from "../lib/api";
import { HoldingEditFormModal } from "./PortfolioPage";
import { HoldingExitModal } from "../components/HoldingExitModal";
import {
  formatMoney,
  formatNumber,
  formatPct,
  getActiveLocale,
  getNumberLocale,
  parseLocaleNumber as asNumber,
} from "../lib/numbers";
function colorForPct(value: string | number | null | undefined): string {
  const n = asNumber(value);
  if (n > 0) return "text-green-400 dark:text-green-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-900";
}

function formatDate(dateStr: string | null | undefined, locale = getActiveLocale()): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function PriceSpreadChart({
  history,
  locale = getActiveLocale(),
}: {
  history: HoldingPriceHistory;
  locale?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<{
    nominal?: ISeriesApi<"Line">;
    cost?: ISeriesApi<"Line">;
    market?: ISeriesApi<"Baseline">;
    projection?: ISeriesApi<"Line">;
  }>({});
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [showProjection, setShowProjection] = useState(false);
  const [showLabels, toggleLabels] = useChartLabels();
  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;

  const points = history.points || [];
  const historicalPoints = useMemo(() => points.filter((p) => !p.is_projection), [points]);
  const projectionPoints = useMemo(() => points.filter((p) => p.is_projection), [points]);
  const hasProjection = projectionPoints.length > 0;

  useEffect(() => {
    if (!ref.current || points.length === 0) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 320,
      layout: {
        background: { color: isDark ? "#0f172a" : "#ffffff" },
        textColor: isDark ? "#94a3b8" : "#475569",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)" },
        horzLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
      },
      timeScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        rightOffsetPixels: showLabelsRef.current ? 90 : 10,
      },
    });

    const activeRangePoints = showProjection ? points : (historicalPoints.length > 0 ? historicalPoints : points);

    // 1. Linea Prezzo Nominale (100.00)
    const nominalSeries = chart.addSeries(LineSeries, {
      color: isDark ? "#94a3b8" : "#64748b",
      lineWidth: 2,
      lineStyle: 2, // Dashed
      title: showLabelsRef.current ? t("holding_detail.chart.series_nominal") : "",
      priceLineVisible: false,
    });
    nominalSeries.setData(
      activeRangePoints.map((p) => ({
        time: p.date,
        value: asNumber(p.nominal_price),
      }))
    );

    // 2. Linea Prezzo di Carico (avg_cost)
    const costSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Amber
      lineWidth: 2,
      lineStyle: 3, // Dotted
      title: showLabelsRef.current ? t("holding_detail.chart.series_cost") : "",
      priceLineVisible: false,
    });
    costSeries.setData(
      activeRangePoints.map((p) => ({
        time: p.date,
        value: asNumber(p.avg_cost),
      }))
    );

    // 3. Serie Prezzo di Mercato Reale (BaselineSeries basata sul prezzo medio di carico)
    const marketSeriesData = (historicalPoints.length > 0 ? historicalPoints : points).map((p) => ({
      time: p.date,
      value: asNumber(p.market_price),
    }));

    const avgCostValue = asNumber(history.avg_cost) || (points.length > 0 ? asNumber(points[points.length - 1].avg_cost) : 0);

    const marketSeries = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: avgCostValue },
      topLineColor: isDark ? "#2dd4bf" : "#0d9488",
      topFillColor1: isDark ? "rgba(45, 212, 191, 0.28)" : "rgba(13, 148, 136, 0.22)",
      topFillColor2: isDark ? "rgba(45, 212, 191, 0.02)" : "rgba(13, 148, 136, 0.02)",
      bottomLineColor: isDark ? "#f87171" : "#dc2626",
      bottomFillColor1: isDark ? "rgba(248, 113, 113, 0.02)" : "rgba(220, 38, 38, 0.02)",
      bottomFillColor2: isDark ? "rgba(248, 113, 113, 0.28)" : "rgba(220, 38, 38, 0.22)",
      lineWidth: 2,
      title: showLabelsRef.current ? t("holding_detail.chart.series_market") : "",
      priceLineVisible: true,
    });
    marketSeries.setData(marketSeriesData);

    // 4. Se abilitata, linea di proiezione Pull-to-Par a scadenza (tratteggiata)
    let projectionSeries: ISeriesApi<"Line"> | undefined;
    if (showProjection && hasProjection) {
      projectionSeries = chart.addSeries(LineSeries, {
        color: isDark ? "#2dd4bf" : "#0d9488",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        title: showLabelsRef.current ? t("holding_detail.chart.series_projection") : "",
        priceLineVisible: false,
      });

      const lastHist = historicalPoints[historicalPoints.length - 1];
      const projData = [
        ...(lastHist ? [{ time: lastHist.date, value: asNumber(lastHist.market_price) }] : []),
        ...projectionPoints.map((p) => ({ time: p.date, value: asNumber(p.market_price) })),
      ];
      projectionSeries.setData(projData);
    }

    chartRef.current = chart;
    seriesRefs.current = {
      nominal: nominalSeries,
      cost: costSeries,
      market: marketSeries,
      projection: projectionSeries,
    };

    chart.timeScale().fitContent();

    const resize = () => {
      if (ref.current) {
        chart.applyOptions({ width: ref.current.clientWidth });
      }
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chartRef.current = null;
      seriesRefs.current = {};
      chart.remove();
    };
  }, [points, historicalPoints, projectionPoints, showProjection, hasProjection, isDark, history.avg_cost, t]);

  useEffect(() => {
    const { nominal, cost, market, projection } = seriesRefs.current;
    nominal?.applyOptions({ title: showLabels ? t("holding_detail.chart.series_nominal") : "" });
    cost?.applyOptions({ title: showLabels ? t("holding_detail.chart.series_cost") : "" });
    market?.applyOptions({ title: showLabels ? t("holding_detail.chart.series_market") : "" });
    projection?.applyOptions({ title: showLabels ? t("holding_detail.chart.series_projection") : "" });
    chartRef.current?.timeScale().applyOptions({
      rightOffsetPixels: showLabels ? 90 : 10,
    });
  }, [showLabels, t]);

  const currentP = asNumber(history.current_price);
  const nominalP = asNumber(history.nominal_price) || 100;
  const costP = asNumber(history.avg_cost);
  const spreadToNominal = currentP - nominalP;
  const spreadToCost = currentP - costP;

  return (
    <div className="card overflow-hidden p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3 dark:border-slate-200">
        <div>
          <h3 className="text-base font-semibold text-teal-200 dark:text-teal-900">
            {t("holding_detail.chart.title")}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {t("holding_detail.chart.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-teal-400 dark:bg-teal-600" />
            <span className="text-slate-300 dark:text-slate-800">{t("holding_detail.chart.market")}</span>
            <span className="font-mono font-semibold text-teal-300 dark:text-teal-900">
              {formatNumber(currentP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/60 px-2.5 py-1 dark:border-slate-300 dark:bg-slate-100">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="text-slate-300 dark:text-slate-800">{t("holding_detail.chart.nominal")}</span>
            <span className="font-mono font-semibold text-slate-200 dark:text-slate-900">
              {formatNumber(nominalP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-slate-300 dark:text-slate-800">{t("holding_detail.chart.cost")}</span>
            <span className="font-mono font-semibold text-amber-300 dark:text-amber-900">
              {formatNumber(costP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1 dark:border-slate-300 dark:bg-slate-50">
            <span className="text-slate-400 dark:text-slate-700">{t("holding_detail.chart.spread_nominal")}</span>
            <span className={`font-mono font-semibold ${colorForPct(spreadToNominal)}`}>
              {formatPct(spreadToNominal, 2, locale)}
            </span>
          </div>

          {hasProjection && (
            <button
              type="button"
              onClick={() => setShowProjection((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition-colors ${
                showProjection
                  ? "border-teal-500 bg-teal-500/20 text-teal-300 dark:border-teal-600 dark:text-teal-900"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${showProjection ? "bg-teal-400" : "bg-slate-400"}`} />
              <span>{showProjection ? t("holding_detail.chart.hide_projection") : t("holding_detail.chart.show_projection")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleLabels}
            aria-pressed={showLabels}
            title={t("charts.toggle_labels_tooltip")}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition-colors ${
              showLabels
                ? "border-teal-500 bg-teal-500/20 text-teal-300 dark:border-teal-600 dark:text-teal-900"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${showLabels ? "bg-teal-400" : "bg-slate-400"}`} />
            <span>{t("charts.labels")}</span>
          </button>
        </div>
      </div>

      <div ref={ref} className="w-full" />

      {hasProjection && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800/40 p-2 text-xs text-slate-400 dark:bg-slate-100 dark:text-slate-600">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${showProjection ? "bg-teal-400 animate-pulse" : "bg-slate-400"}`} />
            <span>
              {showProjection
                ? t("holding_detail.chart.projection_hint")
                : t("holding_detail.chart.history_hint")}
            </span>
          </div>
          <span className="font-mono text-teal-400 dark:text-teal-700">{t("holding_detail.chart.redemption")}</span>
        </div>
      )}
    </div>
  );
}

export function HoldingDetailPage() {
  const { holdingId } = useParams<{ holdingId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = getNumberLocale(i18n.resolvedLanguage);
  const queryClient = useQueryClient();
  const toast = useToast();
  const exitTypeLabel = (type: string) => {
    if (type === "maturity") {
      return t("portfolio.exit_maturity");
    }
    if (type === "early_redemption") {
      return t("portfolio.exit_early_redemption");
    }
    return t("portfolio.exit_market_sale");
  };

  const [editTarget, setEditTarget] = useState<HoldingDetail | HoldingSingleDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; symbol: string } | null>(null);
  const [exitTarget, setExitTarget] = useState<HoldingDetail | HoldingSingleDetail | null>(null);
  const [exitToDelete, setExitToDelete] = useState<HoldingExit | null>(null);
  const [bulkExitMode, setBulkExitMode] = useState(false);

  // Queries
  const {
    data: holding,
    isLoading: loadingDetail,
    isError: errorDetail,
    refetch: refetchDetail,
  } = useQuery<HoldingSingleDetail>({
    queryKey: ["portfolio", "holding", holdingId],
    queryFn: () => fetchHoldingDetail(holdingId!, true),
    enabled: Boolean(holdingId),
  });

  const { data: priceHistory, isLoading: loadingHistory } = useQuery<HoldingPriceHistory>({
    queryKey: ["portfolio", "holding", holdingId, "history"],
    queryFn: () => fetchHoldingPriceHistory(holdingId!, true),
    enabled: Boolean(holdingId),
  });

  const { data: calendarItems, isLoading: loadingCalendar } = useQuery({
    queryKey: ["portfolio", "holding", holdingId, "calendar"],
    queryFn: () => fetchHoldingCalendar(holdingId!, true),
    enabled: Boolean(holdingId),
  });

  const { data: exitHistory, refetch: refetchExits } = useQuery<HoldingExit[]>({
    queryKey: ["portfolio", "holding", holdingId, "exits"],
    queryFn: () => fetchHoldingExits(holdingId!, true),
    enabled: Boolean(holdingId),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (id) => deleteHolding(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("portfolio.holding_deleted"));

      const remaining = (holding?.tranches ?? []).filter((tr) => tr.id !== deletedId);
      if (remaining.length > 0) {
        if (Number(holdingId) === deletedId) {
          navigate(`/portfolio/holdings/${remaining[0].id}`, { replace: true });
        } else {
          refetchDetail();
        }
      } else {
        navigate("/portfolio");
      }
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(t("holding_detail.delete_error", { message: err.message }));
    },
  });

  const deleteExitMutation = useMutation({
    mutationFn: (exitId: number) => deleteHoldingExit(exitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      refetchDetail();
      refetchExits();
      toast.success(t("portfolio.exit_deleted"));
      setExitToDelete(null);
    },
    onError: (err: Error) => {
      toast.error(t("holding_detail.undo_exit_error", { message: err.message }));
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncHoldingEuronext(holdingId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      refetchDetail();
      toast.success(
        t("portfolio.sync_euronext_success")
      );
    },
    onError: (err: Error) => {
      toast.error(`Errore sincronizzazione Euronext: ${err.message}`);
    },
  });

  const isBond = useMemo(() => {
    const it = (holding?.instrument_type || "").toLowerCase();
    return it === "bond" || it === "government_bond" || it === "titolo_di_stato";
  }, [holding]);

  const tranches = useMemo(() => holding?.tranches ?? [], [holding]);
  const trancheCount = holding?.tranche_count ?? 1;
  const isAggregated = trancheCount > 1 && tranches.length > 0;
  const isClosed = asNumber(holding?.quantity) <= 0;
  const isMatured = Boolean(
    isBond &&
      holding?.bond_detail?.maturity_date &&
      new Date(holding.bond_detail.maturity_date).getTime() <= Date.now() &&
      asNumber(holding?.quantity) > 0,
  );

  const handleExitDone = () => {
    refetchDetail();
    refetchExits();
    queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    queryClient.invalidateQueries({ queryKey: ["bonds"] });
    queryClient.invalidateQueries({ queryKey: ["ledger"] });
    setExitTarget(null);
    setBulkExitMode(false);
  };

  const openSingleExit = (target: HoldingDetail | HoldingSingleDetail) => {
    setBulkExitMode(false);
    setExitTarget(target);
  };

  const startBulkExit = () => {
    if (!holding) return;
    setBulkExitMode(true);
    setExitTarget(holding);
  };

  // Aggregated future cash flows
  const cashFlowSummary = useMemo(() => {
    if (!calendarItems || calendarItems.length === 0) {
      return { totalGross: 0, totalTax: 0, totalNet: 0, couponCount: 0, redemptionNet: 0 };
    }
    let totalGross = 0;
    let totalTax = 0;
    let totalNet = 0;
    let couponCount = 0;
    let redemptionNet = 0;

    for (const item of calendarItems) {
      const net = asNumber(item.net_amount);
      const gross = asNumber(item.gross_amount);
      const tax = asNumber(item.tax_amount);
      totalNet += net;
      totalGross += gross;
      totalTax += tax;
      if (item.flow_type === "coupon") {
        couponCount++;
      } else if (item.flow_type === "redemption") {
        redemptionNet += net;
      }
    }
    return { totalGross, totalTax, totalNet, couponCount, redemptionNet };
  }, [calendarItems]);

  // Timeline progress calculation
  const timelineProgress = useMemo(() => {
    if (!holding) return null;
    const entryDate = new Date(holding.entry_date).getTime();
    const today = new Date().getTime();
    const maturityDateStr = holding.bond_detail?.maturity_date || holding.exit_date;
    if (!maturityDateStr) return null;

    const maturityDate = new Date(maturityDateStr).getTime();
    const totalDuration = maturityDate - entryDate;
    if (totalDuration <= 0) return { pct: 100, elapsedDays: holding.hold_duration_days || 0, remainingDays: 0 };

    const elapsed = Math.max(0, today - entryDate);
    const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    return {
      pct,
      elapsedDays: holding.hold_duration_days || 0,
      remainingDays: holding.remaining_days || 0,
    };
  }, [holding]);

  if (loadingDetail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-600">{t("holding_detail.loading")}</p>
        </div>
      </div>
    );
  }

  if (errorDetail || !holding) {
    return (
      <div className="p-6">
        <div className="card border-red-500/30 p-8 text-center">
          <h2 className="text-xl font-bold text-red-400">{t("holding_detail.not_found_title")}</h2>
          <p className="mt-2 text-sm text-slate-400">
            {t("holding_detail.not_found_hint")}
          </p>
          <Link
            to="/portfolio"
            className="mt-4 inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
          >
            {t("holding_detail.back_to_portfolio")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Breadcrumb & Top Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-600">
          <Link
            to="/portfolio"
            className="flex items-center gap-1 font-medium text-teal-400 hover:text-teal-300 dark:text-teal-700 dark:hover:text-teal-800"
          >
            ← {t("portfolio.title")}
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-200 dark:text-slate-900">{holding.asset_symbol}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/analysis?symbol=${holding.asset_symbol}`}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 dark:text-indigo-800 transition-colors"
            title={t("portfolio.ai_analysis_title")}
          >
            <span aria-hidden="true">🤖</span>
            <span>{t("portfolio.ai_analysis")}</span>
          </Link>
          {isBond && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 disabled:opacity-50 dark:text-teal-800"
              title={t("portfolio.sync_euronext_title")}
            >
              <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {syncMutation.isPending
                ? t("portfolio.sync_euronext_loading")
                : t("portfolio.sync_euronext")}
            </button>
          )}
          {!isAggregated && !isClosed && (
            <>
              <button
                onClick={() => openSingleExit(holding)}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 dark:text-amber-800"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                {t("portfolio.register_exit")}
              </button>
              <button
                onClick={() => setEditTarget(holding)}
                className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 dark:text-sky-700"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                {t("portfolio.edit_holding")}
              </button>

              <button
                onClick={() => setDeleteTarget({ id: holding.id, symbol: holding.asset_symbol })}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 dark:text-red-700"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                </svg>
                {t("portfolio.delete")}
              </button>
            </>
          )}
          {!isAggregated && isClosed && (
            <span className="rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-300 dark:text-purple-800">
              {t("portfolio.position_closed")}
              {holding.closed_at ? ` · ${formatDate(holding.closed_at, locale)}` : ""}
            </span>
          )}
          {isAggregated && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-600">
                {t("holding_detail.aggregated_hint")}
              </span>
              <button
                onClick={startBulkExit}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 dark:text-amber-800"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                {t("portfolio.sell_all_position")}
              </button>
            </div>
          )}
        </div>
      </div>

      {isMatured && (
        <div className="card border-amber-500/40 bg-amber-500/10 p-4 dark:border-amber-300 dark:bg-amber-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-300 dark:text-amber-800">
                {t("portfolio.maturity_due")}
              </h2>
              <p className="mt-1 text-xs text-slate-300 dark:text-slate-700">
                {t("portfolio.maturity_due_hint")}{" "}
                {holding.bond_detail?.maturity_date
                  ? formatDate(holding.bond_detail.maturity_date, locale)
                  : ""}
              </p>
            </div>
            {isAggregated ? (
              <span className="text-xs text-amber-300 dark:text-amber-800">
                {t("portfolio.maturity_due_tranches")}
              </span>
            ) : (
              <button
                onClick={() => openSingleExit(holding)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                {t("portfolio.register_maturity")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Header Title & Badges ─────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-900">
                {holding.asset_symbol}
              </h1>
              {holding.isin && (
                <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800">
                  {holding.isin}
                </span>
              )}
              <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-semibold uppercase text-teal-300 dark:text-teal-800">
                {holding.instrument_type}
              </span>
              {isAggregated && (
                <span className="rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300 dark:text-sky-800">
                  {trancheCount} tranche
                </span>
              )}
              {isAggregated ? (
                holding.all_eligible_for_bonus ? (
                  <span className="rounded-md border border-teal-500/40 bg-teal-500/20 px-2 py-0.5 text-xs font-bold text-teal-300 dark:text-teal-800">
                    {t("holding_detail.badge_cum_all")}
                  </span>
                ) : holding.has_eligible_for_bonus ? (
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300 dark:text-amber-800">
                    {t("holding_detail.badge_cum_some")}
                  </span>
                ) : null
              ) : (
                holding.eligible_for_bonus && (
                  <span className="rounded-md border border-teal-500/40 bg-teal-500/20 px-2 py-0.5 text-xs font-bold text-teal-300 dark:text-teal-800">
                    {t("holding_detail.badge_cum")}
                  </span>
                )
              )}
            </div>
            <p className="mt-1.5 text-base text-slate-300 dark:text-slate-700">{holding.asset_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-slate-600">
              <span>
                {t("holding_detail.label_account")}{" "}
                <strong className="text-slate-200 dark:text-slate-900">{holding.account_name}</strong>
              </span>
              {holding.exchange && (
                <span>
                  {t("holding_detail.label_exchange")}{" "}
                  <strong className="text-slate-200 dark:text-slate-900">{holding.exchange}</strong>
                </span>
              )}
              <span>
                {t("holding_detail.label_currency")}{" "}
                <strong className="text-slate-200 dark:text-slate-900">{holding.asset_currency}</strong>
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs uppercase text-slate-400 dark:text-slate-600">{t("holding_detail.market_value")}</div>
            <div className="mt-1 text-2xl font-bold text-teal-300 dark:text-teal-900">
              {formatMoney(holding.market_value, holding.asset_currency, locale)}
            </div>
            <div className={`mt-0.5 text-sm font-semibold ${colorForPct(holding.return_pct)}`}>
              {formatMoney(holding.return_value, holding.asset_currency, locale)} ({formatPct(holding.return_pct)})
            </div>
          </div>
        </div>
      </div>

      {/* ── Key Metrics Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? t("holding_detail.kpi_nominal_qty") : t("holding_detail.kpi_quantity")}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100 dark:text-slate-900">
            {isBond
              ? `${Number(holding.quantity).toLocaleString(locale)} €`
              : Number(holding.quantity).toLocaleString(locale, { maximumFractionDigits: 4 })}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
            {isAggregated ? `${t("portfolio.tranches_count", { count: trancheCount })} · ` : ""}
            {t("holding_detail.cost_value")} {formatMoney(holding.cost_basis, holding.asset_currency, locale)}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? t("holding_detail.kpi_cost_price") : t("holding_detail.kpi_avg_cost")}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-amber-300 dark:text-amber-800">
            {isBond ? `${formatNumber(holding.avg_cost, { minDecimals: 2, maxDecimals: 2, locale })}%` : formatMoney(holding.avg_cost, holding.asset_currency, locale)}
          </div>
          {isBond && asNumber(holding.accrued_interest_in) > 0 && (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {t("holding_detail.accrued_at_purchase")}{" "}
              +{formatNumber(holding.accrued_interest_in, { minDecimals: 2, maxDecimals: 4, locale })}%
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? t("holding_detail.kpi_dirty_price_now") : t("holding_detail.kpi_market_live")}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-teal-300 dark:text-teal-800">
            {isBond ? `${formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}%` : formatMoney(holding.current_price, holding.asset_currency, locale)}
          </div>
          {isBond && holding.dirty_price && (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {t("holding_detail.kpi_dirty_price")}{" "}
              <span className="font-mono font-medium text-slate-200 dark:text-slate-800">
                {formatNumber(holding.dirty_price, { minDecimals: 2, maxDecimals: 2, locale })}%
              </span>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? t("holding_detail.kpi_ytm_net") : t("holding_detail.kpi_unrealized")}
          </div>
          <div className={`mt-1.5 text-xl font-bold font-mono ${isBond ? "text-green-400 dark:text-green-700" : colorForPct(holding.return_pct)}`}>
            {isBond
              ? holding.ytm_net != null
                ? formatPct(holding.ytm_net)
                : "—"
              : formatPct(holding.return_pct)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
            {isBond && holding.ytm_gross != null
              ? `${t("holding_detail.ytm_gross_short")} ${formatPct(holding.ytm_gross, 2, locale)}`
              : `${t("holding_detail.return_short")} ${formatMoney(holding.return_value, holding.asset_currency, locale)}`}
          </div>
        </div>
      </div>

      {/* ── Ciclo di Vita & Timeline Temporale ─────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-teal-200 dark:text-teal-900">
          {t("holding_detail.timeline.title")}
        </h2>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
          {t("holding_detail.timeline.subtitle")}
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              {t("holding_detail.timeline.bought_on")}
            </div>
            <div className="mt-2 text-lg font-bold text-slate-100 dark:text-slate-900">
              {formatDate(holding.entry_date, locale)}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {t("holding_detail.timeline.elapsed")}{" "}
              <strong className="font-mono text-slate-200 dark:text-slate-800">
                {t("holding_detail.timeline.elapsed_days", { count: holding.hold_duration_days ?? 0 })}
              </strong>{" "}
              {t("holding_detail.timeline.elapsed_suffix")}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
              {t("holding_detail.timeline.today")}
            </div>
            <div className="mt-2 text-lg font-bold text-teal-300 dark:text-teal-900">
              {formatDate(new Date().toISOString().split("T")[0], locale)}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {t("holding_detail.timeline.active_position")}{" "}
              <strong className="text-green-400 dark:text-green-700 font-semibold">
                {t("holding_detail.timeline.active")}
              </strong>{" "}
              {t("holding_detail.timeline.in_portfolio")}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
              {t("holding_detail.timeline.end")}
            </div>
            <div className="mt-2 text-lg font-bold text-slate-100 dark:text-slate-900">
              {formatDate(holding.bond_detail?.maturity_date || holding.exit_date, locale)}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {holding.remaining_days != null ? (
                holding.remaining_days > 0 ? (
                  <>
                    <strong className="font-mono text-purple-300 dark:text-purple-800">
                      {t("holding_detail.timeline.remaining", { count: holding.remaining_days })}
                    </strong>{" "}
                    {t("holding_detail.timeline.remaining_years", {
                      years: Math.round((holding.remaining_days / 365.25) * 10) / 10,
                    })}
                  </>
                ) : (
                  <span className="text-amber-400 font-semibold">
                    {t("holding_detail.timeline.matured")}
                  </span>
                )
              ) : (
                t("holding_detail.timeline.no_maturity")
              )}
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        {timelineProgress && (
          <div className="mt-6 pt-4 border-t border-slate-800 dark:border-slate-200">
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-600 mb-2">
              <span>
                {t("holding_detail.timeline.purchase")} ({formatDate(holding.entry_date, locale)})
              </span>
              <span className="font-mono font-semibold text-teal-300 dark:text-teal-800">
                {t("holding_detail.timeline.completed_pct", {
                  pct: formatNumber(timelineProgress.pct, { minDecimals: 1, maxDecimals: 1, locale }),
                })}
              </span>
              <span>
                {t("holding_detail.timeline.maturity")} (
                {formatDate(holding.bond_detail?.maturity_date || holding.exit_date, locale)})
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800 dark:bg-slate-200">
              <div
                className="h-full bg-gradient-to-r from-teal-500 via-sky-500 to-purple-500 transition-all duration-500"
                style={{ width: `${timelineProgress.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Rendimento: Nominale vs Attuale (Solo Obbligazioni) ────────────────── */}
      {isBond && (
        <div className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Blocco 1: Rendimento Nominale */}
            <div className="card p-6 border-slate-700/70 dark:border-slate-300">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 dark:border-slate-200">
                <div>
                  <h3 className="text-base font-semibold text-slate-100 dark:text-slate-900">
                    {t("holding_detail.nominal_yield.title")}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-600">
                    {t("holding_detail.nominal_yield.subtitle")}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-mono font-semibold text-slate-300 dark:bg-slate-100 dark:text-slate-800">
                  {holding.bond_detail?.bond_type === "step_up"
                    ? t("holding_detail.nominal_yield.type_step_up")
                    : t("holding_detail.nominal_yield.type_fixed")}
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.nominal_yield.coupon_rate")}</span>
                  <span className="font-mono font-bold text-lg text-slate-100 dark:text-slate-900">
                    {formatNumber(holding.nominal_yield, { minDecimals: 2, maxDecimals: 2, locale })}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.nominal_yield.frequency")}</span>
                  <span className="font-mono font-medium text-slate-200 dark:text-slate-800">
                    {holding.bond_detail?.coupon_frequency === 4
                      ? t("holding_detail.nominal_yield.freq_quarterly")
                      : holding.bond_detail?.coupon_frequency === 2
                        ? t("holding_detail.nominal_yield.freq_semiannual")
                        : holding.bond_detail?.coupon_frequency === 1
                          ? t("holding_detail.nominal_yield.freq_annual")
                          : t("holding_detail.nominal_yield.freq_zero")}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.nominal_yield.tax_rate")}</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    {formatNumber(holding.bond_detail?.tax_rate, { minDecimals: 2, maxDecimals: 2, locale })}%
                  </span>
                </div>

                {asNumber(holding.bond_detail?.final_bonus_rate) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.nominal_yield.final_bonus")}</span>
                    <span className="font-mono font-semibold text-teal-400 dark:text-teal-700">
                      +{formatNumber(holding.bond_detail?.final_bonus_rate, { minDecimals: 2, maxDecimals: 2, locale })}%
                    </span>
                  </div>
                )}

                {/* Step Up Schedule Table if applicable */}
                {holding.bond_detail?.step_up_schedule && holding.bond_detail.step_up_schedule.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-850 p-3 dark:border-slate-200 dark:bg-slate-50">
                    <div className="text-xs font-semibold text-slate-300 dark:text-slate-800 mb-2">
                      {t("holding_detail.nominal_yield.step_up_plan")}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {holding.bond_detail.step_up_schedule.map((step, idx) => (
                        <div key={idx} className="flex justify-between bg-slate-800/60 dark:bg-slate-100 p-1.5 rounded">
                          <span className="text-slate-400">
                            {t("holding_detail.nominal_yield.step_up_years", {
                              from: step.from_year,
                              to: step.to_year,
                            })}
                          </span>
                          <span className="font-mono font-bold text-teal-300 dark:text-teal-800">{formatNumber(step.rate, { minDecimals: 2, maxDecimals: 2, locale })}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Blocco 2: Rendimento Attuale di Mercato */}
            <div className="card p-6 border-slate-700/70 dark:border-slate-300">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 dark:border-slate-200">
                <div>
                  <h3 className="text-base font-semibold text-teal-200 dark:text-teal-900">
                    {t("holding_detail.market_yield.title")}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-600">
                    {t("holding_detail.market_yield.subtitle")}
                  </p>
                </div>
                <span className="rounded-lg bg-teal-500/20 px-2.5 py-1 text-xs font-mono font-semibold text-teal-300 dark:text-teal-900">
                  {t("holding_detail.market_yield.price")}{" "}
                  {formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}%
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.market_yield.ytm_net")}</span>
                  <span className="font-mono font-bold text-lg text-green-400 dark:text-green-700">
                    {formatPct(holding.ytm_net, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.market_yield.ytm_gross")}</span>
                  <span className="font-mono font-semibold text-slate-100 dark:text-slate-900">
                    {formatPct(holding.ytm_gross, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.market_yield.current_yield")}</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    {formatPct(holding.current_yield, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.market_yield.accrued")}</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    +{formatNumber(holding.accrued_interest, { minDecimals: 4, maxDecimals: 4, locale })}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">{t("holding_detail.market_yield.dirty_price")}</span>
                  <span className="font-mono font-semibold text-teal-300 dark:text-teal-800">
                    {formatNumber(holding.dirty_price, { minDecimals: 2, maxDecimals: 2, locale })}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Box Analisi Scostamento Rendimento */}
          <div className="card border-teal-500/30 bg-teal-500/5 p-4 dark:border-teal-300 dark:bg-teal-50/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-teal-500/20 p-2 text-teal-300 dark:bg-teal-100 dark:text-teal-800 shrink-0">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100 dark:text-slate-900">
                    {t("holding_detail.spread.title")}
                  </h4>
                  <p className="mt-1 text-xs text-slate-300 dark:text-slate-700 leading-relaxed">
                    {asNumber(holding.current_price) < 100
                      ? t("holding_detail.spread.below_par", {
                          price: formatNumber(holding.current_price, {
                            minDecimals: 2,
                            maxDecimals: 2,
                            locale,
                          }),
                          gain: formatNumber(100 - asNumber(holding.current_price), {
                            minDecimals: 2,
                            maxDecimals: 2,
                            locale,
                          }),
                          ytm: formatPct(holding.ytm_net, 2, locale),
                        })
                      : asNumber(holding.current_price) > 100
                        ? t("holding_detail.spread.above_par", {
                            price: formatNumber(holding.current_price, {
                              minDecimals: 2,
                              maxDecimals: 2,
                              locale,
                            }),
                            loss: formatNumber(asNumber(holding.current_price) - 100, {
                              minDecimals: 2,
                              maxDecimals: 2,
                              locale,
                            }),
                            ytm: formatPct(holding.ytm_net, 2, locale),
                          })
                        : t("holding_detail.spread.at_par")}
                  </p>
                </div>
              </div>

              {holding.yield_spread != null && (
                <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-right">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-600">
                    {t("holding_detail.spread.spread_label")}
                  </div>
                  <div className={`text-xl font-bold font-mono ${colorForPct(holding.yield_spread)}`}>
                    {formatPct(holding.yield_spread, 2, locale)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Grafico Scostamento Prezzo ────────────────────────────────────────── */}
      {priceHistory && priceHistory.points.length > 0 && (
        <PriceSpreadChart history={priceHistory} locale={locale} />
      )}

      {/* ── Future Cedole del Titolo ──────────────────────────────────────────── */}
      {isBond && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-5 dark:border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
                {t("holding_detail.coupons.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
                {isAggregated
                  ? t("holding_detail.coupons.subtitle_aggregated", {
                      count: trancheCount,
                      nominal: Number(holding.quantity).toLocaleString(locale),
                    })
                  : t("holding_detail.coupons.subtitle_single", {
                      nominal: Number(holding.quantity).toLocaleString(locale),
                    })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-800">
                {t("holding_detail.coupons.count", { count: calendarItems?.length ?? 0 })}
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadBondCalendarIcs({
                    holdingId: Number(holding.id),
                    aggregate: isAggregated,
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 dark:border-teal-700/30 dark:bg-teal-50 dark:text-teal-800 dark:hover:bg-teal-100 transition-colors"
                title={t("portfolio.export_calendar_ics")}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 3v13.5" />
                </svg>
                <span>{t("portfolio.export_calendar_ics")}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-600 bg-slate-850 dark:bg-slate-50">
                  <th className="p-3">{t("holding_detail.coupons.col_date")}</th>
                  <th className="p-3">{t("holding_detail.coupons.col_flow_type")}</th>
                  <th className="p-3 text-right">{t("holding_detail.coupons.col_rate")}</th>
                  <th className="p-3 text-right">{t("holding_detail.coupons.col_gross")}</th>
                  <th className="p-3 text-right">{t("holding_detail.coupons.col_tax")}</th>
                  <th className="p-3 text-right">{t("holding_detail.coupons.col_net")}</th>
                </tr>
              </thead>
              <tbody>
                {(!calendarItems || calendarItems.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      {t("holding_detail.coupons.empty")}
                    </td>
                  </tr>
                )}
                {calendarItems?.map((item, idx) => {
                  const isRedemption = item.flow_type === "redemption";
                  const isBonus = item.flow_type === "bonus";
                  const isFirst = idx === 0;

                  return (
                    <tr
                      key={`${item.date}-${item.flow_type}-${idx}`}
                      className={`border-b border-slate-850 hover:bg-slate-800/40 dark:border-slate-100 dark:hover:bg-slate-50 ${
                        isRedemption ? "bg-purple-500/5 font-semibold" : ""
                      }`}
                    >
                      <td className="p-3 font-mono text-slate-200 dark:text-slate-900 flex items-center gap-2">
                        <span>{formatDate(item.date, locale)}</span>
                        {isFirst && (
                          <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300 dark:text-teal-800">
                            {t("holding_detail.coupons.tag_next")}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {isRedemption ? (
                          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-300 dark:text-purple-800">
                            {t("holding_detail.coupons.flow_redemption")}
                          </span>
                        ) : isBonus ? (
                          <span className="rounded bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300 dark:text-teal-800">
                            {t("holding_detail.coupons.flow_bonus")}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-800">{t("holding_detail.coupons.flow_coupon")}</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 dark:text-slate-800">
                        {isRedemption
                          ? `${formatNumber(100, { minDecimals: 2, maxDecimals: 2, locale })}%`
                          : `${formatNumber(item.rate, { minDecimals: 2, maxDecimals: 2, locale })}%`}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 dark:text-slate-800">
                        {formatMoney(item.gross_amount, holding.asset_currency, locale)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400 dark:text-slate-600 text-xs">
                        {asNumber(item.tax_amount) > 0 ? `-${formatMoney(item.tax_amount, holding.asset_currency, locale)}` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-teal-300 dark:text-teal-900">
                        {formatMoney(item.net_amount, holding.asset_currency, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Totali Flussi */}
          {calendarItems && calendarItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3 border-t border-slate-700/60 p-4 bg-slate-850 dark:border-slate-200 dark:bg-slate-50">
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600">
                  {t("holding_detail.coupons.foot_total_net")}
                </div>
                <div className="mt-1 text-base font-bold font-mono text-teal-300 dark:text-teal-900">
                  {formatMoney(
                    cashFlowSummary.totalNet - cashFlowSummary.redemptionNet,
                    holding.asset_currency,
                    locale,
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {t("holding_detail.coupons.foot_coupon_count", { count: cashFlowSummary.couponCount })}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600">
                  {t("holding_detail.coupons.foot_redemption")}
                </div>
                <div className="mt-1 text-base font-bold font-mono text-purple-300 dark:text-purple-900">
                  {formatMoney(cashFlowSummary.redemptionNet, holding.asset_currency, locale)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {t("holding_detail.coupons.foot_nominal_note")}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600">
                  {t("holding_detail.coupons.foot_total")}
                </div>
                <div className="mt-1 text-base font-bold font-mono text-green-400 dark:text-green-700">
                  {formatMoney(cashFlowSummary.totalNet, holding.asset_currency, locale)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {t("holding_detail.coupons.foot_total_note")}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tranche Breakdown (aggregated view only) ─────────────────────────── */}
      {isAggregated && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-5 dark:border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
                {t("holding_detail.tranches.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
                {t("holding_detail.tranches.subtitle", { count: trancheCount })}
              </p>
            </div>
            <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-800">
              {trancheCount} tranche
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-850 text-xs uppercase text-slate-400 dark:border-slate-300 dark:bg-slate-50 dark:text-slate-600">
                  <th className="p-3">#</th>
                  <th className="p-3">{t("holding_detail.tranches.col_entry_date")}</th>
                  <th className="p-3 text-right">
                    {isBond
                      ? t("holding_detail.tranches.col_nominal")
                      : t("holding_detail.tranches.col_quantity")}
                  </th>
                  <th className="p-3 text-right">{t("holding_detail.tranches.col_cost_price")}</th>
                  <th className="p-3 text-right">{t("holding_detail.tranches.col_accrued_in")}</th>
                  <th className="p-3 text-right">{t("holding_detail.tranches.col_market_value")}</th>
                  <th className="p-3 text-right">{t("holding_detail.tranches.col_return")}</th>
                  <th className="p-3 text-center">{t("holding_detail.tranches.col_cum")}</th>
                  <th className="p-3 text-right">{t("holding_detail.tranches.col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tranches.map((tr, idx) => (
                  <tr
                    key={tr.id}
                    className="border-b border-slate-850 hover:bg-slate-800/40 dark:border-slate-100 dark:hover:bg-slate-50"
                  >
                    <td className="p-3 font-mono text-slate-400 dark:text-slate-600">#{idx + 1}</td>
                    <td className="p-3 font-mono text-slate-200 dark:text-slate-900">
                      {formatDate(tr.entry_date, locale)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200 dark:text-slate-900">
                      {isBond
                        ? `${Number(tr.quantity).toLocaleString(locale)} €`
                        : Number(tr.quantity).toLocaleString(locale, { maximumFractionDigits: 4 })}
                    </td>
                    <td className="p-3 text-right font-mono text-amber-300 dark:text-amber-800">
                      {isBond
                        ? `${formatNumber(tr.avg_cost, { minDecimals: 2, maxDecimals: 2, locale })}%`
                        : formatMoney(tr.avg_cost, tr.asset_currency, locale)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400 dark:text-slate-600">
                      {asNumber(tr.accrued_interest_in) > 0
                        ? `+${formatNumber(tr.accrued_interest_in, { minDecimals: 2, maxDecimals: 4, locale })}%`
                        : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200 dark:text-slate-900">
                      {formatMoney(tr.market_value, tr.asset_currency, locale)}
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${colorForPct(tr.return_pct)}`}>
                      {formatMoney(tr.return_value, tr.asset_currency, locale)} ({formatPct(tr.return_pct, 2, locale)})
                    </td>
                    <td className="p-3 text-center">
                      {tr.eligible_for_bonus ? (
                        <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300 dark:text-teal-800">
                          {t("holding_detail.tranches.cum_yes")}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        {asNumber(tr.quantity) > 0 && (
                          <button
                            onClick={() => openSingleExit(tr)}
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-400 hover:bg-amber-500/20 dark:text-amber-800"
                            title={t("portfolio.register_exit")}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                              <path d="M16 17l5-5-5-5" />
                              <path d="M21 12H9" />
                            </svg>
                          </button>
                        )}
                        {asNumber(tr.quantity) > 0 && (
                          <button
                            onClick={() => setEditTarget(tr)}
                            className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-1.5 text-sky-400 hover:bg-sky-500/20 dark:text-sky-700"
                            title={t("portfolio.edit_holding")}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          </button>
                        )}
                        {asNumber(tr.quantity) > 0 && (
                          <button
                            onClick={() => setDeleteTarget({ id: tr.id, symbol: tr.asset_symbol })}
                            className="rounded-lg border border-red-500/40 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 dark:text-red-700"
                            title={t("portfolio.delete")}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
                        )}
                        {asNumber(tr.quantity) <= 0 && (
                          <span className="text-[11px] text-purple-300 dark:text-purple-800">
                            {t("portfolio.position_closed")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Exit History ─────────────────────────────────────────────────────── */}
      {exitHistory && exitHistory.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-5 dark:border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
                {t("portfolio.exit_history")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
                {t("portfolio.exit_history_hint")}
              </p>
            </div>
            <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-800">
              {exitHistory.length} {t("portfolio.exit_count")}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-850 text-xs uppercase text-slate-400 dark:border-slate-300 dark:bg-slate-50 dark:text-slate-600">
                  <th className="p-3">{t("portfolio.exit_col_date")}</th>
                  <th className="p-3">{t("portfolio.exit_col_type")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_quantity")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_price")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_net")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_pnl")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_taxes")}</th>
                  <th className="p-3">{t("portfolio.exit_col_notes")}</th>
                  <th className="p-3 text-right">{t("portfolio.exit_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {exitHistory.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-850 hover:bg-slate-800/40 dark:border-slate-100 dark:hover:bg-slate-50"
                  >
                    <td className="p-3 font-mono text-slate-200 dark:text-slate-900">
                      {formatDate(item.exit_date, locale)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          item.exit_type === "maturity"
                            ? "bg-purple-500/20 text-purple-300 dark:text-purple-800"
                            : item.exit_type === "early_redemption"
                              ? "bg-amber-500/20 text-amber-300 dark:text-amber-800"
                              : "bg-teal-500/20 text-teal-300 dark:text-teal-800"
                        }`}
                      >
                        {exitTypeLabel(item.exit_type)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200 dark:text-slate-900">
                      {formatNumber(item.quantity, { minDecimals: 0, maxDecimals: 6, locale })}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200 dark:text-slate-900">
                      {isBond
                        ? `${formatNumber(item.clean_price, { minDecimals: 2, maxDecimals: 2, locale })}%`
                        : formatMoney(item.clean_price, item.currency, locale)}
                    </td>
                    <td className="p-3 text-right font-mono font-semibold text-teal-300 dark:text-teal-800">
                      {formatMoney(item.net_proceeds, item.currency, locale)}
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${colorForPct(item.realized_pnl)}`}>
                      {formatMoney(item.realized_pnl, item.currency, locale)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400 dark:text-slate-600">
                      {formatMoney(item.taxes, item.currency, locale)}
                    </td>
                    <td className="p-3 max-w-[220px] truncate text-xs text-slate-400 dark:text-slate-600">
                      {item.notes || "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => setExitToDelete(item)}
                          className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 dark:text-red-700"
                        >
                          {t("portfolio.exit_undo")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <HoldingEditFormModal
        open={editTarget !== null}
        holding={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          refetchDetail();
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        }}
      />

      <HoldingExitModal
        key={`${exitTarget?.id ?? "exit-modal"}-${bulkExitMode ? "bulk" : "single"}`}
        open={exitTarget !== null}
        holding={exitTarget}
        maturityDate={holding.bond_detail?.maturity_date ?? null}
        bulk={bulkExitMode}
        onClose={() => {
          setExitTarget(null);
          setBulkExitMode(false);
        }}
        onDone={handleExitDone}
      />

      {deleteTarget && (
        <ConfirmModal
          message={t("holding_detail.delete_confirm", { symbol: deleteTarget.symbol })}
          confirmLabel={t("portfolio.delete")}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {exitToDelete && (
        <ConfirmModal
          message={t("holding_detail.undo_exit_confirm", {
            date: formatDate(exitToDelete.exit_date, locale),
            symbol: exitToDelete.asset_symbol,
          })}
          confirmLabel={t("portfolio.exit_undo")}
          onConfirm={() => deleteExitMutation.mutate(exitToDelete.id)}
          onCancel={() => setExitToDelete(null)}
          isPending={deleteExitMutation.isPending}
        />
      )}
    </div>
  );
}
export default HoldingDetailPage;
