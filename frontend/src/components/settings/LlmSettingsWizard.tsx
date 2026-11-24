import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { analysisApi, api, LlmConfig, TestLlmResult } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";

interface UserPreferencesResponse {
  preferences?: {
    llm_config?: LlmConfig;
    [key: string]: unknown;
  };
}

interface ProviderPreset {
  id: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama" | "mock";
  titleKey: string;
  badgeKey?: string;
  badgeColor?: string;
  descKey: string;
  linkKey?: string;
  linkUrl?: string;
  defaultBaseUrl?: string;
  requiresKey: boolean;
  allowsKey?: boolean;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: "gemini",
    titleKey: "settings.llm.gemini_title",
    descKey: "settings.llm.gemini_desc",
    linkKey: "settings.llm.gemini_link",
    linkUrl: "https://aistudio.google.com/app/apikey",
    requiresKey: true,
    allowsKey: true,
  },
  {
    id: "openai",
    titleKey: "settings.llm.openai_title",
    descKey: "settings.llm.openai_desc",
    linkKey: "settings.llm.openai_link",
    linkUrl: "https://platform.openai.com/api-keys",
    requiresKey: true,
    allowsKey: true,
  },
  {
    id: "anthropic",
    titleKey: "settings.llm.anthropic_title",
    descKey: "settings.llm.anthropic_desc",
    linkKey: "settings.llm.anthropic_link",
    linkUrl: "https://console.anthropic.com/settings/keys",
    requiresKey: true,
    allowsKey: true,
  },
  {
    id: "openrouter",
    titleKey: "settings.llm.openrouter_title",
    descKey: "settings.llm.openrouter_desc",
    linkKey: "settings.llm.openrouter_link",
    linkUrl: "https://openrouter.ai/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    allowsKey: true,
  },
  {
    id: "ollama",
    titleKey: "settings.llm.ollama_title",
    badgeKey: "settings.llm.ollama_badge",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    descKey: "settings.llm.ollama_desc",
    linkKey: "settings.llm.ollama_link",
    linkUrl: "https://ollama.com",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    allowsKey: true,
  },
  {
    id: "mock",
    titleKey: "settings.llm.mock_title",
    badgeKey: "settings.llm.mock_badge",
    badgeColor: "bg-slate-700/40 text-slate-300 border-slate-600/40",
    descKey: "settings.llm.mock_desc",
    requiresKey: false,
    allowsKey: false,
  },
];

