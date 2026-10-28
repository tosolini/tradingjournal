import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { PropsWithChildren, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { TradeCreateModal } from "./TradeCreateModal";
import { CommandPalette } from "./CommandPalette";
import { CreditsModal } from "./CreditsModal";
import { AlertsBellMenu } from "./AlertsBellMenu";
import { TradeModalPrefill } from "../lib/trade-modal-event";
import { fetchAccounts, getMe } from "../lib/api";
import packageJson from "../../package.json";
import bullVectLogo from "../assets/bull_vect.svg";
import tosoliniLogoLight from "../assets/tosolini-logo-light.png";
import tosoliniLogoDark from "../assets/tosolini-logo-dark.png";
import { useTheme } from "../contexts/ThemeContext";
import {
  ActivityIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarIcon,
  CoinsIcon,
  GlobeIcon,
  HelpCircleIcon,
  IconProps,
  LayoutDashboardIcon,
  MenuIcon,
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

export function Layout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeModalPrefill, setTradeModalPrefill] = useState<TradeModalPrefill | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Global keyboard shortcuts (Cmd+K for Command Palette, Esc for drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  // Listen for open-trade-create-modal event
  useEffect(() => {
    const handleOpenModal = (e: Event) => {
      const customEvent = e as CustomEvent<TradeModalPrefill | undefined>;
      setTradeModalPrefill(customEvent.detail || null);
      setIsTradeModalOpen(true);
    };
    window.addEventListener("open-trade-create-modal", handleOpenModal);
    return () => window.removeEventListener("open-trade-create-modal", handleOpenModal);
  }, []);


  type NavItem = {
    to: string;
    label: string;
    icon: (props: IconProps) => React.ReactElement;
    end?: boolean;
  };

  type NavGroup = {
    label?: string;
    items: NavItem[];
  };

  const navGroups: NavGroup[] = [
    {
      items: [
        { to: "/", label: t("layout.nav.dashboard"), icon: LayoutDashboardIcon, end: true },
        { to: "/calendar", label: t("layout.nav.calendar"), icon: CalendarIcon },
        { to: "/trades", label: t("layout.nav.trades"), icon: TrendingUpIcon },
        { to: "/notes", label: t("layout.nav.notes"), icon: BookOpenIcon },
        { to: "/help", label: t("layout.nav.help"), icon: HelpCircleIcon },
      ],
    },
    {
      label: t("layout.nav.section_investments"),
      items: [
        { to: "/portfolio", label: t("layout.nav.portfolio"), icon: PieChartIcon },
        { to: "/performance", label: t("layout.nav.performance"), icon: ActivityIcon },
        { to: "/assets", label: t("layout.nav.assets"), icon: CoinsIcon },
      ],
    },
    {
      label: t("layout.nav.section_settings"),
      items: [
        { to: "/accounts", label: t("layout.nav.accounts"), icon: WalletIcon },
        { to: "/brokers", label: t("layout.nav.brokers"), icon: Building2Icon },
        { to: "/tickers", label: t("layout.nav.tickers"), icon: SearchIcon },
        { to: "/settings", label: t("layout.nav.settings"), icon: SettingsIcon },
      ],
    },
  ];

  const appVersion = packageJson.version;
  const currentYear = new Date().getFullYear();
  const logoUrl = theme === "dark" ? tosoliniLogoLight : tosoliniLogoDark;

  const currentLang = i18n.resolvedLanguage === "it" ? "it" : "en";
  const toggleLanguage = () => {
    const next = currentLang === "it" ? "en" : "it";
    void i18n.changeLanguage(next);
  };

  const getPageTitle = () => {
    const p = location.pathname;
    if (p === "/" || p === "/dashboard") return t("layout.nav.dashboard");
    if (p.startsWith("/calendar")) return t("layout.nav.calendar");
    if (p.startsWith("/trades")) return t("layout.nav.trades");
    if (p.startsWith("/notes")) return t("layout.nav.notes");
    if (p.startsWith("/portfolio")) return t("layout.nav.portfolio");
    if (p.startsWith("/performance")) return t("layout.nav.performance");
    if (p.startsWith("/assets")) return t("layout.nav.assets");
    if (p.startsWith("/accounts")) return t("layout.nav.accounts");
    if (p.startsWith("/brokers")) return t("layout.nav.brokers");
    if (p.startsWith("/tickers")) return t("layout.nav.tickers");
    if (p.startsWith("/settings")) return t("layout.nav.settings");
    if (p.startsWith("/help")) return t("layout.nav.help");
    return "TradingJournal";
  };

  const renderNavLinks = (onItemClick?: () => void) => (
    <nav className="space-y-4">
      {navGroups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {group.label ? (
            <div className="mb-1.5 flex items-center gap-2 px-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </span>
              <div className="h-px flex-1 bg-slate-800 dark:bg-slate-200" />
            </div>
          ) : groupIndex > 0 ? (
            <div className="border-t border-slate-800/80 my-2 dark:border-slate-200" />
          ) : null}
          <div className="space-y-0.5">
            {group.items.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={onItemClick}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-teal-500/15 text-teal-300 font-semibold shadow-xs dark:bg-teal-50 dark:text-teal-900 border border-teal-500/30 dark:border-teal-300"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white dark:text-slate-700 dark:hover:bg-slate-100 dark:hover:text-slate-950"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                  <span className="truncate">{link.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="min-h-screen bg-slate-950 text-slate-100 dark:bg-slate-50 dark:text-slate-900">
        {/* ── Mobile Top Sticky Bar ────────────────────────────── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur md:hidden dark:border-slate-200 dark:bg-white/95">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800 hover:text-white active:scale-95 transition dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200"
              aria-label="Apri menu navigazione"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-base font-bold tracking-tight text-teal-300 dark:text-teal-800">
              <img src={bullVectLogo} alt="Bull logo" className="h-5 w-5 object-contain" />
              <span>TradingJournal</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 transition hover:text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700"
              title="Cerca o comandi (⌘K)"
              aria-label="Cerca o comandi"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            <AlertsBellMenu />
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-teal-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 active:scale-95"
            >
              <PlusIcon className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Trade</span>
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs font-bold text-slate-300 uppercase transition hover:text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700"
              title="Cambia lingua"
            >
              {currentLang}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 transition hover:text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700"
              title={theme === "dark" ? "Passa a tema chiaro" : "Passa a tema scuro"}
            >
              {theme === "dark" ? (
                <SunIcon className="h-4 w-4 text-amber-300" />
              ) : (
                <MoonIcon className="h-4 w-4 text-slate-700" />
              )}
            </button>
          </div>
        </header>

        {/* ── Mobile Sliding Drawer ───────────────────────────── */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-950 p-5 shadow-2xl dark:border-slate-200 dark:bg-white overflow-y-auto fade-up">
              <div className="mb-6 flex items-center justify-between pb-3 border-b border-slate-800 dark:border-slate-200">
                <div className="flex items-center gap-2 text-lg font-bold text-teal-300 dark:text-teal-800">
                  <img src={bullVectLogo} alt="Bull logo" className="h-6 w-6 object-contain" />
                  <span>TradingJournal</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-500 dark:hover:bg-slate-100"
                  aria-label="Chiudi menu navigazione"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {renderNavLinks(() => setIsMobileMenuOpen(false))}

              <div className="mt-6 border-t border-slate-800 pt-4 dark:border-slate-200 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsTradeModalOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow transition hover:bg-teal-400"
                >
                  <PlusIcon className="h-4 w-4 stroke-[2.5]" />
                  <span>{t("layout.actions.new_trade")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate("/notes?new=1");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-teal-500/50 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-teal-200 hover:bg-teal-500/10 dark:border-teal-600/40 dark:bg-slate-50 dark:text-teal-900 transition"
                >
                  <BookOpenIcon className="h-4 w-4" />
                  <span>{t("layout.actions.new_note")}</span>
                </button>
              </div>

              <div className="mt-auto border-t border-slate-800 pt-4 dark:border-slate-200 text-xs text-slate-400 dark:text-slate-500 text-center">
                <p>
                  v{appVersion} ·{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsCreditsModalOpen(true);
                    }}
                    className="hover:text-teal-400 dark:hover:text-teal-700 transition cursor-pointer underline underline-offset-2 decoration-dotted font-medium"
                  >
                    © {currentYear} Walter Tosolini
                  </button>
                </p>
              </div>
            </aside>
          </div>
        )}

        {/* ── Main Layout Grid ─────────────────────────────────── */}
        <div className="md:grid md:grid-cols-[250px_1fr]">
          {/* Desktop Persistent Sidebar */}
          <aside className="hidden md:flex flex-col border-r border-slate-800 bg-slate-950/80 p-5 backdrop-blur dark:border-slate-200 dark:bg-white sticky top-0 h-screen overflow-y-auto">
            {/* Logo */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-teal-300 dark:text-teal-800">
                <img src={bullVectLogo} alt="Bull logo" className="h-6 w-6 object-contain" />
                <span className="titlelogo">TradingJournal</span>
              </div>
              <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-300 dark:border-teal-600/30 dark:text-teal-800">
                v{appVersion}
              </span>
            </div>

            {/* Quick Command Search Button in Sidebar */}
            <button
              type="button"
              onClick={() => setIsCommandPaletteOpen(true)}
              className="mb-4 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition dark:border-slate-200 dark:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-200 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <SearchIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>{t("layout.search_short", "Cerca...")}</span>
              </div>
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.2 text-[10px] font-mono text-slate-400 dark:border-slate-300 dark:bg-slate-200 dark:text-slate-600">
                ⌘K
              </kbd>
            </button>

            {/* Navigation links */}
            <div className="flex-1 overflow-y-auto pr-1">
              {renderNavLinks()}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 border-t border-slate-800/80 pt-4 dark:border-slate-200 space-y-2">
              <button
                type="button"
                onClick={() => setIsTradeModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 active:scale-[0.98]"
              >
                <PlusIcon className="h-4 w-4 stroke-[2.5]" />
                <span>{t("layout.actions.new_trade")}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/notes?new=1")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-teal-500/50 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-teal-200 hover:bg-teal-500/10 dark:border-teal-600/40 dark:bg-slate-50 dark:text-teal-900 transition"
              >
                <BookOpenIcon className="h-4 w-4" />
                <span>{t("layout.actions.new_note")}</span>
              </button>
            </div>

            {/* Footer Controls */}
            <div className="mt-4 border-t border-slate-800/80 pt-4 dark:border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-600">
                {/* Language Toggle */}
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold uppercase hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100 transition"
                  title="Cambia lingua"
                >
                  <GlobeIcon className="h-3.5 w-3.5" />
                  <span>{currentLang}</span>
                </button>

                {/* Theme Toggle */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100 transition"
                  title={theme === "dark" ? "Passa a tema chiaro" : "Passa a tema scuro"}
                >
                  {theme === "dark" ? (
                    <>
                      <SunIcon className="h-3.5 w-3.5 text-amber-300" />
                      <span>Light</span>
                    </>
                  ) : (
                    <>
                      <MoonIcon className="h-3.5 w-3.5 text-slate-700" />
                      <span>Dark</span>
                    </>
                  )}
                </button>
              </div>

              {/* Logo & Credits */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <a
                  href="https://github.com/tosolini/tradingjournal/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-slate-300 dark:hover:text-slate-700"
                >
                  Bug Report
                </a>
                <button
                  type="button"
                  onClick={() => setIsCreditsModalOpen(true)}
                  className="hover:text-teal-400 dark:hover:text-teal-700 transition cursor-pointer underline underline-offset-2 decoration-dotted font-medium"
                  title="Informazioni e Credits"
                >
                  © {currentYear} W. Tosolini
                </button>
              </div>
            </div>
          </aside>

          {/* Desktop Content Area with Top Header */}
          <div className="flex flex-col min-h-screen min-w-0">
            <header className="hidden md:flex h-14 items-center justify-between border-b border-slate-800/60 bg-slate-950/40 px-6 backdrop-blur dark:border-slate-200/50 dark:bg-white/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 dark:text-slate-800 min-w-44">
                <span className="text-slate-500 dark:text-slate-400 font-normal">TradingJournal</span>
                <span className="text-slate-600 dark:text-slate-300">/</span>
                <span className="text-teal-300 dark:text-teal-800">{getPageTitle()}</span>
              </div>

              {/* Center Quick Search / Command Palette Trigger */}
              <div className="flex-1 max-w-sm px-4">
                <button
                  type="button"
                  onClick={() => setIsCommandPaletteOpen(true)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400 shadow-xs transition hover:border-teal-500/40 hover:bg-slate-900 hover:text-slate-200 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-500 dark:hover:border-teal-600/50 dark:hover:text-slate-900 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <SearchIcon className="h-3.5 w-3.5 text-slate-500 group-hover:text-teal-400 dark:text-slate-400 dark:group-hover:text-teal-700 transition-colors shrink-0" />
                    <span className="truncate">{t("layout.search_placeholder", "Cerca azioni, pagine o premi ⌘K...")}</span>
                  </div>
                  <kbd className="shrink-0 rounded border border-slate-700/80 bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shadow-2xs group-hover:border-teal-500/40 group-hover:text-teal-300 dark:border-slate-300 dark:bg-slate-200 dark:text-slate-600">
                    ⌘K
                  </kbd>
                </button>
              </div>

              {/* Right User & Actions */}
              <div className="flex items-center gap-3">
                {/* Account quick badge */}
                {accounts && accounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/accounts")}
                    className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
                    title="Gestione conti"
                  >
                    <WalletIcon className="h-3.5 w-3.5 text-teal-400 dark:text-teal-600" />
                    <span className="font-medium max-w-[120px] truncate">{accounts[0].name}</span>
                    {accounts.length > 1 && (
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400 dark:bg-slate-200 dark:text-slate-600">
                        +{accounts.length - 1}
                      </span>
                    )}
                  </button>
                )}

                {/* User Profile avatar pill */}
                {me && (
                  <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200 cursor-pointer"
                    title={`Profilo utente (${me.username})`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300 border border-teal-500/40 dark:bg-teal-100 dark:text-teal-800 dark:border-teal-300">
                      {(me.username?.[0] || "U").toUpperCase()}
                    </span>
                    <span className="font-medium hidden sm:inline max-w-[90px] truncate">{me.username}</span>
                  </button>
                )}
                <AlertsBellMenu />

                {/* New Trade Primary Button */}
                <button
                  type="button"
                  onClick={() => setIsTradeModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-xs transition hover:bg-teal-400 active:scale-95 cursor-pointer"
                >
                  <PlusIcon className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>{t("layout.actions.new_trade")}</span>
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>

      <TradeCreateModal
        open={isTradeModalOpen}
        onClose={() => {
          setIsTradeModalOpen(false);
          setTradeModalPrefill(null);
        }}
        initialValues={tradeModalPrefill}
      />
      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenNewTrade={() => setIsTradeModalOpen(true)}
        onOpenCredits={() => setIsCreditsModalOpen(true)}
      />
      <CreditsModal
        open={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
      />
    </>
  );
}
