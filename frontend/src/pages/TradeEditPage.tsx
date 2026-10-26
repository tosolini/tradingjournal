import { zodResolverTyped } from "../lib/zod-resolver";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { Account, Broker, Ticker, TradeDetail, api, tickersApi } from "../lib/api";
import { INSTRUMENT_TYPES, estimateExecutionFee } from "../lib/fees";

const editSchema = z.object({
  symbol: z.string().trim().min(1),
  instrument_type: z.string().default("stock"),
  executed_at: z.string().min(1),
  direction: z.enum(["long", "short"]),
  execution_type: z.enum(["open", "close", "partial"]),
  quantity: z.coerce.number().positive(),
  entry_price: z.coerce.number().positive(),
  take_profit: z.coerce.number().optional(),
  stop_loss: z.coerce.number().optional(),
});

type EditPayload = z.infer<typeof editSchema>;

function inferAction(direction: "long" | "short", executionType: "open" | "close" | "partial") {
  if (executionType === "open") {
    return direction === "long" ? "BUY" : "SELL";
  }
  return direction === "long" ? "SELL" : "BUY";
}

function inferExecutionType(action: string, side: string): "open" | "close" | "partial" {
  const normalized = action.toUpperCase();
  if ((side === "long" && normalized === "BUY") || (side === "short" && normalized === "SELL")) {
    return "open";
  }
  return "partial";
}

