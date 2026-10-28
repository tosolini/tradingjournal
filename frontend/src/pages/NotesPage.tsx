import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { DailyNotesTab } from "../components/DailyNotesTab";
import { ScoutingIdeasTab } from "../components/ScoutingIdeasTab";
import { tradeIdeasApi } from "../lib/api";

export function NotesPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = searchParams.get("tab") === "daily" ? "daily" : "scouting";
  const selectedIdeaIdParam = searchParams.get("ideaId");
  const initialSelectedIdeaId = selectedIdeaIdParam ? parseInt(selectedIdeaIdParam, 10) : null;

  const { data: alertsData } = useQuery({
    queryKey: ["trade-idea-alerts"],
    queryFn: () => tradeIdeasApi.getAlerts(),
    refetchInterval: 30000,
  });

  const unreadAlertsCount = alertsData?.unread_count || 0;

  const handleTabChange = (nextTab: "scouting" | "daily") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    setSearchParams(nextParams);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Segmented Tabs Navigation ────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 dark:border-slate-200">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-1 dark:border-slate-200 dark:bg-slate-100 shadow-xs">
          <button
            type="button"
            onClick={() => handleTabChange("scouting")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              currentTab === "scouting"
                ? "bg-teal-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            <span>🎯</span>
            <span>{t("notes.tab_scouting", "Scouting & Idee di Trading")}</span>
            {unreadAlertsCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white animate-pulse">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("daily")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              currentTab === "daily"
                ? "bg-teal-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            <span>📓</span>
            <span>{t("notes.tab_daily", "Diario Giornaliero & Psicologia")}</span>
          </button>
        </div>
      </div>

      {/* ── Active Tab View ──────────────────────────────────── */}
      {currentTab === "scouting" ? (
        <ScoutingIdeasTab initialSelectedIdeaId={initialSelectedIdeaId} />
      ) : (
        <DailyNotesTab />
      )}
    </div>
  );
}
