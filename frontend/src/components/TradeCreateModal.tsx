import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Account, Broker, Ticker, Trade, api, tickersApi } from "../lib/api";
import { INSTRUMENT_TYPES, detectIsGovernmentBond, estimateExecutionFee } from "../lib/fees";
import { XIcon } from "./icons";

// ── Step definitions ─────────────────────────────────────────────────
const STEPS = [
  { key: "account_ticker", labelKey: "trades.new_trade.wizard.step1" },
  { key: "entry_quantity", labelKey: "trades.new_trade.wizard.step2" },
  { key: "direction", labelKey: "trades.new_trade.wizard.step3" },
  { key: "take_profit", labelKey: "trades.new_trade.wizard.step4" },
  { key: "stop_loss", labelKey: "trades.new_trade.wizard.step5" },
  { key: "execution", labelKey: "trades.new_trade.wizard.step6" },
] as const;

type WizardStep = (typeof STEPS)[number]["key"];
type Direction = "long" | "short";
type ExecutionType = "open" | "close" | "partial";
type PercentMode = "price" | "percent";

interface WizardState {
  step: number; // 0-based index
  // Step 1 — Account & Ticker
  accountId: number;
  symbolInput: string;
  selectedTicker: Ticker | null;
  symbolSuggestions: Ticker[];
  showSuggestions: boolean;
  instrumentType: string;
  // Step 2 — Entry & Quantity
  entryPrice: string;
  quantityMode: "shares" | "value";
  quantity: string; // number of shares
  entryValue: string; // total value (when mode = "value")
  // Step 3 — Direction
  direction: Direction;
  // Step 4 — Take Profit
  tpMode: PercentMode;
  tpPrice: string;
  tpPercent: string;
  // Step 5 — Stop Loss
  slMode: PercentMode;
  slPrice: string;
  slPercent: string;
  // Step 6 — Execution
  executionType: ExecutionType;
}

type Props = {
  open: boolean;
  onClose: () => void;
};

function inferAction(direction: Direction, executionType: ExecutionType) {
  if (executionType === "open") return direction === "long" ? "BUY" : "SELL";
  return direction === "long" ? "SELL" : "BUY";
}

