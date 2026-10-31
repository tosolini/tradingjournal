import { useQuery } from "@tanstack/react-query";
import { AreaSeries, ColorType, createChart } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { DailyPnlPoint, fetchDailyPnl } from "../lib/api";

function asNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | undefined, locale = "en-US"): string {
  return asNumber(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedMoney(value: string | number | undefined, locale = "en-US"): string {
  const n = asNumber(value);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}${formatMoney(Math.abs(n), locale)}`;
}

function pnlTone(n: number): string {
  if (n > 0) return "text-teal-300 dark:text-teal-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-500";
}

function KpiCard({
  label,
  value,
  tone = "text-slate-100 dark:text-slate-800",
  caption,
}: {
  label: string;
  value: string;
  tone?: string;
  caption?: string;
}) {
  return (
    <article className="card relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/60 to-transparent" />
      <div className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {caption && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{caption}</div>}
    </article>
  );
}

function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-700/40 px-4 py-3 dark:border-slate-300/30">
          <h2 className="text-sm font-semibold text-slate-200 dark:text-slate-800">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/* ─── Equity curve chart (lightweight-charts) ── */
function EquityChartPanel({ data }: { data: DailyPnlPoint[] }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"invested" | "wealth">("invested");

  useEffect(() => {
    if (!ref.current || data.length < 2) return;
    const isDark = theme === "dark";
    const chart = createChart(ref.current, {
      autoSize: true,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.14)" },
        horzLines: { color: isDark ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.14)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: {
        vertLine: { color: isDark ? "rgba(45,212,191,0.4)" : "rgba(13,148,136,0.4)", labelBackgroundColor: "#14b8a6" },
        horzLine: { color: isDark ? "rgba(45,212,191,0.4)" : "rgba(13,148,136,0.4)", labelBackgroundColor: "#14b8a6" },
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: isDark ? "#2dd4bf" : "#0d9488",
      topColor: isDark ? "rgba(45,212,191,0.35)" : "rgba(13,148,136,0.28)",
      bottomColor: isDark ? "rgba(45,212,191,0.02)" : "rgba(13,148,136,0.02)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    areaSeries.setData(
      data.map((p) => ({
        time: p.date,
        value:
          mode === "wealth"
            ? asNumber(p.total_wealth ?? p.total_value)
            : asNumber(p.total_value),
      }))
    );

    chart.timeScale().fitContent();
    const resizeObserver = new ResizeObserver(() => chart.applyOptions({}));
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, theme, mode]);

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
        Not enough daily snapshots yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => setMode("invested")}
          className={`rounded px-2 py-1 font-medium transition ${
            mode === "invested"
              ? "bg-teal-500 font-bold text-slate-950"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-500"
          }`}
        >
          {t("performance.mode_invested", "Investito")}
        </button>
        <button
          type="button"
          onClick={() => setMode("wealth")}
          title={t(
            "performance.mode_wealth_hint",
            "Include cedole, rimborsi e vendite incassate",
          )}
          className={`rounded px-2 py-1 font-medium transition ${
            mode === "wealth"
              ? "bg-teal-500 font-bold text-slate-950"
              : "text-slate-400 hover:text-slate-200 dark:text-slate-500"
          }`}
        >
          {t("performance.mode_wealth", "Patrimonio totale")}
        </button>
      </div>
      <div ref={ref} />
    </div>
  );
}

/* ─── Daily P&L bars (custom SVG) ── */
function DailyPnlBars({ data, locale }: { data: DailyPnlPoint[]; locale: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const recent = data.slice(-30);
  if (recent.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
        No daily snapshots recorded yet.
      </div>
    );
  }
  const maxAbs = Math.max(1, ...recent.map((p) => Math.abs(asNumber(p.day_pnl))));
  const W = 720;
  const H = 180;
  const pad = 12;
  const zero = H / 2;
  const scale = (H / 2 - pad) / maxAbs;
  const barW = Math.min(18, (W - pad * 2) / recent.length - 3);

  return (
    <div className="px-2 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <defs>
          <linearGradient id="pnlGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="pnlRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="pnlGreenLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="pnlRedLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>
        <line x1={pad} y1={zero} x2={W - pad} y2={zero} stroke="#64748b" strokeOpacity="0.35" strokeWidth="1" />
        {recent.map((p, i) => {
          const value = asNumber(p.day_pnl);
          const h = Math.abs(value) * scale;
          const step = (W - pad * 2) / recent.length;
          const x = pad + i * step + step / 2 - barW / 2;
          const y = value >= 0 ? zero - h : zero;
          const shortDate = p.date.slice(5); // MM-DD
          return (
            <g key={p.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1.5)}
                rx="2"
                fill={value >= 0 ? (isDark ? "url(#pnlGreen)" : "url(#pnlGreenLight)") : (isDark ? "url(#pnlRed)" : "url(#pnlRedLight)")}
                className="transition-opacity hover:opacity-80"
              >
                <title>{`${p.date}: ${formatSignedMoney(value, locale)} (${asNumber(p.day_pnl_pct).toFixed(2)}%)`}</title>
              </rect>
              {recent.length <= 31 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill={isDark ? "#94a3b8" : "#64748b"}>
                  {shortDate}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="px-3 pb-1 text-right text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {recent.length} {recent.length === 1 ? "day" : "days"}
      </div>
    </div>
  );
}

/* ─── Color calendar (month grid) ── */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayColor(daily: Record<string, DailyPnlPoint>, dateKey: string, dark: boolean): string {
  const point = daily[dateKey];
  if (!point) return "transparent";
  const n = asNumber(point.day_pnl);
  if (n > 0) return dark ? "rgba(45,212,191,0.85)" : "rgba(13,148,136,0.8)";
  if (n < 0) return dark ? "rgba(248,113,113,0.85)" : "rgba(220,38,38,0.8)";
  return dark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.25)";
}

function CalendarGrid({
  daily,
  month,
  onSelect,
}: {
  daily: Record<string, DailyPnlPoint>;
  month: string; // YYYY-MM
  onSelect: (date: string) => void;
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [year, monthIdx] = month.split("-").map(Number);

  const first = new Date(year, monthIdx - 1, 1);
  const daysInMonth = new Date(year, monthIdx, 0).getDate();
  // Monday-first offset (getDay: 0=Sun..6=Sat → shift so Monday=0)
  const leadOffset = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leadOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, monthIdx - 1, i + 1);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }),
  ];

  const monthTotal = Object.values(daily)
    .filter((p) => p.date.startsWith(month))
    .reduce((sum, p) => sum + asNumber(p.day_pnl), 0);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {WEEKDAYS.map((wd) => (
          <div key={wd}>{wd}</div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((dateKey, i) =>
          dateKey === null ? (
            <div key={`empty-${i}`} />
          ) : (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelect(dateKey)}
              className="group relative flex aspect-square flex-col items-center justify-center rounded-lg border border-slate-700/40 dark:border-slate-300/30 text-xs font-medium transition hover:scale-105 hover:shadow-lg"
              style={{ backgroundColor: dayColor(daily, dateKey, dark), borderColor: daily[dateKey] ? "transparent" : undefined }}
              title={(() => {
                const p = daily[dateKey];
                if (!p) return dateKey;
                return `${dateKey}: ${formatSignedMoney(asNumber(p.day_pnl))} (${asNumber(p.day_pnl_pct).toFixed(2)}%)`;
              })()}
            >
              <span className={daily[dateKey] ? "text-slate-950 font-semibold" : "text-slate-500 dark:text-slate-400"}>
                {Number(dateKey.slice(-2))}
              </span>
              {daily[dateKey] && (
                <span className="hidden sm:block text-[8px] leading-none text-slate-950/80 font-semibold">
                  {asNumber(daily[dateKey].day_pnl) > 0 ? "+" : ""}
                  {formatMoney(Math.abs(asNumber(daily[dateKey].day_pnl)))}
                </span>
              )}
            </button>
          )
        )}
      </div>
      <div className={`mt-3 text-right text-sm font-semibold tabular-nums ${pnlTone(monthTotal)}`}>
        {monthTotal > 0 ? "+" : ""}
        {formatMoney(monthTotal)}
        {" "}month
      </div>
    </div>
  );
}

/* ─── Page ── */
export function PerformancePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "it" ? "it-IT" : "en-US";
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["daily-pnl"],
    queryFn: () => fetchDailyPnl(),
  });

  const dailyMap = useMemo(() => {
    const map: Record<string, DailyPnlPoint> = {};
    for (const point of data) map[point.date] = point;
    return map;
  }, [data]);

  const lastPoint = data.length > 0 ? data[data.length - 1] : null;
  const positiveDays = data.filter((p) => asNumber(p.day_pnl) > 0).length;
  const negativeDays = data.filter((p) => asNumber(p.day_pnl) < 0).length;
  const pnlDays = positiveDays + negativeDays;
  const winRate = pnlDays > 0 ? (positiveDays / pnlDays) * 100 : 0;

  const selectedPoint = selectedDate ? dailyMap[selectedDate] : null;
  const selectedMonthTotal = data
    .filter((p) => p.date.startsWith(month))
    .reduce((sum, p) => sum + asNumber(p.day_pnl), 0);
  const bestDay = data.reduce<DailyPnlPoint | null>(
    (best, p) => (!best || asNumber(p.day_pnl) > asNumber(best.day_pnl) ? p : best),
    null
  );
  const worstDay = data.reduce<DailyPnlPoint | null>(
    (worst, p) => (!worst || asNumber(p.day_pnl) < asNumber(worst.day_pnl) ? p : worst),
    null
  );

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("performance.title")}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">{t("performance.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("performance.total_value")}
          value={lastPoint ? formatMoney(asNumber(lastPoint.total_value), locale) : "—"}
        />
        <KpiCard
          label={t("performance.cumulative_pnl")}
          value={lastPoint ? formatSignedMoney(asNumber(lastPoint.cumulative_pnl), locale) : "—"}
          tone={pnlTone(lastPoint ? asNumber(lastPoint.cumulative_pnl) : 0)}
        />
        <KpiCard
          label={t("performance.best_day")}
          value={bestDay ? `${formatSignedMoney(asNumber(bestDay.day_pnl), locale)} (${bestDay.date})` : "—"}
          tone="text-teal-300 dark:text-teal-700"
        />
        <KpiCard
          label={t("performance.worst_day")}
          value={worstDay ? `${formatSignedMoney(asNumber(worstDay.day_pnl), locale)} (${worstDay.date})` : "—"}
          tone="text-red-400 dark:text-red-600"
        />
      </div>

      <Panel
        title={t("performance.equity_title")}
        aside={
          lastPoint ? (
            <span className={`text-sm font-semibold tabular-nums ${pnlTone(asNumber(lastPoint.total_return))}`}>
              {t("performance.total_return")}: {formatSignedMoney(asNumber(lastPoint.total_return), locale)}
            </span>
          ) : undefined
        }
      >
        <EquityChartPanel data={data} />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title={t("performance.daily_title")} aside={winRate > 0 ? <span className="text-xs text-slate-400 dark:text-slate-500">{t("performance.win_days", { pct: winRate.toFixed(0) })}</span> : undefined}>
          <DailyPnlBars data={data} locale={locale} />
        </Panel>

        <Panel
          title={t("performance.calendar_title")}
          aside={
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:hover:text-teal-900"
                aria-label={t("performance.prev_month")}
              >
                ‹
              </button>
              <span className="min-w-24 text-center text-xs font-semibold text-slate-200 dark:text-slate-800">{month}</span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 dark:text-slate-900 hover:border-teal-500/50 hover:text-teal-200 dark:hover:text-teal-900"
                aria-label={t("performance.next_month")}
              >
                ›
              </button>
            </div>
          }
        >
          <div className="p-4">
            <CalendarGrid daily={dailyMap} month={month} onSelect={setSelectedDate} />
          </div>
        </Panel>
      </div>

      {selectedPoint && selectedDate && (
        <Panel title={t("performance.day_detail", { date: selectedDate })}>
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("performance.total_value")}</div>
              <div className="mt-1 font-semibold tabular-nums text-slate-200 dark:text-slate-800">{formatMoney(asNumber(selectedPoint.total_value), locale)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("performance.day_pnl")}</div>
              <div className={`mt-1 font-semibold tabular-nums ${pnlTone(asNumber(selectedPoint.day_pnl))}`}>
                {formatSignedMoney(asNumber(selectedPoint.day_pnl), locale)}
                <span className="ml-1 text-xs">({asNumber(selectedPoint.day_pnl_pct).toFixed(2)}%)</span>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("performance.cumulative_pnl")}</div>
              <div className={`mt-1 font-semibold tabular-nums ${pnlTone(asNumber(selectedPoint.cumulative_pnl))}`}>
                {formatSignedMoney(asNumber(selectedPoint.cumulative_pnl), locale)}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