export function LlmSettingsWizard() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: prefData, isLoading: isLoadingPrefs } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: () => api<UserPreferencesResponse>("/api/auth/preferences"),
  });

  const savedConfig = prefData?.preferences?.llm_config;

  const [provider, setProvider] = useState<"gemini" | "openai" | "anthropic" | "openrouter" | "ollama" | "mock">("gemini");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestLlmResult | null>(null);

  // Sync state once preferences are loaded (without hydrating api_key into plain text state)
  useEffect(() => {
    if (savedConfig) {
      if (savedConfig.provider) setProvider(savedConfig.provider);
      if (savedConfig.model) setModel(savedConfig.model);
      setApiKey("");
      if (savedConfig.base_url) {
        setBaseUrl(savedConfig.base_url);
        setShowAdvanced(true);
      }
    }
  }, [savedConfig]);

  const hasSavedKeyForProvider = Boolean(savedConfig?.api_key && savedConfig.provider === provider);
  const activeProviderDef = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

  const handleProviderSelect = (newProvId: "gemini" | "openai" | "anthropic" | "openrouter" | "ollama" | "mock") => {
    setProvider(newProvId);
    setTestResult(null);
    setApiKey("");
    const def = PROVIDERS.find((p) => p.id === newProvId);
    if (def?.defaultBaseUrl && !baseUrl) {
      setBaseUrl(def.defaultBaseUrl);
    }
  };

  const handleTestConnection = async () => {
    if (provider !== "mock" && !model.trim()) {
      toast.error(t("settings.llm.model_required"));
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const effectiveKey = apiKey.trim() || (hasSavedKeyForProvider ? savedConfig?.api_key : undefined);
      const res = await analysisApi.testLlm({
        provider,
        model: model.trim() || undefined,
        api_key: effectiveKey,
        base_url: baseUrl.trim() || undefined,
      });
      setTestResult(res);
      if (res.success) {
        toast.success(`${t("settings.llm.test_success")} (${res.latency_ms ?? 0} ms)`);
      } else {
        toast.error(res.error || res.message || t("settings.llm.test_failed"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        success: false,
        message: t("settings.llm.test_failed"),
        error: msg,
      });
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (newCfg: LlmConfig | null) =>
      api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: {
            llm_config: newCfg,
          },
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-preferences"] });
      toast.success(t("settings.llm.save_success"));
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : t("settings.llm.save_error");
      toast.error(msg);
    },
  });

  const handleSave = () => {
    if (provider !== "mock" && !model.trim()) {
      toast.error(t("settings.llm.model_required"));
      return;
    }
    const effectiveKey = apiKey.trim()
      ? apiKey.trim()
      : hasSavedKeyForProvider
      ? savedConfig?.api_key
      : undefined;

    const payload: LlmConfig = {
      provider,
      model: model.trim() || undefined,
      api_key: effectiveKey,
      base_url: baseUrl.trim() || undefined,
    };
    saveMutation.mutate(payload);
  };

  const handleReset = () => {
    if (window.confirm(t("settings.llm.reset_confirm"))) {
      saveMutation.mutate(null);
      setProvider("gemini");
      setModel("");
      setApiKey("");
      setBaseUrl("");
      setTestResult(null);
      toast.info(t("settings.llm.reset_success"));
    }
  };

  if (isLoadingPrefs) {
    return (
      <section className="card p-6">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span>{t("common.loading")}</span>
        </div>
      </section>
    );
  }

  return (
    <section id="llm-settings" className="card border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-bold shadow-inner">
              ⚡
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">{t("settings.llm.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">{t("settings.llm.description")}</p>
        </div>
        {savedConfig && (
          <span className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            ✓ Configurazione Utente Attiva ({savedConfig.provider})
          </span>
        )}
      </div>

      {/* Provider Selection Grid */}
      <div className="mt-6">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.llm.provider_label")}
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {PROVIDERS.map((p) => {
            const isSelected = provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderSelect(p.id)}
                className={`relative flex flex-col justify-between rounded-xl p-4 text-left transition-all ${
                  isSelected
                    ? "border-2 border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500/50"
                    : "border border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-850/60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-slate-100">{t(p.titleKey)}</span>
                    {p.badgeKey && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${p.badgeColor}`}>
                        {t(p.badgeKey)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{t(p.descKey)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{isSelected ? t("settings.llm.selected") : t("settings.llm.select")}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider Details & Credentials Form */}
      <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/50 p-5 space-y-4">
        {/* Model Input */}
        {provider !== "mock" ? (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t("settings.llm.model_label")}
              </label>
              {activeProviderDef.linkUrl && (
                <a
                  href={activeProviderDef.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline"
                >
                  <span>{activeProviderDef.linkKey ? t(activeProviderDef.linkKey) : "Console API"}</span>
                  <span className="text-[10px]">↗</span>
                </a>
              )}
            </div>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("settings.llm.model_placeholder")}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("settings.llm.model_hint")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            {t("settings.llm.mock_info")}
          </div>
        )}

        {/* API Key Field (if required or allowed by provider) */}
        {(activeProviderDef.requiresKey || activeProviderDef.allowsKey) && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t("settings.llm.api_key_label")}
                {!activeProviderDef.requiresKey && (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    ({t("settings.llm.optional_for_ollama")})
                  </span>
                )}
              </label>
            </div>
            <div className="relative mt-2">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasSavedKeyForProvider && !apiKey
                    ? "•••••••• (configurata)"
                    : activeProviderDef.requiresKey
                    ? t("settings.llm.api_key_placeholder")
                    : t("settings.llm.api_key_placeholder_local")
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 pr-10 pl-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Nascondi chiave" : "Mostra chiave"}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
              >
                {showKey ? "🔒" : "👁️"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
              <span>🛡️</span> {t("settings.llm.api_key_hint")}
            </p>
          </div>
        )}

        {/* Base URL (Shown automatically for Ollama, toggleable for others) */}
        {(provider === "ollama" || showAdvanced) && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t("settings.llm.base_url_label")}
              </label>
              {provider === "ollama" && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="text-slate-400">Predefiniti:</span>
                  <button
                    type="button"
                    onClick={() => setBaseUrl("http://host.docker.internal:8000/v1")}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-400 hover:bg-slate-700 font-mono"
                  >
                    host:8000/v1
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseUrl("http://host.docker.internal:11434/v1")}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-purple-400 hover:bg-slate-700 font-mono"
                  >
                    host:11434/v1
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseUrl("http://127.0.0.1:8000/v1")}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 font-mono"
                  >
                    127.0.0.1:8000/v1
                  </button>
                </div>
              )}
            </div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={activeProviderDef.defaultBaseUrl || t("settings.llm.base_url_placeholder")}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {t("settings.llm.base_url_hint")}{" "}
              <span className="text-slate-300 font-medium">{t("settings.llm.docker_note")}</span>
            </p>
          </div>
        )}

        {provider !== "ollama" && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              {showAdvanced ? "▲ Nascondi Base URL personalizzato" : "▼ Configura Base URL / Proxy personalizzato"}
            </button>
          </div>
        )}

        {/* Live Test Results Alert */}
        {testResult && (
          <div
            className={`rounded-lg border p-3.5 text-sm transition-all ${
              testResult.success
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{testResult.success ? "✓" : "✕"}</span>
                <span className="font-semibold">{testResult.message}</span>
              </div>
              {testResult.latency_ms !== null && testResult.latency_ms !== undefined && (
                <span className="font-mono text-xs opacity-80">
                  {t("settings.llm.test_latency")} {testResult.latency_ms} ms
                </span>
              )}
            </div>
            {testResult.error && (
              <p className="mt-2 font-mono text-xs text-rose-300/90 whitespace-pre-wrap break-all bg-rose-950/40 p-2 rounded border border-rose-800/40">
                {testResult.error}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors disabled:opacity-50"
            >
              <span>{isTesting ? "⏳" : "🔌"}</span>
              <span>{isTesting ? t("settings.llm.testing") : t("settings.llm.test_connection")}</span>
            </button>

            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-900/30 transition-all disabled:opacity-50"
            >
              <span>💾</span>
              <span>{saveMutation.isPending ? t("settings.llm.saving") : t("settings.llm.save")}</span>
            </button>
          </div>

          {savedConfig && (
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={handleReset}
              className="text-xs text-rose-400 hover:text-rose-300 underline transition-colors"
            >
              {t("settings.llm.reset_default")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