// ── Helpers ───────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// ── Field info tooltip ────────────────────────────────────────────────
function FieldHelp({ text, align = "center" }: { text: string; align?: "center" | "start" }) {
  const tooltipPos =
    align === "start"
      ? "left-0 -translate-x-0"
      : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative ml-1 inline-flex">
      <span
        tabIndex={0}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500 text-[10px] font-semibold text-slate-300 dark:text-slate-900 outline-none ring-teal-400/70 transition focus:ring-2"
        aria-label={text}
      >
        ?
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${tooltipPos} top-full z-30 mt-2 w-56 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs leading-snug text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

// ── Stepped input (slider + number) ───────────────────────────────────
function PercentSliderInput({
  value,
  onChange,
  min,
  max,
  step = 0.25,
  label,
  suffix = "%",
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  suffix?: string;
}) {
  const num = parseFloat(value) || 0;
  const pct = clamp(((num - min) / (max - min)) * 100, 0, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400 dark:text-slate-900">{label}</span>
        <span className="font-mono text-sm font-semibold text-slate-200 dark:text-slate-900">
          {num.toFixed(2)}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={num}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-2 appearance-none cursor-pointer rounded-full bg-slate-700 dark:bg-slate-300 accent-teal-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500 [&::-webkit-slider-thumb]:shadow-lg"
        aria-label={label}
      />
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

// ── Mode toggle ───────────────────────────────────────────────────────
function ModeToggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 dark:border-slate-300 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-xs font-semibold transition ${
            value === opt.value
              ? "bg-teal-500 text-slate-900"
              : "bg-transparent text-slate-400 dark:text-slate-600 hover:text-slate-200 dark:hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Stepper header ────────────────────────────────────────────────────
function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  i === current
                    ? "bg-teal-500 text-slate-900 shadow-lg shadow-teal-500/30 scale-110"
                    : i < current
                      ? "bg-teal-500/30 text-teal-300 dark:text-teal-700"
                      : "bg-slate-700 dark:bg-slate-300 text-slate-400 dark:text-slate-600"
                }`}
              >
                {i < current ? "✓" : i + 1}
              </div>
              <span
                className={`hidden sm:block text-[10px] leading-tight text-center max-w-16 ${
                  i === current
                    ? "text-teal-400 dark:text-teal-700 font-semibold"
                    : "text-slate-500 dark:text-slate-500"
                }`}
              >
                {labels[i]}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className={`flex-1 h-px mx-2 transition-colors duration-500 ${
                  i < current ? "bg-teal-500/60" : "bg-slate-700 dark:bg-slate-300"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      {/* Mobile step label */}
      <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-600 sm:hidden">
        {labels[current]}
      </p>
    </div>
  );
}

// ── Card wrapper for each step ────────────────────────────────────────
function StepCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="animate-[fadeSlideIn_0.35s_ease-out] space-y-4">
      <h3 className="text-base font-semibold text-slate-100 dark:text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function RiskRewardPreview({
  direction,
  entryPrice,
  stopLoss,
  takeProfit,
  quantity,
}: {
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
}) {
  const { t } = useTranslation();
  if (entryPrice <= 0) return null;
  const isLong = direction === "long";
  const riskPerShare = isLong
    ? stopLoss > 0 ? entryPrice - stopLoss : null
    : stopLoss > 0 ? stopLoss - entryPrice : null;
  const rewardPerShare = isLong
    ? takeProfit > 0 ? takeProfit - entryPrice : null
    : takeProfit > 0 ? entryPrice - takeProfit : null;

  const hasRisk = riskPerShare !== null && riskPerShare > 0;
  const hasReward = rewardPerShare !== null && rewardPerShare > 0;

  if (!hasRisk && !hasReward) return null;

  const ratio = hasRisk && hasReward && riskPerShare! > 0 ? rewardPerShare! / riskPerShare! : null;
  const totalRisk = hasRisk ? riskPerShare! * quantity : null;
  const totalReward = hasReward ? rewardPerShare! * quantity : null;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-3.5 dark:border-slate-300 dark:bg-slate-50 my-3">
      <div className="flex items-center justify-between text-xs font-semibold mb-2">
        <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Risk / Reward (R:R)
        </span>
        {ratio !== null && (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              ratio >= 2
                ? "bg-emerald-500/15 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                : ratio >= 1
                ? "bg-amber-500/15 text-amber-300 dark:bg-amber-100 dark:text-amber-800"
                : "bg-red-500/15 text-red-300 dark:bg-red-100 dark:text-red-800"
            }`}
          >
            1 : {ratio.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 dark:border-red-200 dark:bg-red-50">
          <div className="text-[10px] text-red-300 dark:text-red-700 uppercase font-semibold">
            {t("trades.new_trade.max_risk", "Rischio Max (Stop Loss)")}
          </div>
          <div className="text-sm font-bold text-red-400 dark:text-red-600 tabular-nums mt-0.5">
            {totalRisk !== null ? `-€${totalRisk.toFixed(2)}` : t("trades.new_trade.not_set", "Non impostato")}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 dark:border-emerald-200 dark:bg-emerald-50">
          <div className="text-[10px] text-emerald-300 dark:text-emerald-700 uppercase font-semibold">
            {t("trades.new_trade.max_target", "Target Max (Take Profit)")}
          </div>
          <div className="text-sm font-bold text-emerald-400 dark:text-emerald-600 tabular-nums mt-0.5">
            {totalReward !== null ? `+€${totalReward.toFixed(2)}` : t("trades.new_trade.not_set", "Non impostato")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Wizard Modal ─────────────────────────────────────────────────
// ── Quick Trade Form (single-step legacy) ──────────────────────────────
function QuickTradeForm({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const numberLocale = i18n.resolvedLanguage === "it" ? "it-IT" : "en-US";

  // State
  const [accountId, setAccountId] = useState(0);
  const [symbolInput, setSymbolInput] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<Ticker | null>(null);
  const [symbolSuggestions, setSymbolSuggestions] = useState<Ticker[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [instrumentType, setInstrumentType] = useState<string>("stock");
  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const symbolContainerRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState("1");
  const [entryPrice, setEntryPrice] = useState("");
  const [direction, setDirection] = useState<Direction>("long");
  const [executionType, setExecutionType] = useState<ExecutionType>("open");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (symbolContainerRef.current && !symbolContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSymbolInput = useCallback((value: string) => {
    setSymbolInput(value);
    setSelectedTicker(null);
    if (detectIsGovernmentBond(value, undefined, undefined)) {
      setInstrumentType("government_bond");
    }
    clearTimeout(symbolDebounceRef.current);
    if (value.trim().length < 1) {
      setSymbolSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    symbolDebounceRef.current = setTimeout(async () => {
      const results = await tickersApi.search(value, 8);
      setSymbolSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 300);
  }, []);

  const selectSymbol = useCallback((ticker: Ticker) => {
    setSymbolInput(ticker.symbol);
    setSelectedTicker(ticker);
    setShowSuggestions(false);
    if (detectIsGovernmentBond(ticker.symbol, ticker.market, ticker.isin)) {
      setInstrumentType("government_bond");
    }
  }, []);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/api/accounts"),
  });
  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: () => api<Broker[]>("/api/brokers"),
  });

  const ep = parseFloat(entryPrice) || 0;
  const qty = parseFloat(quantity) || 0;

  const estimatedFee = useMemo(() => {
    if (!accounts?.length || !brokers?.length || !accountId || accountId <= 0 || !ep || !qty) return null;
    const account = accounts.find((a) => a.id === accountId);
    if (!account?.broker_id) return null;
    const broker = brokers.find((b) => b.id === account.broker_id);
    if (!broker) return null;
    return estimateExecutionFee({
      broker,
      quantity: qty,
      price: ep,
      market: selectedTicker?.market || "Euronext",
      currency: broker.fee_currency || account.base_currency || "EUR",
    });
  }, [accounts, brokers, accountId, ep, qty, selectedTicker]);

  const tpNum = parseFloat(takeProfit) || 0;
  const slNum = parseFloat(stopLoss) || 0;
  const tpPct = ep > 0 && tpNum > 0 ? ((tpNum - ep) / ep) * 100 : null;
  const slPct = ep > 0 && slNum > 0
    ? (direction === "long" ? ((ep - slNum) / ep) * 100 : ((slNum - ep) / ep) * 100)
    : null;

  // Validation
  const isValid = accountId > 0 && symbolInput.trim().length > 0 && qty > 0 && ep > 0;

  const createTrade = useMutation({
    mutationFn: async () => {
      const symbol = selectedTicker?.symbol || symbolInput.toUpperCase();
      const created = await api<Trade>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          account_id: accountId,
          market: selectedTicker?.market || "Euronext",
          symbol,
          ...(selectedTicker && { ticker_id: selectedTicker.id }),
          instrument_type: instrumentType,
          side: direction,
          status: executionType === "open" ? "open" : executionType,
          target_price: tpNum > 0 ? tpNum : null,
          stop_loss: slNum > 0 ? slNum : null,
          tags: [],
        }),
      });
      await api(`/api/trades/${created.id}/executions`, {
        method: "POST",
        body: JSON.stringify({
          action: inferAction(direction, executionType),
          executed_at: new Date().toISOString(),
          quantity: qty,
          price: ep,
          currency: "EUR",
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["recent-executions"] });
      onClose();
    },
  });

  return (
    <div className="space-y-4">
      {/* Account + Symbol */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.account")}
            <FieldHelp text={t("trades.new_trade.tooltips.account")} />
          </span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(parseInt(e.target.value))}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2"
          >
            <option value={0}>{t("trades.new_trade.placeholders.select_account")}</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <div className="text-sm" ref={symbolContainerRef}>
          <span className="inline-flex items-center mb-1 text-slate-300 dark:text-slate-900">
            {t("trades.new_trade.labels.symbol")}
            <FieldHelp text={t("trades.new_trade.tooltips.symbol")} />
          </span>
          <div className="relative">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => handleSymbolInput(e.target.value)}
              onFocus={() => symbolSuggestions.length > 0 && setShowSuggestions(true)}
              className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 uppercase"
              placeholder={t("trades.new_trade.placeholders.symbol")}
              autoComplete="off"
            />
            {showSuggestions && (
              <ul className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-slate-600 dark:border-slate-300 bg-slate-900 dark:bg-white shadow-xl">
                {symbolSuggestions.map((tk) => (
                  <li
                    key={tk.id}
                    onMouseDown={() => selectSymbol(tk)}
                    className="flex cursor-pointer items-baseline gap-2 px-3 py-2 hover:bg-slate-700/60 dark:hover:bg-slate-100"
                  >
                    <span className="font-mono font-semibold text-teal-400 dark:text-teal-700 text-sm shrink-0">{tk.symbol}</span>
                    <span className="truncate text-xs text-slate-300 dark:text-slate-600">{tk.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{tk.market}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Instrument Type selector */}
      <div>
        <label className="text-sm text-slate-300 dark:text-slate-900 block">
          <span className="inline-flex items-center mb-1">
            Tipo Strumento
            <FieldHelp text="I Titoli di Stato sono tassati con aliquota agevolata al 12,5%, mentre azioni, ETF e obbligazioni societarie sono al 26%." />
          </span>
          <select
            value={instrumentType}
            onChange={(e) => setInstrumentType(e.target.value)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
          >
            {INSTRUMENT_TYPES.map((it) => (
              <option key={it.value} value={it.value}>
                {i18n.resolvedLanguage === "it" ? it.labelIt : it.labelEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Quantity + Entry Price */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.quantity")}
            <FieldHelp text={t("trades.new_trade.tooltips.quantity")} align="start" />
          </span>
          <input type="number" step="0.000001" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" />
        </label>
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.entry_price")}
            <FieldHelp text={t("trades.new_trade.tooltips.entry_price")} />
          </span>
          <input type="number" step="0.000001" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" />
        </label>
      </div>

      {/* Direction + Fee */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.direction")}
            <FieldHelp text={t("trades.new_trade.tooltips.direction")} align="start" />
          </span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2">
            <option value="long">{t("trades.new_trade.options.direction.long")}</option>
            <option value="short">{t("trades.new_trade.options.direction.short")}</option>
          </select>
        </label>
        <div className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.auto_fee")}
            <FieldHelp text={t("trades.new_trade.tooltips.auto_fee")} />
          </span>
          <div className="rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-slate-200 dark:text-slate-900">
            {estimatedFee === null ? "-" : `${estimatedFee.value.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${estimatedFee.currency}`}
          </div>
        </div>
      </div>

      {/* Take Profit */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.take_profit")}
            <FieldHelp text={t("trades.new_trade.tooltips.take_profit")} align="start" />
          </span>
          <input type="number" step="0.000001" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)}
            className="w-full rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-emerald-200" />
        </label>
        <div className="flex items-end">
          <div className="w-full rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {t("trades.new_trade.metrics.tp_pct")} {tpPct === null ? "-" : tpPct.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Stop Loss */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.stop_loss")}
            <FieldHelp text={t("trades.new_trade.tooltips.stop_loss")} align="start" />
          </span>
          <input type="number" step="0.000001" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)}
            className="w-full rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-200" />
        </label>
        <div className="flex items-end">
          <div className="w-full rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {t("trades.new_trade.metrics.sl_pct")} {slPct === null ? "-" : slPct.toFixed(2)}
          </div>
        </div>
      </div>

      {createTrade.error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {t("trades.new_trade.errors.create_failed")}
        </div>
      )}

      {/* Risk / Reward live indicator */}
      <RiskRewardPreview
        direction={direction}
        entryPrice={ep}
        stopLoss={slNum}
        takeProfit={tpNum}
        quantity={qty}
      />

      {/* Footer */}
      <div className="flex items-end gap-3 pt-2">
        <label className="flex-1 text-sm text-slate-300 dark:text-slate-900">
          <span className="inline-flex items-center mb-1">
            {t("trades.new_trade.labels.execution")}
            <FieldHelp text={t("trades.new_trade.tooltips.execution_type")} align="start" />
          </span>
          <select value={executionType} onChange={(e) => setExecutionType(e.target.value as ExecutionType)}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2">
            <option value="open">{t("trades.new_trade.options.execution.open")}</option>
            <option value="partial">{t("trades.new_trade.options.execution.partial")}</option>
            <option value="close">{t("trades.new_trade.options.execution.close")}</option>
          </select>
        </label>
        <button type="button" onClick={onClose}
          className="rounded bg-slate-700 dark:bg-slate-200 dark:text-slate-900 px-4 py-2 text-sm font-semibold text-slate-200">
          {t("trades.new_trade.cancel")}
        </button>
        <button type="button" onClick={() => createTrade.mutate()} disabled={createTrade.isPending || !isValid}
          className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50">
          {createTrade.isPending ? t("trades.new_trade.saving") : t("trades.new_trade.save")}
        </button>
      </div>
    </div>
  );
}

export function TradeCreateModal({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  // ── Quick mode toggle ──
  const [quickMode, setQuickMode] = useState(false);

  // ── state ──
  const [st, setSt] = useState<WizardState>({
    step: 0,
    accountId: 0,
    symbolInput: "",
    selectedTicker: null,
    symbolSuggestions: [],
    showSuggestions: false,
    instrumentType: "stock",
    entryPrice: "",
    quantityMode: "shares",
    quantity: "1",
    entryValue: "",
    direction: "long",
    tpMode: "percent",
    tpPrice: "",
    tpPercent: "",
    slMode: "percent",
    slPrice: "",
    slPercent: "",
    executionType: "open",
  });

  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const symbolContainerRef = useRef<HTMLDivElement>(null);
  const numberLocale = i18n.resolvedLanguage === "it" ? "it-IT" : "en-US";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (symbolContainerRef.current && !symbolContainerRef.current.contains(e.target as Node)) {
        setSt((p) => ({ ...p, showSuggestions: false }));
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuickMode(false);
      setSt({
        step: 0,
        accountId: 0,
        symbolInput: "",
        selectedTicker: null,
        symbolSuggestions: [],
        showSuggestions: false,
        instrumentType: "stock",
        entryPrice: "",
        quantityMode: "shares",
        quantity: "1",
        entryValue: "",
        direction: "long",
        tpMode: "percent",
        tpPrice: "",
        tpPercent: "",
        slMode: "percent",
        slPrice: "",
        slPercent: "",
        executionType: "open",
      });
    }
  }, [open]);

  // ── Data queries ──
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/api/accounts"),
    enabled: open,
  });
  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: () => api<Broker[]>("/api/brokers"),
    enabled: open,
  });

  // ── Symbol autocomplete ──
  const handleSymbolInput = useCallback((value: string) => {
    const isGov = detectIsGovernmentBond(value, undefined, undefined);
    setSt((p) => ({
      ...p,
      symbolInput: value,
      selectedTicker: null,
      ...(isGov ? { instrumentType: "government_bond" } : {}),
    }));
    clearTimeout(symbolDebounceRef.current);
    if (value.trim().length < 1) {
      setSt((p) => ({ ...p, symbolSuggestions: [], showSuggestions: false }));
      return;
    }
    symbolDebounceRef.current = setTimeout(async () => {
      const results = await tickersApi.search(value, 8);
      setSt((p) => ({
        ...p,
        symbolSuggestions: results,
        showSuggestions: results.length > 0,
      }));
    }, 300);
  }, []);

  const selectSymbol = useCallback((ticker: Ticker) => {
    const isGov = detectIsGovernmentBond(ticker.symbol, ticker.market, ticker.isin);
    setSt((p) => ({
      ...p,
      symbolInput: ticker.symbol,
      selectedTicker: ticker,
      showSuggestions: false,
      ...(isGov ? { instrumentType: "government_bond" } : {}),
    }));
  }, []);

  // ── Derived values ──
  const ep = parseFloat(st.entryPrice) || 0;
  const qty = parseFloat(st.quantity) || 0;
  const entryValueNum = parseFloat(st.entryValue) || 0;

  // Auto-compute quantity when in "value" mode
  const computedQty =
    st.quantityMode === "value" && ep > 0 && entryValueNum > 0
      ? entryValueNum / ep
      : st.quantityMode === "shares"
        ? qty
        : 0;

  const displayQuantity = st.quantityMode === "value" ? computedQty : qty;

  // TP derived
  const tpPriceNum = parseFloat(st.tpPrice) || 0;
  const tpPercentNum = parseFloat(st.tpPercent) || 0;
  const computedTpPrice = st.tpMode === "percent" && ep > 0 ? ep * (1 + tpPercentNum / 100) : tpPriceNum;
  const computedTpPercent =
    st.tpMode === "price" && ep > 0 && tpPriceNum > 0
      ? ((tpPriceNum - ep) / ep) * 100
      : tpPercentNum;

  // SL derived
  const slPriceNum = parseFloat(st.slPrice) || 0;
  const slPercentNum = parseFloat(st.slPercent) || 0;
  const computedSlPrice = st.slMode === "percent" && ep > 0 ? ep * (1 - slPercentNum / 100) : slPriceNum;
  const computedSlPercent =
    st.slMode === "price" && ep > 0 && slPriceNum > 0
      ? ((st.direction === "long" ? ep - slPriceNum : slPriceNum - ep) / ep) * 100
      : slPercentNum;

  // ── Fee estimation ──
  const estimatedFee = useMemo(() => {
    if (!accounts?.length || !brokers?.length || !st.accountId || st.accountId <= 0 || !ep || !displayQuantity) {
      return null;
    }
    const account = accounts.find((item) => item.id === st.accountId);
    if (!account?.broker_id) return null;
    const broker = brokers.find((item) => item.id === account.broker_id);
    if (!broker) return null;
    return estimateExecutionFee({
      broker,
      quantity: displayQuantity,
      price: ep,
      market: st.selectedTicker?.market || "Euronext",
      currency: broker.fee_currency || account.base_currency || "EUR",
    });
  }, [accounts, brokers, st.accountId, ep, displayQuantity, st.selectedTicker]);

  // ── Validation per step ──
  const stepValid = useMemo((): boolean => {
    switch (st.step) {
      case 0:
        return st.accountId > 0 && st.symbolInput.trim().length > 0;
      case 1:
        return ep > 0 && (st.quantityMode === "shares" ? qty > 0 : entryValueNum > 0);
      case 2:
        return true; // always valid (default long/short)
      case 3:
        return st.tpMode === "percent" ? st.tpPercent !== "" : st.tpPrice !== "";
      case 4:
        return st.slMode === "percent" ? st.slPercent !== "" : st.slPrice !== "";
      case 5:
        return true; // always valid (has defaults)
      default:
        return true;
    }
  }, [st, ep, qty, entryValueNum]);

  // ── Submit ──
  const createTrade = useMutation({
    mutationFn: async () => {
      const symbol = st.selectedTicker?.symbol || st.symbolInput.toUpperCase();
      const createdTrade = await api<Trade>("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          account_id: st.accountId,
          market: st.selectedTicker?.market || "Euronext",
          symbol,
          ...(st.selectedTicker && { ticker_id: st.selectedTicker.id }),
          instrument_type: st.instrumentType || "stock",
          side: st.direction,
          status: st.executionType === "open" ? "open" : st.executionType,
          target_price: computedTpPrice > 0 ? computedTpPrice : null,
          stop_loss: computedSlPrice > 0 ? computedSlPrice : null,
          tags: [],
        }),
      });

      const finalQuantity = st.quantityMode === "value" ? computedQty : qty;

      await api(`/api/trades/${createdTrade.id}/executions`, {
        method: "POST",
        body: JSON.stringify({
          action: inferAction(st.direction, st.executionType),
          executed_at: new Date().toISOString(),
          quantity: finalQuantity,
          price: ep,
          currency: "EUR",
        }),
      });

      return createdTrade;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["recent-executions"] });
      onClose();
    },
  });

  // ── Step nav ──
  const goNext = useCallback(() => {
    if (st.step < STEPS.length - 1) setSt((p) => ({ ...p, step: p.step + 1 }));
  }, [st.step]);

  const goBack = useCallback(() => {
    if (st.step > 0) setSt((p) => ({ ...p, step: p.step - 1 }));
  }, [st.step]);

  // ── Render helpers ──
  const stepLabels = STEPS.map((s) => t(s.labelKey));

  if (!open) return null;

  // ── Step content ──
  const renderStep = () => {
    switch (st.step) {
      // ═════════════════════════════════ STEP 1 ════════════════════════════
      case 0:
        return (
          <StepCard title={t("trades.new_trade.labels.account") + " & " + t("trades.new_trade.labels.symbol")}>
            <div className="grid grid-cols-2 gap-4">
              {/* Account */}
              <label className="text-sm text-slate-300 dark:text-slate-900">
                <span className="inline-flex items-center mb-1">
                  {t("trades.new_trade.labels.account")}
                  <FieldHelp text={t("trades.new_trade.tooltips.account")} />
                </span>
                <select
                  value={st.accountId}
                  onChange={(e) => setSt((p) => ({ ...p, accountId: parseInt(e.target.value) }))}
                  className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2"
                >
                  <option value={0}>{t("trades.new_trade.placeholders.select_account")}</option>
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {st.accountId <= 0 && (
                  <span className="mt-1 block text-xs text-amber-400">{t("trades.new_trade.validation.account_required")}</span>
                )}
              </label>

              {/* Symbol */}
              <div className="text-sm" ref={symbolContainerRef}>
                <span className="inline-flex items-center mb-1 text-slate-300 dark:text-slate-900">
                  {t("trades.new_trade.labels.symbol")}
                  <FieldHelp text={t("trades.new_trade.tooltips.symbol")} />
                </span>
                <div className="relative">
                  <input
                    type="text"
                    value={st.symbolInput}
                    onChange={(e) => handleSymbolInput(e.target.value)}
                    onFocus={() =>
                      st.symbolSuggestions.length > 0 &&
                      setSt((p) => ({ ...p, showSuggestions: true }))
                    }
                    className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 uppercase"
                    placeholder={t("trades.new_trade.placeholders.symbol")}
                    autoComplete="off"
                  />
                  {st.showSuggestions && (
                    <ul className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-slate-600 dark:border-slate-300 bg-slate-900 dark:bg-white shadow-xl">
                      {st.symbolSuggestions.map((tk) => (
                        <li
                          key={tk.id}
                          onMouseDown={() => selectSymbol(tk)}
                          className="flex cursor-pointer items-baseline gap-2 px-3 py-2 hover:bg-slate-700/60 dark:hover:bg-slate-100"
                        >
                          <span className="font-mono font-semibold text-teal-400 dark:text-teal-700 text-sm shrink-0">
                            {tk.symbol}
                          </span>
                          <span className="truncate text-xs text-slate-300 dark:text-slate-600">
                            {tk.name}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                            {tk.market}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {st.symbolInput.trim().length === 0 && (
                  <span className="mt-1 block text-xs text-amber-400">{t("trades.new_trade.validation.symbol_required")}</span>
                )}
              </div>
            </div>

            {/* Instrument Type selector */}
            <div className="mt-3">
              <label className="text-sm text-slate-300 dark:text-slate-900 block mb-1">
                <span className="inline-flex items-center">
                  Tipo Strumento
                  <FieldHelp text="I Titoli di Stato sono tassati al 12,5%, mentre azioni, ETF e corporate bond al 26%." />
                </span>
              </label>
              <select
                value={st.instrumentType || "stock"}
                onChange={(e) => setSt((p) => ({ ...p, instrumentType: e.target.value }))}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
              >
                {INSTRUMENT_TYPES.map((it) => (
                  <option key={it.value} value={it.value}>
                    {i18n.resolvedLanguage === "it" ? it.labelIt : it.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {st.selectedTicker && (
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs text-teal-200 dark:text-teal-800">
                <span className="font-semibold">{st.selectedTicker.symbol}</span> — {st.selectedTicker.name}
                <span className="ml-2 text-slate-400 dark:text-slate-600">{st.selectedTicker.market}</span>
              </div>
            )}
          </StepCard>
        );

      // ═════════════════════════════════ STEP 2 ════════════════════════════
      case 1:
        return (
          <StepCard title={t("trades.new_trade.labels.entry_price") + " & " + t("trades.new_trade.labels.quantity")}>
            {/* Entry price */}
            <label className="block text-sm text-slate-300 dark:text-slate-900">
              <span className="inline-flex items-center mb-1">
                {t("trades.new_trade.labels.entry_price")}
                <FieldHelp text={t("trades.new_trade.tooltips.entry_price")} />
              </span>
              <input
                type="number"
                step="0.000001"
                value={st.entryPrice}
                onChange={(e) => setSt((p) => ({ ...p, entryPrice: e.target.value }))}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-lg font-semibold"
                placeholder="0.00"
              />
              {ep <= 0 && (
                <span className="mt-1 block text-xs text-amber-400">{t("trades.new_trade.validation.entry_price_positive")}</span>
              )}
            </label>

            {/* Quantity mode toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.quantity")}</span>
              <ModeToggle
                options={[
                  { value: "shares", label: t("trades.new_trade.wizard.shares_btn") },
                  { value: "value", label: t("trades.new_trade.wizard.value_btn") },
                ]}
                value={st.quantityMode}
                onChange={(v) => setSt((p) => ({ ...p, quantityMode: v as "shares" | "value" }))}
              />
            </div>

            {st.quantityMode === "shares" ? (
              <label className="block text-sm text-slate-300 dark:text-slate-900">
                <span className="mb-1 block">{t("trades.new_trade.labels.quantity")}</span>
                <input
                  type="number"
                  step="0.000001"
                  value={st.quantity}
                  onChange={(e) => setSt((p) => ({ ...p, quantity: e.target.value, entryValue: "" }))}
                  className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2"
                  placeholder="100"
                />
                {qty <= 0 && (
                  <span className="mt-1 block text-xs text-amber-400">{t("trades.new_trade.validation.quantity_positive")}</span>
                )}
                {ep > 0 && qty > 0 && (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
                    {t("trades.new_trade.wizard.notional")}: {(ep * qty).toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </label>
            ) : (
              <label className="block text-sm text-slate-300 dark:text-slate-900">
                <span className="mb-1 block">{t("trades.new_trade.wizard.value_label")}</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-600">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={st.entryValue}
                    onChange={(e) => setSt((p) => ({ ...p, entryValue: e.target.value, quantity: "" }))}
                    className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white pl-8 pr-3 py-2"
                    placeholder="1000"
                  />
                </div>
                {entryValueNum <= 0 && (
                  <span className="mt-1 block text-xs text-amber-400">{t("trades.new_trade.wizard.value_required")}</span>
                )}
                {ep > 0 && entryValueNum > 0 && (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
                    {t("trades.new_trade.wizard.shares_estimate")}: ~{computedQty.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </p>
                )}
              </label>
            )}

            {/* Fee estimate */}
            {estimatedFee && (
              <div className="rounded-lg border border-slate-600/50 bg-slate-800/50 dark:bg-slate-100/80 px-3 py-2 text-xs">
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.auto_fee")}: </span>
                <span className="font-semibold text-slate-200 dark:text-slate-900">
                  {estimatedFee.value.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}{" "}
                  {estimatedFee.currency}
                </span>
              </div>
            )}
          </StepCard>
        );

      // ═════════════════════════════════ STEP 3 ════════════════════════════
      case 2:
        return (
          <StepCard title={t("trades.new_trade.labels.direction")}>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSt((p) => ({ ...p, direction: "long" }))}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all ${
                  st.direction === "long"
                    ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20"
                    : "border-slate-700 dark:border-slate-300 bg-slate-800/50 dark:bg-slate-100/50 hover:border-slate-500"
                }`}
              >
                <svg viewBox="0 0 24 24" className={`h-10 w-10 ${st.direction === "long" ? "text-emerald-400" : "text-slate-500"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="m19 12-7 7-7-7" />
                </svg>
                <span className={`text-base font-bold ${st.direction === "long" ? "text-emerald-300" : "text-slate-300 dark:text-slate-900"}`}>
                  {t("trades.new_trade.options.direction.long")}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-600 text-center">
                  {t("trades.new_trade.wizard.long_desc")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSt((p) => ({ ...p, direction: "short" }))}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all ${
                  st.direction === "short"
                    ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20"
                    : "border-slate-700 dark:border-slate-300 bg-slate-800/50 dark:bg-slate-100/50 hover:border-slate-500"
                }`}
              >
                <svg viewBox="0 0 24 24" className={`h-10 w-10 ${st.direction === "short" ? "text-red-400" : "text-slate-500"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
                <span className={`text-base font-bold ${st.direction === "short" ? "text-red-300" : "text-slate-300 dark:text-slate-900"}`}>
                  {t("trades.new_trade.options.direction.short")}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-600 text-center">
                  {t("trades.new_trade.wizard.short_desc")}
                </span>
              </button>
            </div>
          </StepCard>
        );

      // ═════════════════════════════════ STEP 4 ════════════════════════════
      case 3:
        return (
          <StepCard title={t("trades.new_trade.labels.take_profit")}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-slate-400 dark:text-slate-600">{t("trades.new_trade.wizard.mode")}</span>
              <ModeToggle
                options={[
                  { value: "percent", label: t("trades.new_trade.wizard.percent_btn") },
                  { value: "price", label: t("trades.new_trade.wizard.price_btn") },
                ]}
                value={st.tpMode}
                onChange={(v) => setSt((p) => ({ ...p, tpMode: v as PercentMode }))}
              />
            </div>

            {st.tpMode === "percent" ? (
              <PercentSliderInput
                value={st.tpPercent}
                onChange={(v) => setSt((p) => ({ ...p, tpPercent: v }))}
                min={0.25}
                max={100}
                label={t("trades.new_trade.wizard.percent_label")}
              />
            ) : (
              <label className="block text-sm text-slate-300 dark:text-slate-900">
                <span className="mb-1 block">{t("trades.new_trade.wizard.price_label")}</span>
                <input
                  type="number"
                  step="0.000001"
                  value={st.tpPrice}
                  onChange={(e) => setSt((p) => ({ ...p, tpPrice: e.target.value }))}
                  className="w-full rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-emerald-200"
                  placeholder="0.00"
                />
              </label>
            )}

            {/* Derived values */}
            {ep > 0 && (tpPriceNum > 0 || tpPercentNum > 0) && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.take_profit")}: </span>
                  <span className="font-semibold text-emerald-200 dark:text-emerald-800">
                    {computedTpPrice.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.metrics.tp_pct")}: </span>
                  <span className="font-semibold text-emerald-200 dark:text-emerald-800">
                    +{computedTpPercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </StepCard>
        );

      // ═════════════════════════════════ STEP 5 ════════════════════════════
      case 4:
        return (
          <StepCard title={t("trades.new_trade.labels.stop_loss")}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-slate-400 dark:text-slate-600">{t("trades.new_trade.wizard.mode")}</span>
              <ModeToggle
                options={[
                  { value: "percent", label: t("trades.new_trade.wizard.percent_btn") },
                  { value: "price", label: t("trades.new_trade.wizard.price_btn") },
                ]}
                value={st.slMode}
                onChange={(v) => setSt((p) => ({ ...p, slMode: v as PercentMode }))}
              />
            </div>

            {st.slMode === "percent" ? (
              <PercentSliderInput
                value={st.slPercent}
                onChange={(v) => setSt((p) => ({ ...p, slPercent: v }))}
                min={0.25}
                max={100}
                label={t("trades.new_trade.wizard.percent_label")}
              />
            ) : (
              <label className="block text-sm text-slate-300 dark:text-slate-900">
                <span className="mb-1 block">{t("trades.new_trade.wizard.price_label")}</span>
                <input
                  type="number"
                  step="0.000001"
                  value={st.slPrice}
                  onChange={(e) => setSt((p) => ({ ...p, slPrice: e.target.value }))}
                  className="w-full rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-200"
                  placeholder="0.00"
                />
              </label>
            )}

            {/* Derived values */}
            {ep > 0 && (slPriceNum > 0 || slPercentNum > 0) && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                  <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.stop_loss")}: </span>
                  <span className="font-semibold text-red-200 dark:text-red-800">
                    {computedSlPrice.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                  <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.metrics.sl_pct")}: </span>
                  <span className="font-semibold text-red-200 dark:text-red-800">
                    -{computedSlPercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </StepCard>
        );

      // ═════════════════════════════════ STEP 6 ════════════════════════════
      case 5:
        return (
          <StepCard title={t("trades.new_trade.wizard.execution_title")}>
            {/* Execution type */}
            <div className="grid grid-cols-3 gap-3">
              {(["open", "partial", "close"] as ExecutionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSt((p) => ({ ...p, executionType: type }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    st.executionType === type
                      ? "border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/20"
                      : "border-slate-700 dark:border-slate-300 bg-slate-800/50 dark:bg-slate-100/50 hover:border-slate-500"
                  }`}
                >
                  <span
                    className={`text-lg font-bold ${
                      st.executionType === type ? "text-teal-300 dark:text-teal-700" : "text-slate-300 dark:text-slate-900"
                    }`}
                  >
                    {t(`trades.new_trade.options.execution.${type}`)}
                  </span>
                </button>
              ))}
            </div>

            {/* Summary card */}
            <div className="rounded-xl border border-slate-600/50 bg-slate-800/50 dark:bg-slate-100/80 p-4 space-y-2 text-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-600">
                {t("trades.new_trade.wizard.summary")}
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.account")}</span>
                <span className="text-right font-medium text-slate-200 dark:text-slate-900">
                  {accounts?.find((a) => a.id === st.accountId)?.name || "-"}
                </span>
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.symbol")}</span>
                <span className="text-right font-mono font-semibold text-teal-300 dark:text-teal-700">
                  {st.selectedTicker?.symbol || st.symbolInput.toUpperCase()}
                </span>
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.entry_price")}</span>
                <span className="text-right font-mono font-semibold text-slate-200 dark:text-slate-900">
                  {ep.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.quantity")}</span>
                <span className="text-right font-mono text-slate-200 dark:text-slate-900">
                  {displayQuantity.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.wizard.notional")}</span>
                <span className="text-right font-mono text-slate-200 dark:text-slate-900">
                  {(ep * displayQuantity).toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.direction")}</span>
                <span className="text-right font-semibold text-slate-200 dark:text-slate-900">
                  {st.direction === "long" ? "🔼 Long" : "🔽 Short"}
                </span>
                {tpPriceNum > 0 && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.take_profit")}</span>
                    <span className="text-right font-mono text-emerald-300 dark:text-emerald-700">
                      {computedTpPrice.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      <span className="text-emerald-400 dark:text-emerald-600"> (+{computedTpPercent.toFixed(1)}%)</span>
                    </span>
                  </>
                )}
                {slPriceNum > 0 && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.stop_loss")}</span>
                    <span className="text-right font-mono text-red-300 dark:text-red-700">
                      {computedSlPrice.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      <span className="text-red-400 dark:text-red-600"> (-{computedSlPercent.toFixed(1)}%)</span>
                    </span>
                  </>
                )}
                {estimatedFee && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600">{t("trades.new_trade.labels.auto_fee")}</span>
                    <span className="text-right font-mono text-slate-200 dark:text-slate-900">
                      {estimatedFee.value.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      {estimatedFee.currency}
                    </span>
                  </>
                )}
              </div>
            </div>

            <RiskRewardPreview
              direction={st.direction}
              entryPrice={ep}
              stopLoss={computedSlPrice}
              takeProfit={computedTpPrice}
              quantity={displayQuantity}
            />

            {createTrade.error && (
              <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {t("trades.new_trade.errors.create_failed")}
              </div>
            )}
          </StepCard>
        );

      default:
        return null;
    }
  };

  // ── Main render ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 dark:bg-slate-100/90 p-4">
      <div className="w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100 dark:text-slate-900">
            {t("trades.new_trade.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:text-slate-200 dark:hover:text-slate-900 transition"
            aria-label={t("trades.new_trade.close")}
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-500">
          {t("trades.new_trade.subtitle")}
        </p>

        {/* Mode Selector Tabs */}
        <div className="mb-4 flex rounded-lg border border-slate-700/80 bg-slate-950/70 p-1 dark:border-slate-300 dark:bg-slate-100">
          <button
            type="button"
            onClick={() => setQuickMode(true)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
              quickMode
                ? "bg-teal-500 text-slate-950 shadow-xs"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("trades.new_trade.mode_quick", "⚡ Inserimento Rapido")}
          </button>
          <button
            type="button"
            onClick={() => setQuickMode(false)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
              !quickMode
                ? "bg-teal-500 text-slate-950 shadow-xs"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("trades.new_trade.mode_wizard", "🧭 Wizard Guidato (6 Step)")}
          </button>
        </div>

        {quickMode ? (
          <QuickTradeForm onClose={onClose} />
        ) : (
          <>
            {/* Stepper */}
            <StepIndicator current={st.step} total={STEPS.length} labels={stepLabels} />

            {/* Step content */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (st.step < STEPS.length - 1) {
                  goNext();
                } else {
                  createTrade.mutate();
                }
              }}
            >
              {renderStep()}

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-700 dark:border-slate-300 pt-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={st.step === 0 ? onClose : goBack}
                    className="rounded bg-slate-700 dark:bg-slate-200 dark:text-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-600 dark:hover:bg-slate-300"
                  >
                    {st.step === 0 ? t("trades.new_trade.cancel") : t("trades.new_trade.wizard.back")}
                  </button>
                  {st.step === 0 && (
                    <button
                      type="button"
                      onClick={() => setQuickMode(true)}
                      className="rounded border border-teal-500/50 px-4 py-2 text-sm font-semibold text-teal-300 dark:text-teal-700 transition hover:bg-teal-500/10"
                    >
                      {t("trades.new_trade.quick_btn")}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {st.step === STEPS.length - 1 && (
                    <button
                      type="button"
                      disabled={createTrade.isPending}
                      onClick={() => createTrade.mutate()}
                      className="rounded bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-teal-400 disabled:opacity-50"
                    >
                      {createTrade.isPending
                        ? t("trades.new_trade.saving")
                        : t("trades.new_trade.save")}
                    </button>
                  )}
                  {st.step < STEPS.length - 1 && (
                    <button
                      type="submit"
                      disabled={!stepValid}
                      className="rounded bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-teal-400 disabled:opacity-50"
                    >
                      {t("trades.new_trade.wizard.next")}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Global fade-in animation keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
