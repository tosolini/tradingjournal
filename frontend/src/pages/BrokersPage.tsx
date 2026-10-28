import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolverTyped } from "../lib/zod-resolver";
import { useTranslation } from "react-i18next";
import { ApiError, Broker, Exchange, FeeMode, api, exchangesApi } from "../lib/api";
import { BROKER_PRESETS, BrokerPresetConfig } from "../lib/fees";
import { ConfirmModal } from "../components/ConfirmModal";

const emptyToNullNumber = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isNaN(num) ? val : num;
}, z.number().min(0).nullable().optional());

const emptyToNullTier = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isNaN(num) ? val : num;
}, z.number().int().min(1).max(4).nullable().optional());

const brokerSchema = z.object({
  name: z.string().trim().min(2, "Inserisci un nome broker valido"),
  broker_profile: z.string().default("custom"),
  fee_mode: z.enum(["fixed", "percent", "percent_min_max", "tiered_volume", "under_30"]),
  fee_value: z.coerce.number().min(0, "Inserisci un valore fee valido"),
  fee_min: emptyToNullNumber,
  fee_max: emptyToNullNumber,
  fee_us_value: emptyToNullNumber,
  fee_currency: z.string().trim().min(3, "Inserisci una valuta valida").max(8, "Valuta troppo lunga"),
  monthly_fee: z.coerce.number().min(0, "Canone non valido").default(0),
  fee_tier_override: emptyToNullTier,
  capital_gain_mode: z.enum(["immediate", "year_end"]),
  capital_gain_rate: z.coerce.number().min(0, "Inserisci una aliquota valida"),
  capital_gain_rate_gov: z.coerce.number().min(0, "Inserisci una aliquota valida"),
});

type BrokerPayload = z.infer<typeof brokerSchema>;

