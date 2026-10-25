import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { Ticker, tickersApi } from "../lib/api";
import {
  ActivityIcon,
  BookOpenIcon,
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

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  category: "navigation" | "action" | "ticker";
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTickerResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
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
        title: t("layout.nav.dashboard", "Dashboard"),
        subtitle: "Panoramica KPI, equity curve e statistiche",
        category: "navigation",
        icon: LayoutDashboardIcon,
        onSelect: () => {
          navigate("/");
          onClose();
        },
      },
      {
        id: "nav-calendar",
        title: t("layout.nav.calendar", "Calendario"),
        subtitle: "Calendario mensile con PnL giornaliero ed esecuzioni",
        category: "navigation",
        icon: CalendarIcon,
        onSelect: () => {
          navigate("/calendar");
          onClose();
        },
      },
      {
        id: "nav-trades",
        title: t("layout.nav.trades", "Trade"),
        subtitle: "Elenco e gestione di tutti i trade ed esecuzioni",
        category: "navigation",
        icon: TrendingUpIcon,
        onSelect: () => {
          navigate("/trades");
          onClose();
        },
      },
      {
        id: "nav-notes",
        title: t("layout.nav.notes", "Note"),
        subtitle: "Diario giornaliero di trading e psicologia",
        category: "navigation",
        icon: BookOpenIcon,
        onSelect: () => {
          navigate("/notes");
          onClose();
        },
      },
      {
        id: "nav-portfolio",
        title: t("layout.nav.portfolio", "Portafoglio"),
        subtitle: "Holdings di ETF e obbligazioni",
        category: "navigation",
        icon: PieChartIcon,
        onSelect: () => {
          navigate("/portfolio");
          onClose();
        },
      },
      {
        id: "nav-performance",
        title: t("layout.nav.performance", "Performance"),
        subtitle: "Analisi storica del valore e del rendimento",
        category: "navigation",
        icon: ActivityIcon,
        onSelect: () => {
          navigate("/performance");
          onClose();
        },
      },
      {
        id: "nav-assets",
        title: t("layout.nav.assets", "Asset"),
        subtitle: "Anagrafica ETF, obbligazioni e fondi",
        category: "navigation",
        icon: CoinsIcon,
        onSelect: () => {
          navigate("/assets");
          onClose();
        },
      },
      {
        id: "nav-accounts",
        title: t("layout.nav.accounts", "Conti"),
        subtitle: "Gestione conti trading e liquidità",
        category: "navigation",
        icon: WalletIcon,
        onSelect: () => {
          navigate("/accounts");
          onClose();
        },
      },
      {
        id: "nav-brokers",
        title: t("layout.nav.brokers", "Broker"),
        subtitle: "Configurazione broker, commissioni e mercati",
        category: "navigation",
        icon: Building2Icon,
        onSelect: () => {
          navigate("/brokers");
          onClose();
        },
      },
      {
        id: "nav-settings",
        title: t("layout.nav.settings", "Impostazioni"),
        subtitle: "Profilo utente, amministrazione e backup",
        category: "navigation",
        icon: SettingsIcon,
        onSelect: () => {
          navigate("/settings");
          onClose();
        },
      },
      {
        id: "nav-help",
        title: t("layout.nav.help", "Guida"),
        subtitle: "Manuale d'uso e documentazione",
        category: "navigation",
        icon: HelpCircleIcon,
        onSelect: () => {
          navigate("/help");
          onClose();
        },
      },

      // Quick Actions
      {
        id: "act-new-trade",
        title: t("layout.actions.new_trade", "Nuovo Trade"),
        subtitle: "Apri il form rapido o il wizard per registrare un trade",
        category: "action",
        icon: PlusIcon,
        onSelect: () => {
          onClose();
          onOpenNewTrade();
        },
      },
      {
        id: "act-new-note",
        title: t("layout.actions.new_note", "Nuova Nota"),
        subtitle: "Scrivi una nuova riflessione nel diario di trading",
        category: "action",
        icon: BookOpenIcon,
        onSelect: () => {
          navigate("/notes?new=1");
          onClose();
        },
      },
      {
        id: "act-toggle-theme",
        title: theme === "dark" ? "Passa a Tema Chiaro (Light Mode)" : "Passa a Tema Scuro (Dark Mode)",
        subtitle: "Inverti lo schema colore dell'interfaccia",
        category: "action",
        icon: theme === "dark" ? SunIcon : MoonIcon,
        onSelect: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "act-toggle-lang",
        title: i18n.resolvedLanguage === "it" ? "Switch to English" : "Passa all'Italiano",
        subtitle: "Cambia lingua dell'applicazione",
        category: "action",
        icon: GlobeIcon,
        onSelect: toggleLanguage,
      },
      {
        id: "act-credits",
        title: "Credits & Sviluppatore (Walter Tosolini)",
        subtitle: "Info sull'autore, link www.tosolini.info, GitHub e LinkedIn",
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

    return [...tickerItems, ...staticMatches];
  }, [query, staticCommands, tickerResults, onClose, onOpenNewTrade]);

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
            placeholder="Cerca comandi, pagine, ticker o azioni... (es. Trade, Note, AAPL)"
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
              Nessun comando o ticker trovato per &ldquo;{query}&rdquo;
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
                        ? "bg-teal-500/15 text-teal-200 dark:bg-teal-50 dark:text-teal-900 border border-teal-500/30 dark:border-teal-300"
                        : "text-slate-300 hover:bg-slate-800/50 dark:text-slate-700 dark:hover:bg-slate-100"
                    }`}
                  >
                    <div
                      className={`rounded-lg p-2 shrink-0 ${
                        cmd.category === "ticker"
                          ? "bg-indigo-500/15 text-indigo-400 dark:bg-indigo-100 dark:text-indigo-800"
                          : cmd.category === "action"
                          ? "bg-teal-500/15 text-teal-400 dark:bg-teal-100 dark:text-teal-800"
                          : "bg-slate-800 text-slate-400 dark:bg-slate-100 dark:text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{cmd.title}</div>
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
            <span>↑↓ Naviga</span>
            <span>↵ Seleziona</span>
            <span>ESC Chiudi</span>
          </div>
          <span className="text-[10px] font-medium text-teal-400/80 dark:text-teal-700">
            TradingJournal Quick Command
          </span>
        </div>
      </div>
    </div>
  );
}
