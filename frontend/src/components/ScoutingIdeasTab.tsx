import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ticker, TradeIdea, TradeIdeaStatus, tickersApi, tradeIdeasApi } from "../lib/api";
import { openTradeCreateModal } from "../lib/trade-modal-event";
import { ConfirmModal } from "./ConfirmModal";
import { TagInput } from "./TagInput";
import { TradingViewChart } from "./TradingViewChart";
import {
  ActivityIcon,
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TrashIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "./icons";

interface ScoutingIdeasTabProps {
  initialSelectedIdeaId?: number | null;
}

export function ScoutingIdeasTab({ initialSelectedIdeaId }: ScoutingIdeasTabProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"distance" | "date" | "expiry">("distance");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<TradeIdea | null>(null);
  const [ideaToDelete, setIdeaToDelete] = useState<TradeIdea | null>(null);
  const [chartIdea, setChartIdea] = useState<TradeIdea | null>(null);

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ["trade-ideas", statusFilter, searchQuery],
    queryFn: () =>
      tradeIdeasApi.list({
        status: statusFilter,
        search: searchQuery.trim() || undefined,
      }),
  });

  const ideas = data?.items || [];
  const counts = data?.counts || {
    all: 0,
    watching: 0,
    triggered: 0,
    stale: 0,
    closed: 0,
    converted: 0,
  };

  // Mutations
  const refreshPricesMutation = useMutation({
    mutationFn: () => tradeIdeasApi.refreshPrices(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trade-ideas"] });
      qc.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
    },
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => tradeIdeasApi.renew(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trade-ideas"] });
      qc.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => tradeIdeasApi.close(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trade-ideas"] });
      qc.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tradeIdeasApi.delete(id),
    onSuccess: () => {
      setIdeaToDelete(null);
      qc.invalidateQueries({ queryKey: ["trade-ideas"] });
      qc.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
    },
  });

  // Sorting
  const sortedIdeas = useMemo(() => {
    const list = [...ideas];
    if (sortBy === "distance") {
      list.sort((a, b) => {
        // Triggered first
        if (a.status === "triggered" && b.status !== "triggered") return -1;
        if (b.status === "triggered" && a.status !== "triggered") return 1;

        const distA = a.distance_pct !== null && a.distance_pct !== undefined ? Math.abs(parseFloat(a.distance_pct)) : 9999;
        const distB = b.distance_pct !== null && b.distance_pct !== undefined ? Math.abs(parseFloat(b.distance_pct)) : 9999;
        return distA - distB;
      });
    } else if (sortBy === "expiry") {
      list.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [ideas, sortBy]);

  const handleOpenConvert = (idea: TradeIdea) => {
    openTradeCreateModal({
      tradeIdeaId: idea.id,
      symbol: idea.symbol,
      direction: idea.direction,
      entryPrice: idea.trigger_price,
      stopLossPrice: idea.stop_loss || undefined,
      targetPrice: idea.target_price || undefined,
    });
  };

  const calculateDaysLeft = (targetDateStr: string) => {
    const target = new Date(targetDateStr).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header & Actions ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 dark:text-slate-900 flex items-center gap-2">
            <span>🎯</span>
            <span>{t("scouting.title", "Idee di Trading & Scouting")}</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
            {t(
              "scouting.subtitle",
              "Traccia titoli e setup tecnici individuati durante lo screening; ricevi alert quando toccano il prezzo trigger.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => refreshPricesMutation.mutate()}
            disabled={refreshPricesMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-teal-500/50 hover:bg-slate-800 disabled:opacity-50 dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-50 cursor-pointer shadow-xs"
          >
            <RefreshCwIcon
              className={`h-3.5 w-3.5 ${refreshPricesMutation.isPending ? "animate-spin text-teal-400" : ""}`}
            />
            <span>{t("scouting.refresh_prices", "Aggiorna Prezzi")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingIdea(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-teal-400 active:scale-95 cursor-pointer"
          >
            <PlusIcon className="h-4 w-4 stroke-[2.5]" />
            <span>{t("scouting.new_idea", "+ Nuova Idea")}</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Triggered Card */}
        <div
          onClick={() => setStatusFilter("triggered")}
          className={`rounded-xl border p-3.5 transition cursor-pointer ${
            statusFilter === "triggered"
              ? "border-emerald-500 bg-emerald-500/15 dark:bg-emerald-50 shadow-md"
              : counts.triggered > 0
                ? "border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-50/50"
                : "border-slate-800 bg-slate-900/60 dark:border-slate-200 dark:bg-white"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-emerald-400 dark:text-emerald-700">
            <span>{t("scouting.kpi.triggered", "Trigger Raggiunto")}</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-100 dark:text-slate-900">
            {counts.triggered}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {t("scouting.kpi.ready_for_entry", "Pronti all'ingresso")}
          </div>
        </div>

        {/* Watching Card */}
        <div
          onClick={() => setStatusFilter("watching")}
          className={`rounded-xl border p-3.5 transition cursor-pointer ${
            statusFilter === "watching"
              ? "border-sky-500 bg-sky-500/15 dark:bg-sky-50 shadow-md"
              : "border-slate-800 bg-slate-900/60 dark:border-slate-200 dark:bg-white"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-sky-400 dark:text-sky-700">
            <span>{t("scouting.kpi.watching", "In Osservazione")}</span>
            <EyeIcon className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-100 dark:text-slate-900">
            {counts.watching}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {t("scouting.kpi.active_setups", "Monitorati attivamente")}
          </div>
        </div>

        {/* Stale Card */}
        <div
          onClick={() => setStatusFilter("stale")}
          className={`rounded-xl border p-3.5 transition cursor-pointer ${
            statusFilter === "stale"
              ? "border-amber-500 bg-amber-500/15 dark:bg-amber-50 shadow-md"
              : "border-slate-800 bg-slate-900/60 dark:border-slate-200 dark:bg-white"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-amber-400 dark:text-amber-700">
            <span>{t("scouting.kpi.stale", "Stale / Da Valutare")}</span>
            <ClockIcon className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-100 dark:text-slate-900">
            {counts.stale}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {t("scouting.kpi.stale_desc", "Nessun trigger da 7+ gg")}
          </div>
        </div>

        {/* Converted & Closed Card */}
        <div
          onClick={() => setStatusFilter(statusFilter === "converted" ? "closed" : "converted")}
          className={`rounded-xl border p-3.5 transition cursor-pointer ${
            statusFilter === "converted" || statusFilter === "closed"
              ? "border-purple-500 bg-purple-500/15 dark:bg-purple-50 shadow-md"
              : "border-slate-800 bg-slate-900/60 dark:border-slate-200 dark:bg-white"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-purple-400 dark:text-purple-700">
            <span>{t("scouting.kpi.converted", "Convertiti / Storico")}</span>
            <CheckIcon className="h-3.5 w-3.5" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-100 dark:text-slate-900">
            {counts.converted}{" "}
            <span className="text-xs font-normal text-slate-400">
              (+{counts.closed} {t("scouting.kpi.closed_small", "chiusi")})
            </span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {t("scouting.kpi.converted_desc", "Diventati posizioni")}
          </div>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ──────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "all", label: t("scouting.filters.all", "Tutti"), count: counts.all },
            {
              key: "triggered",
              label: t("scouting.filters.triggered", "Triggerati"),
              count: counts.triggered,
              color: "emerald",
            },
            {
              key: "watching",
              label: t("scouting.filters.watching", "In Osservazione"),
              count: counts.watching,
              color: "sky",
            },
            {
              key: "stale",
              label: t("scouting.filters.stale", "Stale"),
              count: counts.stale,
              color: "amber",
            },
            {
              key: "converted",
              label: t("scouting.filters.converted", "Convertiti"),
              count: counts.converted,
            },
            {
              key: "closed",
              label: t("scouting.filters.closed", "Chiusi"),
              count: counts.closed,
            },
          ].map((pill) => {
            const isActive = statusFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setStatusFilter(pill.key)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white dark:border-slate-200 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-50"
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive
                      ? "bg-slate-950/20 text-slate-950"
                      : "bg-slate-800 text-slate-400 dark:bg-slate-100 dark:text-slate-600"
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("scouting.search_placeholder", "Cerca ticker o note...")}
              className="w-full rounded-lg border border-slate-700/80 bg-slate-900/80 pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "distance" | "date" | "expiry")}
            className="rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 dark:border-slate-300 dark:bg-white dark:text-slate-800 cursor-pointer"
          >
            <option value="distance">{t("scouting.sort.distance", "Distanza trigger (%)")}</option>
            <option value="date">{t("scouting.sort.date", "Più recenti")}</option>
            <option value="expiry">{t("scouting.sort.expiry", "Scadenza più vicina")}</option>
          </select>
        </div>
      </div>

      {/* ── Cards Grid ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-xs text-slate-500">
          <RefreshCwIcon className="h-5 w-5 animate-spin mr-2 text-teal-400" />
          <span>{t("common.loading", "Caricamento in corso...")}</span>
        </div>
      ) : sortedIdeas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center dark:border-slate-300">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10 text-teal-400 mb-3">
            <EyeIcon className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200 dark:text-slate-800">
            {t("scouting.empty_title", "Nessuna idea di scouting trovata")}
          </h3>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
            {statusFilter !== "all"
              ? t("scouting.empty_filter", "Nessuna idea corrisponde al filtro selezionato.")
              : t(
                  "scouting.empty_cta",
                  "Inizia a catalogare i setup interessanti durante il tuo scouting per ricevere notifiche automatiche.",
                )}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingIdea(null);
              setIsModalOpen(true);
            }}
            className="mt-4 rounded-lg bg-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-teal-400 shadow-sm"
          >
            {t("scouting.create_first", "+ Aggiungi la prima Idea")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedIdeas.map((idea) => {
            const isTriggered = idea.status === "triggered";
            const isStale = idea.status === "stale";
            const isConverted = idea.status === "converted";
            const isClosed = idea.status === "closed";
            const daysToStale = calculateDaysLeft(idea.stale_at);
            const daysToExpiry = calculateDaysLeft(idea.expires_at);

            const distanceNum =
              idea.distance_pct !== null && idea.distance_pct !== undefined
                ? parseFloat(idea.distance_pct)
                : null;

            return (
              <div
                key={idea.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4.5 transition-all shadow-sm min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] ${
                  isTriggered
                    ? "border-emerald-500/70 bg-gradient-to-br from-emerald-950/20 to-slate-900/80 dark:from-emerald-50 dark:to-white shadow-emerald-500/5 ring-1 ring-emerald-500/30"
                    : isStale
                      ? "border-amber-500/50 bg-amber-950/15 dark:bg-amber-50/40"
                      : isConverted
                        ? "border-purple-500/30 bg-purple-950/10 dark:bg-purple-50/30 opacity-80"
                        : isClosed
                          ? "border-slate-800 bg-slate-900/30 dark:border-slate-200 dark:bg-slate-50/50 opacity-60"
                          : "border-slate-800/80 bg-slate-900/60 hover:border-teal-500/40 dark:border-slate-200 dark:bg-white"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-extrabold tracking-tight text-slate-100 dark:text-slate-900">
                        {idea.symbol}
                      </span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-100 dark:text-slate-600">
                        {idea.market}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase flex items-center gap-1 ${
                          idea.direction === "long"
                            ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                            : "bg-rose-500/20 text-rose-300 dark:bg-rose-100 dark:text-rose-800"
                        }`}
                      >
                        {idea.direction === "long" ? (
                          <TrendingUpIcon className="h-3 w-3" />
                        ) : (
                          <TrendingDownIcon className="h-3 w-3" />
                        )}
                        <span>{idea.direction}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Status Badge */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isTriggered
                            ? "bg-emerald-500 text-slate-950 animate-pulse font-extrabold"
                            : isStale
                              ? "bg-amber-500/20 text-amber-300 dark:bg-amber-100 dark:text-amber-800"
                              : isConverted
                                ? "bg-purple-500/20 text-purple-300 dark:bg-purple-100 dark:text-purple-800"
                                : isClosed
                                  ? "bg-slate-800 text-slate-400 dark:bg-slate-200 dark:text-slate-600"
                                  : "bg-sky-500/20 text-sky-300 dark:bg-sky-100 dark:text-sky-800"
                        }`}
                      >
                        {isTriggered
                          ? t("scouting.status.triggered", "TRIGGER SCATTATO")
                          : isStale
                            ? t("scouting.status.stale", "STALE")
                            : isConverted
                              ? t("scouting.status.converted", "CONVERTITO")
                              : isClosed
                                ? t("scouting.status.closed", "CHIUSO")
                                : t("scouting.status.watching", "IN OSSERVAZIONE")}
                      </span>

                      {/* Chart preview button */}
                      <button
                        type="button"
                        onClick={() => setChartIdea(idea)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
                        title={t("scouting.view_chart", "Vedi Grafico")}
                      >
                        <ExternalLinkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Price Comparison Grid */}
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 dark:border-slate-200 dark:bg-slate-50 mb-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium">
                          {t("scouting.initial_price", "Prezzo Scouting")}
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-300 dark:text-slate-700 mt-0.5">
                          {idea.initial_price} €
                        </div>
                      </div>

                      <div className="border-x border-slate-800 dark:border-slate-200 px-1">
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium">
                          {t("scouting.current_price", "Prezzo Attuale")}
                        </div>
                        <div className="font-mono text-sm font-bold text-slate-100 dark:text-slate-900 mt-0.5">
                          {idea.current_price ? `${idea.current_price} €` : "—"}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-teal-400 dark:text-teal-700 uppercase font-bold">
                          {t("scouting.trigger_target", "Target Trigger")}
                        </div>
                        <div className="font-mono text-xs font-extrabold text-teal-300 dark:text-teal-800 mt-0.5">
                          {idea.trigger_condition} {idea.trigger_price} €
                        </div>
                      </div>
                    </div>

                    {/* Proximity / Distance bar */}
                    {isTriggered ? (
                      <div className="mt-2.5 rounded bg-emerald-500/20 px-2 py-1 text-center text-xs font-bold text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800">
                        ⚡ {t("scouting.reached_notice", "Prezzo trigger raggiunto!")}{" "}
                        {idea.triggered_price && `(${idea.triggered_price} €)`}
                      </div>
                    ) : distanceNum !== null ? (
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]">
                          {t("scouting.distance_label", "Distanza dal trigger:")}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            Math.abs(distanceNum) <= 2
                              ? "text-teal-400 dark:text-teal-600 font-extrabold"
                              : Math.abs(distanceNum) <= 5
                                ? "text-amber-400 dark:text-amber-600"
                                : "text-slate-300 dark:text-slate-700"
                          }`}
                        >
                          {distanceNum > 0 ? `+${distanceNum}%` : `${distanceNum}%`}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Stop Loss & Target Price pills (if set) */}
                  {(idea.stop_loss || idea.target_price) && (
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                      {idea.stop_loss && (
                        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-mono text-red-300 dark:text-red-700">
                          SL: {idea.stop_loss} €
                        </div>
                      )}
                      {idea.target_price && (
                        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono text-emerald-300 dark:text-emerald-700">
                          TP: {idea.target_price} €
                        </div>
                      )}
                    </div>
                  )}

                  {/* Thesis Notes */}
                  {idea.thesis_notes && (
                    <div className="rounded border border-slate-800/60 bg-slate-900/40 p-2.5 text-xs text-slate-300 dark:border-slate-200 dark:bg-slate-50 dark:text-slate-700 mb-3 leading-relaxed break-words [overflow-wrap:anywhere] max-w-full overflow-hidden">
                      <p className="line-clamp-3 italic break-words [overflow-wrap:anywhere] whitespace-pre-wrap">"{idea.thesis_notes}"</p>
                    </div>
                  )}

                  {/* Tag chips */}
                  {idea.tags && idea.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {idea.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer: Expiry & Actions */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 dark:border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {isConverted ? (
                      <span>{t("scouting.converted_label", "Convertito in Trade")}</span>
                    ) : isClosed ? (
                      <span>{t("scouting.closed_label", "Idea archiviata")}</span>
                    ) : isStale ? (
                      <span className="text-amber-400 dark:text-amber-600 font-semibold">
                        {daysToExpiry > 0
                          ? t("scouting.expires_in_days", { count: daysToExpiry, defaultValue: `Chiusura tra ${daysToExpiry} gg` })
                          : t("scouting.expires_today", "In scadenza oggi")}
                      </span>
                    ) : (
                      <span>
                        {daysToStale > 0
                          ? t("scouting.stale_in_days", { count: daysToStale, defaultValue: `Stale tra ${daysToStale} gg` })
                          : t("scouting.stale_soon", "In stale presto")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Primary Action Button */}
                    {isTriggered && (
                      <button
                        type="button"
                        onClick={() => handleOpenConvert(idea)}
                        className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-teal-400 active:scale-95 cursor-pointer flex items-center gap-1"
                      >
                        <span>⚡</span>
                        <span>{t("scouting.actions.convert", "Converti in Trade")}</span>
                      </button>
                    )}

                    {isStale && (
                      <>
                        <button
                          type="button"
                          onClick={() => renewMutation.mutate(idea.id)}
                          disabled={renewMutation.isPending}
                          className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 transition hover:bg-amber-400 cursor-pointer shadow-xs"
                        >
                          {t("scouting.actions.renew_7d", "Rinnova (+7gg)")}
                        </button>
                        <button
                          type="button"
                          onClick={() => closeMutation.mutate(idea.id)}
                          disabled={closeMutation.isPending}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-white dark:border-slate-300 dark:text-slate-700"
                        >
                          {t("scouting.actions.close", "Archivia")}
                        </button>
                      </>
                    )}

                    {!isTriggered && !isStale && !isConverted && !isClosed && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIdea(idea);
                            setIsModalOpen(true);
                          }}
                          className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:border-teal-500/50 hover:text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700"
                        >
                          {t("common.edit", "Modifica")}
                        </button>
                        <button
                          type="button"
                          onClick={() => closeMutation.mutate(idea.id)}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-white dark:border-slate-300 dark:text-slate-600"
                        >
                          {t("scouting.actions.close", "Archivia")}
                        </button>
                      </>
                    )}

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => setIdeaToDelete(idea)}
                      className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition"
                      title={t("common.delete", "Elimina")}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Nuova / Modifica Idea ───────────────────────── */}
      {isModalOpen && (
        <TradeIdeaModal
          open={isModalOpen}
          initialData={editingIdea}
          onClose={() => {
            setIsModalOpen(false);
            setEditingIdea(null);
          }}
          onSuccess={() => {
            setIsModalOpen(false);
            setEditingIdea(null);
            qc.invalidateQueries({ queryKey: ["trade-ideas"] });
            qc.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
          }}
        />
      )}

      {/* ── TradingView Chart Preview Modal ───────────────────── */}
      {chartIdea && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setChartIdea(null);
          }}
        >
          <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl dark:border-slate-200 dark:bg-white fade-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 dark:border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-slate-100 dark:text-slate-900">
                  {chartIdea.symbol}
                </span>
                <span className="text-xs text-slate-400">({chartIdea.market})</span>
                <span className="text-xs text-teal-400 font-semibold ml-2">
                  Trigger: {chartIdea.trigger_condition} {chartIdea.trigger_price} €
                </span>
              </div>
              <button
                type="button"
                onClick={() => setChartIdea(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[520px]">
              <TradingViewChart symbol={chartIdea.symbol} market={chartIdea.market} height={520} />
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ──────────────────────────────── */}
      {ideaToDelete && (
        <ConfirmModal
          message={t(
            "scouting.confirm_delete",
            `Sei sicuro di voler eliminare l'idea di scouting per ${ideaToDelete.symbol}?`,
          )}
          confirmLabel={t("common.delete", "Elimina")}
          onConfirm={() => deleteMutation.mutate(ideaToDelete.id)}
          onCancel={() => setIdeaToDelete(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Sub-component Modal Creazione / Modifica Idea ─────────────
interface TradeIdeaModalProps {
  open: boolean;
  initialData?: TradeIdea | null;
  onClose: () => void;
  onSuccess: () => void;
}

function TradeIdeaModal({ open, initialData, onClose, onSuccess }: TradeIdeaModalProps) {
  const { t } = useTranslation();

  const [symbol, setSymbol] = useState(initialData?.symbol || "");
  const [market, setMarket] = useState(initialData?.market || "Euronext Milan");
  const [direction, setDirection] = useState<"long" | "short">(initialData?.direction || "long");
  const [initialPrice, setInitialPrice] = useState(initialData?.initial_price || "");
  const [triggerCondition, setTriggerCondition] = useState<"<=" | ">=">(
    initialData?.trigger_condition || "<=",
  );
  const [triggerPrice, setTriggerPrice] = useState(initialData?.trigger_price || "");
  const [stopLoss, setStopLoss] = useState(initialData?.stop_loss || "");
  const [targetPrice, setTargetPrice] = useState(initialData?.target_price || "");
  const [thesisNotes, setThesisNotes] = useState(initialData?.thesis_notes || "");
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [staleDays, setStaleDays] = useState(initialData?.stale_days || 7);
  const [expireDays, setExpireDays] = useState(initialData?.expire_days || 10);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Symbol suggestions
  const [suggestions, setSuggestions] = useState<Ticker[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSymbolChange = (value: string) => {
    setSymbol(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await tickersApi.search(value.trim(), 5);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 250);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectTicker = (ticker: Ticker) => {
    setSymbol(ticker.symbol);
    setMarket(ticker.market || "Euronext Milan");
    setShowSuggestions(false);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        market: market.trim(),
        direction,
        initial_price: initialPrice ? parseFloat(initialPrice) : undefined,
        trigger_price: parseFloat(triggerPrice),
        trigger_condition: triggerCondition,
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        target_price: targetPrice ? parseFloat(targetPrice) : undefined,
        thesis_notes: thesisNotes.trim() || undefined,
        tags,
        stale_days: staleDays,
        expire_days: expireDays,
      };

      if (initialData) {
        return tradeIdeasApi.update(initialData.id, payload);
      }
      return tradeIdeasApi.create(payload);
    },
    onSuccess,
  });

  const isValid = symbol.trim().length > 0 && parseFloat(triggerPrice) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saveMutation.isPending) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl dark:border-slate-200 dark:bg-white max-h-[90vh] overflow-y-auto fade-up">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 dark:border-slate-200">
          <h3 className="text-base font-bold text-slate-100 dark:text-slate-900">
            {initialData
              ? t("scouting.modal.edit_title", "Modifica Idea di Scouting")
              : t("scouting.modal.new_title", "Nuova Idea di Scouting")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isValid) saveMutation.mutate();
          }}
          className="space-y-4"
        >
          {/* Symbol Autocomplete & Market */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.symbol", "Simbolo / Ticker *")}
              </label>
              <input
                type="text"
                required
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                placeholder="es. ENI, UCG, AAPL"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 font-mono text-sm uppercase text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl dark:border-slate-300 dark:bg-white">
                  {suggestions.map((item) => (
                    <button
                      key={`${item.symbol}-${item.market}`}
                      type="button"
                      onClick={() => handleSelectTicker(item)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-800 dark:hover:bg-slate-100"
                    >
                      <span className="font-mono font-bold">{item.symbol}</span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                        {item.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.market", "Mercato")}
              </label>
              <input
                type="text"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder="es. Euronext Milan, NYSE"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              />
            </div>
          </div>

          {/* Direction Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
              {t("scouting.modal.direction", "Direzione Setup")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDirection("long");
                  if (!initialData) setTriggerCondition("<=");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  direction === "long"
                    ? "bg-emerald-500 text-slate-950 shadow-sm"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700"
                }`}
              >
                <TrendingUpIcon className="h-4 w-4" />
                <span>LONG (Rialzista)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection("short");
                  if (!initialData) setTriggerCondition("<=");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  direction === "short"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700"
                }`}
              >
                <TrendingDownIcon className="h-4 w-4" />
                <span>SHORT (Ribassista)</span>
              </button>
            </div>
          </div>

          {/* Trigger Condition & Price */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.condition", "Condizione Trigger")}
              </label>
              <select
                value={triggerCondition}
                onChange={(e) => setTriggerCondition(e.target.value === ">=" ? ">=" : "<=")}
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              >
                <option value="<=">&le; Scende a o sotto</option>
                <option value=">=">&ge; Sale a o sopra</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-teal-400 dark:text-teal-700 mb-1">
                {t("scouting.modal.trigger_price", "Prezzo Trigger (€) *")}
              </label>
              <input
                type="number"
                step="any"
                required
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder="es. 20.03"
                className="w-full rounded-lg border border-teal-500/60 bg-slate-900 px-3 py-2 font-mono text-sm font-bold text-teal-300 dark:border-teal-600 dark:bg-white dark:text-teal-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.initial_price", "Prezzo Attuale (€)")}
              </label>
              <input
                type="number"
                step="any"
                value={initialPrice}
                onChange={(e) => setInitialPrice(e.target.value)}
                placeholder="Auto da mercato"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-300 dark:border-slate-300 dark:bg-white dark:text-slate-700"
              />
            </div>
          </div>

          {/* Stop Loss & Target Price (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.stop_loss", "Stop Loss stimato (€)")}
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="es. 19.50"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
                {t("scouting.modal.target_price", "Target Take Profit (€)")}
              </label>
              <input
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="es. 22.00"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              />
            </div>
          </div>

          {/* Thesis Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 dark:text-slate-700 mb-1">
              {t("scouting.modal.thesis", "Tesi di Scouting & Setup Tecnico")}
            </label>
            <textarea
              rows={3}
              value={thesisNotes}
              onChange={(e) => setThesisNotes(e.target.value)}
              placeholder="es. Titolo sotto EMA 60 su grafico giornaliero, attendere pullback a 20.03 con retest del supporto prima di aprire posizione short."
              className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 leading-relaxed dark:border-slate-300 dark:bg-white dark:text-slate-900"
            />
          </div>

          {/* Tags */}
          <div>
            <TagInput
              label={t("scouting.modal.tags", "Tag Setup")}
              placeholder="es. ema60, breakdown, pullback"
              value={tags}
              suggestions={["ema60", "breakout", "pullback", "supporto", "resistenza", "doji", "fomo"]}
              onChange={setTags}
            />
          </div>

          {/* Advanced Expiry settings toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="text-xs text-slate-400 hover:text-teal-400 dark:text-slate-600 flex items-center gap-1 font-medium transition cursor-pointer"
            >
              <span>{showAdvanced ? "▼" : "▶"}</span>
              <span>{t("scouting.modal.advanced_timing", "Impostazioni Scadenza e Stale (Opzionali)")}</span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-900/50 p-3 grid grid-cols-2 gap-3 dark:border-slate-200 dark:bg-slate-50">
                <div>
                  <label className="block text-[11px] text-slate-400 dark:text-slate-600 mb-1">
                    {t("scouting.modal.stale_days", "Passa a Stale dopo (giorni)")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={staleDays}
                    onChange={(e) => setStaleDays(parseInt(e.target.value) || 7)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs dark:border-slate-300 dark:bg-white"
                  />
                  <span className="text-[10px] text-slate-500">Default: 7 giorni</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 dark:text-slate-600 mb-1">
                    {t("scouting.modal.expire_days", "Chiusura automatica dopo (giorni)")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expireDays}
                    onChange={(e) => setExpireDays(parseInt(e.target.value) || 10)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs dark:border-slate-300 dark:bg-white"
                  />
                  <span className="text-[10px] text-slate-500">Default: 10 giorni</span>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800 dark:border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saveMutation.isPending}
              className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 dark:border-slate-300 dark:text-slate-700 dark:hover:bg-slate-100"
            >
              {t("common.cancel", "Annulla")}
            </button>
            <button
              type="submit"
              disabled={!isValid || saveMutation.isPending}
              className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-teal-400 disabled:opacity-50"
            >
              {saveMutation.isPending
                ? t("common.saving", "Salvataggio...")
                : initialData
                  ? t("common.save_changes", "Salva Modifiche")
                  : t("scouting.modal.submit", "Crea Idea di Scouting")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