function isoToDatetimeLocal(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function datetimeLocalToIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

export function TradeEditPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "it" ? "it-IT" : "en-US";

  const params = useParams<{ tradeId: string }>();
  const tradeId = Number(params.tradeId || 0);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const executedAtInputRef = useRef<HTMLInputElement | null>(null);

  // Symbol autocomplete
  const [symbolInput, setSymbolInput] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<Ticker | null>(null);
  const [symbolSuggestions, setSymbolSuggestions] = useState<Ticker[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (symbolContainerRef.current && !symbolContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["trade-detail", tradeId],
    queryFn: () => api<TradeDetail>(`/api/trades/${tradeId}`),
    enabled: tradeId > 0,
  });

  // Populate symbol input when data loads
  useEffect(() => {
    if (data?.trade.symbol && !symbolInput) {
      setSymbolInput(data.trade.symbol);
      if (data.trade.ticker_id && data.trade.isin) {
        setSelectedTicker({ id: data.trade.ticker_id, symbol: data.trade.symbol, isin: data.trade.isin, name: "", market: data.trade.market, currency: null });
      }
    }
  }, [data?.trade.symbol]);

  async function handleSymbolInput(value: string) {
    setSymbolInput(value);
    form.setValue("symbol", value.toUpperCase());
    setSelectedTicker(null);
    if (symbolDebounceRef.current) clearTimeout(symbolDebounceRef.current);
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
  }

  function selectSymbol(ticker: Ticker) {
    setSymbolInput(ticker.symbol);
    setSelectedTicker(ticker);
    form.setValue("symbol", ticker.symbol, { shouldValidate: true });
    setShowSuggestions(false);
  }

  const firstExecution = data?.executions?.[0];
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/api/accounts"),
    enabled: tradeId > 0,
  });
  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: () => api<Broker[]>("/api/brokers"),
    enabled: tradeId > 0,
  });

  const form = useForm<EditPayload>({
    resolver: zodResolverTyped(editSchema),
    values: data
      ? {
          symbol: data.trade.symbol,
          instrument_type: data.trade.instrument_type || "stock",
          executed_at: firstExecution
            ? isoToDatetimeLocal(firstExecution.executed_at)
            : isoToDatetimeLocal(data.trade.created_at),
          direction: data.trade.side as "long" | "short",
          execution_type: firstExecution
            ? inferExecutionType(firstExecution.action, data.trade.side)
            : "open",
          quantity: firstExecution ? Number(firstExecution.quantity) : 1,
          entry_price: firstExecution ? Number(firstExecution.price) : 0,
          take_profit: data.trade.target_price ? Number(data.trade.target_price) : undefined,
          stop_loss: data.trade.stop_loss ? Number(data.trade.stop_loss) : undefined,
        }
      : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: EditPayload) => {
      await api(`/api/trades/${tradeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          symbol: values.symbol,
          instrument_type: values.instrument_type,
          ...(selectedTicker && { ticker_id: selectedTicker.id }),
          side: values.direction,
          status: values.execution_type === "open" ? "open" : values.execution_type,
          target_price: values.take_profit,
          stop_loss: values.stop_loss,
        }),
      });

      if (firstExecution) {
        await api(`/api/trades/${tradeId}/executions/${firstExecution.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: inferAction(values.direction, values.execution_type),
            executed_at: datetimeLocalToIso(values.executed_at),
            quantity: values.quantity,
            price: values.entry_price,
          }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["trade-detail", tradeId] });
      qc.invalidateQueries({ queryKey: ["recent-executions"] });
      navigate(`/trades/${tradeId}`);
    },
  });

  const entry = form.watch("entry_price");
  const tp = form.watch("take_profit");
  const sl = form.watch("stop_loss");
  const direction = form.watch("direction");
  const quantity = form.watch("quantity");

  const estimatedFee = useMemo(() => {
    if (!data || !accounts?.length || !brokers?.length || !entry || !quantity) {
      return null;
    }
    const account = accounts.find((item) => item.id === data.trade.account_id);
    if (!account?.broker_id) {
      return null;
    }
    const broker = brokers.find((item) => item.id === account.broker_id);
    if (!broker) {
      return null;
    }
    return estimateExecutionFee({
      broker,
      quantity: Number(quantity),
      price: Number(entry),
      market: data.trade.market,
      currency: broker.fee_currency || account.base_currency || "EUR",
    });
  }, [accounts, brokers, data, entry, quantity]);

  const tpPct = useMemo(() => {
    if (!entry || !tp || entry <= 0 || tp <= 0) {
      return null;
    }
    return ((tp - entry) / entry) * 100;
  }, [entry, tp]);

  const slPct = useMemo(() => {
    if (!entry || !sl || entry <= 0 || sl <= 0) {
      return null;
    }
    if (direction === "long") {
      return ((entry - sl) / entry) * 100;
    }
    return ((sl - entry) / entry) * 100;
  }, [direction, entry, sl]);

  const openDateTimePicker = () => {
    const input = executedAtInputRef.current;
    if (!input) {
      return;
    }
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  if (!tradeId) {
    return <div className="text-sm text-red-400 dark:text-red-600">{t("trade_edit.invalid_trade")}</div>;
  }

  if (isLoading || !data) {
    return <div className="text-sm text-slate-400 dark:text-slate-900">{t("trade_edit.loading")}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("trade_edit.title", { id: tradeId })}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-900">{t("trade_edit.subtitle")}</p>
      </div>

      <form
        className="card space-y-4 p-4"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="text-sm text-slate-300 dark:text-slate-900" ref={symbolContainerRef}>
            <span>{t("trade_edit.fields.symbol")}</span>
            {selectedTicker?.isin && (
              <span className="ml-2 font-mono text-xs text-slate-400 dark:text-slate-500">
                [isin:{selectedTicker.isin}]
              </span>
            )}
            {/* Hidden field for react-hook-form validation */}
            <input type="hidden" {...form.register("symbol")} />
            <div className="relative mt-1">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => handleSymbolInput(e.target.value)}
                onFocus={() => symbolSuggestions.length > 0 && setShowSuggestions(true)}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 uppercase"
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
          </div>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            Tipo Strumento
            <select
              {...form.register("instrument_type")}
              className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm"
            >
              {INSTRUMENT_TYPES.map((it) => (
                <option key={it.value} value={it.value}>
                  {locale.startsWith("it") ? it.labelIt : it.labelEn}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.executed_at")}
            <div className="relative mt-1">
              <input
                type="datetime-local"
                {...form.register("executed_at")}
                ref={(element) => {
                  form.register("executed_at").ref(element);
                  executedAtInputRef.current = element;
                }}
                className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 pr-11"
              />
              <button
                type="button"
                onClick={openDateTimePicker}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-slate-800 dark:bg-slate-100 px-2 py-1 text-xs text-slate-200 dark:text-slate-900 hover:bg-slate-700"
                title={t("trade_edit.fields.open_picker")}
                aria-label={t("trade_edit.fields.open_picker")}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            </div>
          </label>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.direction")}
            <select {...form.register("direction")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2">
              <option value="long">{t("trade_edit.options.long")}</option>
              <option value="short">{t("trade_edit.options.short")}</option>
            </select>
          </label>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.execution_type")}
            <select {...form.register("execution_type")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2">
              <option value="open">{t("trade_edit.options.open")}</option>
              <option value="partial">{t("trade_edit.options.partial")}</option>
              <option value="close">{t("trade_edit.options.close")}</option>
            </select>
          </label>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.quantity")}
            <input type="number" step="0.000001" {...form.register("quantity")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.entry_price")}
            <input type="number" step="0.000001" {...form.register("entry_price")} className="mt-1 w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2" />
          </label>
          <div className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.auto_fee")}
            <div className="mt-1 rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm text-slate-200 dark:text-slate-900">
              {estimatedFee === null
                ? "-"
                : `${estimatedFee.value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${estimatedFee.currency}`}
            </div>
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-900">{t("trade_edit.fields.auto_fee_hint")}</span>
          </div>
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.take_profit")}
            <input type="number" step="0.000001" {...form.register("take_profit")} className="mt-1 w-full rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-emerald-200" />
          </label>
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {t("trade_edit.fields.tp_pct")} {tpPct === null ? "-" : `${tpPct.toFixed(2)}%`}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-300 dark:text-slate-900">
            {t("trade_edit.fields.stop_loss")}
            <input type="number" step="0.000001" {...form.register("stop_loss")} className="mt-1 w-full rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-200" />
          </label>
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {t("trade_edit.fields.sl_pct")} {slPct === null ? "-" : `${slPct.toFixed(2)}%`}
          </div>
        </div>

        {saveMutation.error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {t("trade_edit.save_error")}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(`/trades/${tradeId}`)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 dark:border-slate-300 dark:bg-slate-200 dark:text-slate-800 dark:hover:bg-slate-300"
          >
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saveMutation.isPending} className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900">
            {saveMutation.isPending ? t("common.saving") : t("trade_edit.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
