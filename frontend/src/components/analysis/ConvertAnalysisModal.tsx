import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
    let thesis = `Analisi Multi-Agente AI (Coach Score: ${score ?? "—"}/10)\n`;
    if (report.lead_synthesis) {
      thesis += `\n• Sintesi Commissione: ${report.lead_synthesis.slice(0, 300)}...`;
    }
    if (report.bull_thesis) {
      thesis += `\n• Catalizzatori Bull: ${report.bull_thesis.slice(0, 200)}...`;
    }
    if (report.action_suggestions && report.action_suggestions.length > 0) {
      thesis += `\n• Azioni Suggerite: ${report.action_suggestions.slice(0, 2).join("; ")}`;
    }
    setThesisNotes(thesis.trim());

    // Daily Note Defaults
    setNoteDate(new Date().toISOString().slice(0, 10));
    setMood(score && score >= 7 ? "up" : score && score <= 4 ? "down" : "stale");
    setShortSummary(`Analisi AI: ${report.symbol} (${report.market}) · Score ${score ?? "—"}/10`);

    let rich = `<p><strong>Analisi Multi-Agente: ${report.symbol} (${report.market})</strong></p>`;
    rich += `<p><strong>Score del Coach:</strong> ${score ?? "—"}/10</p>`;
    if (report.lead_synthesis) {
      rich += `<p><strong>Sintesi:</strong> ${report.lead_synthesis}</p>`;
    }
    if (report.action_suggestions && report.action_suggestions.length > 0) {
      rich += `<p><strong>Punti Chiave:</strong></p><ul>${report.action_suggestions
        .map((s) => `<li>${s}</li>`)
        .join("")}</ul>`;
    }
    setNoteContent(rich);
  }, [isOpen, report]);

  // Mutation: Save Scouting Idea
  const scoutingMutation = useMutation({
    mutationFn: () => {
      const parsedTrigger = parseFloat(triggerPrice);
      if (!parsedTrigger || isNaN(parsedTrigger)) {
        throw new Error("Il prezzo trigger è obbligatorio per l'idea di scouting.");
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
      toast.success(`Idea di scouting per ${report.symbol} creata con successo!`);
      onClose();
      navigate("/notes?tab=scouting");
    },
    onError: (err: any) => {
      toast.error(err.message || "Impossibile salvare l'idea di scouting.");
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
          short_summary: shortSummary.trim() || `Analisi ${report.symbol}`,
          rich_text: noteContent.trim(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success(`Nota di trading per ${report.symbol} aggiunta al diario!`);
      onClose();
      navigate("/notes?tab=notes");
    },
    onError: (err: any) => {
      toast.error(err.message || "Impossibile salvare la nota giornaliera.");
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
                {step === 1 ? "Trasforma Analisi in Azione" : destination === "scouting" ? "Crea Idea di Scouting" : "Aggiungi a Nota del Giorno"}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {report.symbol} ({report.market}) · Coach Score:{" "}
              <span className="text-sky-400 font-semibold">{report.overall_score ?? "—"}/10</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Chiudi"
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
                Seleziona dove desideri trasferire i dati e le tesi elaborate dall'intelligenza artificiale:
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
                    Idea di Scouting
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Aggiungi alla Watchlist con trigger di prezzo, Stop Loss e Target precompilati dall'analisi tecnica e dai consensus.
                  </p>
                  <span className="mt-3 text-[11px] font-semibold text-teal-400 flex items-center gap-1">
                    Configura Setup <span>→</span>
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
                    Nota di Trading
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Registra la riflessione e i catalizzatori nel diario di oggi, con score, sentiment e consigli operativi del coach.
                  </p>
                  <span className="mt-3 text-[11px] font-semibold text-violet-400 flex items-center gap-1">
                    Scrivi nel Diario <span>→</span>
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
                  Direzione Setup
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
                    <span>↗</span> LONG (Rialzista)
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
                    <span>↘</span> SHORT (Ribassista)
                  </button>
                </div>
              </div>

              {/* Trigger Price & Condition */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    Condizione
                  </label>
                  <select
                    value={triggerCondition}
                    onChange={(e) => setTriggerCondition(e.target.value as "<=" | ">=")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs font-mono"
                  >
                    <option value="<=">&le; Prezzo tocca o scende a</option>
                    <option value=">=">&ge; Prezzo tocca o sale a</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold uppercase text-slate-400 mb-1">
                    Prezzo Trigger *
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    placeholder="Es. 120.50"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Stop Loss and Target Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-rose-400 mb-1">
                    Stop Loss
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="Supporto tecnico"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-rose-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold uppercase text-emerald-400 mb-1">
                    Target Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="Target Wall St o resistenza"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Thesis Notes */}
              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1">
                  Tesi di Scouting & Catalizzatori
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
                    Data Diario
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
                    Sentiment / Mood
                  </label>
                  <select
                    value={mood}
                    onChange={(e) => setMood(e.target.value as "up" | "down" | "stale")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                  >
                    <option value="up">🟢 Positivo / Rialzista</option>
                    <option value="stale">🟡 Neutro / Attesa</option>
                    <option value="down">🔴 Cauto / Ribassista</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-400 mb-1">
                  Sommario Breve
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
                  Contenuto della Nota (WYSIWYG)
                </label>
                <RichTextEditor
                  value={noteContent}
                  onChange={setNoteContent}
                  placeholder="Scrivi o perfeziona i dettagli della tua nota..."
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
              ← Indietro
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
              Annulla
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
                    <span>Salvataggio...</span>
                  </>
                ) : (
                  <>
                    <span>Salva Subito</span>
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
