import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnalysisReportDetail, api, tradeIdeasApi } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { RichTextEditor } from "../RichTextEditor";

interface ConvertAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AnalysisReportDetail;
}

type DestinationType = "scouting" | "note";

export const ConvertAnalysisModal: React.FC<ConvertAnalysisModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  // Multi-step: step 1 = choose destination, step 2 = customize & confirm
  const [step, setStep] = useState<1 | 2>(1);
  const [destination, setDestination] = useState<DestinationType>("scouting");

  // Scouting form state
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [triggerPrice, setTriggerPrice] = useState<string>("");
  const [triggerCondition, setTriggerCondition] = useState<"<=" | ">=">("<=");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [thesisNotes, setThesisNotes] = useState<string>("");

  // Daily note form state
  const [noteDate, setNoteDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [mood, setMood] = useState<"up" | "down" | "stale">("stale");
  const [shortSummary, setShortSummary] = useState<string>("");
  const [noteContent, setNoteContent] = useState<string>("");

  // Populate smart defaults when modal opens or report changes
  useEffect(() => {
    if (!isOpen) return;

    // Default step
    setStep(1);

    // Extract snapshot figures
    const quote = report.data_snapshot?.quote as number | undefined;
    const tech = (report.data_snapshot?.technical as Record<string, any>) || {};
    const fund = (report.data_snapshot?.fundamental as Record<string, any>) || {};

    const score = report.overall_score;
    const isBullish = score !== null && score !== undefined ? score >= 6 : true;
    const isBearish = score !== null && score !== undefined ? score <= 4 : false;

    // Scouting Defaults
    const defaultDir: "long" | "short" = isBearish ? "short" : "long";
    setDirection(defaultDir);
    setTriggerCondition(defaultDir === "long" ? "<=" : ">=");

    if (quote) {
      setTriggerPrice(Number(quote).toFixed(2));
    } else {
      setTriggerPrice("");
    }

    if (tech.support) {
      setStopLoss(Number(tech.support).toFixed(2));
    } else if (quote) {
      setStopLoss((Number(quote) * 0.94).toFixed(2));
    } else {
      setStopLoss("");
    }

    if (fund.target_mean_price) {
      setTargetPrice(Number(fund.target_mean_price).toFixed(2));
    } else if (tech.resistance) {
      setTargetPrice(Number(tech.resistance).toFixed(2));
    } else if (quote) {
      setTargetPrice((Number(quote) * 1.15).toFixed(2));
    } else {
      setTargetPrice("");
    }

    // Curated thesis text
    let thesis = `${t("analysis.convert_modal.defaults.thesis_header", { score: score ?? "—" })}\n`;
    if (report.lead_synthesis) {
      thesis += `\n${t("analysis.convert_modal.defaults.lead_synthesis_prefix")}${report.lead_synthesis.slice(0, 300)}...`;
    }
    if (report.bull_thesis) {
      thesis += `\n${t("analysis.convert_modal.defaults.bull_thesis_prefix")}${report.bull_thesis.slice(0, 200)}...`;
    }
    if (report.action_suggestions && report.action_suggestions.length > 0) {
      thesis += `\n${t("analysis.convert_modal.defaults.action_sugg_prefix")}${report.action_suggestions.slice(0, 2).join("; ")}`;
    }
    setThesisNotes(thesis.trim());

    // Daily Note Defaults
    setNoteDate(new Date().toISOString().slice(0, 10));
    setMood(score && score >= 7 ? "up" : score && score <= 4 ? "down" : "stale");
    setShortSummary(t("analysis.convert_modal.defaults.short_summary", {
      symbol: report.symbol,
      market: report.market,
      score: score ?? "—",
    }));

    let rich = `<p><strong>${t("analysis.convert_modal.defaults.rich_header", {
      symbol: report.symbol,
      market: report.market,
    })}</strong></p>`;
    rich += `<p><strong>${t("analysis.convert_modal.defaults.coach_score")}</strong> ${score ?? "—"}/10</p>`;
    if (report.lead_synthesis) {
      rich += `<p><strong>${t("analysis.convert_modal.defaults.synthesis")}</strong> ${report.lead_synthesis}</p>`;
    }
    if (report.action_suggestions && report.action_suggestions.length > 0) {
      rich += `<p><strong>${t("analysis.convert_modal.defaults.key_points")}</strong></p><ul>${report.action_suggestions
        .map((s) => `<li>${s}</li>`)
        .join("")}</ul>`;
    }
    setNoteContent(rich);
  }, [isOpen, report, t]);

  // Mutation: Save Scouting Idea
  const scoutingMutation = useMutation({
    mutationFn: () => {
      const parsedTrigger = parseFloat(triggerPrice);
      if (!parsedTrigger || isNaN(parsedTrigger)) {
        throw new Error(t("analysis.convert_modal.toasts.trigger_required"));
      }

      return tradeIdeasApi.create({
        symbol: report.symbol,
        market: report.market,
        direction,
        trigger_price: parsedTrigger,
        trigger_condition: triggerCondition,
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        target_price: targetPrice ? parseFloat(targetPrice) : undefined,
        thesis_notes: thesisNotes.trim() || undefined,
        tags: ["AI Analysis", "Scouting", report.market || "Equity"],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trade-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["trade-idea-alerts"] });
      toast.success(t("analysis.convert_modal.toasts.scouting_success", { symbol: report.symbol }));
      onClose();
      navigate("/notes?tab=scouting");
    },
    onError: (err: any) => {
      toast.error(err.message || t("analysis.convert_modal.toasts.scouting_error"));
    },
  });

  // Mutation: Save Daily Note
  const noteMutation = useMutation({
    mutationFn: () => {
      return api("/api/notes", {
        method: "POST",
        body: JSON.stringify({
          note_date: noteDate,
          symbol: report.symbol,
          mood,
          market_condition: `${report.symbol} (${report.market})`,
          market_volatility: "medium",
          short_summary: shortSummary.trim() || t("analysis.convert_modal.defaults.short_summary_fallback", { symbol: report.symbol }),
          rich_text: noteContent.trim(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success(t("analysis.convert_modal.toasts.note_success", { symbol: report.symbol }));
      onClose();
      navigate("/notes?tab=notes");
    },
    onError: (err: any) => {
      toast.error(err.message || t("analysis.convert_modal.toasts.note_error"));
    },
  });

  if (!isOpen) return null;

  const isPending = scoutingMutation.isPending || noteMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
      <div
        className={`relative w-full ${
          step === 2 && destination === "note" ? "max-w-2xl" : "max-w-lg"
        } bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all`}
      >
        {/* Accent top gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 via-indigo-500 to-teal-400" />

        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {step === 1
                  ? t("analysis.convert_modal.title_step1")
                  : destination === "scouting"
                  ? t("analysis.convert_modal.title_scouting")
                  : t("analysis.convert_modal.title_note")}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {report.symbol} ({report.market}) · {t("analysis.viewer.coach_score")}:{" "}
              <span className="text-sky-400 font-semibold">{report.overall_score ?? "—"}/10</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label={t("analysis.convert_modal.close")}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* STEP 1: Select Destination */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                {t("analysis.convert_modal.step1_prompt")}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: Scouting */}
                <button
                  type="button"
                  onClick={() => {
                    setDestination("scouting");
                    setStep(2);
                  }}
                  className="group flex flex-col items-start p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-teal-500/60 hover:bg-teal-950/10 transition-all text-left cursor-pointer shadow-sm"
                >
                  <div className="h-10 w-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-lg mb-3 group-hover:scale-105 transition-transform">
                    🎯
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-teal-300 transition-colors">
                    {t("analysis.convert_modal.scouting_card_title")}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {t("analysis.convert_modal.scouting_card_desc")}
                  </p>
                  <span className="mt-3 text-[11px] font-semibold text-teal-400 flex items-center gap-1">
                    {t("analysis.convert_modal.scouting_card_action")} <span>→</span>
                  </span>
                </button>

                {/* Option 2: Daily Note */}
                <button
                  type="button"
                  onClick={() => {
                    setDestination("note");
                    setStep(2);
                  }}
                  className="group flex flex-col items-start p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-violet-500/60 hover:bg-violet-950/10 transition-all text-left cursor-pointer shadow-sm"
                >
                  <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center text-lg mb-3 group-hover:scale-105 transition-transform">
                    📝
                  </div>
                  <h3 className="font-bold text-sm text-white group-hover:text-violet-300 transition-colors">
                    {t("analysis.convert_modal.note_card_title")}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {t("analysis.convert_modal.note_card_desc")}
                  </p>
                  <span className="mt-3 text-[11px] font-semibold text-violet-400 flex items-center gap-1">
                    {t("analysis.convert_modal.note_card_action")} <span>→</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Customize Scouting */}
          {step === 2 && destination === "scouting" && (
            <div className="space-y-4 text-xs">
              {/* Direction selector */}
              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1.5">
                  {t("analysis.convert_modal.direction_label")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("long");
                      setTriggerCondition("<=");
                    }}
                    className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      direction === "long"
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>↗</span> {t("analysis.convert_modal.direction_long")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("short");
                      setTriggerCondition(">=");
                    }}
                    className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      direction === "short"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>↘</span> {t("analysis.convert_modal.direction_short")}
                  </button>
                </div>
              </div>

              {/* Trigger Price & Condition */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    {t("analysis.convert_modal.condition_label")}
                  </label>
                  <select
                    value={triggerCondition}
                    onChange={(e) => setTriggerCondition(e.target.value as "<=" | ">=")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono"
                  >
                    <option value="<=">{t("analysis.convert_modal.condition_le")}</option>
                    <option value=">=">{t("analysis.convert_modal.condition_ge")}</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    {t("analysis.convert_modal.trigger_price_label")}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    placeholder={t("analysis.convert_modal.trigger_price_placeholder")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Stop Loss and Target Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-rose-400 mb-1">
                    {t("analysis.convert_modal.stop_loss_label")}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder={t("analysis.convert_modal.stop_loss_placeholder")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-rose-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold uppercase text-emerald-400 mb-1">
                    {t("analysis.convert_modal.target_price_label")}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder={t("analysis.convert_modal.target_price_placeholder")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Thesis Notes */}
              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1">
                  {t("analysis.convert_modal.thesis_label")}
                </label>
                <textarea
                  rows={4}
                  value={thesisNotes}
                  onChange={(e) => setThesisNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-xs focus:ring-1 focus:ring-teal-400 focus:outline-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Customize Daily Note */}
          {step === 2 && destination === "note" && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    {t("analysis.convert_modal.date_label")}
                  </label>
                  <input
                    type="date"
                    value={noteDate}
                    onChange={(e) => setNoteDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    {t("analysis.convert_modal.sentiment_label")}
                  </label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value as "up" | "down" | "stale")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                  >
                    <option value="up">{t("analysis.convert_modal.mood_up")}</option>
                    <option value="stale">{t("analysis.convert_modal.mood_stale")}</option>
                    <option value="down">{t("analysis.convert_modal.mood_down")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1">
                  {t("analysis.convert_modal.summary_label")}
                </label>
                <input
                  type="text"
                  value={shortSummary}
                  onChange={(e) => setShortSummary(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1">
                  {t("analysis.convert_modal.note_content_label")}
                </label>
                <RichTextEditor
                  value={noteContent}
                  onChange={setNoteContent}
                  placeholder={t("analysis.convert_modal.note_content_placeholder")}
                  minHeight="180px"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={isPending}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition"
            >
              {t("analysis.convert_modal.btn_back")}
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-3.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 hover:text-white transition"
            >
              {t("analysis.convert_modal.btn_cancel")}
            </button>

            {step === 2 && (
              <button
                type="button"
                onClick={() => {
                  if (destination === "scouting") {
                    scoutingMutation.mutate();
                  } else {
                    noteMutation.mutate();
                  }
                }}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-950/50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>{t("analysis.convert_modal.btn_saving")}</span>
                  </>
                ) : (
                  <>
                    <span>{t("analysis.convert_modal.btn_save")}</span>
                    <span>🚀</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
