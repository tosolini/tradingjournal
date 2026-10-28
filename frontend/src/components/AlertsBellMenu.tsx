import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { tradeIdeasApi } from "../lib/api";
import { openTradeCreateModal } from "../lib/trade-modal-event";
import { BellIcon } from "./icons";

export function AlertsBellMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: alertsData } = useQuery({
    queryKey: ["trade-idea-alerts"],
    queryFn: () => tradeIdeasApi.getAlerts(),
    refetchInterval: 30000,
  });

  const alerts = alertsData?.items || [];
  const unreadCount = alertsData?.unread_count || 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleOpenTrade = (
    ideaId: number,
    symbol: string,
    direction: "long" | "short",
    triggerPrice: string,
    stopLoss?: string | null,
    targetPrice?: string | null,
  ) => {
    setIsOpen(false);
    openTradeCreateModal({
      tradeIdeaId: ideaId,
      symbol,
      direction,
      entryPrice: triggerPrice,
      stopLossPrice: stopLoss || undefined,
      targetPrice: targetPrice || undefined,
    });
  };

  const handleNavigateToScouting = () => {
    setIsOpen(false);
    navigate("/notes?tab=scouting");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-300 transition hover:text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-700 cursor-pointer"
        title={t("layout.alerts.title", "Notifiche e Alert Scouting")}
        aria-label={t("layout.alerts.title", "Notifiche e Alert Scouting")}
      >
        <BellIcon className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-2xl z-50 dark:border-slate-200 dark:bg-white text-slate-100 dark:text-slate-900 animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 dark:border-slate-200">
            <span className="text-xs font-bold text-slate-200 dark:text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-teal-400"></span>
              {t("layout.alerts.header", "Alert Scouting")}
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300 dark:bg-teal-100 dark:text-teal-800">
                {unreadCount} {t("layout.alerts.ready", "pronti")}
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {alerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "layout.alerts.empty",
                  "Nessun alert attivo. Le idee in osservazione appariranno qui quando raggiungeranno il prezzo trigger.",
                )}
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5 transition hover:border-teal-500/40 dark:border-slate-200 dark:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-slate-100 dark:text-slate-900">
                        {alert.symbol}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase ${
                          alert.direction === "long"
                            ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                            : "bg-rose-500/20 text-rose-300 dark:bg-rose-100 dark:text-rose-800"
                        }`}
                      >
                        {alert.direction}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenTrade(
                          alert.id,
                          alert.symbol,
                          alert.direction,
                          alert.trigger_price,
                          alert.stop_loss,
                          alert.target_price,
                        )
                      }
                      className="rounded bg-teal-500 px-2 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-teal-400 cursor-pointer shadow-xs"
                    >
                      {t("layout.alerts.create_trade", "⚡ Trade")}
                    </button>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      Trigger:{" "}
                      <strong className="text-slate-200 dark:text-slate-800">
                        {alert.trigger_price} €
                      </strong>
                    </span>
                    {alert.triggered_price && (
                      <span className="text-[11px]">
                        Rilevato: {alert.triggered_price} €
                      </span>
                    )}
                  </div>
                  {alert.thesis_notes && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-400 dark:text-slate-600 italic">
                      "{alert.thesis_notes}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-2.5 border-t border-slate-800 pt-2 dark:border-slate-200 text-center">
            <button
              type="button"
              onClick={handleNavigateToScouting}
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 dark:text-teal-700 dark:hover:text-teal-800 transition cursor-pointer"
            >
              {t("layout.alerts.view_all_scouting", "Vedi tutte le Idee di Scouting ➔")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
