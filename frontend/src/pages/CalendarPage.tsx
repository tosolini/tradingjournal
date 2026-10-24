import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { DailyPnlPoint, api, exchangesApi, fetchDailyPnl, getMe } from "../lib/api";
import { MarketGantt } from "../components/MarketGantt";
import {
  BookOpenIcon,
  CalendarIcon,
  ChevronRightIcon,
  PlusIcon,
  TrendingUpIcon,
  XIcon,
} from "../components/icons";

type CalendarExecution = {
  id: number;
  trade_id: number;
  symbol: string;
  action: string;
  executed_at: string;
  quantity: number;
  price: number;
  fee: number;
  currency: string;
};

type CalendarNote = {
  id: number;
  mood?: string | null;
  summary?: string | null;
  text?: string | null;
  market_condition?: string | null;
};

type CalendarDayData = {
  date: string;
  notes: CalendarNote[];
  executions: CalendarExecution[];
};

type CalendarMonthResponse = {
  year: number;
  month: number;
  days: CalendarDayData[];
};

function asNumber(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number, currency = "EUR", locale = "it-IT"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)} ${currency}`;
  }
}

function formatSignedMoney(value: number, currency = "EUR", locale = "it-IT"): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value), currency, locale)}`;
}

function toMonthLabel(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isItalian = i18n.resolvedLanguage === "it";
  const locale = isItalian ? "it-IT" : "en-US";
  const weekDays = isItalian
    ? ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const [activeTab, setActiveTab] = useState<"calendar" | "markets">("calendar");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // 1. Fetch Month data (executions + notes)
  const { data: monthData, isLoading, error } = useQuery({
    queryKey: ["calendar-month", year, month],
    queryFn: () => api<CalendarMonthResponse>(`/api/market-calendar/journal-month?year=${year}&month=${month}`),
  });

  // 2. Fetch Daily PnL for colored calendar cells & KPI strip
  const { data: dailyPnlList } = useQuery({
    queryKey: ["daily-pnl"],
    queryFn: () => fetchDailyPnl(),
  });

  const { data: meData } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: exchangesData } = useQuery({
    queryKey: ["exchanges"],
    queryFn: exchangesApi.list,
    enabled: activeTab === "markets",
  });

  const userTimezone = meData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Map PnL by ISO date string (YYYY-MM-DD)
  const pnlByDate = useMemo(() => {
    const map = new Map<string, DailyPnlPoint>();
    if (dailyPnlList) {
      for (const item of dailyPnlList) {
        map.set(item.date, item);
      }
    }
    return map;
  }, [dailyPnlList]);

  // Map notes & executions by date
  const byDate = useMemo(() => {
    const index = new Map<string, CalendarDayData>();
    for (const day of monthData?.days || []) {
      index.set(day.date, day);
    }
    return index;
  }, [monthData]);

  // Compute month summary statistics
  const monthKpis = useMemo(() => {
    let totalPnl = 0;
    let greenDays = 0;
    let redDays = 0;
    let executionsCount = 0;

    // Check PnL for current month
    if (dailyPnlList) {
      for (const item of dailyPnlList) {
        if (item.date.startsWith(monthKey)) {
          const pnl = asNumber(item.day_pnl);
          totalPnl += pnl;
          if (pnl > 0.001) greenDays += 1;
          else if (pnl < -0.001) redDays += 1;
        }
      }
    }

    if (monthData?.days) {
      for (const d of monthData.days) {
        executionsCount += d.executions.length;
      }
    }

    const totalDays = greenDays + redDays;
    const winRate = totalDays > 0 ? (greenDays / totalDays) * 100 : 0;

    return {
      totalPnl,
      greenDays,
      redDays,
      winRate,
      executionsCount,
    };
  }, [dailyPnlList, monthData, monthKey]);

  const monthGrid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const leadingEmpty = (firstDay.getDay() + 6) % 7;

    const cells: Array<{ isoDate: string | null; dayNumber: number | null }> = [];
    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push({ isoDate: null, dayNumber: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const isoDate = `${year}-${mm}-${dd}`;
      cells.push({ isoDate, dayNumber: day });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ isoDate: null, dayNumber: null });
    }
    return cells;
  }, [month, year]);

  const weekRows = useMemo(() => {
    const rows: Array<{
      days: typeof monthGrid;
      weekPnl: number;
      greenDays: number;
      redDays: number;
      executionsCount: number;
      weekNumber: number;
    }> = [];

    for (let i = 0; i < monthGrid.length; i += 7) {
      const daysChunk = monthGrid.slice(i, i + 7);
      let weekPnl = 0;
      let greenDays = 0;
      let redDays = 0;
      let executionsCount = 0;
      let refDate: Date | null = null;

      for (const cell of daysChunk) {
        if (cell.isoDate) {
          if (!refDate) refDate = new Date(cell.isoDate);
          const pnlPoint = pnlByDate.get(cell.isoDate);
          if (pnlPoint) {
            const val = asNumber(pnlPoint.day_pnl);
            weekPnl += val;
            if (val > 0.001) greenDays += 1;
            else if (val < -0.001) redDays += 1;
          }
          const dayData = byDate.get(cell.isoDate);
          if (dayData) {
            executionsCount += dayData.executions.length;
          }
        }
      }

      // Compute ISO week number
      const target = refDate || new Date(year, month - 1, 1);
      const d = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

      rows.push({
        days: daysChunk,
        weekPnl,
        greenDays,
        redDays,
        executionsCount,
        weekNumber,
      });
    }
    return rows;
  }, [monthGrid, pnlByDate, byDate, month, year]);

  const selectedDayData = selectedDay ? byDate.get(selectedDay) : null;
  const selectedDayPnl = selectedDay ? pnlByDate.get(selectedDay) : null;

  return (
    <div className="space-y-5">
      {/* ── Page Header & Tabs ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-900">
            {t("calendar.title")}
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {isItalian
              ? "Monitora i tuoi risultati giornalieri, le esecuzioni e le note operative."
              : "Track your daily PnL, trade executions, and journal notes."}
          </p>
        </div>

        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 text-sm dark:border-slate-200 dark:bg-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "calendar"
                ? "bg-teal-500 text-slate-950 font-semibold shadow-xs"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>{t("calendar.tab_calendar")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("markets")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition ${
              activeTab === "markets"
                ? "bg-teal-500 text-slate-950 font-semibold shadow-xs"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            <TrendingUpIcon className="h-4 w-4" />
            <span>{t("calendar.tab_markets")}</span>
          </button>
        </div>
      </div>

      {/* ── MERCATI TAB ── */}
      {activeTab === "markets" && (
        <MarketGantt exchanges={exchangesData ?? []} userTimezone={userTimezone} />
      )}

      {/* ── CALENDARIO TAB ── */}
      {activeTab === "calendar" && (
        <>
          {/* Monthly Summary KPI Banner */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 fade-up">
            <div className="card p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {isItalian ? "PnL Netto Mese" : "Month Net PnL"}
              </span>
              <div
                className={`mt-1 text-xl font-bold tabular-nums ${
                  monthKpis.totalPnl > 0
                    ? "text-emerald-400 dark:text-emerald-700"
                    : monthKpis.totalPnl < 0
                    ? "text-red-400 dark:text-red-600"
                    : "text-slate-200 dark:text-slate-700"
                }`}
              >
                {formatSignedMoney(monthKpis.totalPnl, "EUR", locale)}
              </div>
            </div>

            <div className="card p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {isItalian ? "Giorni Profitto / Perdita" : "Green / Red Days"}
              </span>
              <div className="mt-1 flex items-baseline gap-2 text-xl font-bold tabular-nums">
                <span className="text-emerald-400 dark:text-emerald-700">{monthKpis.greenDays}W</span>
                <span className="text-slate-500">/</span>
                <span className="text-red-400 dark:text-red-600">{monthKpis.redDays}L</span>
              </div>
            </div>

            <div className="card p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {isItalian ? "Win Rate Giornaliero" : "Daily Win Rate"}
              </span>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-100 dark:text-slate-800">
                {Math.round(monthKpis.winRate)}%
              </div>
            </div>

            <div className="card p-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {isItalian ? "Ordini Eseguiti" : "Total Executions"}
              </span>
              <div className="mt-1 text-xl font-bold tabular-nums text-teal-300 dark:text-teal-800">
                {monthKpis.executionsCount}
              </div>
            </div>
          </div>

          {/* Month Navigation Strip */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMonthCursor((cur) => new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}
                className="rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-100"
              >
                ← {t("calendar.prev_month")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
                className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/20 dark:border-teal-600/30 dark:bg-teal-50 dark:text-teal-900"
              >
                {t("calendar.today")}
              </button>
              <button
                type="button"
                onClick={() => setMonthCursor((cur) => new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}
                className="rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:bg-slate-100"
              >
                {t("calendar.next_month")} →
              </button>
            </div>

            <div className="text-base font-bold capitalize text-slate-100 dark:text-slate-900">
              {toMonthLabel(monthCursor, locale)}
            </div>
          </div>

          {isLoading ? (
            <div className="card flex h-64 items-center justify-center p-6 text-sm text-slate-400">
              {t("calendar.loading")}
            </div>
          ) : error ? (
            <div className="card flex h-64 items-center justify-center p-6 text-sm text-red-400">
              {t("calendar.unavailable")}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-2 lg:grid-cols-[repeat(7,1fr)_120px]">
                {weekDays.map((weekday) => (
                  <div
                    key={weekday}
                    className="rounded-lg border border-slate-800/80 bg-slate-900/60 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-600"
                  >
                    {weekday}
                  </div>
                ))}
                <div className="hidden lg:flex items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-center text-xs font-bold uppercase tracking-wider text-teal-300 dark:border-teal-300 dark:bg-teal-50 dark:text-teal-800">
                  {t("calendar.col_week_pnl", "Tot. Settimana")}
                </div>
              </div>

              {/* Calendar Grid by Weeks */}
              <div className="space-y-2">
                {weekRows.map((weekRow, rowIndex) => (
                  <div
                    key={`week-${rowIndex}`}
                    className="grid grid-cols-1 gap-2 md:grid-cols-7 lg:grid-cols-[repeat(7,1fr)_120px]"
                  >
                    {weekRow.days.map((cell, cellIndex) => {
                      if (!cell.isoDate || !cell.dayNumber) {
                        return (
                          <div
                            key={`empty-${rowIndex}-${cellIndex}`}
                            className="hidden md:block min-h-32 rounded-xl border border-slate-900/50 bg-slate-950/30 dark:border-slate-200/40 dark:bg-slate-100/30"
                          />
                        );
                      }

                      const dayData = byDate.get(cell.isoDate);
                      const pnlPoint = pnlByDate.get(cell.isoDate);
                      const executions = dayData?.executions || [];
                      const notes = dayData?.notes || [];

                      const dayPnlVal = pnlPoint ? asNumber(pnlPoint.day_pnl) : null;
                      const isProfit = dayPnlVal !== null && dayPnlVal > 0.001;
                      const isLoss = dayPnlVal !== null && dayPnlVal < -0.001;
                      const hasActivity = executions.length > 0 || notes.length > 0 || dayPnlVal !== null;

                      return (
                        <div
                          key={cell.isoDate}
                          onClick={() => setSelectedDay(cell.isoDate)}
                          className={`min-h-32 rounded-xl border p-2.5 transition-all flex flex-col justify-between cursor-pointer ${
                            hasActivity
                              ? "hover:border-teal-500/60 hover:shadow-lg hover:-translate-y-0.5"
                              : ""
                          } ${
                            isProfit
                              ? "border-emerald-500/30 bg-emerald-500/[0.04] dark:border-emerald-200 dark:bg-emerald-50/40"
                              : isLoss
                              ? "border-red-500/30 bg-red-500/[0.04] dark:border-red-200 dark:bg-red-50/40"
                              : "border-slate-800/80 bg-slate-900/40 dark:border-slate-200 dark:bg-white"
                          }`}
                        >
                          {/* Cell Header: Day Number + Note indicator */}
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                                  isProfit
                                    ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                                    : isLoss
                                    ? "bg-red-500/20 text-red-300 dark:bg-red-100 dark:text-red-800"
                                    : "text-slate-300 dark:text-slate-800"
                                }`}
                              >
                                {cell.dayNumber}
                              </span>

                              {notes.length > 0 && (
                                <span
                                  className="flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[10px] text-teal-300 dark:text-teal-800"
                                  title={`${notes.length} note(s)`}
                                >
                                  <BookOpenIcon className="h-3 w-3" />
                                  <span>{notes.length}</span>
                                </span>
                              )}
                            </div>

                            {/* Daily PnL prominent badge */}
                            {dayPnlVal !== null && (
                              <div
                                className={`mb-2 rounded-lg px-2 py-1 text-center font-bold tabular-nums text-xs shadow-xs ${
                                  isProfit
                                    ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 dark:bg-emerald-100 dark:border-emerald-300 dark:text-emerald-800"
                                    : isLoss
                                    ? "bg-red-500/15 border border-red-500/40 text-red-300 dark:bg-red-100 dark:border-red-300 dark:text-red-800"
                                    : "bg-slate-800/60 border border-slate-700 text-slate-300 dark:bg-slate-100 dark:border-slate-200 dark:text-slate-700"
                                }`}
                              >
                                <div>{formatSignedMoney(dayPnlVal, "EUR", locale)}</div>
                                {pnlPoint?.day_pnl_pct && (
                                  <div className="text-[10px] opacity-80 font-normal">
                                    {asNumber(pnlPoint.day_pnl_pct) >= 0 ? "+" : ""}
                                    {asNumber(pnlPoint.day_pnl_pct).toFixed(2)}%
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Cell Executions list / chips */}
                          <div className="space-y-1 mt-auto">
                            {executions.slice(0, 2).map((execution) => (
                              <div
                                key={execution.id}
                                className="flex items-center justify-between rounded-md border border-slate-700/60 bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-slate-200 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-800 truncate"
                                title={`${execution.symbol} ${execution.action} ${execution.quantity} @ ${execution.price}`}
                              >
                                <span className="font-semibold text-teal-300 dark:text-teal-800">
                                  {execution.symbol}
                                </span>
                                <span className="text-[9px] uppercase font-medium text-slate-400 dark:text-slate-500">
                                  {execution.action}
                                </span>
                              </div>
                            ))}
                            {executions.length > 2 && (
                              <div className="text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                +{executions.length - 2} altro
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Desktop Week Summary Column (8th column) */}
                    <div
                      className={`hidden lg:flex min-h-32 flex-col justify-between rounded-xl border p-2.5 transition-all ${
                        weekRow.weekPnl > 0.001
                          ? "border-emerald-500/40 bg-emerald-500/[0.08] dark:border-emerald-300 dark:bg-emerald-50/60"
                          : weekRow.weekPnl < -0.001
                          ? "border-red-500/40 bg-red-500/[0.08] dark:border-red-300 dark:bg-red-50/60"
                          : "border-slate-800/80 bg-slate-900/40 dark:border-slate-200 dark:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Sett. {weekRow.weekNumber}
                        </span>
                        <span className="rounded bg-slate-800/80 px-1 py-0.2 text-[9px] font-mono text-slate-400 dark:bg-slate-200 dark:text-slate-600">
                          W{weekRow.weekNumber}
                        </span>
                      </div>

                      <div className="my-auto py-2 text-center">
                        <div
                          className={`text-sm font-black tabular-nums ${
                            weekRow.weekPnl > 0.001
                              ? "text-emerald-400 dark:text-emerald-700"
                              : weekRow.weekPnl < -0.001
                              ? "text-red-400 dark:text-red-600"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {formatSignedMoney(weekRow.weekPnl, "EUR", locale)}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5 font-medium">
                          <span className="text-emerald-400 dark:text-emerald-600 font-bold">{weekRow.greenDays}W</span>
                          <span>·</span>
                          <span className="text-red-400 dark:text-red-600 font-bold">{weekRow.redDays}L</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center border-t border-slate-800/60 dark:border-slate-200/60 pt-1">
                        {weekRow.executionsCount} {t("dashboard.cards.trades", "trade")}
                      </div>
                    </div>

                    {/* Mobile Week Summary Banner */}
                    <div className="lg:hidden flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs dark:border-slate-200 dark:bg-slate-100">
                      <span className="font-semibold text-slate-400 dark:text-slate-600">Settimana {weekRow.weekNumber}</span>
                      <span className={`font-bold tabular-nums ${weekRow.weekPnl > 0.001 ? "text-emerald-400 dark:text-emerald-700" : weekRow.weekPnl < -0.001 ? "text-red-400 dark:text-red-600" : "text-slate-400"}`}>
                        {formatSignedMoney(weekRow.weekPnl, "EUR", locale)} ({weekRow.greenDays}W - {weekRow.redDays}L)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Day Detail Drawer / Modal ── */}
          {selectedDay && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedDay(null);
              }}
            >
              <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl dark:border-slate-200 dark:bg-white fade-up max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-4 dark:border-slate-200">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-teal-400 dark:text-teal-700">
                      {isItalian ? "Riepilogo Giornaliero" : "Daily Summary"}
                    </span>
                    <h2 className="text-lg font-bold text-slate-100 dark:text-slate-900">
                      {new Date(selectedDay).toLocaleDateString(locale, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-100"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Day PnL Hero if available */}
                {selectedDayPnl && (
                  <div className="my-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 dark:border-slate-200 dark:bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        {isItalian ? "PnL Giornaliero" : "Day PnL"}
                      </div>
                      <div
                        className={`text-2xl font-bold tabular-nums mt-0.5 ${
                          asNumber(selectedDayPnl.day_pnl) > 0
                            ? "text-emerald-400 dark:text-emerald-700"
                            : asNumber(selectedDayPnl.day_pnl) < 0
                            ? "text-red-400 dark:text-red-600"
                            : "text-slate-200 dark:text-slate-800"
                        }`}
                      >
                        {formatSignedMoney(asNumber(selectedDayPnl.day_pnl), "EUR", locale)}
                      </div>
                    </div>
                    {selectedDayPnl.day_pnl_pct && (
                      <div
                        className={`rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${
                          asNumber(selectedDayPnl.day_pnl_pct) >= 0
                            ? "bg-emerald-500/15 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                            : "bg-red-500/15 text-red-300 dark:bg-red-100 dark:text-red-800"
                        }`}
                      >
                        {asNumber(selectedDayPnl.day_pnl_pct) >= 0 ? "+" : ""}
                        {asNumber(selectedDayPnl.day_pnl_pct).toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}

                {/* Executions section */}
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-2">
                    <TrendingUpIcon className="h-4 w-4 text-teal-400" />
                    <span>{t("calendar.latest_executions")} ({selectedDayData?.executions.length || 0})</span>
                  </h3>

                  {!selectedDayData?.executions.length ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500 dark:border-slate-200">
                      {isItalian ? "Nessuna operazione registrata in questa data" : "No executions recorded on this date"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayData.executions.map((exec) => (
                        <div
                          key={exec.id}
                          className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs dark:border-slate-200 dark:bg-slate-50"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-teal-300 dark:text-teal-800 text-sm">
                                {exec.symbol}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  exec.action.toLowerCase() === "buy"
                                    ? "bg-emerald-500/20 text-emerald-300 dark:bg-emerald-100 dark:text-emerald-800"
                                    : "bg-red-500/20 text-red-300 dark:bg-red-100 dark:text-red-800"
                                }`}
                              >
                                {exec.action}
                              </span>
                            </div>
                            <div className="mt-1 text-slate-400 dark:text-slate-500">
                              {exec.quantity} @ {formatMoney(exec.price, exec.currency, locale)} · Fee: {formatMoney(exec.fee, exec.currency, locale)}
                            </div>
                          </div>

                          <Link
                            to={`/trades/${exec.trade_id}`}
                            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white dark:border-slate-300 dark:bg-white dark:text-slate-800"
                          >
                            <span>Dettagli</span>
                            <ChevronRightIcon className="h-3 w-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes section */}
                <div className="mt-6 border-t border-slate-800 pt-5 dark:border-slate-200">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <BookOpenIcon className="h-4 w-4 text-sky-400" />
                      <span>{t("calendar.notes")} ({selectedDayData?.notes.length || 0})</span>
                    </h3>
                    <Link
                      to={`/notes?date=${selectedDay}`}
                      className="text-xs font-semibold text-teal-400 hover:underline dark:text-teal-700"
                    >
                      + {isItalian ? "Aggiungi Nota" : "Add Note"}
                    </Link>
                  </div>

                  {!selectedDayData?.notes.length ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500 dark:border-slate-200">
                      {isItalian ? "Nessuna nota per questa data" : "No notes recorded for this date"}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedDayData.notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs dark:border-slate-200 dark:bg-slate-50"
                        >
                          <div className="font-semibold text-slate-200 dark:text-slate-900 text-sm mb-1">
                            {note.summary || t("calendar.note_fallback")}
                          </div>
                          {note.text && (
                            <p className="text-slate-400 dark:text-slate-600 leading-relaxed mb-2 line-clamp-3">
                              {note.text}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {note.mood && (
                              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 dark:bg-slate-200 dark:text-slate-800">
                                Mood: {note.mood}
                              </span>
                            )}
                            {parseTags(note.market_condition).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 dark:border-slate-300 dark:text-slate-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4 dark:border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800"
                  >
                    {t("common.close", "Chiudi")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      navigate(`/notes?date=${selectedDay}`);
                    }}
                    className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 transition"
                  >
                    {isItalian ? "Vai alle Note" : "Open in Notes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
