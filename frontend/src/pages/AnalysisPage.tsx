import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisApi, AnalysisReportDetail, AnalysisReportSummary, AnalysisTargetItem } from "../lib/api";
import { ReportViewer } from "../components/analysis/ReportViewer";
import { useToast } from "../contexts/ToastContext";

export const AnalysisPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [language, setLanguage] = useState<"it" | "en">("it");
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  // 1. Fetch eligible targets
  const { data: targets = [], isLoading: targetsLoading } = useQuery<AnalysisTargetItem[]>({
    queryKey: ["analysisTargets"],
    queryFn: analysisApi.getTargets,
  });

  // 2. Fetch history
  const { data: history = [], isLoading: historyLoading } = useQuery<AnalysisReportSummary[]>({
    queryKey: ["analysisHistory"],
    queryFn: () => analysisApi.getHistory(),
  });

  // Select first target by default once loaded
  useEffect(() => {
    if (targets.length > 0 && !selectedTargetKey) {
      setSelectedTargetKey(`${targets[0].target_source}:${targets[0].symbol}`);
    }
  }, [targets, selectedTargetKey]);

  // Select first completed report from history if none is active
  useEffect(() => {
    if (!activeReportId && history.length > 0) {
      setActiveReportId(history[0].id);
    }
  }, [history, activeReportId]);

  // 3. Fetch active report detail (with polling if pending/running)
  const { data: activeReport, isLoading: reportLoading } = useQuery<AnalysisReportDetail>({
    queryKey: ["analysisReport", activeReportId],
    queryFn: () => analysisApi.get(activeReportId!),
    enabled: !!activeReportId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 3000 : false;
    },
  });

  // Run analysis mutation
  const runMutation = useMutation({
    mutationFn: analysisApi.run,
    onSuccess: (newReport) => {
      addToast({
        type: "success",
        title: "Analisi avviata",
        message: `L'analisi multi-agente per ${newReport.symbol} è in elaborazione.`,
      });
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      setActiveReportId(newReport.id);
    },
    onError: (err: any) => {
      addToast({
        type: "error",
        title: "Errore avvio analisi",
        message: err.message || "Impossibile avviare l'analisi.",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: analysisApi.delete,
    onSuccess: () => {
      addToast({
        type: "info",
        title: "Report eliminato",
        message: "Il report è stato rimosso dallo storico.",
      });
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      setActiveReportId(null);
    },
  });

  const handleStartAnalysis = () => {
    if (!selectedTargetKey) return;
    const [source, symbol] = selectedTargetKey.split(":");
    const target = targets.find((t) => t.target_source === source && t.symbol === symbol);
    if (!target) return;

    runMutation.mutate({
      symbol: target.symbol,
      market: target.market,
      holding_id: target.holding_id,
      trade_idea_id: target.trade_idea_id,
      language: language,
    });
  };

  const selectedTarget = targets.find((t) => `${t.target_source}:${t.symbol}` === selectedTargetKey);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <span>🤖</span> Asset Coaching & Analisi Multi-Agente
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Punto di vista terzo basato su analisi tecnica, fondamentale e ciclica (Hurst) con dibattito dialettico Bull vs Bear.
        </p>
      </div>

      {/* Control Panel: Target Selection & Run Trigger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
            {/* Target Asset Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Asset da analizzare
              </label>
              {targetsLoading ? (
                <div className="h-10 bg-slate-800 animate-pulse rounded-lg" />
              ) : targets.length === 0 ? (
                <div className="text-sm text-slate-400 py-2">
                  Nessun asset attivo censito in portafoglio o idee.
                </div>
              ) : (
                <select
                  value={selectedTargetKey}
                  onChange={(e) => setSelectedTargetKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <optgroup label="Holdings di Portafoglio">
                    {targets
                      .filter((t) => t.target_source === "holding")
                      .map((t) => (
                        <option key={`holding:${t.symbol}`} value={`holding:${t.symbol}`}>
                          {t.symbol} — {t.name} ({t.quantity ? `${Number(t.quantity)} pz` : ""})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Trade Ideas Attive">
                    {targets
                      .filter((t) => t.target_source === "trade_idea")
                      .map((t) => (
                        <option key={`trade_idea:${t.symbol}`} value={`trade_idea:${t.symbol}`}>
                          {t.symbol} (Setup Scouting)
                        </option>
                      ))}
                  </optgroup>
                </select>
              )}
            </div>

            {/* Language Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Lingua del Report
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "it" | "en")}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="it">Italiano 🇮🇹</option>
                <option value="en">English 🇬🇧</option>
              </select>
            </div>

            {/* Target Info Badge */}
            <div className="flex flex-col justify-end">
              {selectedTarget && (
                <div className="text-xs text-slate-400 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
                  <span className="font-semibold text-slate-200">{selectedTarget.instrument_type.toUpperCase()}</span>
                  {" · "}
                  <span>Mercato: {selectedTarget.market}</span>
                  {selectedTarget.avg_cost && (
                    <>
                      {" · "}
                      <span>Carico: €{Number(selectedTarget.avg_cost).toFixed(2)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Run Button */}
          <div>
            <button
              onClick={handleStartAnalysis}
              disabled={runMutation.isPending || targets.length === 0}
              className="w-full sm:w-auto px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow transition-all flex items-center justify-center gap-2"
            >
              {runMutation.isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Avvio in corso...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Genera Coaching AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Active Report + History Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Column: Historical Reports List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Storico Analisi</h2>
            <span className="text-xs text-slate-500 font-mono">{history.length}</span>
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-800 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Nessuna analisi passata presente.</p>
          ) : (
            <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
              {history.map((rep) => {
                const isSelected = rep.id === activeReportId;
                const isRunning = rep.status === "pending" || rep.status === "running";
                return (
                  <div
                    key={rep.id}
                    onClick={() => setActiveReportId(rep.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800 border-primary shadow-sm"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{rep.symbol}</span>
                      {rep.overall_score !== null && rep.overall_score !== undefined ? (
                        <span className="text-xs font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                          {rep.overall_score}/10
                        </span>
                      ) : isRunning ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 animate-pulse">
                          In corso...
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">{rep.status}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
                      <span>{new Date(rep.created_at).toLocaleDateString("it-IT", { month: "short", day: "numeric" })}</span>
                      <span className="uppercase text-[10px] text-slate-500 font-semibold">{rep.language}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Report Display */}
        <div className="lg:col-span-3">
          {reportLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
              <div className="inline-block animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-sm text-slate-400">Caricamento del report in corso...</p>
            </div>
          ) : !activeReport ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-2">
              <span className="text-4xl block mb-2">📊</span>
              <h3 className="text-lg font-bold text-white">Nessuna analisi selezionata</h3>
              <p className="text-sm text-slate-400">
                Seleziona un report dallo storico o avviane uno nuovo per visualizzare il coaching e i dibattiti.
              </p>
            </div>
          ) : activeReport.status === "pending" || activeReport.status === "running" ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4">
              <div className="inline-block animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" />
              <h3 className="text-lg font-bold text-white">Analisi Multi-Agente in corso...</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                La squadra di analisti (Tecnico, Fondamentale e Ciclico con Hurst) sta raccogliendo i dati ed elaborando il dibattito con il Coach.
              </p>
              <div className="text-xs font-mono text-slate-500">Aggiornamento automatico ogni 3 secondi</div>
            </div>
          ) : activeReport.status === "failed" ? (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-8 text-center space-y-4">
              <span className="text-4xl block">⚠️</span>
              <h3 className="text-lg font-bold text-rose-400">Analisi non riuscita</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                {activeReport.error_message || "Si è verificato un errore durante l'esecuzione del team di analisi."}
              </p>
              <button
                onClick={() => deleteMutation.mutate(activeReport.id)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors"
              >
                Rimuovi report con errore
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <ReportViewer report={activeReport} />
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    if (window.confirm("Sei sicuro di voler eliminare questo report?")) {
                      deleteMutation.mutate(activeReport.id);
                    }
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:underline"
                >
                  Elimina questo report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
