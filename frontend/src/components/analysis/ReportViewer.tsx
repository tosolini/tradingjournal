import React, { useState } from "react";
import { AnalysisReportDetail } from "../../lib/api";
import { ScoreGauge } from "./ScoreGauge";
import { ConvertAnalysisModal } from "./ConvertAnalysisModal";

interface ReportViewerProps {
  report: AnalysisReportDetail;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ report }) => {
  const [activeTab, setActiveTab] = useState<"coach" | "debate" | "lead" | "technical" | "fundamental" | "cyclical">("coach");
  const [isConvertModalOpen, setIsConvertModalOpen] = useState<boolean>(false);

  // Extract cyclical metrics if present in data snapshot
  const cyclicalSnapshot = (report.data_snapshot?.cyclical as Record<string, unknown>) || {};
  const hurstVal = typeof cyclicalSnapshot.hurst_exponent === "number" ? cyclicalSnapshot.hurst_exponent : null;
  const regimeVal = typeof cyclicalSnapshot.regime === "string" ? cyclicalSnapshot.regime : null;
  const dominantCycles = Array.isArray(cyclicalSnapshot.dominant_cycles) ? cyclicalSnapshot.dominant_cycles : [];

  // Extract trade context if present
  const tradeCtx = (report.data_snapshot?.trade_context as Record<string, any>) || null;

  // Extract fundamental snapshot metrics
  const fundSnapshot = (report.data_snapshot?.fundamental as Record<string, any>) || {};
  const peRatio = typeof fundSnapshot.pe_ratio === "number" ? fundSnapshot.pe_ratio : null;
  const forwardPe = typeof fundSnapshot.forward_pe === "number" ? fundSnapshot.forward_pe : null;
  const pegRatio = typeof fundSnapshot.peg_ratio === "number" ? fundSnapshot.peg_ratio : null;
  const pbRatio = typeof fundSnapshot.price_to_book === "number" ? fundSnapshot.price_to_book : null;
  const evEbitda = typeof fundSnapshot.enterprise_to_ebitda === "number" ? fundSnapshot.enterprise_to_ebitda : null;
  const operatingMargins = typeof fundSnapshot.operating_margins === "number" ? fundSnapshot.operating_margins : null;
  const grossMargins = typeof fundSnapshot.gross_margins === "number" ? fundSnapshot.gross_margins : null;
  const targetMean = typeof fundSnapshot.target_mean_price === "number" ? fundSnapshot.target_mean_price : null;
  const targetHigh = typeof fundSnapshot.target_high_price === "number" ? fundSnapshot.target_high_price : null;
  const targetLow = typeof fundSnapshot.target_low_price === "number" ? fundSnapshot.target_low_price : null;
  const recommendation = typeof fundSnapshot.recommendation_key === "string" ? fundSnapshot.recommendation_key : null;
  const numAnalysts = typeof fundSnapshot.number_of_analyst_opinions === "number" ? fundSnapshot.number_of_analyst_opinions : null;

  return (
    <div className="space-y-6">
      {/* Hero Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-white tracking-tight">{report.symbol}</span>
              <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-medium">
                {report.market}
              </span>
              <span className="text-xs px-2 py-0.5 rounded uppercase font-semibold bg-primary/20 text-primary border border-primary/30">
                {report.language}
              </span>
              <span className="text-xs px-2 py-0.5 rounded capitalize text-slate-400 bg-slate-800/80">
                {report.trigger_mode}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Analisi completata il{" "}
              {report.completed_at
                ? new Date(report.completed_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })
                : "In corso..."}
            </p>
            {report.llm_model_used && (
              <p className="text-xs text-slate-500 font-mono">Modello: {report.llm_model_used}</p>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsConvertModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-950/40 transition-all cursor-pointer group"
                title="Converti questa analisi in un'Idea di Scouting o in una Nota di Diario"
              >
                <span className="group-hover:scale-110 transition-transform">⚡</span>
                <span>Trasforma in Azione</span>
                <span className="text-[10px] opacity-75 font-normal">(Scouting / Nota)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-8 self-center md:self-auto">
            {hurstVal !== null && (
              <div className="text-center px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs uppercase font-medium text-slate-400 block">Hurst Exponent</span>
                <span className="text-lg font-bold text-sky-400">{hurstVal.toFixed(2)}</span>
                <span className="text-[11px] block text-slate-400 capitalize">{regimeVal?.replace("_", " ")}</span>
              </div>
            )}
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase font-medium text-slate-400 mb-1">Coach Score</span>
              <ScoreGauge score={report.overall_score} size={84} />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("coach")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "coach" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>🏋️ Coaching & Action</span>
        </button>
        <button
          onClick={() => setActiveTab("debate")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "debate" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>⚔️ Dibattito Bull vs Bear</span>
        </button>
        <button
          onClick={() => setActiveTab("lead")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "lead" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>🎓 Sintesi Lead</span>
        </button>
        <button
          onClick={() => setActiveTab("cyclical")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "cyclical" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>🔄 Analisi Ciclica</span>
        </button>
        <button
          onClick={() => setActiveTab("technical")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "technical" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>📈 Analisi Tecnica</span>
        </button>
        <button
          onClick={() => setActiveTab("fundamental")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "fundamental" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>📋 Fondamentali / Bond</span>
        </button>
      </div>

      {/* Tab 1: Coach & Action Items */}
      {activeTab === "coach" && (
        <div className="space-y-6">
          {/* Trade Context Banner if attached to an active trade */}
          {tradeCtx && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">🎯 Posizione a Mercato</span>
                  {tradeCtx.trade_id && (
                    <span className="text-xs font-mono text-slate-400">Trade #{tradeCtx.trade_id}</span>
                  )}
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded font-bold uppercase ${
                      String(tradeCtx.side).toLowerCase() === "short"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {tradeCtx.side || "LONG"}
                  </span>
                </div>
                {tradeCtx.unrealized_pnl !== undefined && tradeCtx.unrealized_pnl !== null && (
                  <div className="text-sm">
                    <span className="text-slate-400 mr-1.5">PnL Non Realizzato:</span>
                    <span
                      className={`font-semibold ${
                        Number(tradeCtx.unrealized_pnl) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {Number(tradeCtx.unrealized_pnl) >= 0 ? "+" : ""}
                      {Number(tradeCtx.unrealized_pnl).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Quantità Aperta</span>
                  <span className="font-semibold text-white text-sm">{tradeCtx.open_position_qty ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Prezzo Medio Entrata</span>
                  <span className="font-semibold text-white text-sm">
                    {tradeCtx.average_entry_price !== undefined && tradeCtx.average_entry_price !== null
                      ? Number(tradeCtx.average_entry_price).toFixed(2)
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Stop Loss</span>
                  <span className="font-semibold text-rose-400 text-sm">
                    {tradeCtx.stop_loss ? Number(tradeCtx.stop_loss).toFixed(2) : "Non impostato"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Target Price</span>
                  <span className="font-semibold text-emerald-400 text-sm">
                    {tradeCtx.target_price ? Number(tradeCtx.target_price).toFixed(2) : "Non impostato"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Suggestions & Risk Warnings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-5">
              <h3 className="text-emerald-400 font-semibold flex items-center gap-2 mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Suggerimenti Operativi
              </h3>
              {report.action_suggestions && report.action_suggestions.length > 0 ? (
                <ul className="space-y-2">
                  {report.action_suggestions.map((sugg, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span>{sugg}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">Nessun suggerimento specifico rilevato.</p>
              )}
            </div>

            <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-5">
              <h3 className="text-rose-400 font-semibold flex items-center gap-2 mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Avvisi di Rischio & Bias
              </h3>
              {report.risk_warnings && report.risk_warnings.length > 0 ? (
                <ul className="space-y-2">
                  {report.risk_warnings.map((risk, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">Nessun alert critico segnalato.</p>
              )}
            </div>
          </div>

          {/* Full Coaching Reflection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span>🏋️</span> Rapporto del Coach
            </h3>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.coaching_report || "Nessun testo di coaching disponibile."}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Bull vs Bear Debate */}
      {activeTab === "debate" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-6">
            <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
              <span>🐂</span> Tesi Bull (Catalizzatori & Edge)
            </h3>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.bull_thesis || "Nessun report rialzista generato."}
            </div>
          </div>

          <div className="bg-rose-950/10 border border-rose-900/30 rounded-xl p-6">
            <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2">
              <span>🐻</span> Tesi Bear (Avvocato del Diavolo & Rischi)
            </h3>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.bear_thesis || "Nessun report ribassista generato."}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Lead Researcher Synthesis */}
      {activeTab === "lead" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>🎓</span> Sintesi della Commissione d'Investimento
          </h3>
          <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
            {report.lead_synthesis || "Nessuna sintesi disponibile."}
          </div>
        </div>
      )}

      {/* Tab 4: Cyclical Analysis */}
      {activeTab === "cyclical" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Hurst Exponent (H)</span>
              <span className="text-2xl font-extrabold text-sky-400">
                {hurstVal !== null ? hurstVal.toFixed(3) : "—"}
              </span>
              <p className="text-xs text-slate-400 mt-2">
                {hurstVal !== null && hurstVal > 0.55
                  ? "Regime persistente: trend forte e continuità di momentum."
                  : hurstVal !== null && hurstVal < 0.45
                  ? "Regime anti-persistente: oscillazione ciclica e ritorni verso la media."
                  : "Cammino aleatorio (rumore browniano)."}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Regime Frattale</span>
              <span className="text-2xl font-extrabold text-amber-400 capitalize">
                {regimeVal?.replace("_", " ") || "Indeterminato"}
              </span>
              <p className="text-xs text-slate-400 mt-2">
                Stato di memoria a lungo termine identificato con analisi R/S.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Cicli Rilevati (FFT)</span>
              {dominantCycles.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {dominantCycles.map((c: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-300">
                      <span>Ciclo {idx + 1}:</span>
                      <span className="font-semibold text-white">{c.period_trading_days} giorni</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-slate-500">Nessuna armonica spettrale isolata</span>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span>🔄</span> Report Ciclico & Spettrale Completo
            </h3>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.cyclical_report || "Nessun report ciclico disponibile."}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Technical Analysis */}
      {activeTab === "technical" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📈</span> Analisi Tecnica & Indicatori
          </h3>
          <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
            {report.technical_report || "Nessun report tecnico disponibile."}
          </div>
        </div>
      )}

      {/* Tab 6: Fundamental Analysis */}
      {activeTab === "fundamental" && (
        <div className="space-y-6">
          {/* Equity Fundamentals & Wall Street Consensus Grid */}
          {(peRatio !== null || pegRatio !== null || targetMean !== null || recommendation !== null) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Consensus Wall St.</span>
                <span className="text-lg font-bold text-amber-400 capitalize">
                  {recommendation?.replace(/_/g, " ") || "—"}
                </span>
                {numAnalysts !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">{numAnalysts} analisti censiti</p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Target Price Medio</span>
                <span className="text-lg font-bold text-emerald-400">
                  {targetMean !== null ? targetMean.toFixed(2) : "—"}
                </span>
                {targetLow !== null && targetHigh !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Min: {targetLow.toFixed(1)} | Max: {targetHigh.toFixed(1)}
                  </p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Multipli (P/E & PEG)</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-sky-400">
                    {peRatio !== null ? peRatio.toFixed(1) : "—"}
                  </span>
                  <span className="text-xs text-slate-400">P/E</span>
                </div>
                {pegRatio !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">PEG Ratio: {pegRatio.toFixed(2)}</p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">Margini Operativi</span>
                <span className="text-lg font-bold text-indigo-400">
                  {operatingMargins !== null ? `${(operatingMargins * 100).toFixed(1)}%` : "—"}
                </span>
                {grossMargins !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">Margine Lordo: {(grossMargins * 100).toFixed(1)}%</p>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span>📋</span> Analisi Fondamentale & Obbligazionaria
            </h3>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.fundamental_report || "Nessun report fondamentale disponibile."}
            </div>
          </div>
        </div>
      )}

      {/* Convert into Action Modal */}
      <ConvertAnalysisModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        report={report}
      />
    </div>
  );
};
