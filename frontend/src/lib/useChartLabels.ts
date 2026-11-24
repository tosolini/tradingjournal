import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tj_chart_labels_visible";
const SYNC_EVENT = "tj-chart-labels-change";

function readStoredPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "false") return false;
    if (raw === "true") return true;
  } catch {
    // Ignore storage access errors
  }
  return true;
}

/**
 * Shared preference hook for showing/hiding overlapping text titles on
 * Lightweight Charts while keeping numeric price badges on the right axis.
 */
export function useChartLabels(): [boolean, () => void] {
  const [showLabels, setShowLabels] = useState<boolean>(readStoredPreference);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      if (typeof custom.detail === "boolean") {
        setShowLabels(custom.detail);
      }
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    return () => window.removeEventListener(SYNC_EVENT, handleSync);
  }, []);

  const toggleLabels = useCallback(() => {
    setShowLabels((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage access errors
      }
      window.dispatchEvent(new CustomEvent<boolean>(SYNC_EVENT, { detail: next }));
      return next;
    });
  }, []);

  return [showLabels, toggleLabels];
}
