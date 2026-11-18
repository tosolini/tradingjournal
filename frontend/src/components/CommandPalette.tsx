import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { analysisApi, AnalysisReportSummary, Ticker, tickersApi } from "../lib/api";
import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  Building2Icon,
  CalendarIcon,
  CoinsIcon,
  GlobeIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  MoonIcon,
  PieChartIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
} from "./icons";

type CommandCategory = "navigation" | "action" | "ticker" | "ai";

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenNewTrade: () => void;
  onOpenCredits?: () => void;
};

export function CommandPalette({ open, onClose, onOpenNewTrade, onOpenCredits }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tickerResults, setTickerResults] = useState<Ticker[]>([]);
  const [recentReports, setRecentReports] = useState<AnalysisReportSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open & fetch recent AI reports
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTickerResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);

      analysisApi
        .getHistory(undefined, 20)
        .then((data) => setRecentReports(data))
        .catch(() => setRecentReports([]));
    }
  }, [open]);

  // Search tickers with debounce when typing
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTickerResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await tickersApi.search(trimmed, 5);
        setTickerResults(results);
      } catch {
        setTickerResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const toggleLanguage = () => {
    const current = i18n.resolvedLanguage === "it" ? "it" : "en";
    void i18n.changeLanguage(current === "it" ? "en" : "it");
    onClose();
  };

  const staticCommands = useMemo<CommandItem[]>(() => {
    return [
      // Navigation
      {
        id: "nav-dashboard",
        title: t("layout.nav.dashboard"),
        subtitle: t("layout.command_palette.sub_dashboard"),
        category: "navigation",
        icon: LayoutDashboardIcon,
        onSelect: () => {
          navigate("/");
          onClose();
        },
      },
      {
        id: "nav-analysis",
        title: t("layout.nav.analysis"),
        subtitle: t("layout.command_palette.sub_analysis"),
        category: "navigation",
        icon: BotIcon,
        onSelect: () => {
          navigate("/analysis");
          onClose();
        },
      },
      {
        id: "nav-calendar",
        title: t("layout.nav.calendar"),
        subtitle: t("layout.command_palette.sub_calendar"),
        category: "navigation",
        icon: CalendarIcon,
        onSelect: () => {
          navigate("/calendar");
          onClose();
        },
      },
      {
        id: "nav-trades",
        title: t("layout.nav.trades"),
        subtitle: t("layout.command_palette.sub_trades"),
        category: "navigation",
        icon: TrendingUpIcon,
        onSelect: () => {
          navigate("/trades");
          onClose();
        },
      },
      {
        id: "nav-notes",
        title: t("layout.nav.notes"),
        subtitle: t("layout.command_palette.sub_notes"),
        category: "navigation",
        icon: BookOpenIcon,
        onSelect: () => {
          navigate("/notes");
          onClose();
        },
      },
      {
        id: "nav-portfolio",
        title: t("layout.nav.portfolio"),
        subtitle: t("layout.command_palette.sub_portfolio"),
        category: "navigation",
        icon: PieChartIcon,
        onSelect: () => {
          navigate("/portfolio");
          onClose();
        },
      },
      {
        id: "nav-performance",
        title: t("layout.nav.performance"),
        subtitle: t("layout.command_palette.sub_performance"),
        category: "navigation",
        icon: ActivityIcon,
        onSelect: () => {
          navigate("/performance");
          onClose();
        },
      },
      {
        id: "nav-assets",
        title: t("layout.nav.assets"),
        subtitle: t("layout.command_palette.sub_assets"),
        category: "navigation",
        icon: CoinsIcon,
        onSelect: () => {
          navigate("/assets");
          onClose();
        },
      },
      {
        id: "nav-accounts",
        title: t("layout.nav.accounts"),
        subtitle: t("layout.command_palette.sub_accounts"),
        category: "navigation",
        icon: WalletIcon,
        onSelect: () => {
          navigate("/accounts");
          onClose();
        },
      },
      {
        id: "nav-brokers",
        title: t("layout.nav.brokers"),
        subtitle: t("layout.command_palette.sub_brokers"),
        category: "navigation",
        icon: Building2Icon,
        onSelect: () => {
          navigate("/brokers");
          onClose();
        },
      },
      {
        id: "nav-settings",
        title: t("layout.nav.settings"),
        subtitle: t("layout.command_palette.sub_settings"),
        category: "navigation",
        icon: SettingsIcon,
        onSelect: () => {
          navigate("/settings");
          onClose();
        },
      },
      {
        id: "nav-help",
        title: t("layout.nav.help"),
        subtitle: t("layout.command_palette.sub_help"),
        category: "navigation",
        icon: HelpCircleIcon,
        onSelect: () => {
          navigate("/help");
          onClose();
        },
      },

      // Quick Actions
      {
        id: "act-new-analysis",
        title: t("layout.actions.new_analysis"),
        subtitle: t("layout.command_palette.act_new_analysis_sub"),
        category: "ai",
        icon: BotIcon,
        onSelect: () => {
          navigate("/analysis?mode=new");
          onClose();
        },
      },
      {
        id: "act-new-trade",
        title: t("layout.actions.new_trade"),
        subtitle: t("layout.command_palette.act_new_trade_sub"),
        category: "action",
        icon: PlusIcon,
        onSelect: () => {
          onClose();
          onOpenNewTrade();
        },
      },
      {
        id: "act-new-note",
        title: t("layout.actions.new_note"),
        subtitle: t("layout.command_palette.act_new_note_sub"),
        category: "action",
        icon: BookOpenIcon,
        onSelect: () => {
          navigate("/notes?new=1");
          onClose();
        },
      },
      {
        id: "act-llm-settings",
        title: t("layout.actions.llm_settings"),
        subtitle: t("layout.command_palette.act_llm_settings_sub"),
        category: "ai",
        icon: SettingsIcon,
        onSelect: () => {
          navigate("/settings#llm-settings");
          onClose();
        },
      },
      {
        id: "act-toggle-theme",
        title: theme === "dark" 
          ? t("layout.command_palette.act_light_theme") 
          : t("layout.command_palette.act_dark_theme"),
        subtitle: t("layout.command_palette.act_toggle_theme_sub"),
        category: "action",
        icon: theme === "dark" ? SunIcon : MoonIcon,
        onSelect: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "act-toggle-lang",
        title:
          i18n.resolvedLanguage === "it"
            ? t("layout.command_palette.act_switch_to_en")
            : t("layout.command_palette.act_switch_to_it"),
        subtitle: t("layout.command_palette.act_toggle_lang_sub"),
        category: "action",
        icon: GlobeIcon,
        onSelect: toggleLanguage,
      },
      {
        id: "act-credits",
        title: t("layout.command_palette.act_credits"),
        subtitle: t("layout.command_palette.act_credits_sub"),
        category: "action",
        icon: HelpCircleIcon,
        onSelect: () => {
          onClose();
          onOpenCredits?.();
        },
      },
    ];
  }, [t, i18n.resolvedLanguage, theme, navigate, onClose, onOpenNewTrade, onOpenCredits, toggleTheme]);

  // Filter commands by search term
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const staticMatches = q
      ? staticCommands.filter(
          (c) => c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q)
        )
      : staticCommands;

    const aiItems: CommandItem[] = [];

    // If typing at least 2 chars, offer quick action to analyze query symbol with AI
    if (q.length >= 2) {
      const upperQuery = q.toUpperCase();
      aiItems.push({
        id: `ai-run-query-${upperQuery}`,
        title: t("layout.command_palette.run_analysis_for", { symbol: upperQuery }),
        subtitle: t("layout.command_palette.run_analysis_for_sub"),
        category: "ai",
        icon: BotIcon,
        onSelect: () => {
          navigate(`/analysis?symbol=${encodeURIComponent(upperQuery)}&mode=new`);
          onClose();
        },
      });
    }

    // Matching recent reports
    const matchingReports = q
      ? recentReports.filter(
          (r) =>
            r.symbol.toLowerCase().includes(q) ||
            (r.market && r.market.toLowerCase().includes(q)) ||
            (r.status && r.status.toLowerCase().includes(q))
        )
      : recentReports.slice(0, 5); // Show up to 5 recent analyses when search is empty

    matchingReports.forEach((r) => {
      const scoreText = r.overall_score != null ? `Score: ${r.overall_score}/100` : "";
      const dateText = r.created_at ? new Date(r.created_at).toLocaleDateString() : "";
      const meta = [scoreText, dateText, r.market].filter(Boolean).join(" · ");

      aiItems.push({
        id: `ai-report-${r.id}`,
        title: `${r.symbol} (${t("layout.command_palette.ai_report_label")})`,
        subtitle: meta || t("layout.command_palette.sub_analysis"),
        category: "ai",
        icon: BotIcon,
        onSelect: () => {
          navigate(`/analysis/${r.id}`);
          onClose();
        },
      });
    });

    const tickerItems: CommandItem[] = tickerResults.map((ticker) => ({
      id: `ticker-${ticker.id}`,
      title: `${ticker.symbol} · ${ticker.name}`,
      subtitle: `${ticker.market || "Stock"} (${ticker.currency || "EUR"})`,
      category: "ticker",
      icon: SearchIcon,
      onSelect: () => {
        onClose();
        onOpenNewTrade();
      },
    }));

    if (q) {
      return [...aiItems, ...tickerItems, ...staticMatches];
    }

    return [...staticMatches, ...aiItems];
  }, [query, staticCommands, tickerResults, recentReports, t, navigate, onClose, onOpenNewTrade]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].onSelect();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredCommands, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-16 sm:pt-24 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl dark:border-slate-300 dark:bg-white overflow-hidden fade-up">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3.5 dark:border-slate-200">
          <SearchIcon className="h-5 w-5 text-teal-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t("layout.command_palette.placeholder")}
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none dark:text-slate-900 dark:placeholder-slate-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-slate-500 hover:text-slate-300 dark:hover:text-slate-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400 dark:bg-slate-100 dark:text-slate-600">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("layout.command_palette.no_results", { query })}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon;
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={cmd.onSelect}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isSelected
                        ? cmd.category === "ai"
                          ? "bg-purple-500/15 text-purple-200 dark:bg-purple-50 dark:text-purple-900 border border-purple-500/30 dark:border-purple-300"
                          : "bg-teal-500/15 text-teal-200 dark:bg-teal-50 dark:text-teal-900 border border-teal-500/30 dark:border-teal-300"
                        : "text-slate-300 hover:bg-slate-800/50 dark:text-slate-700 dark:hover:bg-slate-100"
                    }`}
                  >
                    <div
                      className={`rounded-lg p-2 shrink-0 ${
                        cmd.category === "ticker"
                          ? "bg-indigo-500/15 text-indigo-400 dark:bg-indigo-100 dark:text-indigo-800"
                          : cmd.category === "ai"
                          ? "bg-purple-500/15 text-purple-400 dark:bg-purple-100 dark:text-purple-800"
                          : cmd.category === "action"
                          ? "bg-teal-500/15 text-teal-400 dark:bg-teal-100 dark:text-teal-800"
                          : "bg-slate-800 text-slate-400 dark:bg-slate-100 dark:text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{cmd.title}</span>
                        {cmd.category === "ai" && (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 dark:bg-purple-100 dark:text-purple-800 dark:border-purple-200">
                            AI
                          </span>
                        )}
                      </div>
                      {cmd.subtitle && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {cmd.subtitle}
                        </div>
                      )}
                    </div>
                    <kbd className="hidden sm:inline-block rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:bg-slate-200 dark:text-slate-600">
                      ↵
                    </kbd>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-200 dark:bg-slate-50 dark:text-slate-600">
          <div className="flex items-center gap-3">
            <span>{t("layout.command_palette.nav_hint")}</span>
            <span>{t("layout.command_palette.select_hint")}</span>
            <span>{t("layout.command_palette.close_hint")}</span>
          </div>
          <span className="text-[10px] font-medium text-teal-400/80 dark:text-teal-700">
            TradingJournal Quick Command
          </span>
        </div>
      </div>
    </div>
  );
}
