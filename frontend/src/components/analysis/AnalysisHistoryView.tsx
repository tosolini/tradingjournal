import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analysisApi,
  AnalysisPurgePayload,
  AnalysisReportDetail,
  AnalysisReportSummary,
} from "../../lib/api";
import { ReportViewer } from "./ReportViewer";
import { useToast } from "../../contexts/ToastContext";
import {
  AlertCircleIcon,
  CheckIcon,
  ClockIcon,
  RefreshCwIcon,
  SearchIcon,
  TrashIcon,
} from "../icons";

interface Props {
  onSelectForReanalysis: (symbol: string, market?: string) => void;
  dateLocale: string;
}

export const AnalysisHistoryView: React.FC<Props> = ({
  onSelectForReanalysis,
  dateLocale,
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Selected report to view full-width within history
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Purge Modal State
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [purgeOption, setPurgeOption] = useState<"older_30" | "failed" | "all">("older_30");

  // Fetch full history list
  const { data: history = [], isLoading: historyLoading } = useQuery<AnalysisReportSummary[]>({
    queryKey: ["analysisHistory"],
    queryFn: () => analysisApi.getHistory(undefined, 200),
  });

  // Fetch selected report detail if one is selected
  const { data: reportDetail, isLoading: reportDetailLoading } = useQuery<AnalysisReportDetail>({
    queryKey: ["analysisReport", selectedReportId],
    queryFn: () => analysisApi.get(selectedReportId!),
    enabled: !!selectedReportId,
  });

  // Delete single report mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => analysisApi.delete(id),
    onSuccess: (_, id) => {
      toast.success(t("analysis.history.delete_success", "Report eliminato con successo."));
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      if (selectedReportId === id) {
        setSelectedReportId(null);
      }
    },
    onError: () => {
      toast.error(t("common.error_occurred", "Si è verificato un errore"));
    },
  });

  // Purge mutation
  const purgeMutation = useMutation({
    mutationFn: (payload: AnalysisPurgePayload) => analysisApi.purge(payload),
    onSuccess: (res) => {
      toast.success(
        t("analysis.history.purge_toast_success", {
          count: res.deleted_count,
          defaultValue: `${res.deleted_count} report eliminati dallo storico.`,
        })
      );
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      setIsPurgeModalOpen(false);
      setSelectedReportId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || t("common.error_occurred", "Si è verificato un errore"));
    },
  });

  // Stats calculation
  const now = useMemo(() => new Date(), []);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const total = history.length;
    const completed = history.filter((h) => h.status === "completed");
    const failed = history.filter((h) => h.status === "failed");
    const scores = completed
      .map((h) => h.overall_score)
      .filter((s): s is number => typeof s === "number");

    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

    const stale = history.filter((h) => {
      const created = new Date(h.created_at).getTime();
      return now.getTime() - created > thirtyDaysMs;
    });

    const fresh = total - stale.length;

    return {
      total,
      avgScore,
      fresh,
      staleCount: stale.length,
      failedCount: failed.length,
    };
  }, [history, now, thirtyDaysMs]);

  // Filtered and Paginated records
  const filteredHistory = useMemo(() => {
    return history.filter((rep) => {
      // Search by symbol
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toUpperCase();
        if (!rep.symbol.toUpperCase().includes(term) && !rep.market.toUpperCase().includes(term)) {
          return false;
        }
      }

      // Filter by status
      if (statusFilter !== "all" && rep.status !== statusFilter) {
        return false;
      }

      // Filter by time
      if (timeFilter !== "all") {
        const ageMs = now.getTime() - new Date(rep.created_at).getTime();
        const days = ageMs / (24 * 60 * 60 * 1000);
        if (timeFilter === "7d" && days > 7) return false;
        if (timeFilter === "30d" && days > 30) return false;
        if (timeFilter === "older" && days <= 30) return false;
      }

      return true;
    });
  }, [history, searchTerm, statusFilter, timeFilter, now]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, currentPage, pageSize]);

  const handleExecutePurge = () => {
    if (purgeOption === "older_30") {
      purgeMutation.mutate({ older_than_days: 30 });
    } else if (purgeOption === "failed") {
      purgeMutation.mutate({ only_failed: true });
    } else if (purgeOption === "all") {
      if (window.confirm(t("analysis.history.purge_opt_all_sub", "Attenzione: azzera completamente lo storico dei report salvati."))) {
        purgeMutation.mutate({ all_reports: true });
      }
    }
  };

  // Helper to check if a report is older than 30 days
  const isReportStale = (createdAt: string) => {
    return now.getTime() - new Date(createdAt).getTime() > thirtyDaysMs;
  };

  // If viewing a single report from history:
  if (selectedReportId) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb & Action Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedReportId(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all border border-slate-700/80 cursor-pointer group active:scale-95"
            >
              <span>←</span>
              <span>{t("analysis.history.back_to_list", "Torna all'elenco dello storico")}</span>
            </button>

            {reportDetail && (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-teal-400 text-sm">
                  {reportDetail.symbol}
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {reportDetail.market}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  • {new Date(reportDetail.created_at).toLocaleString(dateLocale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            )}
          </div>

          {reportDetail && (
            <div className="flex items-center gap-2.5 self-end md:self-auto">
              <button
                type="button"
                onClick={() => onSelectForReanalysis(reportDetail.symbol, reportDetail.market)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all cursor-pointer"
                title={t("analysis.history.reanalyze_now", "Rigenera con Dati Odierni")}
              >
                <RefreshCwIcon className="h-3.5 w-3.5" />
                <span>{t("analysis.history.reanalyze_now", "Rigenera con Dati Odierni")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t("analysis.history.delete_confirm_msg", "Sei sicuro di voler eliminare definitivamente questo report dallo storico?"))) {
                    deleteMutation.mutate(reportDetail.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold transition-all cursor-pointer"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                <span>{t("analysis.history.delete_btn", "Elimina")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Stale Warning Banner if > 30 days */}
        {reportDetail && isReportStale(reportDetail.created_at) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
            <span className="text-base shrink-0">⚠️</span>
            <div className="flex-1 space-y-1">
              <strong className="block font-semibold">
                {t("analysis.history.stale_tag", "Obsoleta (> 30gg)")}
              </strong>
              <p className="text-amber-300/90 leading-relaxed">
                {t(
                  "analysis.history.stale_notice",
                  "Questa analisi è stata generata più di 30 giorni fa. Prezzi di mercato, indicatori tecnici e cicli temporali potrebbero essere cambiati significativamente."
                )}
              </p>
            </div>
          </div>
        )}

        {/* Detailed Report Viewer */}
        {reportDetailLoading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
            <div className="inline-block animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-slate-400">
              {t("analysis.display.loading", "Caricamento del report in corso...")}
            </p>
          </div>
        ) : reportDetail ? (
          <ReportViewer report={reportDetail} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Reports */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {t("analysis.history.stat_total", "Totale Analisi")}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {stats.total}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {t("analysis.history.title", "Storico Analisi")}
          </div>
        </div>

        {/* Card 2: Average Score */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {t("analysis.history.stat_avg_score", "Score Medio")}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight flex items-baseline gap-1">
            <span>{stats.avgScore ?? "—"}</span>
            {stats.avgScore && <span className="text-xs text-slate-500 font-mono">/10</span>}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {t("analysis.gauge.high", "Rating Complessivo")}
          </div>
        </div>

        {/* Card 3: Fresh Reports (<30d) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 mb-1">
            {t("analysis.history.stat_fresh", "Recenti (< 30gg)")}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-teal-300 tracking-tight">
            {stats.fresh}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {t("analysis.existing_hint", "Mercato recente")}
          </div>
        </div>

        {/* Card 4: Stale Reports (>30d) */}
        <div className={`border rounded-2xl p-4 sm:p-5 relative overflow-hidden transition-all ${
          stats.staleCount > 0
            ? "bg-amber-950/20 border-amber-500/30"
            : "bg-slate-900 border-slate-800"
        }`}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">
            {t("analysis.history.stat_stale", "Obsolete (> 30gg)")}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 tracking-tight">
            {stats.staleCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats.staleCount > 0 ? "Consigliato purge" : "Database pulito"}
          </div>
        </div>
      </div>

      {/* Control & Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[260px] flex-1 sm:flex-initial">
              <SearchIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("analysis.history.search_placeholder", "Cerca per simbolo (es. NVDA, UCG, AAPL)...")}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">{t("analysis.history.filter_status_all", "Tutti gli stati")}</option>
              <option value="completed">{t("analysis.history.filter_status_completed", "Completate")}</option>
              <option value="running">{t("analysis.history.filter_status_running", "In corso")}</option>
              <option value="failed">{t("analysis.history.filter_status_failed", "Con errore")}</option>
            </select>

            {/* Time Filter */}
            <select
              value={timeFilter}
              onChange={(e) => {
                setTimeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-medium focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">{t("analysis.history.filter_time_all", "Qualsiasi data")}</option>
              <option value="7d">{t("analysis.history.filter_time_7d", "Ultimi 7 giorni")}</option>
              <option value="30d">{t("analysis.history.filter_time_30d", "Ultimi 30 giorni")}</option>
              <option value="older">{t("analysis.history.filter_time_older", "Oltre 30 giorni")}</option>
            </select>
          </div>

          {/* Right: Purge Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPurgeModalOpen(true)}
              className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
            >
              <span>🧹</span>
              <span>{t("analysis.history.purge_btn", "Gestione & Pulizia Storico")}</span>
              {stats.staleCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                  {stats.staleCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main List / Table of Analysis Reports */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {historyLoading ? (
          <div className="p-12 text-center space-y-3">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-xs text-slate-400">
              {t("analysis.display.loading", "Caricamento storico analisi...")}
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <span className="text-4xl block mb-1">📜</span>
            <h3 className="text-sm font-bold text-white">
              {history.length === 0
                ? t("analysis.history.empty", "Nessuna analisi passata presente.")
                : t("analysis.history.no_results_filtered", "Nessuna analisi corrisponde ai filtri di ricerca selezionati.")}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {history.length === 0
                ? t("analysis.display.no_selection_subtitle", "Avvia la tua prima analisi multi-agente selezionando un asset o ticker sopra.")
                : "Prova a modificare i termini di ricerca o i filtri di stato/tempo."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <tr>
                  <th className="py-3.5 px-4">{t("analysis.history.col_symbol", "Simbolo / Titolo")}</th>
                  <th className="py-3.5 px-4">{t("analysis.history.col_score", "Score AI")}</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">{t("analysis.history.col_model", "Modello AI")}</th>
                  <th className="py-3.5 px-4">{t("analysis.history.col_date", "Data")}</th>
                  <th className="py-3.5 px-4">{t("analysis.history.col_status", "Stato")}</th>
                  <th className="py-3.5 px-4 text-right">{t("analysis.history.col_actions", "Azioni")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {paginatedHistory.map((rep) => {
                  const stale = isReportStale(rep.created_at);
                  const isRunning = rep.status === "pending" || rep.status === "running";
                  const isFailed = rep.status === "failed";

                  return (
                    <tr
                      key={rep.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedReportId(rep.id)}
                    >
                      {/* Simbolo & Mercato */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-white text-sm group-hover:text-primary transition-colors">
                            {rep.symbol}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                            {rep.market}
                          </span>
                          {stale && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <span>⚠️</span>
                              <span className="hidden sm:inline">{t("analysis.history.stale_tag", "Obsoleta (> 30gg)")}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Score AI */}
                      <td className="py-3.5 px-4">
                        {rep.overall_score !== null && rep.overall_score !== undefined ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={`text-xs font-extrabold px-2 py-0.5 rounded-lg border ${
                                rep.overall_score >= 7
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : rep.overall_score >= 5
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                              }`}
                            >
                              {rep.overall_score}/10
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>

                      {/* Modello AI */}
                      <td className="py-3.5 px-4 hidden md:table-cell">
                        <span className="text-slate-400 font-mono text-[11px] bg-slate-950/60 px-2 py-1 rounded-md border border-slate-800">
                          {rep.llm_model_used || "standard"}
                        </span>
                      </td>

                      {/* Data Generazione */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="text-slate-200 text-xs font-medium">
                            {new Date(rep.created_at).toLocaleDateString(dateLocale, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(rep.created_at).toLocaleTimeString(dateLocale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Stato */}
                      <td className="py-3.5 px-4">
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            <span>{t("analysis.history.in_progress", "In corso...")}</span>
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            <span>{t("analysis.display.failed_title", "Errore")}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckIcon className="h-3 w-3" />
                            <span>Completata</span>
                          </span>
                        )}
                      </td>

                      {/* Azioni */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedReportId(rep.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors cursor-pointer"
                            title={t("analysis.history.view_report_btn", "Visualizza Report")}
                          >
                            {t("analysis.history.view_report_btn", "Visualizza")}
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectForReanalysis(rep.symbol, rep.market)}
                            className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors cursor-pointer"
                            title={t("analysis.history.reanalyze_btn", "Rianalizza")}
                          >
                            <RefreshCwIcon className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t("analysis.history.delete_confirm_msg", "Sei sicuro di voler eliminare definitivamente questo report dallo storico?"))) {
                                deleteMutation.mutate(rep.id);
                              }
                            }}
                            className="px-2 py-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title={t("analysis.history.delete_btn", "Elimina")}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400">
            <span>
              {t("analysis.history.pagination_page", {
                current: currentPage,
                total: totalPages,
                defaultValue: `Pagina ${currentPage} di ${totalPages}`,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                {t("analysis.history.prev_page", "Precedente")}
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                {t("analysis.history.next_page", "Successiva")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Purge Modal Dialog */}
      {isPurgeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !purgeMutation.isPending) {
              setIsPurgeModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-400 shrink-0 border border-amber-500/30">
                <span className="text-xl">🧹</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {t("analysis.history.purge_modal_title", "Pulizia e Ottimizzazione Storico Analisi")}
                </h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  {t(
                    "analysis.history.purge_modal_desc",
                    "Con il passare del tempo, le analisi accumulate occupano spazio sul database e perdono efficacia predittiva perché i mercati evolvono. Scegli un'opzione di pulizia:"
                  )}
                </p>
              </div>
            </div>

            {/* Radio Options */}
            <div className="space-y-2.5 pt-1">
              {/* Option 1: Older than 30 days */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  purgeOption === "older_30"
                    ? "bg-slate-800 border-primary shadow-sm"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="purge_option"
                  value="older_30"
                  checked={purgeOption === "older_30"}
                  onChange={() => setPurgeOption("older_30")}
                  className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {t("analysis.history.purge_opt_30d", "Elimina analisi più vecchie di 30 giorni")}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                      {stats.staleCount} {t("common.reports", "report")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(
                      "analysis.history.purge_opt_30d_sub",
                      "Rimuove le analisi storiche ormai superate dai movimenti di mercato."
                    )}
                  </p>
                </div>
              </label>

              {/* Option 2: Failed Only */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  purgeOption === "failed"
                    ? "bg-slate-800 border-primary shadow-sm"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="purge_option"
                  value="failed"
                  checked={purgeOption === "failed"}
                  onChange={() => setPurgeOption("failed")}
                  className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {t("analysis.history.purge_opt_failed", "Elimina solo analisi fallite con errore")}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                      {stats.failedCount} {t("common.reports", "report")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(
                      "analysis.history.purge_opt_failed_sub",
                      "Ripulisce tentativi non andati a buon fine (es. rate limit o errori provider)."
                    )}
                  </p>
                </div>
              </label>

              {/* Option 3: All Reports */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  purgeOption === "all"
                    ? "bg-rose-950/30 border-rose-500/60 shadow-sm"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="purge_option"
                  value="all"
                  checked={purgeOption === "all"}
                  onChange={() => setPurgeOption("all")}
                  className="mt-0.5 text-rose-500 focus:ring-rose-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-300">
                      {t("analysis.history.purge_opt_all", "Svuota l'intero archivio (Tutte le analisi)")}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                      {stats.total} {t("common.reports", "report")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t(
                      "analysis.history.purge_opt_all_sub",
                      "Attenzione: azzera completamente lo storico dei report salvati."
                    )}
                  </p>
                </div>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(false)}
                disabled={purgeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                {t("analysis.history.purge_cancel", "Annulla")}
              </button>
              <button
                type="button"
                onClick={handleExecutePurge}
                disabled={
                  purgeMutation.isPending ||
                  (purgeOption === "older_30" && stats.staleCount === 0) ||
                  (purgeOption === "failed" && stats.failedCount === 0) ||
                  (purgeOption === "all" && stats.total === 0)
                }
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              >
                {purgeMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>{t("common.processing", "Elaborazione...")}</span>
                  </>
                ) : (
                  <span>{t("analysis.history.purge_confirm_action", "Procedi con l'eliminazione")}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
