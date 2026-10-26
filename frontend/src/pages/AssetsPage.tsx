import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Asset, Ticker, createAsset, deleteAsset, fetchAssets, tickersApi, updateAsset } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const INSTRUMENT_TYPES = ["etf", "stock", "bond", "fund"];

export interface AssetFormModalProps {
  open: boolean;
  onClose: () => void;
  editAsset?: Asset | null;
  onCreated?: (asset: Asset) => void;
}

export function AssetFormModal({
  open,
  onClose,
  editAsset,
  onCreated,
}: AssetFormModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [isin, setIsin] = useState("");
  const [instrumentType, setInstrumentType] = useState("etf");
  const [exchange, setExchange] = useState("");
  const [currency, setCurrency] = useState("EUR");

  // Autocomplete state
  const [tickerSuggestions, setTickerSuggestions] = useState<Ticker[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolContainerRef = useRef<HTMLDivElement>(null);

  const isEditing = !!editAsset;

  useEffect(() => {
    if (open) {
      if (editAsset) {
        setSymbol(editAsset.symbol);
        setName(editAsset.name);
        setIsin(editAsset.isin ?? "");
        setInstrumentType(editAsset.instrument_type ?? "etf");
        setExchange(editAsset.exchange ?? "");
        setCurrency(editAsset.currency ?? "EUR");
      } else {
        setSymbol("");
        setName("");
        setIsin("");
        setInstrumentType("etf");
        setExchange("");
        setCurrency("EUR");
      }
      setAutofilled(false);
      setTickerSuggestions([]);
      setShowSuggestions(false);
    }
  }, [open, editAsset]);

  // Click outside suggestions dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (symbolContainerRef.current && !symbolContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSymbolChange = (val: string) => {
    const up = val.toUpperCase();
    setSymbol(up);
    setAutofilled(false);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!up.trim() || isEditing) {
      setTickerSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await tickersApi.search(up.trim(), 6);
        setTickerSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        // ignore search error
      }
    }, 250);
  };

  const handleSelectTicker = (tk: Ticker) => {
    setSymbol(tk.symbol);
    setName(tk.name);
    if (tk.isin) setIsin(tk.isin);
    if (tk.market) setExchange(tk.market);
    if (tk.currency) setCurrency(tk.currency);

    const lowerName = tk.name.toLowerCase();
    if (lowerName.includes("etf") || lowerName.includes("ucits")) {
      setInstrumentType("etf");
    } else if (lowerName.includes("bond") || lowerName.includes("btp") || lowerName.includes("bot") || lowerName.includes("obblig")) {
      setInstrumentType("bond");
    } else if (lowerName.includes("fund") || lowerName.includes("fondo")) {
      setInstrumentType("fund");
    } else {
      setInstrumentType("stock");
    }

    setAutofilled(true);
    setShowSuggestions(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        symbol: symbol.trim(),
        name: name.trim(),
        isin: isin.trim() ? isin.trim().toUpperCase() : null,
        instrument_type: instrumentType,
        exchange: exchange.trim() ? exchange.trim() : null,
        currency: currency.trim() ? currency.trim().toUpperCase() : "EUR",
      };
      if (isEditing && editAsset) {
        return updateAsset(editAsset.id, payload);
      }
      return createAsset(payload);
    },
    onSuccess: (savedAsset) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(isEditing ? t("assets.updated_success", "Asset aggiornato") : t("assets.created_success", "Asset creato"));
      onCreated?.(savedAsset);
      onClose();
    },
    onError: (err: Error) => {
      console.error("Asset mutation error:", err);
      if (err.message.includes("409") || err.message.toLowerCase().includes("already exists")) {
        toast.error(t("assets.error_already_exists", "Un asset con questo simbolo esiste già"));
      } else {
        toast.error(`Error: ${err.message}`);
      }
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-teal-200 dark:text-teal-900">
          {isEditing ? t("assets.edit_title") : t("assets.add_title")}
        </h2>

        {autofilled && (
          <div className="mb-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-300 dark:text-teal-800 flex items-center justify-between">
            <span>{t("assets.autofilled_badge", "✓ Campi compilati automaticamente dal ticker")}</span>
            <button
              type="button"
              onClick={() => setAutofilled(false)}
              className="text-slate-400 hover:text-slate-200 text-xs ml-2"
            >
              ✕
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div ref={symbolContainerRef} className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-slate-400 dark:text-slate-900">
                {t("assets.symbol")} *
              </label>
              {!isEditing && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {t("assets.symbol_autocomplete_hint", "Cerca tra i ticker o digita un simbolo")}
                </span>
              )}
            </div>
            <input
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              onFocus={() => tickerSuggestions.length > 0 && setShowSuggestions(true)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900 uppercase font-mono"
              placeholder="es. VWCE, SWDA, AAPL"
              autoComplete="off"
            />
            {showSuggestions && tickerSuggestions.length > 0 && (
              <ul className="absolute left-0 top-full z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-600 dark:border-slate-300 bg-slate-900 dark:bg-white shadow-xl">
                {tickerSuggestions.map((tk) => (
                  <li
                    key={tk.id}
                    onMouseDown={() => handleSelectTicker(tk)}
                    className="flex cursor-pointer items-baseline gap-2 px-3 py-2 hover:bg-slate-800 dark:hover:bg-slate-100 text-xs border-b border-slate-800/50 last:border-0"
                  >
                    <span className="font-mono font-semibold text-teal-400 dark:text-teal-700 shrink-0">
                      {tk.symbol}
                    </span>
                    <span className="truncate text-slate-300 dark:text-slate-700">
                      {tk.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                      {tk.market}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {t("assets.name")} *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="es. Vanguard FTSE All-World UCITS ETF"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {t("assets.isin")}
            </label>
            <input
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900 font-mono uppercase"
              placeholder="es. IE00BK5BQT80"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {t("assets.instrument_type")}
            </label>
            <select
              value={instrumentType}
              onChange={(e) => setInstrumentType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            >
              {INSTRUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                {t("assets.exchange")}
              </label>
              <input
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                placeholder="es. XETRA, Borsa Italiana"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                {t("assets.currency")}
              </label>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={5}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900 font-mono uppercase"
                placeholder="EUR"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 dark:border-slate-300 px-3 py-2 text-sm font-semibold text-slate-300 dark:text-slate-700 hover:bg-slate-800 dark:hover:bg-slate-100"
          >
            {t("assets.cancel")}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!symbol.trim() || !name.trim() || mutation.isPending}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
          >
            {mutation.isPending ? t("assets.saving") : isEditing ? t("assets.save") : t("assets.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssetsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: fetchAssets,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("assets.title")}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-900">{t("assets.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setEditAsset(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400"
        >
          + {t("assets.add")}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-900">
              <th className="px-3 py-2">{t("assets.col_symbol")}</th>
              <th className="px-3 py-2">{t("assets.col_name")}</th>
              <th className="px-3 py-2">{t("assets.col_isin")}</th>
              <th className="px-3 py-2">{t("assets.col_type")}</th>
              <th className="px-3 py-2">{t("assets.col_exchange")}</th>
              <th className="px-3 py-2">{t("assets.col_currency")}</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-400 dark:text-slate-600">
                  {t("common.loading", "Caricamento...")}
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-slate-400 dark:text-slate-600 text-sm">
                      {t("assets.no_assets", "Nessun asset registrato.")}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm">
                      {t("assets.empty_hint", "Registra ETF, azioni o fondi con ricerca ticker automatica per tracciare le tue posizioni in Portafoglio.")}
                    </p>
                    <button
                      onClick={() => {
                        setEditAsset(null);
                        setShowForm(true);
                      }}
                      className="mt-2 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400"
                    >
                      + {t("assets.add_first", "Aggiungi il tuo primo Asset")}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              assets.map((asset: Asset) => (
                <tr key={asset.id} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono font-medium text-teal-200 dark:text-teal-900">{asset.symbol}</td>
                  <td className="px-3 py-2 text-slate-300 dark:text-slate-900">{asset.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400 dark:text-slate-700">{asset.isin ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400 dark:text-slate-700 uppercase text-xs">{asset.instrument_type}</td>
                  <td className="px-3 py-2 text-slate-400 dark:text-slate-700">{asset.exchange ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400 dark:text-slate-700">{asset.currency}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditAsset(asset);
                          setShowForm(true);
                        }}
                        className="rounded bg-sky-500 p-1.5 text-slate-950 hover:bg-sky-400"
                        title={t("assets.edit")}
                        aria-label={t("assets.edit")}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(asset.id)}
                        className="rounded bg-red-500 p-1.5 text-white hover:bg-red-400"
                        title={t("assets.delete")}
                        aria-label={t("assets.delete")}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AssetFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditAsset(null);
        }}
        editAsset={editAsset}
      />

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
            <p className="mb-4 text-slate-200 dark:text-slate-900">{t("assets.confirm_delete")}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-700 dark:border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-200 dark:text-slate-900"
              >
                {t("assets.cancel")}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-400"
              >
                {t("assets.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
