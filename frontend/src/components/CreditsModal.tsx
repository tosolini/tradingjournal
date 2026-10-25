import { useEffect } from "react";
import packageJson from "../../package.json";
import bullVectLogo from "../assets/bull_vect.svg";
import { useTheme } from "../contexts/ThemeContext";
import {
  ExternalLinkIcon,
  GithubIcon,
  GlobeIcon,
  HelpCircleIcon,
  LinkedinIcon,
  XIcon,
} from "./icons";

const LIGHT_BG_LOGO_URL = "https://www.tosolini.info/wp-content/uploads/2021/01/tosolini-logo-200.png";
const DARK_BG_LOGO_URL = "https://www.tosolini.info/wp-content/uploads/2021/01/tosolini_nero_200.png";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreditsModal({ open, onClose }: Props) {
  const { theme } = useTheme();
  const currentYear = new Date().getFullYear();
  const appVersion = packageJson.version;
  const logoUrl = theme === "dark" ? LIGHT_BG_LOGO_URL : DARK_BG_LOGO_URL;

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const links = [
    {
      title: "Sito Personale",
      url: "https://www.tosolini.info",
      display: "www.tosolini.info",
      desc: "Blog, articoli, portfolio e approfondimenti tecnologici",
      icon: GlobeIcon,
      color: "text-teal-400 dark:text-teal-600",
    },
    {
      title: "Profilo GitHub",
      url: "https://github.com/tosolini",
      display: "github.com/tosolini",
      desc: "Repository open source, progetti e codice sorgente",
      icon: GithubIcon,
      color: "text-slate-300 dark:text-slate-800",
    },
    {
      title: "Profilo LinkedIn",
      url: "https://www.linkedin.com/in/waltertosolini/",
      display: "linkedin.com/in/waltertosolini",
      desc: "Esperienze professionali, contatti e networking",
      icon: LinkedinIcon,
      color: "text-sky-400 dark:text-sky-600",
    },
    {
      title: "Segnala un Bug o Richiesta",
      url: "https://github.com/tosolini/tradingjournal/issues",
      display: "github.com/tosolini/tradingjournal/issues",
      desc: "Issue tracker e roadmap di sviluppo per TradingJournal",
      icon: HelpCircleIcon,
      color: "text-amber-400 dark:text-amber-600",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl dark:border-slate-200 dark:bg-white text-slate-100 dark:text-slate-900 overflow-hidden fade-up">
        {/* Subtle top gradient accent */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-sky-500 to-indigo-500" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:text-slate-500 dark:hover:bg-slate-100 dark:hover:text-slate-900 transition cursor-pointer"
          aria-label="Chiudi"
        >
          <XIcon className="h-5 w-5" />
        </button>

        {/* Header with App Identity */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800/80 dark:border-slate-200/80">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 dark:bg-teal-50 dark:border-teal-200">
            <img src={bullVectLogo} alt="TradingJournal Logo" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 dark:text-slate-900">TradingJournal</h2>
              <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-2 py-0.2 text-[10px] font-semibold text-teal-300 dark:border-teal-300 dark:text-teal-800">
                v{appVersion}
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Sviluppato da <strong className="font-semibold text-slate-300 dark:text-slate-700">Walter Tosolini</strong>
            </p>
          </div>
        </div>

        {/* Previous Tosolini Logo Highlight */}
        <div className="my-5 flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 transition hover:border-slate-700 dark:border-slate-200 dark:bg-slate-50">
          <a
            href="https://www.tosolini.info"
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col items-center gap-2 transition hover:opacity-100"
            title="Visita www.tosolini.info"
          >
            <img
              src={logoUrl}
              alt="Logo Walter Tosolini"
              className="h-10 w-auto object-contain opacity-90 transition-transform duration-200 group-hover:scale-105 group-hover:opacity-100"
              loading="lazy"
            />
            <span className="text-[11px] font-medium text-slate-400 group-hover:text-teal-400 dark:text-slate-500 dark:group-hover:text-teal-700 transition">
              www.tosolini.info
            </span>
          </a>
        </div>

        {/* Links list */}
        <div className="space-y-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 transition hover:border-teal-500/40 hover:bg-slate-900/80 dark:border-slate-200 dark:bg-slate-50 dark:hover:border-teal-300 dark:hover:bg-slate-100"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 dark:bg-white dark:border-slate-200 shrink-0 ${link.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-teal-300 dark:text-slate-800 dark:group-hover:text-teal-700 transition">
                      {link.title}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {link.desc}
                    </div>
                  </div>
                </div>
                <ExternalLinkIcon className="h-3.5 w-3.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-teal-300 dark:text-slate-400 dark:group-hover:text-teal-700 shrink-0 ml-2" />
              </a>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 dark:border-slate-200/80 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span>© {currentYear} Walter Tosolini</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer dark:bg-slate-100 dark:text-slate-800 dark:hover:bg-slate-200"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
