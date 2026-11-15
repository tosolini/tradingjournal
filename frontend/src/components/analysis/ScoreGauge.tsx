import React from "react";

interface ScoreGaugeProps {
  score: number | null | undefined;
  size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, size = 110 }) => {
  const validScore = score !== null && score !== undefined ? Math.max(1, Math.min(10, score)) : null;

  const getColor = (s: number) => {
    if (s >= 7.5) return { stroke: "#10b981", text: "text-emerald-500", label: "Elevato", bg: "bg-emerald-500/10 text-emerald-400" };
    if (s >= 5.5) return { stroke: "#f59e0b", text: "text-amber-500", label: "Moderato", bg: "bg-amber-500/10 text-amber-400" };
    return { stroke: "#ef4444", text: "text-rose-500", label: "Prudenziale", bg: "bg-rose-500/10 text-rose-400" };
  };

  const colorConfig = validScore ? getColor(validScore) : { stroke: "#64748b", text: "text-slate-400", label: "N/D", bg: "bg-slate-800 text-slate-400" };

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = validScore ? (validScore / 10) * circumference : 0;
  const dashoffset = circumference - progress;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-800/80 dark:text-slate-800"
            fill="transparent"
          />
          {/* Progress Indicator */}
          {validScore && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colorConfig.stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
          )}
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-extrabold tracking-tight ${colorConfig.text}`}>
            {validScore !== null ? validScore : "—"}
          </span>
          <span className="text-[10px] uppercase font-semibold text-slate-400">/ 10</span>
        </div>
      </div>

      <div className="mt-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-transparent ${colorConfig.bg}`}>
          {colorConfig.label}
        </span>
      </div>
    </div>
  );
};
