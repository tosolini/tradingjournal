import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { alertsApi, BondCouponAlert, BondMaturityAlert, TradeIdea, TradePriceAlert } from "../lib/api";
import { openTradeCreateModal } from "../lib/trade-modal-event";
import { BellIcon, CheckIcon } from "./icons";

type AlertTab = "all" | "trades" | "coupons" | "maturities" | "scouting";

export function AlertsBellMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<AlertTab>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: alertsData } = useQuery({
    queryKey: ["unified-alerts"],
    queryFn: () => alertsApi.getUnifiedAlerts(),
    refetchInterval: 30000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertKey: string) => alertsApi.acknowledge(alertKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-alerts"] });
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: () => alertsApi.acknowledgeAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unified-alerts"] });
    },
  });

  const unreadCount = alertsData?.unread_count || 0;
  const counts = alertsData?.counts || { all: 0, trades: 0, coupons: 0, maturities: 0, scouting: 0 };

  const trades = alertsData?.trades || [];
  const coupons = alertsData?.coupons || [];
  const maturities = alertsData?.maturities || [];
  const scouting = alertsData?.scouting || [];

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

  const handleOpenTradeFromIdea = (
    ideaId: number,
    symbol: string,
    direction: "long" | "short",
    triggerPrice: string | number,
    stopLoss?: string | number | null,
    targetPrice?: string | number | null,
  ) => {
    setIsOpen(false);
    openTradeCreateModal({
      tradeIdeaId: ideaId,
      symbol,
      direction,
      entryPrice: String(triggerPrice),
      stopLossPrice: stopLoss ? String(stopLoss) : undefined,
      targetPrice: targetPrice ? String(targetPrice) : undefined,
    });
  };

  const handleNavigateToTrades = (symbol?: string) => {
    setIsOpen(false);
    if (symbol) {
      navigate(`/trades?search=${encodeURIComponent(symbol)}`);
    } else {
      navigate("/trades");
    }
  };

  const handleNavigateToPortfolio = (holdingId?: number) => {
    setIsOpen(false);
    if (holdingId) {
      navigate(`/portfolio/holding/${holdingId}`);
    } else {
      navigate("/portfolio");
    }
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
        title={t("layout.alerts.title", "Notifiche e Alert di Trading & Portafoglio")}
        aria-label={t("layout.alerts.title", "Notifiche e Alert di Trading & Portafoglio")}
      >
        <BellIcon className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[95vw] rounded-xl border border-slate-700 bg-[#0c121e] p-3.5 shadow-2xl z-50 dark:border-slate-300 dark:bg-white text-slate-100 dark:text-slate-900">
          {/* Header - Clean, balanced, no crowded buttons */}
          <div className="mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2.5 dark:border-slate-200">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {unreadCount > 0 ? (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500"></span>
                  </>
                ) : (
                  <span className="inline-flex h-2 w-2 rounded-full bg-slate-600"></span>
                )}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200 dark:text-slate-800">
                {t("layout.alerts.header", "Centro Notifiche & Alert")}
              </span>
            </div>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[10px] font-semibold text-teal-300 dark:bg-teal-50 dark:border-teal-200 dark:text-teal-800">
                {unreadCount} {t("layout.alerts.ready", "attivi")}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-medium">
                {t("layout.alerts.empty_header", "0 attivi")}
              </span>
            )}
          </div>

          {/* Category Tabs */}
          <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedTab("all")}
              className={`rounded-md px-2 py-1 font-medium transition cursor-pointer text-[11px] whitespace-nowrap ${
                selectedTab === "all"
                  ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                  : "bg-[#161f30] text-slate-300 hover:text-white dark:bg-slate-200 dark:text-slate-700 dark:hover:text-slate-950"
              }`}
            >
              {t("layout.alerts.tab_all", "Tutti")} ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("trades")}
              className={`rounded-md px-2 py-1 font-medium transition cursor-pointer text-[11px] whitespace-nowrap ${
                selectedTab === "trades"
                  ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                  : "bg-[#161f30] text-slate-300 hover:text-white dark:bg-slate-200 dark:text-slate-700 dark:hover:text-slate-950"
              }`}
            >
              {t("layout.alerts.tab_trades", "Trade")} ({counts.trades})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("coupons")}
              className={`rounded-md px-2 py-1 font-medium transition cursor-pointer text-[11px] whitespace-nowrap ${
                selectedTab === "coupons"
                  ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                  : "bg-[#161f30] text-slate-300 hover:text-white dark:bg-slate-200 dark:text-slate-700 dark:hover:text-slate-950"
              }`}
            >
              {t("layout.alerts.tab_coupons", "Cedole")} ({counts.coupons})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("maturities")}
              className={`rounded-md px-2 py-1 font-medium transition cursor-pointer text-[11px] whitespace-nowrap ${
                selectedTab === "maturities"
                  ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                  : "bg-[#161f30] text-slate-300 hover:text-white dark:bg-slate-200 dark:text-slate-700 dark:hover:text-slate-950"
              }`}
            >
              {t("layout.alerts.tab_maturities", "Scadenze")} ({counts.maturities})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("scouting")}
              className={`rounded-md px-2 py-1 font-medium transition cursor-pointer text-[11px] whitespace-nowrap ${
                selectedTab === "scouting"
                  ? "bg-teal-500 text-slate-950 font-bold shadow-xs"
                  : "bg-[#161f30] text-slate-300 hover:text-white dark:bg-slate-200 dark:text-slate-700 dark:hover:text-slate-950"
              }`}
            >
              {t("layout.alerts.tab_scouting", "Scouting")} ({counts.scouting})
            </button>
          </div>

          {/* Alert Cards Container */}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {/* Trades Alerts */}
            {(selectedTab === "all" || selectedTab === "trades") &&
              trades.map((alert: TradePriceAlert) => (
                <div
                  key={`trade-${alert.id}-${alert.alert_type}`}
                  className={`rounded-lg border border-slate-700/80 bg-[#141b2a] p-2.5 transition hover:border-slate-600 dark:border-slate-200 dark:bg-slate-50 border-l-[3px] ${
                    alert.alert_type === "take_profit"
                      ? "border-l-emerald-500"
                      : "border-l-rose-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-100 dark:text-slate-900">
                        {alert.symbol}
                      </span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 dark:bg-slate-200 dark:text-slate-700">
                        {alert.side}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                          alert.alert_type === "take_profit"
                            ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                            : "bg-rose-500/20 text-rose-300 dark:bg-rose-100 dark:text-rose-800"
                        }`}
                      >
                        {alert.alert_type === "take_profit"
                          ? t("layout.alerts.take_profit", "Take Profit Raggiunto")
                          : t("layout.alerts.stop_loss", "Stop Loss Raggiunto")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleNavigateToTrades(alert.symbol)}
                        className="rounded bg-teal-500 px-2 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-teal-400 cursor-pointer shadow-xs"
                      >
                        {t("layout.alerts.action_view_trade", "Dettagli Trade")}
                      </button>
                      {alert.alert_key && (
                        <button
                          type="button"
                          onClick={() => acknowledgeMutation.mutate(alert.alert_key)}
                          disabled={acknowledgeMutation.isPending}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/80 text-slate-400 hover:border-teal-500 hover:bg-teal-500/20 hover:text-teal-300 transition-all cursor-pointer dark:border-slate-300 dark:bg-slate-100 dark:text-slate-600 dark:hover:bg-teal-50 dark:hover:text-teal-700 active:scale-90"
                          title={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                          aria-label={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                        >
                          <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {alert.alert_type === "take_profit"
                        ? t("layout.alerts.target_price", "Target")
                        : t("layout.alerts.stop_price", "Stop")}
                      :{" "}
                      <strong className="text-slate-200 dark:text-slate-800">
                        {alert.threshold_price}
                      </strong>
                    </span>
                    <span className="text-[11px]">
                      {t("layout.alerts.current_price", "Prezzo attuale")}:{" "}
                      <strong className="text-teal-400 dark:text-teal-600 font-mono">
                        {alert.current_price}
                      </strong>
                    </span>
                  </div>
                  {alert.account_name && (
                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {alert.account_name}
                    </div>
                  )}
                </div>
              ))}

            {/* Coupons Alerts */}
            {(selectedTab === "all" || selectedTab === "coupons") &&
              coupons.map((coupon: BondCouponAlert) => (
                <div
                  key={`coupon-${coupon.id}`}
                  className="rounded-lg border border-amber-600/50 bg-[#1e170a] p-2.5 transition hover:border-amber-500/60 dark:border-amber-200 dark:bg-amber-50 border-l-[3px] border-l-amber-500"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-amber-200 dark:text-amber-900">
                        {coupon.asset_symbol}
                      </span>
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-300 dark:bg-amber-100 dark:text-amber-800">
                        {t("layout.alerts.coupon_today", "Cedola Oggi")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleNavigateToPortfolio(coupon.holding_id)}
                        className="rounded bg-amber-500 px-2 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-amber-400 cursor-pointer shadow-xs"
                      >
                        {t("layout.alerts.action_view_portfolio", "Dettagli BTP")}
                      </button>
                      {coupon.alert_key && (
                        <button
                          type="button"
                          onClick={() => acknowledgeMutation.mutate(coupon.alert_key)}
                          disabled={acknowledgeMutation.isPending}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-800/80 bg-amber-950/40 text-amber-300 hover:border-amber-500 hover:bg-amber-500/20 transition-all cursor-pointer dark:border-amber-300 dark:bg-amber-100 dark:text-amber-800 active:scale-90"
                          title={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                          aria-label={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                        >
                          <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-300 dark:text-slate-700 font-medium truncate">
                    {coupon.asset_name}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {t("layout.alerts.net_estimate", "Netto stimato")}:{" "}
                      <strong className="text-amber-300 dark:text-amber-800 font-mono">
                        {coupon.net_amount} {coupon.currency}
                      </strong>
                    </span>
                    {coupon.account_name && (
                      <span className="text-[11px] text-slate-400">
                        {coupon.account_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}

            {/* Maturities Alerts */}
            {(selectedTab === "all" || selectedTab === "maturities") &&
              maturities.map((mat: BondMaturityAlert) => (
                <div
                  key={`mat-${mat.id}`}
                  className="rounded-lg border border-indigo-600/50 bg-[#13172b] p-2.5 transition hover:border-indigo-500/60 dark:border-indigo-200 dark:bg-indigo-50 border-l-[3px] border-l-indigo-500"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-indigo-200 dark:text-indigo-900">
                        {mat.asset_symbol}
                      </span>
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-bold text-indigo-300 dark:bg-indigo-100 dark:text-indigo-800">
                        {t("layout.alerts.maturity_warning", "Scadenza BTP")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleNavigateToPortfolio(mat.holding_id)}
                        className="rounded bg-indigo-500 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-400 cursor-pointer shadow-xs"
                      >
                        {t("layout.alerts.action_view_portfolio", "Dettagli BTP")}
                      </button>
                      {mat.alert_key && (
                        <button
                          type="button"
                          onClick={() => acknowledgeMutation.mutate(mat.alert_key)}
                          disabled={acknowledgeMutation.isPending}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-indigo-800/80 bg-indigo-950/40 text-indigo-300 hover:border-indigo-500 hover:bg-indigo-500/20 transition-all cursor-pointer dark:border-indigo-300 dark:bg-indigo-100 dark:text-indigo-800 active:scale-90"
                          title={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                          aria-label={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                        >
                          <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-300 dark:text-slate-700 font-medium truncate">
                    {mat.asset_name}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span className="font-semibold text-indigo-300 dark:text-indigo-700">
                      {mat.days_remaining === 1
                        ? t("layout.alerts.days_left_one", "Manca 1 giorno")
                        : t("layout.alerts.days_left", {
                            count: mat.days_remaining,
                            defaultValue: `Mancano ${mat.days_remaining} giorni`,
                          })}
                    </span>
                    <span>
                      {t("layout.alerts.nominal", "Nominale")}:{" "}
                      <strong className="text-slate-200 dark:text-slate-800 font-mono">
                        {mat.nominal_value} {mat.currency}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}

            {/* Scouting Alerts */}
            {(selectedTab === "all" || selectedTab === "scouting") &&
              scouting.map((alert: TradeIdea) => (
                <div
                  key={`scout-${alert.id}`}
                  className="rounded-lg border border-slate-700/80 bg-[#141b2a] p-2.5 transition hover:border-teal-500/40 dark:border-slate-200 dark:bg-slate-50 border-l-[3px] border-l-teal-500"
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenTradeFromIdea(
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
                      <button
                        type="button"
                        onClick={() => {
                          const key = alert.alert_key || `scouting:${alert.id}`;
                          acknowledgeMutation.mutate(key);
                        }}
                        disabled={acknowledgeMutation.isPending}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/80 text-slate-400 hover:border-teal-500 hover:bg-teal-500/20 hover:text-teal-300 transition-all cursor-pointer dark:border-slate-300 dark:bg-slate-100 dark:text-slate-600 dark:hover:bg-teal-50 dark:hover:text-teal-700 active:scale-90"
                        title={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                        aria-label={t("layout.alerts.acknowledge_tooltip", "Segna come letto")}
                      >
                        <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {t("layout.alerts.trigger_price", "Trigger")}:{" "}
                      <strong className="text-slate-200 dark:text-slate-800">
                        {alert.trigger_price} €
                      </strong>
                    </span>
                    {alert.triggered_price && (
                      <span className="text-[11px]">
                        {t("layout.alerts.detected_price", "Rilevato")}: {alert.triggered_price} €
                      </span>
                    )}
                  </div>
                  {alert.thesis_notes && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-slate-400 dark:text-slate-600 italic">
                      "{alert.thesis_notes}"
                    </p>
                  )}
                </div>
              ))}

            {/* Empty States */}
            {selectedTab === "all" && counts.all === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("layout.alerts.empty", "Nessun alert attivo al momento.")}
              </div>
            )}
            {selectedTab === "trades" && counts.trades === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("layout.alerts.empty_trades", "Nessun trade aperto ha toccato Take Profit o Stop Loss.")}
              </div>
            )}
            {selectedTab === "coupons" && counts.coupons === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("layout.alerts.empty_coupons", "Nessuna cedola o stacco programmato per oggi.")}
              </div>
            )}
            {selectedTab === "maturities" && counts.maturities === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("layout.alerts.empty_maturities", "Nessuna obbligazione o BTP in scadenza imminente.")}
              </div>
            )}
            {selectedTab === "scouting" && counts.scouting === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                {t("layout.alerts.empty_scouting", "Nessuna idea di scouting pronta al prezzo trigger.")}
              </div>
            )}
          </div>

          {/* Footer Actions: Dedicated bottom action area */}
          <div className="mt-3 border-t border-slate-800/80 pt-2.5 dark:border-slate-200/80 space-y-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-teal-300 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200 dark:hover:text-slate-900 cursor-pointer shadow-2xs active:scale-[0.99]"
                title={t("layout.alerts.acknowledge_all_tooltip", "Segna tutti gli alert attivi come letti")}
              >
                <CheckIcon className="h-3.5 w-3.5 text-teal-400 dark:text-teal-600 stroke-[2.5]" />
                <span>{t("layout.alerts.acknowledge_all", "Segna tutti come letti")}</span>
              </button>
            )}

            <div className="flex items-center justify-between text-xs pt-0.5">
              {selectedTab === "scouting" ? (
                <button
                  type="button"
                  onClick={handleNavigateToScouting}
                  className="w-full text-center font-semibold text-teal-400 hover:text-teal-300 dark:text-teal-700 dark:hover:text-teal-800 transition cursor-pointer text-[11px]"
                >
                  {t("layout.alerts.view_all_scouting", "Vedi tutte le Idee di Scouting ➔")}
                </button>
              ) : selectedTab === "trades" ? (
                <button
                  type="button"
                  onClick={() => handleNavigateToTrades()}
                  className="w-full text-center font-semibold text-teal-400 hover:text-teal-300 dark:text-teal-700 dark:hover:text-teal-800 transition cursor-pointer text-[11px]"
                >
                  {t("layout.alerts.view_all_trades", "Vedi tutti i Trade ➔")}
                </button>
              ) : selectedTab === "coupons" || selectedTab === "maturities" ? (
                <button
                  type="button"
                  onClick={() => handleNavigateToPortfolio()}
                  className="w-full text-center font-semibold text-amber-400 hover:text-amber-300 dark:text-amber-700 dark:hover:text-amber-800 transition cursor-pointer text-[11px]"
                >
                  {t("layout.alerts.view_all_bonds", "Vedi Portafoglio ➔")}
                </button>
              ) : (
                <div className="w-full flex items-center justify-between text-[11px] text-slate-400">
                  <button
                    type="button"
                    onClick={() => handleNavigateToTrades()}
                    className="hover:text-teal-300 dark:hover:text-teal-700 transition cursor-pointer"
                  >
                    {t("layout.alerts.tab_trades", "Trade")}
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleNavigateToPortfolio()}
                    className="hover:text-amber-300 dark:hover:text-amber-700 transition cursor-pointer"
                  >
                    {t("layout.alerts.tab_coupons", "Cedole")}
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleNavigateToScouting}
                    className="hover:text-teal-300 dark:hover:text-teal-700 transition cursor-pointer"
                  >
                    {t("layout.alerts.tab_scouting", "Scouting")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
