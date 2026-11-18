import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { analysisApi, AnalysisChartData } from "../../lib/api";
import { useTheme } from "../../contexts/ThemeContext";

interface AnalysisInteractiveChartProps {
  reportId: number;
  symbol: string;
  market?: string;
  mode: "technical" | "cyclical";
  height?: number;
}

type MaType = "SMA" | "EMA";
type TimeframeOption = "1M" | "3M" | "6M" | "1Y" | "ALL";

export const AnalysisInteractiveChart: React.FC<AnalysisInteractiveChartProps> = ({
  reportId,
  symbol,
  mode,
  height = 460,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  // Technical Toolbar State
  const [maType, setMaType] = useState<MaType>("SMA");
  const [showMa20, setShowMa20] = useState<boolean>(true);
  const [showMa50, setShowMa50] = useState<boolean>(true);
  const [showMa200, setShowMa200] = useState<boolean>(true);
  const [showLevels, setShowLevels] = useState<boolean>(true);
  const [showCoachLevels, setShowCoachLevels] = useState<boolean>(true);

  // Cyclical Toolbar State
  const [showCyclicalWave, setShowCyclicalWave] = useState<boolean>(true);
  const [showTurningPoints, setShowTurningPoints] = useState<boolean>(true);

  // Timeframe State
  const [timeframe, setTimeframe] = useState<TimeframeOption>("6M");

  // Hovered Bar Info for Header Legend
  const [hoveredCandle, setHoveredCandle] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  // Fetch chart data
  const { data: chartData, isLoading, isError } = useQuery<AnalysisChartData>({
    queryKey: ["analysisChartData", reportId],
    queryFn: () => analysisApi.getChartData(reportId),
    staleTime: 5 * 60 * 1000,
  });

  // Build and sync chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData || !chartData.candles || chartData.candles.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    container.innerHTML = "";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? "#0f172a" : "#ffffff", // slate-900 or white
        },
        textColor: isDark ? "#94a3b8" : "#475569", // slate-400 or slate-600
        fontSize: 11,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: {
          color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)", // slate-700/40
        },
        horzLines: {
          color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)",
        },
      },
      crosshair: {
        vertLine: {
          color: isDark ? "#64748b" : "#94a3b8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? "#1e293b" : "#334155",
        },
        horzLine: {
          color: isDark ? "#64748b" : "#94a3b8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? "#1e293b" : "#334155",
        },
      },
      timeScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        scaleMargins: {
          top: 0.1,
          bottom: 0.15,
        },
      },
    });

    chartInstanceRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", // emerald-500
      downColor: "#ef4444", // red-500
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    const formattedCandles = chartData.candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(formattedCandles);

    // Initial hover legend shows latest bar
    const lastCandle = chartData.candles[chartData.candles.length - 1];
    setHoveredCandle(lastCandle);

    // Subscribe to crosshair move for dynamic legend
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.get(candleSeries)) {
        const d = param.seriesData.get(candleSeries) as any;
        setHoveredCandle({
          time: String(param.time),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        });
      } else {
        setHoveredCandle(lastCandle);
      }
    });

    // 2. Technical Mode Overlays
    if (mode === "technical") {
      const tech = chartData.technical || {};

      // Moving Averages: SMA vs EMA
      const ma20Data = maType === "SMA" ? tech.sma_20 : tech.ema_20;
      const ma50Data = maType === "SMA" ? tech.sma_50 : tech.ema_50;
      const ma200Data = maType === "SMA" ? tech.sma_200 : tech.ema_200;

      if (showMa20 && ma20Data && ma20Data.length > 0) {
        const ma20Series = chart.addSeries(LineSeries, {
          color: "#f59e0b", // Amber-500
          lineWidth: 1,
          priceLineVisible: false,
          title: `${maType} 20`,
        });
        ma20Series.setData(ma20Data);
      }

      if (showMa50 && ma50Data && ma50Data.length > 0) {
        const ma50Series = chart.addSeries(LineSeries, {
          color: "#38bdf8", // Sky-400
          lineWidth: 1,
          priceLineVisible: false,
          title: `${maType} 50`,
        });
        ma50Series.setData(ma50Data);
      }

      if (showMa200 && ma200Data && ma200Data.length > 0) {
        const ma200Series = chart.addSeries(LineSeries, {
          color: "#a855f7", // Purple-500
          lineWidth: 2,
          priceLineVisible: false,
          title: `${maType} 200`,
        });
        ma200Series.setData(ma200Data);
      }

      // Supports & Resistances
      if (showLevels) {
        (tech.supports || []).forEach((sup, idx) => {
          candleSeries.createPriceLine({
            price: sup,
            color: "#10b981", // Emerald
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Sup ${idx + 1} (${sup.toFixed(2)})`,
          });
        });

        (tech.resistances || []).forEach((res, idx) => {
          candleSeries.createPriceLine({
            price: res,
            color: "#f43f5e", // Rose
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Res ${idx + 1} (${res.toFixed(2)})`,
          });
        });
      }

      // Coach Target & Stop Loss Levels
      if (showCoachLevels && tech.coach_levels) {
        if (tech.coach_levels.stop_loss) {
          candleSeries.createPriceLine({
            price: tech.coach_levels.stop_loss,
            color: "#ef4444", // Red solid
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `Stop Loss (${tech.coach_levels.stop_loss.toFixed(2)})`,
          });
        }
        if (tech.coach_levels.target_price) {
          candleSeries.createPriceLine({
            price: tech.coach_levels.target_price,
            color: "#10b981", // Emerald solid
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `Target (${tech.coach_levels.target_price.toFixed(2)})`,
          });
        }
      }
    }

    // 3. Cyclical Mode Overlays
    if (mode === "cyclical") {
      const cyc = chartData.cyclical || {};

      // Harmonic Composite Wave
      if (showCyclicalWave && cyc.composite_wave && cyc.composite_wave.length > 0) {
        const waveSeries = chart.addSeries(LineSeries, {
          color: "#06b6d4", // Cyan-500
          lineWidth: 2,
          priceLineVisible: false,
          title: t("analysis.charts.cyclical_wave_title"),
        });

        const waveData = cyc.composite_wave.map((p) => ({
          time: p.time,
          value: p.value,
        }));
        waveSeries.setData(waveData);

        // Turning Point Markers (Future Troughs and Peaks)
        if (showTurningPoints && cyc.turning_points && cyc.turning_points.length > 0) {
          const markers = cyc.turning_points.map((tp) => ({
            time: tp.date,
            position: (tp.type === "trough" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
            color: tp.type === "trough" ? "#10b981" : "#ef4444",
            shape: (tp.type === "trough" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
            text: tp.type === "trough" ? t("analysis.charts.trough_badge") : t("analysis.charts.peak_badge"),
          }));

          try {
            createSeriesMarkers(waveSeries, markers);
          } catch {
            // Fallback gracefully if marker time isn't strictly sorted
          }
        }
      }
    }

    // 4. Timeframe Zoom Range
    applyTimeframe(chart, chartData.candles, timeframe);

    // Responsive resize observer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [
    chartData,
    height,
    isDark,
    mode,
    maType,
    showMa20,
    showMa50,
    showMa200,
    showLevels,
    showCoachLevels,
    showCyclicalWave,
    showTurningPoints,
    timeframe,
    t,
  ]);

  // Helper to zoom chart timescale based on selected timeframe
  const applyTimeframe = (chart: IChartApi, candles: any[], tf: TimeframeOption) => {
    if (!candles || candles.length === 0) return;
    if (tf === "ALL") {
      chart.timeScale().fitContent();
      return;
    }

    const n = candles.length;
    let barsBack = 120; // 6M default
    if (tf === "1M") barsBack = 22;
    if (tf === "3M") barsBack = 65;
    if (tf === "6M") barsBack = 130;
    if (tf === "1Y") barsBack = 250;

    const fromIdx = Math.max(0, n - barsBack);
    const fromTime = candles[fromIdx]?.time;
    const toTime = candles[n - 1]?.time;

    if (fromTime && toTime) {
      try {
        chart.timeScale().setVisibleRange({
          from: fromTime,
          to: toTime,
        });
      } catch {
        chart.timeScale().fitContent();
      }
    }
  };

  const handleTimeframeChange = (tf: TimeframeOption) => {
    setTimeframe(tf);
    if (chartInstanceRef.current && chartData?.candles) {
      applyTimeframe(chartInstanceRef.current, chartData.candles, tf);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[380px] space-y-4">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm font-medium text-slate-400 animate-pulse">
          {t("analysis.charts.loading_candles", { symbol })}
        </span>
      </div>
    );
  }

  if (isError || !chartData || !chartData.candles || chartData.candles.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-400 text-sm">
        {t("analysis.charts.candles_unavailable", { symbol })}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
      {/* Chart Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        {/* Left: Dynamic Candle Legend */}
        <div className="flex flex-wrap items-baseline gap-2.5 text-xs font-mono">
          <span className="font-bold text-white text-sm tracking-tight">{symbol}</span>
          {hoveredCandle && (
            <>
              <span className="text-slate-400 text-[11px] font-sans">
                {hoveredCandle.time}
              </span>
              <span className="text-slate-400">
                O: <strong className="text-slate-200">{hoveredCandle.open.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                H: <strong className="text-slate-200">{hoveredCandle.high.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                L: <strong className="text-slate-200">{hoveredCandle.low.toFixed(2)}</strong>
              </span>
              <span className="text-slate-400">
                C:{" "}
                <strong
                  className={
                    hoveredCandle.close >= hoveredCandle.open ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {hoveredCandle.close.toFixed(2)}
                </strong>
              </span>
            </>
          )}
        </div>

        {/* Right: Technical or Cyclical Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Technical Controls */}
          {mode === "technical" && (
            <>
              {/* SMA / EMA Type Toggle */}
              <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setMaType("SMA")}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    maType === "SMA" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  SMA
                </button>
                <button
                  type="button"
                  onClick={() => setMaType("EMA")}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    maType === "EMA" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  EMA
                </button>
              </div>

              {/* MA 20 Toggle */}
              <button
                type="button"
                onClick={() => setShowMa20(!showMa20)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  showMa20
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span>20</span>
              </button>

              {/* MA 50 Toggle */}
              <button
                type="button"
                onClick={() => setShowMa50(!showMa50)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  showMa50
                    ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                <span>50</span>
              </button>

              {/* MA 200 Toggle */}
              <button
                type="button"
                onClick={() => setShowMa200(!showMa200)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  showMa200
                    ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                <span>200</span>
              </button>

              {/* Supports & Resistances Toggle */}
              <button
                type="button"
                onClick={() => setShowLevels(!showLevels)}
                title={t("analysis.charts.toggle_sr_tooltip")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showLevels
                    ? "bg-slate-800 text-white border-slate-700"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span>📐</span>
                <span>{t("analysis.charts.toggle_sr")}</span>
              </button>

              {/* Coach Levels Toggle (if present) */}
              {(chartData.technical.coach_levels?.stop_loss || chartData.technical.coach_levels?.target_price) && (
                <button
                  type="button"
                  onClick={() => setShowCoachLevels(!showCoachLevels)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    showCoachLevels
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                  }`}
                >
                  <span>🎯</span>
                  <span>{t("analysis.charts.toggle_coach_levels")}</span>
                </button>
              )}
            </>
          )}

          {/* Cyclical Controls */}
          {mode === "cyclical" && (
            <>
              <button
                type="button"
                onClick={() => setShowCyclicalWave(!showCyclicalWave)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showCyclicalWave
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span>{t("analysis.charts.toggle_harmonic_wave")}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTurningPoints(!showTurningPoints)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showTurningPoints
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                <span>🔄</span>
                <span>{t("analysis.charts.toggle_turning_points")}</span>
              </button>
            </>
          )}

          {/* Timeframe Selector */}
          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-semibold ml-1">
            {(["1M", "3M", "6M", "1Y", "ALL"] as TimeframeOption[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  timeframe === tf ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cyclical Informative Banner */}
      {mode === "cyclical" && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-300">
          <span>ℹ️</span>
          <span>{t("analysis.charts.cyclical_projection_notice")}</span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="w-full relative" style={{ height: `${height}px` }} />
    </div>
  );
};
