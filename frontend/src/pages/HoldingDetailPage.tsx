import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AreaSeries, createChart, LineSeries } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import {
  deleteHolding,
  fetchHoldingCalendar,
  fetchHoldingDetail,
  fetchHoldingPriceHistory,
  HoldingPriceHistory,
  HoldingPriceHistoryPoint,
  HoldingSingleDetail,
} from "../lib/api";
import { HoldingEditFormModal } from "./PortfolioPage";
import { formatMoney, formatNumber, formatPct, getNumberLocale, parseLocaleNumber as asNumber } from "../lib/numbers";
function colorForPct(value: string | number | null | undefined): string {
  const n = asNumber(value);
  if (n > 0) return "text-green-400 dark:text-green-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-900";
}

function formatDate(dateStr: string | null | undefined, locale = "it-IT"): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function PriceSpreadChart({ history, locale = "it-IT" }: { history: HoldingPriceHistory; locale?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const points = history.points || [];

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
      },
    });

    // 1. Linea Prezzo Nominale (100.00)
    const nominalSeries = chart.addSeries(LineSeries, {
      color: isDark ? "#94a3b8" : "#64748b",
      lineWidth: 2,
      lineStyle: 2, // Dashed
      title: "Nominale (100)",
      priceLineVisible: false,
    });
    nominalSeries.setData(
      points.map((p) => ({
        time: p.date,
        value: asNumber(p.nominal_price),
      }))
    );

    // 2. Linea Prezzo di Carico (avg_cost)
    const costSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Amber
      lineWidth: 2,
      lineStyle: 3, // Dotted
      title: "Prezzo Carico",
      priceLineVisible: false,
    });
    costSeries.setData(
      points.map((p) => ({
        time: p.date,
        value: asNumber(p.avg_cost),
      }))
    );

    // 3. Serie Prezzo di Mercato / Traiettoria
    const marketSeries = chart.addSeries(AreaSeries, {
      lineColor: isDark ? "#2dd4bf" : "#0d9488",
      topColor: isDark ? "rgba(45, 212, 191, 0.28)" : "rgba(13, 148, 136, 0.22)",
      bottomColor: isDark ? "rgba(45, 212, 191, 0.02)" : "rgba(13, 148, 136, 0.02)",
      lineWidth: 2,
      title: "Prezzo Mercato",
      priceLineVisible: true,
    });
    marketSeries.setData(
      points.map((p) => ({
        time: p.date,
        value: asNumber(p.market_price),
      }))
    );

    chart.timeScale().fitContent();

    const resize = () => {
      if (ref.current) {
        chart.applyOptions({ width: ref.current.clientWidth });
      }
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [points, isDark]);

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
            Scostamento Prezzo di Mercato vs Prezzo Nominale
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            Confronto visivo tra la quotazione corrente, il prezzo di carico e il valore nominale di rimborso a 100.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-teal-400 dark:bg-teal-600" />
            <span className="text-slate-300 dark:text-slate-800">Mercato:</span>
            <span className="font-mono font-semibold text-teal-300 dark:text-teal-900">
              {formatNumber(currentP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/60 px-2.5 py-1 dark:border-slate-300 dark:bg-slate-100">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="text-slate-300 dark:text-slate-800">Nominale:</span>
            <span className="font-mono font-semibold text-slate-200 dark:text-slate-900">
              {formatNumber(nominalP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-slate-300 dark:text-slate-800">Carico:</span>
            <span className="font-mono font-semibold text-amber-300 dark:text-amber-900">
              {formatNumber(costP, { minDecimals: 2, maxDecimals: 2, locale })}%
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1 dark:border-slate-300 dark:bg-slate-50">
            <span className="text-slate-400 dark:text-slate-700">Scostamento Nominale:</span>
            <span className={`font-mono font-semibold ${colorForPct(spreadToNominal)}`}>
              {formatPct(spreadToNominal, 2, locale)}
            </span>
          </div>
        </div>
      </div>

      <div ref={ref} className="w-full" />

      {points.some((p) => p.is_projection) && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800/40 p-2 text-xs text-slate-400 dark:bg-slate-100 dark:text-slate-600">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
            <span>
              La curva include la traiettoria di convergenza teorica a scadenza verso 100 (Pull-to-Par).
            </span>
          </div>
          <span className="font-mono text-teal-400 dark:text-teal-700">Rimborso: 100,00%</span>
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

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Queries
  const {
    data: holding,
    isLoading: loadingDetail,
    isError: errorDetail,
    refetch: refetchDetail,
  } = useQuery<HoldingSingleDetail>({
    queryKey: ["portfolio", "holding", holdingId],
    queryFn: () => fetchHoldingDetail(holdingId!),
    enabled: Boolean(holdingId),
  });

  const { data: priceHistory, isLoading: loadingHistory } = useQuery<HoldingPriceHistory>({
    queryKey: ["portfolio", "holding", holdingId, "history"],
    queryFn: () => fetchHoldingPriceHistory(holdingId!),
    enabled: Boolean(holdingId),
  });

  const { data: calendarItems, isLoading: loadingCalendar } = useQuery({
    queryKey: ["portfolio", "holding", holdingId, "calendar"],
    queryFn: () => fetchHoldingCalendar(holdingId!),
    enabled: Boolean(holdingId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHolding(Number(holdingId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("portfolio.holding_deleted", "Posizione eliminata con successo"));
      navigate("/portfolio");
    },
    onError: (err: Error) => {
      toast.error(`Errore eliminazione: ${err.message}`);
    },
  });

  const isBond = useMemo(() => {
    const it = (holding?.instrument_type || "").toLowerCase();
    return it === "bond" || it === "government_bond";
  }, [holding]);

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
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-600">Caricamento posizione in corso...</p>
        </div>
      </div>
    );
  }

  if (errorDetail || !holding) {
    return (
      <div className="p-6">
        <div className="card border-red-500/30 p-8 text-center">
          <h2 className="text-xl font-bold text-red-400">Posizione non trovata</h2>
          <p className="mt-2 text-sm text-slate-400">
            La partecipazione richiesta non esiste o non hai i permessi per visualizzarla.
          </p>
          <Link
            to="/portfolio"
            className="mt-4 inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
          >
            ← Torna al Portafoglio
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
            ← {t("portfolio.title", "Portafoglio")}
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-200 dark:text-slate-900">{holding.asset_symbol}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 dark:text-sky-700"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            {t("portfolio.edit_holding", "Modifica")}
          </button>

          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 dark:text-red-700"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
            {t("portfolio.delete", "Elimina")}
          </button>
        </div>
      </div>

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
              {holding.eligible_for_bonus && (
                <span className="rounded-md border border-teal-500/40 bg-teal-500/20 px-2 py-0.5 text-xs font-bold text-teal-300 dark:text-teal-800">
                  CUM / Premio Fedeltà
                </span>
              )}
            </div>
            <p className="mt-1.5 text-base text-slate-300 dark:text-slate-700">{holding.asset_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-slate-600">
              <span>
                Conto: <strong className="text-slate-200 dark:text-slate-900">{holding.account_name}</strong>
              </span>
              {holding.exchange && (
                <span>
                  Borsa: <strong className="text-slate-200 dark:text-slate-900">{holding.exchange}</strong>
                </span>
              )}
              <span>
                Valuta: <strong className="text-slate-200 dark:text-slate-900">{holding.asset_currency}</strong>
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs uppercase text-slate-400 dark:text-slate-600">Controvalore di Mercato</div>
            <div className="mt-1 text-2xl font-bold text-teal-300 dark:text-teal-900">
              {formatMoney(holding.market_value, holding.asset_currency)}
            </div>
            <div className={`mt-0.5 text-sm font-semibold ${colorForPct(holding.return_pct)}`}>
              {formatMoney(holding.return_value, holding.asset_currency)} ({formatPct(holding.return_pct)})
            </div>
          </div>
        </div>
      </div>

      {/* ── Key Metrics Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? "Valore Nominale Detenuto" : "Quantità Detenuta"}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100 dark:text-slate-900">
            {isBond
              ? `${Number(holding.quantity).toLocaleString("it-IT")} €`
              : Number(holding.quantity).toLocaleString("it-IT", { maximumFractionDigits: 4 })}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
            Controvalore di Carico: {formatMoney(holding.cost_basis, holding.asset_currency)}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? "Prezzo di Carico (% base 100)" : "Prezzo Medio d'Acquisto"}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-amber-300 dark:text-amber-800">
            {isBond ? `${formatNumber(holding.avg_cost, { minDecimals: 2, maxDecimals: 2, locale })}%` : formatMoney(holding.avg_cost, holding.asset_currency, locale)}
          </div>
          {isBond && asNumber(holding.accrued_interest_in) > 0 && (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              Rateo all'acquisto: +{formatNumber(holding.accrued_interest_in, { minDecimals: 2, maxDecimals: 4, locale })}%
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? "Prezzo Secco Attuale" : "Prezzo di Mercato Live"}
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono text-teal-300 dark:text-teal-800">
            {isBond ? `${formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}%` : formatMoney(holding.current_price, holding.asset_currency, locale)}
          </div>
          {isBond && holding.dirty_price && (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              Prezzo Tel Quel: <span className="font-mono font-medium text-slate-200 dark:text-slate-800">{formatNumber(holding.dirty_price, { minDecimals: 2, maxDecimals: 2, locale })}%</span>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase text-slate-400 dark:text-slate-600">
            {isBond ? "Rendimento Effettivo (YTM Netto)" : "P&L Non Realizzato"}
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
              ? `YTM Lordo: ${formatPct(holding.ytm_gross)}`
              : `Ritorno: ${formatMoney(holding.return_value, holding.asset_currency)}`}
          </div>
        </div>
      </div>

      {/* ── Ciclo di Vita & Timeline Temporale ─────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-teal-200 dark:text-teal-900">
          Ciclo di Vita & Timeline di Detenzione
        </h2>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
          Monitoraggio temporale: dalla data di acquisto fino alla scadenza o data programmata di uscita.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              Quando l'ho comprato
            </div>
            <div className="mt-2 text-lg font-bold text-slate-100 dark:text-slate-900">
              {formatDate(holding.entry_date)}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              Trascorsi: <strong className="font-mono text-slate-200 dark:text-slate-800">{holding.hold_duration_days ?? 0} giorni</strong> di detenzione
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
              Oggi / Stato Attuale
            </div>
            <div className="mt-2 text-lg font-bold text-teal-300 dark:text-teal-900">
              {formatDate(new Date().toISOString().split("T")[0])}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              Posizione <strong className="text-green-400 dark:text-green-700 font-semibold">Attiva</strong> in portafoglio
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
              Quando è prevista la fine
            </div>
            <div className="mt-2 text-lg font-bold text-slate-100 dark:text-slate-900">
              {formatDate(holding.bond_detail?.maturity_date || holding.exit_date)}
            </div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {holding.remaining_days != null ? (
                holding.remaining_days > 0 ? (
                  <>Mancano <strong className="font-mono text-purple-300 dark:text-purple-800">{holding.remaining_days} giorni</strong> ({Math.round(holding.remaining_days / 365.25 * 10) / 10} anni) al rimborso</>
                ) : (
                  <span className="text-amber-400 font-semibold">Posizione giunta a scadenza</span>
                )
              ) : (
                "Nessuna data di scadenza definita"
              )}
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        {timelineProgress && (
          <div className="mt-6 pt-4 border-t border-slate-800 dark:border-slate-200">
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-600 mb-2">
              <span>Acquisto ({formatDate(holding.entry_date)})</span>
              <span className="font-mono font-semibold text-teal-300 dark:text-teal-800">
                {formatNumber(timelineProgress.pct, { minDecimals: 1, maxDecimals: 1, locale })}% del ciclo completato
              </span>
              <span>Scadenza ({formatDate(holding.bond_detail?.maturity_date || holding.exit_date, locale)})</span>
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
                    Rendimento Nominale Garantito
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-600">
                    Condizioni contrattuali stabilite all'emissione dall'emittente
                  </p>
                </div>
                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-mono font-semibold text-slate-300 dark:bg-slate-100 dark:text-slate-800">
                  {holding.bond_detail?.bond_type === "step_up" ? "Step-Up" : "Fisso"}
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Tasso Cedolare Nominale Annuo:</span>
                  <span className="font-mono font-bold text-lg text-slate-100 dark:text-slate-900">
                    {formatNumber(holding.nominal_yield, { minDecimals: 2, maxDecimals: 2, locale })}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Frequenza Stacco Cedole:</span>
                  <span className="font-mono font-medium text-slate-200 dark:text-slate-800">
                    {holding.bond_detail?.coupon_frequency === 4
                      ? "Trimestrale (4/anno)"
                      : holding.bond_detail?.coupon_frequency === 2
                      ? "Semestrale (2/anno)"
                      : holding.bond_detail?.coupon_frequency === 1
                      ? "Annuale (1/anno)"
                      : "Zero-Coupon"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Aliquota Fiscale Applicata:</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    {formatNumber(holding.bond_detail?.tax_rate, { minDecimals: 2, maxDecimals: 2, locale })}%
                  </span>
                </div>

                {asNumber(holding.bond_detail?.final_bonus_rate) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 dark:text-slate-600">Premio Fedeltà Finale (CUM):</span>
                    <span className="font-mono font-semibold text-teal-400 dark:text-teal-700">
                      +{formatNumber(holding.bond_detail?.final_bonus_rate, { minDecimals: 2, maxDecimals: 2, locale })}%
                    </span>
                  </div>
                )}

                {/* Step Up Schedule Table if applicable */}
                {holding.bond_detail?.step_up_schedule && holding.bond_detail.step_up_schedule.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-850 p-3 dark:border-slate-200 dark:bg-slate-50">
                    <div className="text-xs font-semibold text-slate-300 dark:text-slate-800 mb-2">
                      Piano Cedolare Step-Up:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {holding.bond_detail.step_up_schedule.map((step, idx) => (
                        <div key={idx} className="flex justify-between bg-slate-800/60 dark:bg-slate-100 p-1.5 rounded">
                          <span className="text-slate-400">Anni {step.from_year}–{step.to_year}:</span>
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
                    Rendimento Attuale di Mercato
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-600">
                    Calcolato a oggi in base al prezzo di mercato e ai giorni residui
                  </p>
                </div>
                <span className="rounded-lg bg-teal-500/20 px-2.5 py-1 text-xs font-mono font-semibold text-teal-300 dark:text-teal-900">
                  Prezzo: {formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}%
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Rendimento a Scadenza (YTM Netto):</span>
                  <span className="font-mono font-bold text-lg text-green-400 dark:text-green-700">
                    {formatPct(holding.ytm_net, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Rendimento Lordo (YTM Lordo):</span>
                  <span className="font-mono font-semibold text-slate-100 dark:text-slate-900">
                    {formatPct(holding.ytm_gross, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Tasso Immediato (Current Yield):</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    {formatPct(holding.current_yield, 2, locale)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Rateo Maturato a oggi (% base 100):</span>
                  <span className="font-mono text-slate-200 dark:text-slate-800">
                    +{formatNumber(holding.accrued_interest, { minDecimals: 4, maxDecimals: 4, locale })}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 dark:text-slate-600">Prezzo Tel Quel (Corso Secco + Rateo):</span>
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
                    Analisi Differenziale Rendimento (Spread di Mercato)
                  </h4>
                  <p className="mt-1 text-xs text-slate-300 dark:text-slate-700 leading-relaxed">
                    {asNumber(holding.current_price) < 100 ? (
                      <>
                        Il titolo quota attualmente <strong>sotto la pari</strong> ({formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}% &lt; 100,00%).
                        Il rimborso a 100 alla scadenza garantisce un <strong>capital gain aggiuntivo</strong> di +{formatNumber(100 - asNumber(holding.current_price), { minDecimals: 2, maxDecimals: 2, locale })}%
                        che eleva il rendimento netto a scadenza (<strong>{formatPct(holding.ytm_net)}</strong>) rispetto alla cedola nominale.
                      </>
                    ) : asNumber(holding.current_price) > 100 ? (
                      <>
                        Il titolo quota attualmente <strong>sopra la pari</strong> ({formatNumber(holding.current_price, { minDecimals: 2, maxDecimals: 2, locale })}% &gt; 100,00%).
                        Il rimborso a 100 alla scadenza comporta una riduzione in conto capitale di -{formatNumber(asNumber(holding.current_price) - 100, { minDecimals: 2, maxDecimals: 2, locale })}%,
                        portando il rendimento effettivo a scadenza (<strong>{formatPct(holding.ytm_net)}</strong>) al di sotto della cedola nominale.
                      </>
                    ) : (
                      <>Il titolo quota esattamente alla pari (100,00%). Il rendimento effettivo coincide con la cedola nominale.</>
                    )}
                  </p>
                </div>
              </div>

              {holding.yield_spread != null && (
                <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-right">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-600">Spread Rendimento Netto</div>
                  <div className={`text-xl font-bold font-mono ${colorForPct(holding.yield_spread)}`}>
                    {formatPct(holding.yield_spread)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Grafico Scostamento Prezzo ────────────────────────────────────────── */}
      {priceHistory && priceHistory.points.length > 0 && (
        <PriceSpreadChart history={priceHistory} />
      )}

      {/* ── Future Cedole del Titolo ──────────────────────────────────────────── */}
      {isBond && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-5 dark:border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
                Future Cedole & Flussi di Cassa del Titolo
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
                Scadenzario dei flussi finanziari futuri calcolati esclusivamente per questa posizione ({Number(holding.quantity).toLocaleString(locale)} € nominali).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-800">
                {calendarItems?.length ?? 0} flussi futuri
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-600 bg-slate-850 dark:bg-slate-50">
                  <th className="p-3">Data Stacco</th>
                  <th className="p-3">Tipo Flusso</th>
                  <th className="p-3 text-right">Tasso %</th>
                  <th className="p-3 text-right">Importo Lordo</th>
                  <th className="p-3 text-right">Ritenuta Fiscale</th>
                  <th className="p-3 text-right">Netto Accreditato</th>
                </tr>
              </thead>
              <tbody>
                {(!calendarItems || calendarItems.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Nessun flusso cedolare futuro previsto per questa posizione.
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
                        <span>{formatDate(item.date)}</span>
                        {isFirst && (
                          <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300 dark:text-teal-800">
                            PROSSIMA
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {isRedemption ? (
                          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-300 dark:text-purple-800">
                            Rimborso Capitale (100%)
                          </span>
                        ) : isBonus ? (
                          <span className="rounded bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300 dark:text-teal-800">
                            Premio Fedeltà (CUM)
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-800">Cedola Periodica</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300 dark:text-slate-800">
                        {isRedemption ? (locale.startsWith("it") ? "100,00%" : "100.00%") : `${formatNumber(item.rate, { minDecimals: 2, maxDecimals: 2, locale })}%`}
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
                <div className="text-xs text-slate-400 dark:text-slate-600">Totale Cedole Future Nette</div>
                <div className="mt-1 text-base font-bold font-mono text-teal-300 dark:text-teal-900">
                  {formatMoney(cashFlowSummary.totalNet - cashFlowSummary.redemptionNet, holding.asset_currency)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {cashFlowSummary.couponCount} stacchi cedolari futuri
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600">Capitale Rimborsato a Scadenza</div>
                <div className="mt-1 text-base font-bold font-mono text-purple-300 dark:text-purple-900">
                  {formatMoney(cashFlowSummary.redemptionNet, holding.asset_currency)}
                </div>
                <div className="text-[11px] text-slate-500">100% del valore nominale</div>
              </div>

              <div>
                <div className="text-xs text-slate-400 dark:text-slate-600">Flusso Finanziario Totale Atteso</div>
                <div className="mt-1 text-base font-bold font-mono text-green-400 dark:text-green-700">
                  {formatMoney(cashFlowSummary.totalNet, holding.asset_currency)}
                </div>
                <div className="text-[11px] text-slate-500">Importo netto complessivo fino a maturity</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <HoldingEditFormModal
        open={editOpen}
        holding={holding}
        onClose={() => setEditOpen(false)}
        onUpdated={() => {
          refetchDetail();
          queryClient.invalidateQueries({ queryKey: ["portfolio"] });
        }}
      />

      {deleteOpen && (
        <ConfirmModal
          message={`Sei sicuro di voler eliminare la partecipazione di ${holding.asset_symbol}?`}
          confirmLabel={t("portfolio.delete", "Elimina")}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteOpen(false)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
export default HoldingDetailPage;
