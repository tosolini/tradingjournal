import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  api,
  analysisApi,
  AnalysisReportDetail,
  AnalysisReportSummary,
  AnalysisTargetItem,
  LlmConfig,
  Ticker,
  tickersApi,
} from "../lib/api";
import { ReportViewer } from "../components/analysis/ReportViewer";
import { AnalysisHistoryView } from "../components/analysis/AnalysisHistoryView";
import { useToast } from "../contexts/ToastContext";
import { SearchIcon } from "../components/icons";

export const AnalysisPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const dateLocale = (i18n.resolvedLanguage || i18n.language || "en").startsWith("it") ? "it-IT" : "en-US";

  // Report language automatically inherits user base preference from settings
  const appLanguage: "it" | "en" = (i18n.resolvedLanguage || i18n.language || "en")
    .slice(0, 2)
    .toLowerCase() === "en"
    ? "en"
    : "it";

  const [inputMode, setInputMode] = useState<"existing" | "custom" | "history">("existing");
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [customSymbol, setCustomSymbol] = useState<string>("");
  const [customMarket, setCustomMarket] = useState<string>("NASDAQ");
  const [selectedDbTicker, setSelectedDbTicker] = useState<Ticker | null>(null);
  const [tickerSuggestions, setTickerSuggestions] = useState<Ticker[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSearchingTickers, setIsSearchingTickers] = useState<boolean>(false);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectForReanalysis = (symbol: string, market?: string) => {
    setInputMode("custom");
    setCustomSymbol(symbol);
    if (market) setCustomMarket(market);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCustomSymbolChange = (value: string) => {
    setCustomSymbol(value);
    setSelectedDbTicker(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      setIsSearchingTickers(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await tickersApi.search(trimmed, 8);
          setTickerSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch {
          setTickerSuggestions([]);
        } finally {
          setIsSearchingTickers(false);
        }
      }, 250);
    } else {
      setTickerSuggestions([]);
      setShowSuggestions(false);
      setIsSearchingTickers(false);
    }
  };

  const handleSelectTicker = (ticker: Ticker) => {
    setCustomSymbol(ticker.symbol);
    if (ticker.market) {
      setCustomMarket(ticker.market);
    }
    setSelectedDbTicker(ticker);
    setShowSuggestions(false);
  };

  // 1. Fetch eligible targets
  const { data: targets = [], isLoading: targetsLoading } = useQuery<AnalysisTargetItem[]>({
    queryKey: ["analysisTargets"],
    queryFn: analysisApi.getTargets,
  });

  // Fetch user LLM preferences to check if running in Mock mode
  const { data: prefData } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: () => api<{ preferences?: { llm_config?: LlmConfig } }>("/api/auth/preferences"),
  });
  const isMockProvider = prefData?.preferences?.llm_config?.provider === "mock";

  // 2. Fetch history
  const { data: history = [], isLoading: historyLoading } = useQuery<AnalysisReportSummary[]>({
    queryKey: ["analysisHistory"],
    queryFn: () => analysisApi.getHistory(),
  });

  // Check URL query parameters (e.g. ?symbol=NVDA&market=NASDAQ&tradeId=5)
  useEffect(() => {
    const querySymbol = searchParams.get("symbol");
    const queryMarket = searchParams.get("market");
    const queryTradeId = searchParams.get("tradeId");

    if (querySymbol) {
      if (queryTradeId && targets.length > 0) {
        const found = targets.find((t) => t.trade_id === Number(queryTradeId));
        if (found) {
          setInputMode("existing");
          setSelectedTargetKey(`trade:${found.trade_id}`);
          return;
        }
      }
      setInputMode("custom");
      setCustomSymbol(querySymbol.toUpperCase());
      if (queryMarket) setCustomMarket(queryMarket);
    }
  }, [searchParams, targets]);

  // Select first target by default once loaded
  useEffect(() => {
    if (targets.length > 0 && !selectedTargetKey && inputMode === "existing") {
      const firstTarget = targets[0];
      const key = firstTarget.target_source === "trade"
        ? `trade:${firstTarget.trade_id}`
        : `${firstTarget.target_source}:${firstTarget.symbol}`;
      setSelectedTargetKey(key);
    }
  }, [targets, selectedTargetKey, inputMode]);

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
      toast.success(t("analysis.toasts.run_success", { symbol: newReport.symbol }));
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      setActiveReportId(newReport.id);
    },
    onError: (err: any) => {
      toast.error(err.message || t("analysis.toasts.run_error"));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: analysisApi.delete,
    onSuccess: () => {
      toast.info(t("analysis.toasts.delete_success"));
      queryClient.invalidateQueries({ queryKey: ["analysisHistory"] });
      setActiveReportId(null);
    },
  });

  const handleStartAnalysis = () => {
    if (inputMode === "custom") {
      if (!customSymbol.trim()) {
        toast.error(t("analysis.toasts.invalid_symbol"));
        return;
      }
      runMutation.mutate({
        symbol: customSymbol.trim().toUpperCase(),
        market: customMarket,
        language: appLanguage,
      });
      return;
    }

    if (!selectedTargetKey) return;
    const [source, idOrSymbol] = selectedTargetKey.split(":");
    let target: AnalysisTargetItem | undefined;

    if (source === "trade") {
      target = targets.find((t) => t.target_source === "trade" && String(t.trade_id) === idOrSymbol);
    } else {
      target = targets.find((t) => t.target_source === source && t.symbol === idOrSymbol);
    }

    if (!target) return;

    runMutation.mutate({
      symbol: target.symbol,
      market: target.market,
      holding_id: target.holding_id,
      trade_idea_id: target.trade_idea_id,
      trade_id: target.trade_id,
      language: appLanguage,
    });
  };

  const selectedTarget = targets.find((t) => {
    if (t.target_source === "trade") return `trade:${t.trade_id}` === selectedTargetKey;
    return `${t.target_source}:${t.symbol}` === selectedTargetKey;
  });

  const openTrades = targets.filter((t) => t.target_source === "trade");
  const holdings = targets.filter((t) => t.target_source === "holding");
  const tradeIdeas = targets.filter((t) => t.target_source === "trade_idea");

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <span>🤖</span> {t("analysis.page_title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("analysis.page_subtitle")}
        </p>
      </div>

      {/* Mock Mode Notice Banner */}
      {isMockProvider && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🧪</span>
            <span>
              <strong>{t("analysis.mock_banner_title")}</strong> {t("analysis.mock_banner_text")}
            </span>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors"
          >
            <span>Configura Provider AI (Gemini, Claude, OpenAI, Ollama)</span>
            <span>→</span>
          </Link>
        </div>
      )}

      {/* Control Panel: Target Selection & Run Trigger */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        {/* Segmented Mode Selector Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-950/80 border border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setInputMode("existing")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                inputMode === "existing"
                  ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📁 {t("analysis.modes.existing_assets")}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-slate-300 font-mono">
                {targets.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode("custom")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                inputMode === "custom"
                  ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🔍 {t("analysis.modes.custom_ticker")}</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode("history")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                inputMode === "history"
                  ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700/60"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📜 {t("analysis.modes.history_archive")}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-slate-300 font-mono">
                {history.length}
              </span>
            </button>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline font-medium">
            {inputMode === "existing"
              ? t("analysis.modes.existing_hint")
              : inputMode === "custom"
              ? t("analysis.modes.custom_hint")
              : t("analysis.modes.history_hint")}
          </span>
        </div>

        {/* Input & Action Grid - Hidden when in History tab */}
        {inputMode === "existing" ? (
          /* Existing Mode: 8/9 cols for select, 4/3 cols for button */
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-8 lg:col-span-9">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 h-4 flex items-center gap-1.5">
                  <span>{t("analysis.existing.select_label")}</span>
                </label>
                {targetsLoading ? (
                  <div className="h-11 bg-slate-800 animate-pulse rounded-xl" />
                ) : targets.length === 0 ? (
                  <div className="h-11 flex items-center px-4 rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
                    {t("analysis.existing.empty")}
                  </div>
                ) : (
                  <div className="h-11 rounded-xl border border-slate-700/80 bg-slate-950/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all flex items-center px-3.5">
                    <span className="text-slate-400 mr-2.5 text-sm shrink-0">📁</span>
                    <select
                      value={selectedTargetKey}
                      onChange={(e) => setSelectedTargetKey(e.target.value)}
                      className="w-full bg-transparent border-0 p-0 text-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-0 cursor-pointer"
                    >
                      {openTrades.length > 0 && (
                        <optgroup label={t("analysis.existing.group_trades")}>
                          {openTrades.map((tItem) => (
                            <option key={`trade:${tItem.trade_id}`} value={`trade:${tItem.trade_id}`} className="bg-slate-900 text-white">
                              {tItem.symbol} — {tItem.side?.toUpperCase()} #{tItem.trade_id} ({tItem.quantity ? `${Number(tItem.quantity)} ${t("analysis.existing.pcs")}` : ""}{tItem.avg_cost ? ` @ €${Number(tItem.avg_cost).toFixed(2)}` : ""})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {holdings.length > 0 && (
                        <optgroup label={t("analysis.existing.group_holdings")}>
                          {holdings.map((tItem) => (
                            <option key={`holding:${tItem.symbol}`} value={`holding:${tItem.symbol}`} className="bg-slate-900 text-white">
                              {tItem.symbol} — {tItem.name} ({tItem.quantity ? `${Number(tItem.quantity)} ${t("analysis.existing.pcs")}` : ""})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {tradeIdeas.length > 0 && (
                        <optgroup label={t("analysis.existing.group_trade_ideas")}>
                          {tradeIdeas.map((tItem) => (
                            <option key={`trade_idea:${tItem.symbol}`} value={`trade_idea:${tItem.symbol}`} className="bg-slate-900 text-white">
                              {tItem.symbol} ({t("analysis.existing.scouting_setup")})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>

              <div className="md:col-span-4 lg:col-span-3">
                <div className="h-4 hidden md:block mb-1.5" />
                <button
                  type="button"
                  onClick={handleStartAnalysis}
                  disabled={runMutation.isPending || targets.length === 0}
                  className="w-full h-11 px-5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-[0.99]"
                >
                  {runMutation.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{t("analysis.actions.running")}</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform">🚀</span>
                      <span>{t("analysis.actions.generate")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selected Target Information Strip */}
            {selectedTarget && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/40 border border-slate-800">
                  <span className="font-semibold text-white">{selectedTarget.symbol}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-300">{selectedTarget.name}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                    {selectedTarget.market}
                  </span>
                </div>
                {selectedTarget.target_source === "trade" && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
                    {t("analysis.existing.market_position_badge", {
                      side: selectedTarget.side?.toUpperCase(),
                      id: selectedTarget.trade_id,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : inputMode === "custom" ? (
          /* Custom Mode: 5 cols for ticker, 4 cols for market, 3 cols for button */
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Col 1: Ticker Input */}
              <div ref={autocompleteRef} className="md:col-span-5 relative">
                <div className="flex items-center justify-between mb-1.5 h-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t("analysis.custom.symbol_label")}
                  </label>
                  {isSearchingTickers && (
                    <span className="text-[10px] text-teal-400 font-mono animate-pulse flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-ping" />
                      {t("analysis.custom.searching")}
                    </span>
                  )}
                </div>

                <div className="h-11 rounded-xl border border-slate-700/80 bg-slate-950/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all flex items-center px-3.5">
                  <SearchIcon className="h-4 w-4 text-slate-400 shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={customSymbol}
                    onChange={(e) => handleCustomSymbolChange(e.target.value.toUpperCase())}
                    onFocus={() => {
                      if (tickerSuggestions.length > 0) setShowSuggestions(true);
                    }}
                    placeholder={t("analysis.custom.symbol_placeholder")}
                    autoComplete="off"
                    className="w-full bg-transparent border-0 p-0 text-white font-mono text-xs sm:text-sm uppercase placeholder:text-slate-500 placeholder:font-sans focus:outline-none focus:ring-0"
                  />
                  {customSymbol && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomSymbol("");
                        setSelectedDbTicker(null);
                        setTickerSuggestions([]);
                        setShowSuggestions(false);
                      }}
                      className="text-slate-500 hover:text-slate-300 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown from Internal DB */}
                {showSuggestions && tickerSuggestions.length > 0 && (
                  <ul className="absolute left-0 top-full z-50 mt-1.5 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl divide-y divide-slate-800/80">
                    {tickerSuggestions.map((tk) => (
                      <li
                        key={tk.id}
                        onMouseDown={() => handleSelectTicker(tk)}
                        className="flex cursor-pointer items-baseline justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-800/80 transition-colors"
                      >
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono font-bold text-teal-400 text-sm shrink-0">
                            {tk.symbol}
                          </span>
                          <span className="truncate text-xs text-slate-300">
                            {tk.name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase font-semibold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">
                          {tk.market}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Col 2: Market Selector */}
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 h-4">
                  {t("analysis.custom.market_label")}
                </label>
                <div className="h-11 rounded-xl border border-slate-700/80 bg-slate-950/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all flex items-center px-3">
                  <span className="text-slate-400 mr-2 text-sm shrink-0">🌐</span>
                  <select
                    value={customMarket}
                    onChange={(e) => setCustomMarket(e.target.value)}
                    className="w-full bg-transparent border-0 p-0 text-white text-xs sm:text-sm font-medium focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    <option value="NASDAQ" className="bg-slate-900 text-white">{t("analysis.markets.nasdaq")}</option>
                    <option value="NYSE" className="bg-slate-900 text-white">{t("analysis.markets.nyse")}</option>
                    <option value="Euronext Milan" className="bg-slate-900 text-white">{t("analysis.markets.milan")}</option>
                    <option value="Euronext Growth Milan" className="bg-slate-900 text-white">{t("analysis.markets.growth_milan")}</option>
                    <option value="Euronext Global Equity Market" className="bg-slate-900 text-white">{t("analysis.markets.gem")}</option>
                    <option value="EuroTLX" className="bg-slate-900 text-white">{t("analysis.markets.eurotlx")}</option>
                    <option value="Euronext Paris" className="bg-slate-900 text-white">{t("analysis.markets.paris")}</option>
                    <option value="Euronext Amsterdam" className="bg-slate-900 text-white">{t("analysis.markets.amsterdam")}</option>
                    <option value="Xetra" className="bg-slate-900 text-white">{t("analysis.markets.xetra")}</option>
                    <option value="London" className="bg-slate-900 text-white">{t("analysis.markets.london")}</option>
                    {![
                      "NASDAQ",
                      "NYSE",
                      "Euronext Milan",
                      "Euronext Growth Milan",
                      "Euronext Global Equity Market",
                      "EuroTLX",
                      "Euronext Paris",
                      "Euronext Amsterdam",
                      "Xetra",
                      "London",
                    ].includes(customMarket) && (
                      <option value={customMarket} className="bg-slate-900 text-white">{customMarket}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Col 3: Action Button */}
              <div className="md:col-span-3">
                <div className="h-4 hidden md:block mb-1.5" />
                <button
                  type="button"
                  onClick={handleStartAnalysis}
                  disabled={runMutation.isPending || !customSymbol.trim()}
                  className="w-full h-11 px-5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-[0.99]"
                >
                  {runMutation.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{t("analysis.actions.running")}</span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:scale-110 transition-transform">🚀</span>
                      <span>{t("analysis.actions.generate")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selected DB Ticker Metadata Pill */}
            {selectedDbTicker && (
              <div className="flex items-center gap-2 pt-1 text-xs text-slate-400 animate-fade-in">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  <span className="font-mono font-bold">{selectedDbTicker.symbol}</span>
                  <span className="text-slate-400">•</span>
                  <span className="truncate max-w-[280px]">{selectedDbTicker.name}</span>
                  <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                    {selectedDbTicker.market}
                  </span>
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  {t("analysis.custom.verified_db_ticker")}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Main Content Area: Dedicated History View OR Full-Width Active Report Display */}
      {inputMode === "history" ? (
        <AnalysisHistoryView
          onSelectForReanalysis={handleSelectForReanalysis}
          dateLocale={dateLocale}
        />
      ) : (
        <div className="w-full">
          {reportLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
              <div className="inline-block animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-sm text-slate-400">{t("analysis.display.loading")}</p>
            </div>
          ) : !activeReport ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
              <span className="text-4xl block mb-2">📊</span>
              <h3 className="text-lg font-bold text-white">{t("analysis.display.no_selection_title")}</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {t("analysis.display.no_selection_subtitle")}
              </p>
              {history.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setInputMode("history")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <span>📜 Sfoglia le {history.length} analisi nello storico</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          ) : activeReport.status === "pending" || activeReport.status === "running" ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
              <div className="inline-block animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" />
              <h3 className="text-lg font-bold text-white">{t("analysis.display.running_title")}</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {t("analysis.display.running_subtitle")}
              </p>
              <div className="text-xs font-mono text-slate-500">{t("analysis.display.running_refresh_hint")}</div>
            </div>
          ) : activeReport.status === "failed" ? (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-2xl p-10 text-center space-y-4">
              <span className="text-4xl block">⚠️</span>
              <h3 className="text-lg font-bold text-rose-400">{t("analysis.display.failed_title")}</h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                {activeReport.error_message || t("analysis.display.failed_default_message")}
              </p>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(activeReport.id)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl transition-colors cursor-pointer"
              >
                {t("analysis.display.remove_failed")}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <ReportViewer report={activeReport} />
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("analysis.display.confirm_delete"))) {
                      deleteMutation.mutate(activeReport.id);
                    }
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                >
                  {t("analysis.display.delete_report")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