const exchangeSchema = z.object({
  name: z.string().trim().min(2, "Inserisci un nome valido"),
  mic: z.string().trim().optional(),
  suffix: z.string().trim().optional(),
  country: z.string().trim().optional(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  timezone: z.string().trim().optional(),
  open_time: z.string().trim().optional(),
  close_time: z.string().trim().optional(),
});

type ExchangePayload = z.infer<typeof exchangeSchema>;

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function BrokersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"brokers" | "markets">("brokers");

  // Broker state
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSuccess, setRowSuccess] = useState<string | null>(null);
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [editName, setEditName] = useState("");
  const [editBrokerProfile, setEditBrokerProfile] = useState<string>("custom");
  const [editFeeMode, setEditFeeMode] = useState<FeeMode>("fixed");
  const [editFeeValue, setEditFeeValue] = useState(0);
  const [editFeeMin, setEditFeeMin] = useState<number | "">("");
  const [editFeeMax, setEditFeeMax] = useState<number | "">("");
  const [editFeeUsValue, setEditFeeUsValue] = useState<number | "">("");
  const [editFeeCurrency, setEditFeeCurrency] = useState("EUR");
  const [editMonthlyFee, setEditMonthlyFee] = useState(0);
  const [editFeeTierOverride, setEditFeeTierOverride] = useState<number | "">("");
  const [editCapitalGainMode, setEditCapitalGainMode] = useState<"immediate" | "year_end">("immediate");
  const [editCapitalGainRate, setEditCapitalGainRate] = useState(26);
  const [editCapitalGainRateGov, setEditCapitalGainRateGov] = useState(12.5);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);

  // Preset state in form
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");

  // Exchange state
  const [exchError, setExchError] = useState<string | null>(null);
  const [exchSuccess, setExchSuccess] = useState<string | null>(null);
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [editExchName, setEditExchName] = useState("");
  const [editExchMic, setEditExchMic] = useState("");
  const [editExchSuffix, setEditExchSuffix] = useState("");
  const [editExchCountry, setEditExchCountry] = useState("");
  const [editExchCurrency, setEditExchCurrency] = useState("EUR");
  const [editExchTimezone, setEditExchTimezone] = useState("");
  const [editExchOpen, setEditExchOpen] = useState("");
  const [editExchClose, setEditExchClose] = useState("");
  const [deleteExchPendingId, setDeleteExchPendingId] = useState<number | null>(null);
  const [syncingExchId, setSyncingExchId] = useState<number | null>(null);

  // Broker-exchange linking state
  const [addingExchangeForBroker, setAddingExchangeForBroker] = useState<number | null>(null);
  const [selectedExchToLink, setSelectedExchToLink] = useState<number | "">("");

  // Queries
  const { data: brokersData, isLoading: brokersLoading } = useQuery({
    queryKey: ["brokers"],
    queryFn: () => api<Broker[]>("/api/brokers"),
  });

  const { data: exchangesData, isLoading: exchangesLoading } = useQuery({
    queryKey: ["exchanges"],
    queryFn: () => exchangesApi.list(),
  });

  // Forms
  const {
    register: registerBroker,
    handleSubmit: handleBrokerSubmit,
    reset: resetBroker,
    watch: watchBroker,
    setValue: setBrokerValue,
    formState: { errors: brokerErrors },
  } = useForm<BrokerPayload>({
    resolver: zodResolverTyped(brokerSchema),
    defaultValues: {
      name: "",
      broker_profile: "custom",
      fee_mode: "fixed",
      fee_value: 0,
      fee_min: null,
      fee_max: null,
      fee_us_value: null,
      fee_currency: "EUR",
      monthly_fee: 0,
      fee_tier_override: null,
      capital_gain_mode: "immediate",
      capital_gain_rate: 26,
      capital_gain_rate_gov: 12.5,
    },
  });

  const currentFeeMode = watchBroker("fee_mode");

  const applyPreset = (preset: BrokerPresetConfig) => {
    setSelectedPreset(preset.profile);
    setBrokerValue("name", preset.name);
    setBrokerValue("broker_profile", preset.profile);
    setBrokerValue("fee_mode", preset.fee_mode);
    setBrokerValue("fee_value", preset.fee_value);
    setBrokerValue("fee_min", preset.fee_min ?? null);
    setBrokerValue("fee_max", preset.fee_max ?? null);
    setBrokerValue("fee_us_value", preset.fee_us_value ?? null);
    setBrokerValue("fee_currency", preset.fee_currency);
    setBrokerValue("monthly_fee", preset.monthly_fee);
    setBrokerValue("fee_tier_override", preset.fee_tier_override ?? null);
    setBrokerValue("capital_gain_mode", preset.capital_gain_mode);
    setBrokerValue("capital_gain_rate", preset.capital_gain_rate);
    setBrokerValue("capital_gain_rate_gov", preset.capital_gain_rate_gov);
  };

  const { register: registerExchange, handleSubmit: handleExchangeSubmit, reset: resetExchange, formState: { errors: exchangeErrors } } = useForm<ExchangePayload>({
    resolver: zodResolverTyped(exchangeSchema),
    defaultValues: { name: "", mic: "", suffix: "", country: "", currency: "EUR", timezone: "", open_time: "", close_time: "" },
  });

  const parseApiError = (err: unknown): string => {
    if (err instanceof ApiError) return err.message || t("brokers.error_generic");
    if (!(err instanceof Error)) return t("brokers.error_generic");
    return err.message || t("brokers.error_generic");
  };

  // Broker mutations
  const createBroker = useMutation({
    mutationFn: (payload: BrokerPayload) =>
      api<Broker>("/api/brokers", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      resetBroker({
        name: "",
        broker_profile: "custom",
        fee_mode: "fixed",
        fee_value: 0,
        fee_min: null,
        fee_max: null,
        fee_us_value: null,
        fee_currency: "EUR",
        monthly_fee: 0,
        fee_tier_override: null,
        capital_gain_mode: "immediate",
        capital_gain_rate: 26,
        capital_gain_rate_gov: 12.5,
      });
      setSelectedPreset("custom");
      setRowError(null);
      setRowSuccess(t("brokers.success_added"));
    },
    onError: (err) => { setRowSuccess(null); setRowError(parseApiError(err)); },
  });

  const deleteBroker = useMutation({
    mutationFn: (id: number) => api<{ deleted: boolean }>(`/api/brokers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setRowError(null);
      setRowSuccess(t("brokers.success_deleted"));
    },
    onError: (err) => { setRowSuccess(null); setRowError(parseApiError(err)); },
  });

  const updateBroker = useMutation({
    mutationFn: (payload: {
      id: number;
      name: string;
      broker_profile: string;
      fee_mode: FeeMode;
      fee_value: number;
      fee_min?: number | null;
      fee_max?: number | null;
      fee_us_value?: number | null;
      fee_currency: string;
      monthly_fee: number;
      fee_tier_override?: number | null;
      capital_gain_mode: "immediate" | "year_end";
      capital_gain_rate: number;
      capital_gain_rate_gov: number;
    }) =>
      api<Broker>(`/api/brokers/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setRowError(null);
      setRowSuccess(t("brokers.success_updated"));
      setEditingBroker(null);
    },
    onError: (err) => { setRowSuccess(null); setRowError(parseApiError(err)); },
  });

  // Exchange mutations
  const createExchange = useMutation({
    mutationFn: (payload: ExchangePayload) =>
      exchangesApi.create({
        name: payload.name,
        mic: payload.mic || null,
        suffix: payload.suffix || null,
        country: payload.country || null,
        currency: payload.currency || "EUR",
        timezone: payload.timezone || null,
        open_time: payload.open_time || null,
        close_time: payload.close_time || null,
        closed_on_weekends: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchanges"] });
      resetExchange({ name: "", mic: "", suffix: "", country: "", currency: "EUR", timezone: "", open_time: "", close_time: "" });
      setExchError(null);
      setExchSuccess(t("brokers.exchange_success_added"));
    },
    onError: (err) => { setExchSuccess(null); setExchError(parseApiError(err)); },
  });

  const updateExchange = useMutation({
    mutationFn: (payload: { id: number; data: ExchangePayload }) =>
      exchangesApi.update(payload.id, {
        name: payload.data.name,
        mic: payload.data.mic || null,
        suffix: payload.data.suffix || null,
        country: payload.data.country || null,
        currency: payload.data.currency || "EUR",
        timezone: payload.data.timezone || null,
        open_time: payload.data.open_time || null,
        close_time: payload.data.close_time || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchanges"] });
      setExchError(null);
      setExchSuccess(t("brokers.exchange_success_updated"));
      setEditingExchange(null);
    },
    onError: (err) => { setExchSuccess(null); setExchError(parseApiError(err)); },
  });

  const deleteExchange = useMutation({
    mutationFn: (id: number) => exchangesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchanges"] });
      qc.invalidateQueries({ queryKey: ["brokers"] });
      setExchError(null);
      setExchSuccess(t("brokers.exchange_success_deleted"));
    },
    onError: (err) => { setExchSuccess(null); setExchError(parseApiError(err)); },
  });

  const syncExchangeTickers = useMutation({
    mutationFn: (exchangeId: number) => exchangesApi.syncTickers(exchangeId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["tickers-count"] });
      setSyncingExchId(null);
      setExchError(null);
      setExchSuccess(
        t("brokers.exchange_sync_tickers_success", {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          total: result.total,
        })
      );
    },
    onError: (err) => {
      setSyncingExchId(null);
      setExchSuccess(null);
      setExchError(parseApiError(err) || t("brokers.exchange_sync_tickers_error"));
    },
  });

  const linkExchange = useMutation({
    mutationFn: (payload: { brokerId: number; exchangeId: number }) =>
      exchangesApi.linkToBroker(payload.brokerId, payload.exchangeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      setAddingExchangeForBroker(null);
      setSelectedExchToLink("");
      setRowError(null);
      setRowSuccess(t("brokers.exchange_linked"));
    },
    onError: (err) => { setRowSuccess(null); setRowError(parseApiError(err)); },
  });

  const unlinkExchange = useMutation({
    mutationFn: (payload: { brokerId: number; exchangeId: number }) =>
      exchangesApi.unlinkFromBroker(payload.brokerId, payload.exchangeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      setRowError(null);
      setRowSuccess(t("brokers.exchange_unlinked"));
    },
    onError: (err) => { setRowSuccess(null); setRowError(parseApiError(err)); },
  });

  const seedDirecta = useMutation({
    mutationFn: () => exchangesApi.seedDirecta(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchanges"] });
      setExchError(null);
      setExchSuccess(t("brokers.exchange_seed_directa_success"));
    },
    onError: (err) => { setExchSuccess(null); setExchError(parseApiError(err)); },
  });

  const startEditing = (broker: Broker) => {
    setRowError(null);
    setRowSuccess(null);
    setEditingBroker(broker);
    setEditName(broker.name);
    setEditBrokerProfile(broker.broker_profile || "custom");
    setEditFeeMode(broker.fee_mode);
    setEditFeeValue(Number(broker.fee_value || 0));
    setEditFeeMin(broker.fee_min !== null && broker.fee_min !== undefined ? Number(broker.fee_min) : "");
    setEditFeeMax(broker.fee_max !== null && broker.fee_max !== undefined ? Number(broker.fee_max) : "");
    setEditFeeUsValue(broker.fee_us_value !== null && broker.fee_us_value !== undefined ? Number(broker.fee_us_value) : "");
    setEditFeeCurrency((broker.fee_currency || "EUR").toUpperCase());
    setEditMonthlyFee(Number(broker.monthly_fee || 0));
    setEditFeeTierOverride(broker.fee_tier_override !== null && broker.fee_tier_override !== undefined ? Number(broker.fee_tier_override) : "");
    setEditCapitalGainMode(broker.capital_gain_mode === "year_end" ? "year_end" : "immediate");
    setEditCapitalGainRate(Number(broker.capital_gain_rate ?? 26));
    setEditCapitalGainRateGov(Number(broker.capital_gain_rate_gov ?? 12.5));
  };

  const cancelEditing = () => {
    setEditingBroker(null);
  };

  const saveEditing = async () => {
    if (!editingBroker) return;
    const parsed = brokerSchema.safeParse({
      name: editName,
      broker_profile: editBrokerProfile,
      fee_mode: editFeeMode,
      fee_value: editFeeValue,
      fee_min: editFeeMin === "" ? null : Number(editFeeMin),
      fee_max: editFeeMax === "" ? null : Number(editFeeMax),
      fee_us_value: editFeeUsValue === "" ? null : Number(editFeeUsValue),
      fee_currency: (editFeeCurrency || "EUR").toUpperCase(),
      monthly_fee: Number(editMonthlyFee || 0),
      fee_tier_override: editFeeTierOverride === "" ? null : Number(editFeeTierOverride),
      capital_gain_mode: editCapitalGainMode || "immediate",
      capital_gain_rate: Number.isFinite(editCapitalGainRate) ? editCapitalGainRate : 26,
      capital_gain_rate_gov: Number.isFinite(editCapitalGainRateGov) ? editCapitalGainRateGov : 12.5,
    });
    if (!parsed.success) {
      setRowError(parsed.error.issues[0]?.message ?? t("brokers.error_invalid_name"));
      return;
    }
    await updateBroker.mutateAsync({
      id: editingBroker.id,
      name: parsed.data.name,
      broker_profile: parsed.data.broker_profile,
      fee_mode: parsed.data.fee_mode,
      fee_value: parsed.data.fee_value,
      fee_min: parsed.data.fee_min,
      fee_max: parsed.data.fee_max,
      fee_us_value: parsed.data.fee_us_value,
      fee_currency: parsed.data.fee_currency.toUpperCase(),
      monthly_fee: parsed.data.monthly_fee,
      fee_tier_override: parsed.data.fee_tier_override,
      capital_gain_mode: parsed.data.capital_gain_mode,
      capital_gain_rate: parsed.data.capital_gain_rate,
      capital_gain_rate_gov: parsed.data.capital_gain_rate_gov,
    });
  };

  const startEditingExchange = (exchange: Exchange) => {
    setExchError(null); setExchSuccess(null);
    setEditingExchange(exchange);
    setEditExchName(exchange.name);
    setEditExchMic(exchange.mic || "");
    setEditExchSuffix(exchange.suffix || "");
    setEditExchCountry(exchange.country || "");
    setEditExchCurrency(exchange.currency || "EUR");
    setEditExchTimezone(exchange.timezone || "");
    setEditExchOpen(exchange.open_time || "");
    setEditExchClose(exchange.close_time || "");
  };

  const cancelEditingExchange = () => { setEditingExchange(null); };

  const saveEditingExchange = async () => {
    if (!editingExchange) return;
    if (!editExchName.trim() || editExchName.trim().length < 2) { setExchError(t("brokers.error_invalid_name")); return; }
    await updateExchange.mutateAsync({
      id: editingExchange.id,
      data: {
        name: editExchName.trim(),
        mic: editExchMic.trim() || undefined,
        suffix: editExchSuffix.trim() || undefined,
        country: editExchCountry.trim() || undefined,
        currency: editExchCurrency.trim().toUpperCase() || "EUR",
        timezone: editExchTimezone.trim() || undefined,
        open_time: editExchOpen.trim() || undefined,
        close_time: editExchClose.trim() || undefined,
      },
    });
  };

  const getAvailableExchanges = (broker: Broker) => {
    const linkedIds = new Set((broker.exchanges || []).map((e) => e.id));
    return (exchangesData || []).filter((e) => !linkedIds.has(e.id));
  };

  const inputCls = "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-teal-500 focus:outline-none";
  const smallInputCls = "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:border-teal-500 focus:outline-none";

  const renderFeeDescription = (b: Broker) => {
    switch (b.fee_mode) {
      case "fixed":
        return `Fissa ${Number(b.fee_value || 0).toFixed(2)} ${b.fee_currency || "EUR"}`;
      case "percent":
        return `${Number(b.fee_value || 0).toFixed(2)}%`;
      case "percent_min_max":
        return `${Number(b.fee_value || 0).toFixed(2)}% (min ${Number(b.fee_min || 0).toFixed(2)} / max ${Number(b.fee_max || 0).toFixed(2)} ${b.fee_currency || "EUR"})`;
      case "under_30":
        return `Under 30: ${Number(b.fee_value || 2.95).toFixed(2)} € / ${Number(b.fee_us_value || 3.95).toFixed(2)} $ USA`;
      case "tiered_volume":
        return `A fasce mensili ${b.fee_tier_override ? `(Fascia ${b.fee_tier_override} fissa)` : "(Auto volume)"}`;
      default:
        return b.fee_mode;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("brokers.page_title")}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-900">{t("brokers.page_subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/80 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("brokers")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "brokers"
              ? "border-teal-400 text-teal-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          {t("brokers.tab_brokers")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("markets")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "markets"
              ? "border-teal-400 text-teal-300"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          {t("brokers.tab_markets")}
        </button>
      </div>

      {activeTab === "brokers" && (
        <>
          <section className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("brokers.new_title")}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{t("brokers.preset")}:</span>
                <select
                  value={selectedPreset}
                  onChange={(e) => {
                    const preset = BROKER_PRESETS.find((p) => p.profile === e.target.value);
                    if (preset) applyPreset(preset);
                  }}
                  className="rounded border border-teal-600/60 bg-slate-900 px-2 py-1 text-xs text-teal-300 font-semibold"
                >
                  {BROKER_PRESETS.map((p) => (
                    <option key={p.profile} value={p.profile}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedPreset !== "custom" && (
              <div className="rounded border border-teal-800/40 bg-teal-950/30 p-2 text-xs text-teal-300">
                💡 {BROKER_PRESETS.find((p) => p.profile === selectedPreset)?.description}
              </div>
            )}

            <form className="space-y-3" onSubmit={handleBrokerSubmit((values) => createBroker.mutate(values))}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Nome Broker</label>
                  <input {...registerBroker("name")} placeholder="Es. Fineco - Conto Trading" className={`w-full ${inputCls}`} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("brokers.fee_mode_label")}</label>
                  <select {...registerBroker("fee_mode")} className={`w-full ${inputCls}`}>
                    <option value="fixed">{t("brokers.fee_mode_fixed")}</option>
                    <option value="percent">{t("brokers.fee_mode_percent")}</option>
                    <option value="percent_min_max">{t("brokers.fee_mode_percent_min_max")}</option>
                    <option value="under_30">{t("brokers.fee_mode_under_30")}</option>
                    <option value="tiered_volume">{t("brokers.fee_mode_tiered_volume")}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    {currentFeeMode === "percent" || currentFeeMode === "percent_min_max" ? "Percentuale (%)" : "Fee / Base"}
                  </label>
                  <input type="number" step="0.0001" {...registerBroker("fee_value")} placeholder="Valore fee" className={`w-full ${inputCls}`} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Valuta</label>
                  <input {...registerBroker("fee_currency")} placeholder="EUR" className={`w-full ${inputCls}`} />
                </div>

                {/* Conditional fields based on fee_mode */}
                {currentFeeMode === "percent_min_max" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">{t("brokers.fee_min")}</label>
                      <input type="number" step="0.01" {...registerBroker("fee_min")} placeholder="Es. 2.95" className={`w-full ${inputCls}`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">{t("brokers.fee_max")}</label>
                      <input type="number" step="0.01" {...registerBroker("fee_max")} placeholder="Es. 19.00" className={`w-full ${inputCls}`} />
                    </div>
                  </>
                )}

                {currentFeeMode === "under_30" && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{t("brokers.fee_us_value")}</label>
                    <input type="number" step="0.01" {...registerBroker("fee_us_value")} placeholder="Es. 3.95" className={`w-full ${inputCls}`} />
                  </div>
                )}

                {currentFeeMode === "tiered_volume" && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{t("brokers.fee_tier")}</label>
                    <select {...registerBroker("fee_tier_override")} className={`w-full ${inputCls}`}>
                      <option value="">{t("brokers.fee_tier_auto")}</option>
                      <option value="1">{t("brokers.fee_tier_1")}</option>
                      <option value="2">{t("brokers.fee_tier_2")}</option>
                      <option value="3">{t("brokers.fee_tier_3")}</option>
                      <option value="4">{t("brokers.fee_tier_4")}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("brokers.monthly_fee")} (€/mese)</label>
                  <input type="number" step="0.01" {...registerBroker("monthly_fee")} placeholder="Es. 0, 3.95, 29.95" className={`w-full ${inputCls}`} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Regime Fiscale</label>
                  <select {...registerBroker("capital_gain_mode")} className={`w-full ${inputCls}`}>
                    <option value="immediate">Capital gain immediato (amministrato)</option>
                    <option value="year_end">Capital gain a fine anno</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("brokers.capital_gain_standard")}</label>
                  <input type="number" step="0.01" {...registerBroker("capital_gain_rate")} placeholder="Es. 26" className={`w-full ${inputCls}`} />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("brokers.capital_gain_rate_gov")}</label>
                  <input type="number" step="0.01" {...registerBroker("capital_gain_rate_gov")} placeholder="Es. 12.50" className={`w-full ${inputCls}`} />
                </div>
              </div>

              {currentFeeMode === "tiered_volume" && (
                <div className="rounded border border-slate-700/60 bg-slate-900/60 p-2.5 text-xs text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Scaglioni Fineco per ordini Italia/Europa e USA:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded bg-slate-800/80 p-1.5 border border-slate-700/40">
                      <div className="text-teal-400 font-semibold">Fascia 1 (&lt; 99 € comm.)</div>
                      <div>19,00 € / 12,95 $</div>
                    </div>
                    <div className="rounded bg-slate-800/80 p-1.5 border border-slate-700/40">
                      <div className="text-teal-400 font-semibold">Fascia 2 (100 - 1.499 €)</div>
                      <div>9,95 € / 9,95 $</div>
                    </div>
                    <div className="rounded bg-slate-800/80 p-1.5 border border-slate-700/40">
                      <div className="text-teal-400 font-semibold">Fascia 3 (1.500 - 2.499 €)</div>
                      <div>6,95 € / 8,95 $</div>
                    </div>
                    <div className="rounded bg-slate-800/80 p-1.5 border border-slate-700/40">
                      <div className="text-teal-400 font-semibold">Fascia 4 (≥ 2.500 €)</div>
                      <div>2,95 € / 3,95 $</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded bg-teal-500 px-4 py-2 font-semibold text-slate-950 hover:bg-teal-400 transition-colors" disabled={createBroker.isPending}>
                  {createBroker.isPending ? t("brokers.saving") : t("brokers.create")}
                </button>
              </div>
            </form>

            {brokerErrors.name && <p className="mt-1 text-sm text-red-400">{brokerErrors.name.message}</p>}
            {brokerErrors.fee_value && <p className="mt-1 text-sm text-red-400">{brokerErrors.fee_value.message}</p>}
            {brokerErrors.monthly_fee && <p className="mt-1 text-sm text-red-400">{brokerErrors.monthly_fee.message}</p>}
            {brokerErrors.capital_gain_rate && <p className="mt-1 text-sm text-red-400">{brokerErrors.capital_gain_rate.message}</p>}
            {brokerErrors.capital_gain_rate_gov && <p className="mt-1 text-sm text-red-400">{brokerErrors.capital_gain_rate_gov.message}</p>}
          </section>

          <section className="card overflow-x-auto">
            <div className="border-b border-slate-700/80 px-4 py-3 text-lg font-semibold">{t("brokers.list_title")}</div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 dark:border-slate-300 text-left text-slate-400 dark:text-slate-900">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Nome Broker</th>
                  <th className="px-4 py-2">Struttura Fee</th>
                  <th className="px-4 py-2">Canone Mensile</th>
                  <th className="px-4 py-2">Fiscalità (Ord / TdS)</th>
                  <th className="px-4 py-2">{t("brokers.markets_column")}</th>
                  <th className="px-4 py-2">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {brokersLoading ? (
                  <tr><td colSpan={7} className="px-4 py-3 text-slate-400">{t("brokers.loading")}</td></tr>
                ) : brokersData?.length ? (
                  brokersData.map((broker) => {
                    const isEditingThis = editingBroker?.id === broker.id;
                    return (
                      <tr key={broker.id} className="border-b border-slate-800/80">
                        <td className="px-4 py-2">{broker.id}</td>

                        {/* Name & Profile */}
                        <td className="px-4 py-2 text-teal-200 dark:text-teal-900">
                          {isEditingThis ? (
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`w-full ${smallInputCls}`} />
                          ) : (
                            <div>
                              <div className="font-semibold text-slate-200">{broker.name}</div>
                              {broker.broker_profile && broker.broker_profile !== "custom" && (
                                <span className="inline-block mt-0.5 rounded-full bg-slate-800 px-2 py-0.2 text-[10px] text-teal-400 border border-slate-700">
                                  {BROKER_PRESETS.find((p) => p.profile === broker.broker_profile)?.label || broker.broker_profile}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Fee Structure */}
                        <td className="px-4 py-2">
                          {isEditingThis ? (
                            <div className="space-y-1">
                              <select value={editFeeMode} onChange={(e) => setEditFeeMode(e.target.value as FeeMode)} className={smallInputCls}>
                                <option value="fixed">Fissa</option>
                                <option value="percent">Percentuale</option>
                                <option value="percent_min_max">% con Min/Max</option>
                                <option value="under_30">Under 30</option>
                                <option value="tiered_volume">A fasce volume</option>
                              </select>
                              <div className="flex gap-1 items-center">
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editFeeValue}
                                  onChange={(e) => setEditFeeValue(Number(e.target.value))}
                                  className={`w-16 ${smallInputCls}`}
                                  placeholder="Valore"
                                />
                                {editFeeMode === "percent_min_max" && (
                                  <>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editFeeMin}
                                      onChange={(e) => setEditFeeMin(e.target.value === "" ? "" : Number(e.target.value))}
                                      className={`w-14 ${smallInputCls}`}
                                      placeholder="Min"
                                    />
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editFeeMax}
                                      onChange={(e) => setEditFeeMax(e.target.value === "" ? "" : Number(e.target.value))}
                                      className={`w-14 ${smallInputCls}`}
                                      placeholder="Max"
                                    />
                                  </>
                                )}
                                {editFeeMode === "under_30" && (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editFeeUsValue}
                                    onChange={(e) => setEditFeeUsValue(e.target.value === "" ? "" : Number(e.target.value))}
                                    className={`w-16 ${smallInputCls}`}
                                    placeholder="USA $"
                                  />
                                )}
                                {editFeeMode === "tiered_volume" && (
                                  <select
                                    value={editFeeTierOverride}
                                    onChange={(e) => setEditFeeTierOverride(e.target.value === "" ? "" : Number(e.target.value))}
                                    className={smallInputCls}
                                  >
                                    <option value="">Auto</option>
                                    <option value="1">Fascia 1</option>
                                    <option value="2">Fascia 2</option>
                                    <option value="3">Fascia 3</option>
                                    <option value="4">Fascia 4</option>
                                  </select>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-300">
                              <div>{renderFeeDescription(broker)}</div>
                            </div>
                          )}
                        </td>

                        {/* Canone Mensile */}
                        <td className="px-4 py-2">
                          {isEditingThis ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editMonthlyFee}
                              onChange={(e) => setEditMonthlyFee(Number(e.target.value))}
                              className={`w-16 ${smallInputCls}`}
                            />
                          ) : Number(broker.monthly_fee || 0) > 0 ? (
                            <span className="font-semibold text-amber-400">
                              {Number(broker.monthly_fee).toFixed(2)} €/m
                            </span>
                          ) : (
                            <span className="text-slate-400">0,00 €</span>
                          )}
                        </td>

                        {/* Capital gain rates (Ord / Gov) */}
                        <td className="px-4 py-2">
                          {isEditingThis ? (
                            <div className="space-y-1">
                              <select value={editCapitalGainMode} onChange={(e) => setEditCapitalGainMode(e.target.value as "immediate" | "year_end")} className={smallInputCls}>
                                <option value="immediate">immediato</option>
                                <option value="year_end">fine anno</option>
                              </select>
                              <div className="flex gap-1 items-center text-xs">
                                <span title="Aliquota standard">Ord:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editCapitalGainRate}
                                  onChange={(e) => setEditCapitalGainRate(Number(e.target.value))}
                                  className={`w-14 ${smallInputCls}`}
                                />
                                <span title="Aliquota Titoli di Stato">TdS:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editCapitalGainRateGov}
                                  onChange={(e) => setEditCapitalGainRateGov(Number(e.target.value))}
                                  className={`w-14 ${smallInputCls}`}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs space-y-0.5">
                              <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                                {broker.capital_gain_mode}
                              </span>
                              <div className="flex gap-1.5">
                                <span className="text-slate-300 font-medium">Ord: {Number(broker.capital_gain_rate || 26).toFixed(1)}%</span>
                                <span className="text-emerald-400 font-medium">TdS: {Number(broker.capital_gain_rate_gov || 12.5).toFixed(1)}%</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Markets column */}
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1 items-center min-w-[120px]">
                            {(broker.exchanges || []).map((exc) => (
                              <span key={exc.id} className="inline-flex items-center gap-1 rounded-full bg-teal-900/60 px-2 py-0.5 text-xs text-teal-300">
                                {exc.name}{exc.suffix ? `.${exc.suffix}` : ""}
                                <button
                                  type="button"
                                  className="hover:text-red-400 transition-colors"
                                  onClick={() => unlinkExchange.mutate({ brokerId: broker.id, exchangeId: exc.id })}
                                  title={`Rimuovi ${exc.name}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {addingExchangeForBroker === broker.id ? (
                              <span className="inline-flex items-center gap-1">
                                <select
                                  value={selectedExchToLink}
                                  onChange={(e) => setSelectedExchToLink(e.target.value === "" ? "" : Number(e.target.value))}
                                  className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
                                >
                                  <option value="">— mercato —</option>
                                  {getAvailableExchanges(broker).map((e) => (
                                    <option key={e.id} value={e.id}>{e.name}{e.suffix ? `.${e.suffix}` : ""}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={selectedExchToLink === ""}
                                  onClick={() => {
                                    if (selectedExchToLink !== "") {
                                      linkExchange.mutate({ brokerId: broker.id, exchangeId: Number(selectedExchToLink) });
                                    }
                                  }}
                                  className="text-xs text-teal-400 hover:text-teal-300 disabled:opacity-40"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAddingExchangeForBroker(null); setSelectedExchToLink(""); }}
                                  className="text-xs text-slate-400 hover:text-slate-300"
                                >
                                  ✕
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setAddingExchangeForBroker(broker.id); setSelectedExchToLink(""); }}
                                className="rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
                              >
                                + mercato
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            {isEditingThis ? (
                              <>
                                <button
                                  type="button"
                                  onClick={saveEditing}
                                  className="rounded p-1 text-emerald-400 hover:bg-slate-700/60"
                                  title="Salva"
                                >
                                  <SaveIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-700/60"
                                  title="Annulla"
                                >
                                  <CancelIcon />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditing(broker)}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
                                  title="Modifica"
                                >
                                  <EditIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletePendingId(broker.id)}
                                  className="rounded p-1 text-red-400 hover:bg-slate-700/60 hover:text-red-300"
                                  title="Elimina"
                                >
                                  <DeleteIcon />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan={7} className="px-4 py-3 text-slate-400">{t("brokers.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {rowError && <p className="text-sm text-red-400">{rowError}</p>}
          {rowSuccess && <p className="text-sm text-emerald-400">{rowSuccess}</p>}
        </>
      )}

      {activeTab === "markets" && (
        <>
          <section className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("brokers.markets_title")}</h2>
                <p className="text-xs text-slate-400">{t("brokers.markets_subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => seedDirecta.mutate()}
                disabled={seedDirecta.isPending}
                title={t("brokers.exchange_seed_directa_hint")}
                className="rounded border border-teal-500/60 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 disabled:opacity-50 transition-colors"
              >
                {seedDirecta.isPending ? "…" : t("brokers.exchange_seed_directa")}
              </button>
            </div>

            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleExchangeSubmit((values) => createExchange.mutate(values))}>
              <input {...registerExchange("name")} placeholder={t("brokers.exchange_name")} className={inputCls} />
              <input {...registerExchange("mic")} placeholder={t("brokers.exchange_mic")} className={inputCls} />
              <input {...registerExchange("suffix")} placeholder={t("brokers.exchange_suffix")} className={inputCls} />
              <input {...registerExchange("country")} placeholder={t("brokers.exchange_country")} className={inputCls} />
              <input {...registerExchange("currency")} placeholder={t("brokers.exchange_currency")} className={inputCls} />
              <input {...registerExchange("timezone")} placeholder={t("brokers.exchange_timezone")} className={inputCls} />
              <input {...registerExchange("open_time")} placeholder={t("brokers.exchange_open")} className={inputCls} />
              <input {...registerExchange("close_time")} placeholder={t("brokers.exchange_close")} className={inputCls} />
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button type="submit" className="rounded bg-teal-500 px-4 py-2 font-semibold text-slate-950 hover:bg-teal-400 transition-colors" disabled={createExchange.isPending}>
                  {createExchange.isPending ? t("brokers.saving") : t("brokers.exchange_add")}
                </button>
              </div>
            </form>

            {exchangeErrors.name && <p className="text-sm text-red-400">{exchangeErrors.name.message}</p>}
          </section>

          <section className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">MIC</th>
                  <th className="px-4 py-2">Suffisso</th>
                  <th className="px-4 py-2">Paese</th>
                  <th className="px-4 py-2">Valuta</th>
                  <th className="px-4 py-2">Fuso</th>
                  <th className="px-4 py-2">Orari</th>
                  <th className="px-4 py-2">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {exchangesLoading ? (
                  <tr><td colSpan={9} className="px-4 py-3 text-slate-400">{t("brokers.exchange_loading")}</td></tr>
                ) : exchangesData?.length ? (
                  exchangesData.map((exchange) => (
                    <tr key={exchange.id} className="border-b border-slate-800/80">
                      <td className="px-4 py-2">{exchange.id}</td>
                      <td className="px-4 py-2 text-teal-200">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchName} onChange={(e) => setEditExchName(e.target.value)} className={smallInputCls} />
                        ) : exchange.name}
                      </td>
                      <td className="px-4 py-2">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchMic} onChange={(e) => setEditExchMic(e.target.value)} className={`w-20 ${smallInputCls}`} />
                        ) : exchange.mic || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchSuffix} onChange={(e) => setEditExchSuffix(e.target.value)} className={`w-16 ${smallInputCls}`} />
                        ) : exchange.suffix ? `.${exchange.suffix}` : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchCountry} onChange={(e) => setEditExchCountry(e.target.value)} className={`w-14 ${smallInputCls}`} />
                        ) : exchange.country || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchCurrency} onChange={(e) => setEditExchCurrency(e.target.value.toUpperCase())} className={`w-16 ${smallInputCls}`} />
                        ) : exchange.currency}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {editingExchange?.id === exchange.id ? (
                          <input value={editExchTimezone} onChange={(e) => setEditExchTimezone(e.target.value)} className={smallInputCls} />
                        ) : exchange.timezone || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {editingExchange?.id === exchange.id ? (
                          <div className="flex gap-1">
                            <input value={editExchOpen} onChange={(e) => setEditExchOpen(e.target.value)} className={`w-14 ${smallInputCls}`} placeholder="Open" />
                            <input value={editExchClose} onChange={(e) => setEditExchClose(e.target.value)} className={`w-14 ${smallInputCls}`} placeholder="Close" />
                          </div>
                        ) : (
                          `${exchange.open_time || "—"} - ${exchange.close_time || "—"}`
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {editingExchange?.id === exchange.id ? (
                            <>
                              <button type="button" onClick={saveEditingExchange} className="rounded p-1 text-emerald-400 hover:bg-slate-700/60"><SaveIcon /></button>
                              <button type="button" onClick={cancelEditingExchange} className="rounded p-1 text-slate-400 hover:bg-slate-700/60"><CancelIcon /></button>
                            </>
                          ) : (
                            <>
                              {exchange.euronext_code && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSyncingExchId(exchange.id);
                                    syncExchangeTickers.mutate(exchange.id);
                                  }}
                                  disabled={syncingExchId === exchange.id}
                                  title={t("brokers.exchange_sync_tickers")}
                                  className="rounded p-1 text-teal-400 hover:bg-slate-700/60 hover:text-teal-300 disabled:opacity-50 transition-colors"
                                >
                                  {syncingExchId === exchange.id ? (
                                    <span className="inline-block animate-spin text-xs">⟳</span>
                                  ) : (
                                    <DownloadIcon />
                                  )}
                                </button>
                              )}
                              <button type="button" onClick={() => startEditingExchange(exchange)} className="rounded p-1 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"><EditIcon /></button>
                              <button type="button" onClick={() => setDeleteExchPendingId(exchange.id)} className="rounded p-1 text-red-400 hover:bg-slate-700/60 hover:text-red-300"><DeleteIcon /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={9} className="px-4 py-3 text-slate-400">{t("brokers.exchange_empty")}</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {exchError && <p className="text-sm text-red-400">{exchError}</p>}
          {exchSuccess && <p className="text-sm text-emerald-400">{exchSuccess}</p>}
        </>
      )}

      {/* Modals */}
      {deletePendingId !== null && (
        <ConfirmModal
          message={t("brokers.confirm_delete", { id: deletePendingId, name: brokersData?.find((b) => b.id === deletePendingId)?.name ?? "" })}
          confirmLabel="Elimina"
          onConfirm={() => { if (deletePendingId !== null) { deleteBroker.mutate(deletePendingId); setDeletePendingId(null); } }}
          onCancel={() => setDeletePendingId(null)}
        />
      )}

      {deleteExchPendingId !== null && (
        <ConfirmModal
          message={t("brokers.exchange_confirm_delete", { id: deleteExchPendingId, name: exchangesData?.find((e) => e.id === deleteExchPendingId)?.name ?? "" })}
          confirmLabel="Elimina"
          onConfirm={() => { if (deleteExchPendingId !== null) { deleteExchange.mutate(deleteExchPendingId); setDeleteExchPendingId(null); } }}
          onCancel={() => setDeleteExchPendingId(null)}
        />
      )}
    </div>
  );
}
