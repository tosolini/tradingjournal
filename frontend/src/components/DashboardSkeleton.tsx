import { useTranslation } from "react-i18next";
import bullVectLogo from "../assets/bull_vect.svg";

export function DashboardSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-5 fade-up" aria-busy="true" aria-live="polite">
      {/* ─── Hero Loading Banner ────────────────────────────── */}
      <section className="card relative overflow-hidden p-5 border border-teal-500/30 bg-gradient-to-r from-teal-950/20 via-slate-900/60 to-slate-900/80 dark:from-teal-50/60 dark:via-white dark:to-slate-50">
        {/* Animated continuous indeterminate top progress bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-slate-800/80 dark:bg-slate-200/80 overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-400 rounded-full animate-indeterminate-bar" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Animated Glowing Bull Logo Emblem */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/30 animate-pulse-glow">
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-teal-500" />
            </span>
            <img src={bullVectLogo} alt="Trading Journal" className="h-8 w-8 object-contain" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-100 dark:text-slate-800">
                {t("dashboard.loading_title", "Caricamento dashboard in corso...")}
              </h2>
              <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-medium text-teal-300 dark:text-teal-700">
                {t("dashboard.syncing", "Live Sync")}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {t("dashboard.loading_subtitle", "Sincronizzazione quotazioni e ricalcolo metriche di portafoglio...")}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {t(
                "dashboard.loading_notice",
                "Al primo avvio o dopo un periodo di inattività il recupero delle quotazioni e il calcolo del portafoglio richiedono alcuni istanti."
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ─── 5 Hero KPI Cards Skeleton ──────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <article
            key={i}
            className="card relative overflow-hidden p-4 skeleton-shimmer"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent" />
            <div className="h-3 w-24 rounded bg-slate-700/50 dark:bg-slate-300/50" />
            <div className="mt-3 h-8 w-32 rounded bg-slate-700/80 dark:bg-slate-300/80" />
            <div className="mt-2.5 h-3 w-28 rounded bg-slate-800/60 dark:bg-slate-200/60" />
          </article>
        ))}
      </section>

      {/* ─── 4 Compact Metric Cards Skeleton ────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <article
            key={i}
            className="card relative overflow-hidden p-4 skeleton-shimmer"
            style={{ animationDelay: `${150 + i * 80}ms` }}
          >
            <div className="h-3 w-20 rounded bg-slate-700/50 dark:bg-slate-300/50" />
            <div className="mt-2.5 h-7 w-24 rounded bg-slate-700/70 dark:bg-slate-300/70" />
            <div className="mt-2 h-3 w-36 rounded bg-slate-800/60 dark:bg-slate-200/60" />
          </article>
        ))}
      </section>

      {/* ─── Main Equity Chart & Outcome Donut Skeleton ─────── */}
      <section className="grid gap-4 xl:grid-cols-3">
        {/* Equity Chart Panel Skeleton */}
        <section className="card xl:col-span-2 overflow-hidden skeleton-shimmer">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/40 px-4 py-3 dark:border-slate-300/30">
            <div className="h-4 w-36 rounded bg-slate-700/60 dark:bg-slate-300/60" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-40 rounded-lg border border-slate-700/40 bg-slate-800/40 dark:bg-slate-200/40" />
              <div className="h-7 w-48 rounded-lg border border-slate-700/40 bg-slate-800/40 dark:bg-slate-200/40" />
            </div>
          </header>

          <div className="p-4">
            <div className="relative h-[320px] w-full rounded-lg bg-slate-900/40 dark:bg-slate-100/40 p-4 overflow-hidden flex flex-col justify-between">
              {/* Fake grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-6 opacity-15 pointer-events-none">
                <div className="border-b border-slate-500 border-dashed w-full" />
                <div className="border-b border-slate-500 border-dashed w-full" />
                <div className="border-b border-slate-500 border-dashed w-full" />
                <div className="border-b border-slate-500 border-dashed w-full" />
              </div>

              {/* Animated Chart Wave Silhouette */}
              <div className="relative w-full h-[230px] mt-4">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 800 240"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="skeleton-chart-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0,200 Q 140,190 220,150 T 420,130 T 620,70 T 800,45 L 800,240 L 0,240 Z"
                    fill="url(#skeleton-chart-grad)"
                    className="opacity-75"
                  />
                  <path
                    d="M 0,200 Q 140,190 220,150 T 420,130 T 620,70 T 800,45"
                    stroke="#2dd4bf"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="opacity-80"
                  />
                  <circle cx="800" cy="45" r="4.5" fill="#2dd4bf" className="animate-ping" />
                  <circle cx="800" cy="45" r="4" fill="#2dd4bf" />
                </svg>
              </div>

              {/* Fake X-axis dates */}
              <div className="flex justify-between pt-2 border-t border-slate-700/40 text-[10px] text-slate-500 dark:border-slate-300/40">
                <div className="h-2.5 w-12 rounded bg-slate-700/50 dark:bg-slate-300/50" />
                <div className="h-2.5 w-12 rounded bg-slate-700/50 dark:bg-slate-300/50" />
                <div className="h-2.5 w-12 rounded bg-slate-700/50 dark:bg-slate-300/50" />
                <div className="h-2.5 w-12 rounded bg-slate-700/50 dark:bg-slate-300/50" />
                <div className="h-2.5 w-12 rounded bg-slate-700/50 dark:bg-slate-300/50" />
              </div>
            </div>
          </div>
        </section>

        {/* Outcome Donut Skeleton */}
        <section className="card xl:col-span-1 overflow-hidden skeleton-shimmer flex flex-col justify-between">
          <header className="border-b border-slate-700/40 px-4 py-3 dark:border-slate-300/30">
            <div className="h-4 w-28 rounded bg-slate-700/60 dark:bg-slate-300/60" />
          </header>

          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
            {/* Animated Rotating Donut Ring */}
            <div className="relative flex items-center justify-center">
              <svg className="w-44 h-44 animate-spin-slow" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="currentColor"
                  className="text-slate-800 dark:text-slate-200"
                  strokeWidth="11"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#2dd4bf"
                  strokeWidth="11"
                  strokeDasharray="160 240"
                  strokeLinecap="round"
                  fill="none"
                  className="opacity-70"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <div className="h-6 w-14 rounded bg-slate-700/70 dark:bg-slate-300/70" />
                <div className="mt-1 h-2.5 w-10 rounded bg-slate-800/60 dark:bg-slate-200/60" />
              </div>
            </div>

            {/* Legend Pills Skeleton */}
            <div className="flex flex-wrap justify-center gap-3 w-full">
              <div className="h-5 w-20 rounded-md bg-slate-800/60 dark:bg-slate-200/60" />
              <div className="h-5 w-20 rounded-md bg-slate-800/60 dark:bg-slate-200/60" />
              <div className="h-5 w-20 rounded-md bg-slate-800/60 dark:bg-slate-200/60" />
            </div>
          </div>
        </section>
      </section>

      {/* ─── Secondary Panels Skeleton ──────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-3">
        <section className="card xl:col-span-2 overflow-hidden skeleton-shimmer p-4">
          <div className="h-4 w-32 rounded bg-slate-700/60 dark:bg-slate-300/60 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="rounded-lg bg-slate-800/40 dark:bg-slate-200/40 p-3">
                <div className="h-2.5 w-16 rounded bg-slate-700/50 dark:bg-slate-300/50" />
                <div className="mt-2 h-5 w-20 rounded bg-slate-700/70 dark:bg-slate-300/70" />
              </div>
            ))}
          </div>
        </section>

        <section className="card xl:col-span-1 overflow-hidden skeleton-shimmer p-4">
          <div className="h-4 w-36 rounded bg-slate-700/60 dark:bg-slate-300/60 mb-4" />
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-800/40 dark:bg-slate-200/40 p-3 h-14" />
            <div className="rounded-lg bg-slate-800/40 dark:bg-slate-200/40 p-3 h-14" />
          </div>
        </section>
      </section>
    </div>
  );
}
