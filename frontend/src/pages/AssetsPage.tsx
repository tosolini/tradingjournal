import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Asset, Ticker, createAsset, deleteAsset, fetchAssets, lookupBond, syncAssetEuronext, tickersApi, updateAsset } from "../lib/api";
import { parseLocaleNumber } from "../lib/numbers";
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

  // Bond-specific state
  const [bondType, setBondType] = useState("fixed");
  const [maturityDate, setMaturityDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [couponFrequency, setCouponFrequency] = useState(2);
  const [annualCouponRate, setAnnualCouponRate] = useState("3.50");
  const [finalBonusRate, setFinalBonusRate] = useState("0.00");
  const [taxRate, setTaxRate] = useState("12.50");
  const [stepUpSchedule, setStepUpSchedule] = useState<{ from_year: number; to_year: number; rate: number }[]>([
    { from_year: 1, to_year: 3, rate: 3.25 },
    { from_year: 4, to_year: 5, rate: 4.00 },
  ]);
  const [euronextQuery, setEuronextQuery] = useState("");
  const [loadingEuronext, setLoadingEuronext] = useState(false);

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
        setEuronextQuery(editAsset.isin || editAsset.symbol || "");
        if (editAsset.bond_detail) {
          setBondType(editAsset.bond_detail.bond_type || "fixed");
          setMaturityDate(editAsset.bond_detail.maturity_date || "");
          setIssueDate(editAsset.bond_detail.issue_date || "");
          setCouponFrequency(editAsset.bond_detail.coupon_frequency ?? 2);
          setAnnualCouponRate(String(editAsset.bond_detail.annual_coupon_rate ?? "0"));
          setFinalBonusRate(String(editAsset.bond_detail.final_bonus_rate ?? "0"));
          setTaxRate(String(editAsset.bond_detail.tax_rate ?? "12.50"));
          setStepUpSchedule(editAsset.bond_detail.step_up_schedule || []);
        } else {
          setBondType("fixed");
          setMaturityDate("");
          setIssueDate("");
          setCouponFrequency(2);
          setAnnualCouponRate("3.50");
          setFinalBonusRate("0.00");
          setTaxRate("12.50");
          setStepUpSchedule([
            { from_year: 1, to_year: 3, rate: 3.25 },
            { from_year: 4, to_year: 5, rate: 4.00 },
          ]);
        }
      } else {
        setSymbol("");
        setName("");
        setIsin("");
        setInstrumentType("etf");
        setExchange("");
        setCurrency("EUR");
        setBondType("fixed");
        setMaturityDate("");
        setIssueDate("");
        setCouponFrequency(2);
        setAnnualCouponRate("3.50");
        setFinalBonusRate("0.00");
        setTaxRate("12.50");
        setStepUpSchedule([
          { from_year: 1, to_year: 3, rate: 3.25 },
          { from_year: 4, to_year: 5, rate: 4.00 },
        ]);
      }
      setEuronextQuery("");
      setLoadingEuronext(false);
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

  const handleEuronextLookup = async () => {
    if (!euronextQuery.trim()) return;
    setLoadingEuronext(true);
    try {
      const data = await lookupBond(euronextQuery.trim());
      setSymbol(data.symbol);
      setName(data.name);
      if (data.isin) setIsin(data.isin);
      if (data.exchange) setExchange(data.exchange);
      if (data.currency) setCurrency(data.currency);
      setInstrumentType("bond");
      if (data.bond_detail) {
        setBondType(data.bond_detail.bond_type || "fixed");
        setMaturityDate(data.bond_detail.maturity_date || "");
        setIssueDate(data.bond_detail.issue_date || "");
        setCouponFrequency(data.bond_detail.coupon_frequency ?? 2);
        setAnnualCouponRate(String(data.bond_detail.annual_coupon_rate ?? "0"));
        setFinalBonusRate(String(data.bond_detail.final_bonus_rate ?? "0"));
        setTaxRate(String(data.bond_detail.tax_rate ?? "12.50"));
        if (data.bond_detail.step_up_schedule) {
          setStepUpSchedule(data.bond_detail.step_up_schedule);
        }
      }
      toast.success(
        `${t("assets.euronext_import_success", "Dati obbligazione importati con successo!")} Prezzo live: ${data.live_price ?? "N/A"}%`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Errore importazione Euronext: ${msg}`);
    } finally {
      setLoadingEuronext(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<Asset> = {
        symbol: symbol.trim(),
        name: name.trim(),
        isin: isin.trim() ? isin.trim().toUpperCase() : null,
        instrument_type: instrumentType,
        exchange: exchange.trim() ? exchange.trim() : null,
        currency: currency.trim() ? currency.trim().toUpperCase() : "EUR",
      };

      if (instrumentType === "bond") {
        if (!maturityDate.trim()) {
          throw new Error(t("assets.maturity_date_required", "Data di scadenza obbligatoria"));
        }
        payload.bond_detail = {
          bond_type: bondType,
          issue_date: issueDate.trim() ? issueDate.trim() : null,
          maturity_date: maturityDate.trim(),
          coupon_frequency: Number(couponFrequency),
          annual_coupon_rate: parseLocaleNumber(annualCouponRate),
          final_bonus_rate: parseLocaleNumber(finalBonusRate),
          tax_rate: parseLocaleNumber(taxRate) || 12.5,
          step_up_schedule: bondType === "step_up" ? stepUpSchedule : null,
          day_count_convention: "ACT/ACT ICMA",
        };
      }

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
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
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


        {(
          <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 dark:bg-teal-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-teal-300 dark:text-teal-900 flex items-center justify-between">
              <span>
                {t("assets.euronext_import_prefix", "Importa automaticamente da")}{" "}
                <a
                  href="https://live.euronext.com/en/products/bonds/mot/list"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-teal-200 dark:hover:text-teal-700 transition-colors inline-flex items-center gap-1"
                  title="Apri Euronext MOT"
                >
                  Euronext / MOT
                  <svg viewBox="0 0 24 24" className="h-3 w-3 inline" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={euronextQuery}
                onChange={(e) => setEuronextQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEuronextLookup();
                  }
                }}
                placeholder={t("assets.euronext_import_placeholder", "Incolla URL Euronext o codice ISIN (es. IT0005611741)")}
                className="flex-1 rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-xs text-slate-200 dark:text-slate-900 font-mono"
              />
              <button
                type="button"
                onClick={handleEuronextLookup}
                disabled={!euronextQuery.trim() || loadingEuronext}
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 whitespace-nowrap"
              >
                {loadingEuronext ? t("assets.euronext_import_loading", "Caricamento...") : t("assets.euronext_import_btn", "Importa Live")}
              </button>
            </div>
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

          {instrumentType === "bond" && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 dark:bg-teal-50 p-3 space-y-3">
              <div className="text-xs font-semibold text-teal-300 dark:text-teal-900 uppercase tracking-wider">
                {t("assets.bond_section", "Parametri Obbligazionari")}
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.bond_type")}</label>
                <select
                  value={bondType}
                  onChange={(e) => setBondType(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                >
                  <option value="fixed">{t("assets.bond_type_fixed")}</option>
                  <option value="step_up">{t("assets.bond_type_step_up")}</option>
                  <option value="zero_coupon">{t("assets.bond_type_zcb")}</option>
                  <option value="inflation_linked">{t("assets.bond_type_inflation")}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.issue_date")}</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.maturity_date")} *</label>
                  <input
                    type="date"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.coupon_frequency")}</label>
                  <select
                    value={couponFrequency}
                    onChange={(e) => setCouponFrequency(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  >
                    <option value={2}>{t("assets.freq_semiannual")}</option>
                    <option value={4}>{t("assets.freq_quarterly")}</option>
                    <option value={1}>{t("assets.freq_annual")}</option>
                    <option value={0}>{t("assets.freq_none")}</option>
                  </select>
                </div>
                {bondType !== "zero_coupon" && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                      {bondType === "step_up" ? t("assets.rate_pct", "Tasso Base %") : t("assets.coupon_rate")}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={annualCouponRate}
                      onChange={(e) => setAnnualCouponRate(e.target.value)}
                      placeholder="es. 3.50"
                      className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.tax_rate")}</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  >
                    <option value="12.50">{t("assets.tax_gov")}</option>
                    <option value="26.00">{t("assets.tax_corp")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900" title={t("assets.final_bonus_hint")}>
                    {t("assets.final_bonus_rate")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={finalBonusRate}
                    onChange={(e) => setFinalBonusRate(e.target.value)}
                    placeholder="es. 0.80"
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  />
                </div>
              </div>

              {bondType === "step_up" && (
                <div className="pt-2 border-t border-slate-700/40 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300 dark:text-slate-800">
                    <span>{t("assets.step_up_schedule")}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setStepUpSchedule((prev) => [
                          ...prev,
                          { from_year: prev.length + 1, to_year: prev.length + 2, rate: 3.5 },
                        ])
                      }
                      className="text-teal-400 hover:text-teal-300 text-xs"
                    >
                      {t("assets.add_step")}
                    </button>
                  </div>
                  {stepUpSchedule.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 w-12">{t("assets.from_year")}</span>
                      <input
                        type="number"
                        min="1"
                        value={step.from_year}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStepUpSchedule((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, from_year: val } : s))
                          );
                        }}
                        className="w-14 rounded border border-slate-700 bg-slate-800 p-1 text-center text-slate-200"
                      />
                      <span className="text-slate-400 w-10">{t("assets.to_year")}</span>
                      <input
                        type="number"
                        min="1"
                        value={step.to_year}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStepUpSchedule((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, to_year: val } : s))
                          );
                        }}
                        className="w-14 rounded border border-slate-700 bg-slate-800 p-1 text-center text-slate-200"
                      />
                      <span className="text-slate-400">{t("assets.rate_pct")}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={step.rate}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStepUpSchedule((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, rate: val } : s))
                          );
                        }}
                        className="w-16 rounded border border-slate-700 bg-slate-800 p-1 text-center text-slate-200"
                      />
                      {stepUpSchedule.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setStepUpSchedule((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-300 ml-auto"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
  const toast = useToast();

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: fetchAssets,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("assets.deleted_success", "Asset eliminato con successo"));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      console.error("Asset delete error:", err);
      toast.error(err.message || "Errore durante l'eliminazione dell'asset");
      setDeleteId(null);
    },
  });

  const syncAssetMutation = useMutation({
    mutationFn: (id: number) => syncAssetEuronext(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("assets.sync_euronext_success", "Dati obbligazione aggiornati con successo da Euronext"));
    },
    onError: (err: Error) => {
      toast.error(`Errore sincronizzazione: ${err.message}`);
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
                      {asset.instrument_type === "bond" && (
                        <button
                          onClick={() => syncAssetMutation.mutate(asset.id)}
                          disabled={syncAssetMutation.isPending}
                          className="rounded bg-teal-500 p-1.5 text-slate-950 hover:bg-teal-400 disabled:opacity-50"
                          title={t("assets.sync_euronext", "Sincronizza con Euronext")}
                          aria-label={t("assets.sync_euronext", "Sincronizza con Euronext")}
                        >
                          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${syncAssetMutation.isPending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                        </button>
                      )}
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
                type="button"
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {deleteMutation.isPending ? t("assets.saving", "Eliminazione...") : t("assets.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
