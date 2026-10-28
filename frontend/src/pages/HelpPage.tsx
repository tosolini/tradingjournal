import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarkdownPreview from "@uiw/react-markdown-preview";
import { useTheme } from "../contexts/ThemeContext";

// Import markdown files as raw strings via Vite ?raw suffix
import itDashboard from "../docs/it/dashboard.md?raw";
import itGettingStarted from "../docs/it/getting-started.md?raw";
import itTrades from "../docs/it/trades.md?raw";
import itNotes from "../docs/it/notes.md?raw";
import itAccounts from "../docs/it/accounts.md?raw";
import itTickers from "../docs/it/tickers.md?raw";
import itCalendar from "../docs/it/calendar.md?raw";
import itSettings from "../docs/it/settings.md?raw";
import enDashboard from "../docs/en/dashboard.md?raw";
import enGettingStarted from "../docs/en/getting-started.md?raw";
import enTrades from "../docs/en/trades.md?raw";
import enAccounts from "../docs/en/accounts.md?raw";
import enNotes from "../docs/en/notes.md?raw";
import enTickers from "../docs/en/tickers.md?raw";
import enCalendar from "../docs/en/calendar.md?raw";
import enSettings from "../docs/en/settings.md?raw";

type SectionDef = {
  id: string;
  labelKey: string;
  icon: string;
  it: string;
  en: string;
};

const SECTIONS: SectionDef[] = [
  { id: "getting-started", labelKey: "help.nav.getting_started", icon: "🚀", it: itGettingStarted, en: enGettingStarted },
  { id: "dashboard",       labelKey: "help.nav.dashboard",       icon: "📊", it: itDashboard,       en: enDashboard },
  { id: "trades",          labelKey: "help.nav.trades",          icon: "📈", it: itTrades,         en: enTrades },
  { id: "notes",           labelKey: "help.nav.notes",           icon: "🎯", it: itNotes,          en: enNotes },
  { id: "accounts",        labelKey: "help.nav.accounts",        icon: "🏦", it: itAccounts,       en: enAccounts },
  { id: "tickers",         labelKey: "help.nav.tickers",         icon: "🔍", it: itTickers,        en: enTickers },
  { id: "calendar",        labelKey: "help.nav.calendar",        icon: "📅", it: itCalendar,       en: enCalendar },
  { id: "settings",        labelKey: "help.nav.settings",        icon: "⚙️", it: itSettings,      en: enSettings },
];

export default function HelpPage() {
  const { t, i18n } = useTranslation();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const activeId = section && SECTIONS.find((s) => s.id === section) ? section : "getting-started";
  const active = SECTIONS.find((s) => s.id === activeId)!;

  // Pick content based on active language; fall back to English
  const lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const content = lang.startsWith("it") ? active.it : active.en;

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Reset mobile menu on section change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [activeId]);

  function goTo(id: string) {
    navigate(`/help/${id}`);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={[
          "flex-shrink-0 w-56 border-r border-slate-700 dark:border-slate-300 bg-slate-900/50 dark:bg-white/40",
          "flex flex-col gap-1 p-3 overflow-y-auto",
          // Mobile: hidden by default, shown when open
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-64 max-md:shadow-2xl",
          isMobileOpen ? "max-md:block" : "max-md:hidden",
        ].join(" ")}
      >
        <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("help.nav.title")}
        </p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => goTo(s.id)}
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors w-full",
              activeId === s.id
                ? "bg-teal-500/20 text-teal-300 dark:text-teal-700 font-semibold"
                : "text-slate-300 dark:text-slate-700 hover:bg-slate-800/50 dark:hover:bg-slate-200/50",
            ].join(" ")}
          >
            <span className="text-base leading-none">{s.icon}</span>
            <span>{t(s.labelKey)}</span>
          </button>
        ))}
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Content area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {/* Mobile header */}
        <div className="flex items-center gap-3 mb-6 md:hidden">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-300"
          >
            ☰ {t("help.nav.title")}
          </button>
          <span className="text-slate-400 text-sm">{active.icon} {t(active.labelKey)}</span>
        </div>

        {/* Markdown content */}
        <div className="max-w-3xl" data-color-mode={theme === "light" ? "light" : "dark"}>
          <MarkdownPreview
            source={content}
            style={{
              backgroundColor: "transparent",
              fontSize: "0.9375rem",
              lineHeight: "1.7",
            }}
            wrapperElement={{ "data-color-mode": theme === "light" ? "light" : "dark" }}
          />
        </div>
      </main>
    </div>
  );
}
