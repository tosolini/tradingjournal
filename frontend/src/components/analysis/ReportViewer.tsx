import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisReportDetail } from "../../lib/api";
import { ScoreGauge } from "./ScoreGauge";
import { ConvertAnalysisModal } from "./ConvertAnalysisModal";
import { ReportMarkdownViewer } from "./ReportMarkdownViewer";

interface ReportViewerProps {
  report: AnalysisReportDetail;
}

/**
 * Lightweight inline markdown renderer for short action suggestions and risk items.
 * Handles **bold**, *italic*, and `code` tags cleanly.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*\s](?:[^*\n]*?[^*\s])?\*|`[^`]+?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
      return (
        <em key={i} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ report }) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<"coach" | "debate" | "lead" | "technical" | "fundamental" | "cyclical">("coach");
  const [isConvertModalOpen, setIsConvertModalOpen] = useState<boolean>(false);

  const dateLocale = (i18n.resolvedLanguage || i18n.language || "en").startsWith("it") ? "it-IT" : "en-US";

  // Extract cyclical metrics if present in data snapshot
  const cyclicalSnapshot = (report.data_snapshot?.cyclical as Record<string, unknown>) || {};
  const hurstVal = typeof cyclicalSnapshot.hurst_exponent === "number" ? cyclicalSnapshot.hurst_exponent : null;
  const regimeVal = typeof cyclicalSnapshot.regime === "string" ? cyclicalSnapshot.regime : null;
  const dominantCycles = Array.isArray(cyclicalSnapshot.dominant_cycles) ? cyclicalSnapshot.dominant_cycles : [];

  // Extract trade context if present
  const tradeCtx = (report.data_snapshot?.trade_context as Record<string, any>) || null;
  const targetDirection = (report.data_snapshot?.target_direction as string) || null;

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
              {targetDirection && (
                <span
                  className={`text-xs px-2 py-0.5 rounded font-semibold border ${
                    targetDirection === "short"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      : targetDirection === "long"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {targetDirection === "short"
                    ? `🔴 ${t("analysis.viewer.direction_short")}`
                    : targetDirection === "long"
                    ? `🟢 ${t("analysis.viewer.direction_long")}`
                    : `⚖️ ${t("analysis.viewer.direction_both")}`}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              {report.completed_at
                ? t("analysis.viewer.completed_at", {
                    date: new Date(report.completed_at).toLocaleString(dateLocale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })
                : t("analysis.viewer.in_progress")}
            </p>
            {report.llm_model_used && (
              <p className="text-xs text-slate-500 font-mono">
                {t("analysis.viewer.model", { model: report.llm_model_used })}
              </p>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsConvertModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-950/40 transition-all cursor-pointer group"
                title={t("analysis.viewer.convert_tooltip")}
              >
                <span className="group-hover:scale-110 transition-transform">⚡</span>
                <span>{t("analysis.viewer.turn_into_action")}</span>
                <span className="text-[10px] opacity-75 font-normal">{t("analysis.viewer.action_sub")}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-8 self-center md:self-auto">
            {hurstVal !== null && (
              <div className="text-center px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs uppercase font-medium text-slate-400 block">{t("analysis.viewer.hurst_exponent")}</span>
                <span className="text-lg font-bold text-sky-400">{hurstVal.toFixed(2)}</span>
                <span className="text-[11px] block text-slate-400 capitalize">{regimeVal?.replace("_", " ")}</span>
              </div>
            )}
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase font-medium text-slate-400 mb-1">{t("analysis.viewer.coach_score")}</span>
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
          <span>{t("analysis.viewer.tabs.coach")}</span>
        </button>
        <button
          onClick={() => setActiveTab("debate")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "debate" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>{t("analysis.viewer.tabs.debate")}</span>
        </button>
        <button
          onClick={() => setActiveTab("lead")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "lead" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>{t("analysis.viewer.tabs.lead")}</span>
        </button>
        <button
          onClick={() => setActiveTab("cyclical")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "cyclical" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>{t("analysis.viewer.tabs.cyclical")}</span>
        </button>
        <button
          onClick={() => setActiveTab("technical")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "technical" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>{t("analysis.viewer.tabs.technical")}</span>
        </button>
        <button
          onClick={() => setActiveTab("fundamental")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeTab === "fundamental" ? "bg-primary text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <span>{t("analysis.viewer.tabs.fundamental")}</span>
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
                  <span className="text-base font-bold text-white">{t("analysis.viewer.coach.market_position")}</span>
                  {tradeCtx.trade_id && (
                    <span className="text-xs font-mono text-slate-400">
                      {t("analysis.viewer.coach.trade_id", { id: tradeCtx.trade_id })}
                    </span>
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
                    <span className="text-slate-400 mr-1.5">{t("analysis.viewer.coach.unrealized_pnl")}</span>
                    <span
                      className={`font-semibold ${
                        Number(tradeCtx.unrealized_pnl) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {Number(tradeCtx.unrealized_pnl) >= 0 ? "+" : ""}
                      {Number(tradeCtx.unrealized_pnl).toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">{t("analysis.viewer.coach.open_qty")}</span>
                  <span className="font-semibold text-white text-sm">{tradeCtx.open_position_qty ?? "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{t("analysis.viewer.coach.avg_entry")}</span>
                  <span className="font-semibold text-white text-sm">
                    {tradeCtx.average_entry_price !== undefined && tradeCtx.average_entry_price !== null
                      ? Number(tradeCtx.average_entry_price).toFixed(2)
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{t("analysis.viewer.coach.stop_loss")}</span>
                  <span className="font-semibold text-rose-400 text-sm">
                    {tradeCtx.stop_loss ? Number(tradeCtx.stop_loss).toFixed(2) : t("analysis.viewer.coach.not_set")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">{t("analysis.viewer.coach.target_price")}</span>
                  <span className="font-semibold text-emerald-400 text-sm">
                    {tradeCtx.target_price ? Number(tradeCtx.target_price).toFixed(2) : t("analysis.viewer.coach.not_set")}
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
                {t("analysis.viewer.coach.suggestions_title")}
              </h3>
              {report.action_suggestions && report.action_suggestions.length > 0 ? (
                <ul className="space-y-2">
                  {report.action_suggestions.map((sugg, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span className="leading-snug">{renderInlineMarkdown(sugg)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">{t("analysis.viewer.coach.suggestions_empty")}</p>
              )}
            </div>

            <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-5">
              <h3 className="text-rose-400 font-semibold flex items-center gap-2 mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {t("analysis.viewer.coach.risks_title")}
              </h3>
              {report.risk_warnings && report.risk_warnings.length > 0 ? (
                <ul className="space-y-2">
                  {report.risk_warnings.map((risk, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span className="leading-snug">{renderInlineMarkdown(risk)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400 italic">{t("analysis.viewer.coach.risks_empty")}</p>
              )}
            </div>
          </div>

          {/* Full Coaching Reflection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span aria-hidden="true">🏋️</span> {t("analysis.viewer.coach.report_title")}
            </h3>
            <ReportMarkdownViewer
              content={report.coaching_report}
              emptyText={t("analysis.viewer.coach.report_empty")}
              stripJsonBlock
            />
          </div>
        </div>
      )}

      {/* Tab 2: Bull vs Bear Debate */}
      {activeTab === "debate" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-6">
            <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
              <span aria-hidden="true">🐂</span> {t("analysis.viewer.debate.bull_title")}
            </h3>
            <ReportMarkdownViewer
              content={report.bull_thesis}
              emptyText={t("analysis.viewer.debate.bull_empty")}
            />
          </div>

          <div className="bg-rose-950/10 border border-rose-900/30 rounded-xl p-6">
            <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2">
              <span aria-hidden="true">🐻</span> {t("analysis.viewer.debate.bear_title")}
            </h3>
            <ReportMarkdownViewer
              content={report.bear_thesis}
              emptyText={t("analysis.viewer.debate.bear_empty")}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Lead Researcher Synthesis */}
      {activeTab === "lead" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span aria-hidden="true">🎓</span> {t("analysis.viewer.lead.title")}
          </h3>
          <ReportMarkdownViewer
            content={report.lead_synthesis}
            emptyText={t("analysis.viewer.lead.empty")}
          />
        </div>
      )}

      {/* Tab 4: Cyclical Analysis */}
      {activeTab === "cyclical" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                {t("analysis.viewer.cyclical.hurst_title")}
              </span>
              <span className="text-2xl font-extrabold text-sky-400">
                {hurstVal !== null ? hurstVal.toFixed(3) : "—"}
              </span>
              <p className="text-xs text-slate-400 mt-2">
                {hurstVal !== null && hurstVal > 0.55
                  ? t("analysis.viewer.cyclical.regime_persistent")
                  : hurstVal !== null && hurstVal < 0.45
                  ? t("analysis.viewer.cyclical.regime_anti_persistent")
                  : t("analysis.viewer.cyclical.regime_random")}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                {t("analysis.viewer.cyclical.regime_title")}
              </span>
              <span className="text-2xl font-extrabold text-amber-400 capitalize">
                {regimeVal?.replace("_", " ") || t("analysis.viewer.cyclical.regime_indeterminate")}
              </span>
              <p className="text-xs text-slate-400 mt-2">
                {t("analysis.viewer.cyclical.regime_desc")}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                {t("analysis.viewer.cyclical.cycles_title")}
              </span>
              {dominantCycles.length > 0 ? (
                <div className="space-y-1 mt-1">
                  {dominantCycles.map((c: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-300">
                      <span>{t("analysis.viewer.cyclical.cycle_label", { index: idx + 1 })}</span>
                      <span className="font-semibold text-white">
                        {t("analysis.viewer.cyclical.days", { count: c.period_trading_days })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-slate-500">{t("analysis.viewer.cyclical.cycles_empty")}</span>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span aria-hidden="true">🔄</span> {t("analysis.viewer.cyclical.report_title")}
            </h3>
            <ReportMarkdownViewer
              content={report.cyclical_report}
              emptyText={t("analysis.viewer.cyclical.report_empty")}
            />
          </div>
        </div>
      )}

      {/* Tab 5: Technical Analysis */}
      {activeTab === "technical" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span aria-hidden="true">📈</span> {t("analysis.viewer.technical.title")}
          </h3>
          <ReportMarkdownViewer
            content={report.technical_report}
            emptyText={t("analysis.viewer.technical.empty")}
          />
        </div>
      )}

      {/* Tab 6: Fundamental Analysis */}
      {activeTab === "fundamental" && (
        <div className="space-y-6">
          {/* Equity Fundamentals & Wall Street Consensus Grid */}
          {(peRatio !== null || pegRatio !== null || targetMean !== null || recommendation !== null) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                  {t("analysis.viewer.fundamental.consensus_title")}
                </span>
                <span className="text-lg font-bold text-amber-400 capitalize">
                  {recommendation?.replace(/_/g, " ") || "—"}
                </span>
                {numAnalysts !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t("analysis.viewer.fundamental.analysts_count", { count: numAnalysts })}
                  </p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                  {t("analysis.viewer.fundamental.target_mean_title")}
                </span>
                <span className="text-lg font-bold text-emerald-400">
                  {targetMean !== null ? targetMean.toFixed(2) : "—"}
                </span>
                {targetLow !== null && targetHigh !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t("analysis.viewer.fundamental.target_range", { min: targetLow.toFixed(1), max: targetHigh.toFixed(1) })}
                  </p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                  {t("analysis.viewer.fundamental.multiples_title")}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-sky-400">
                    {peRatio !== null ? peRatio.toFixed(1) : "—"}
                  </span>
                  <span className="text-xs text-slate-400">P/E</span>
                </div>
                {pegRatio !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t("analysis.viewer.fundamental.peg_ratio", { value: pegRatio.toFixed(2) })}
                  </p>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-xs uppercase font-medium text-slate-400 block mb-1">
                  {t("analysis.viewer.fundamental.operating_margins_title")}
                </span>
                <span className="text-lg font-bold text-indigo-400">
                  {operatingMargins !== null ? `${(operatingMargins * 100).toFixed(1)}%` : "—"}
                </span>
                {grossMargins !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t("analysis.viewer.fundamental.gross_margin", { value: (grossMargins * 100).toFixed(1) })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span aria-hidden="true">📋</span> {t("analysis.viewer.fundamental.report_title")}
            </h3>
            <ReportMarkdownViewer
              content={report.fundamental_report}
              emptyText={t("analysis.viewer.fundamental.report_empty")}
            />
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
