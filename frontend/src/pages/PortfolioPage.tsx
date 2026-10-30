import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createChart, AreaSeries } from "lightweight-charts";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Account,
  Asset,
  BondCalendarItem,
  BondPortfolioMetrics,
  HoldingDetail,
  HoldingExit,
  PortfolioSummary,
  createHolding,
  deleteHolding,
  fetchAccounts,
  fetchAssets,
  fetchBondCalendar,
  fetchBondMetrics,
  fetchPortfolioDetails,
  fetchPortfolioExits,
  fetchPortfolioHistory,
  fetchPortfolioSummary,
  updateHolding,
} from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { AssetFormModal } from "./AssetsPage";
import { QuickAccountModal } from "../components/QuickAccountModal";
import { cleanNumberInput, formatMoney, formatNumber, formatPct, formatPrice, formatQuantity, getNumberLocale, parseLocaleNumber, parseLocaleNumber as asNumber } from "../lib/numbers";

function isBondInstrumentType(value: string | null | undefined): boolean {
  return ["bond", "government_bond", "titolo_di_stato"].includes((value || "").toLowerCase());
}

function exitTypeLabel(type: string): string {
  if (type === "maturity") return "Rimborso a scadenza";
  if (type === "early_redemption") return "Rimborso anticipato";
  return "Vendita a mercato";
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}


function colorForPct(value: string | number | null | undefined): string {
  const n = asNumber(value);
  if (n > 0) return "text-green-400 dark:text-green-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-900";
}
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className || "h-4 w-4"} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className || "h-4 w-4"} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export type GroupedHolding = {
  key: string;
  account_id: number;
  asset_id: number;
  asset_symbol: string;
  asset_name: string;
  instrument_type: string;
  asset_currency: string;
  tranches: HoldingDetail[];
  totalQuantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  returnValue: number;
  returnPct: number;
  hasBonusEligible: boolean;
  allBonusEligible: boolean;
  accruedInterest?: number | null;
  dirtyPrice?: number | null;
  weightedYtmNet?: number | null;
};

function groupHoldings(items: HoldingDetail[]): GroupedHolding[] {
  const map = new Map<string, GroupedHolding>();

  for (const h of items) {
    const key = `${h.account_id}_${h.asset_id}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        account_id: h.account_id,
        asset_id: h.asset_id,
        asset_symbol: h.asset_symbol,
        asset_name: h.asset_name,
        instrument_type: h.instrument_type,
        asset_currency: h.asset_currency,
        tranches: [],
        totalQuantity: 0,
        avgCost: 0,
        currentPrice: 0,
        marketValue: 0,
        returnValue: 0,
        returnPct: 0,
        hasBonusEligible: false,
        allBonusEligible: true,
        accruedInterest: null,
        dirtyPrice: null,
        weightedYtmNet: null,
      };
      map.set(key, group);
    }
    group.tranches.push(h);
  }

  for (const group of map.values()) {
    const isBond = isBondInstrumentType(group.instrument_type);

    let totalQty = 0;
    let totalCostBasis = 0;
    let totalMktVal = 0;
    let totalRetVal = 0;
    let priceWeightedSum = 0;
    let accruedWeightedSum = 0;
    let accruedWeight = 0;
    let dirtyWeightedSum = 0;
    let dirtyWeight = 0;
    let ytmWeightedSum = 0;
    let ytmWeight = 0;

    for (const t of group.tranches) {
      const q = asNumber(t.quantity);
      const c = asNumber(t.avg_cost);
      const mv = asNumber(t.market_value);
      const rv = asNumber(t.return_value);
      totalQty += q;
      totalMktVal += mv;
      totalRetVal += rv;
      priceWeightedSum += q * asNumber(t.current_price);

      if (t.accrued_interest !== undefined && t.accrued_interest !== null) {
        accruedWeightedSum += q * asNumber(t.accrued_interest);
        accruedWeight += q;
      }
      if (t.dirty_price !== undefined && t.dirty_price !== null) {
        dirtyWeightedSum += q * asNumber(t.dirty_price);
        dirtyWeight += q;
      }

      if (isBond) {
        const accIn = asNumber(t.accrued_interest_in);
        totalCostBasis += (q * (c + accIn)) / 100;
        if (t.ytm_net !== undefined && t.ytm_net !== null) {
          ytmWeightedSum += mv * asNumber(t.ytm_net);
          ytmWeight += mv;
        }
      } else {
        totalCostBasis += q * c;
      }
    }

    group.totalQuantity = totalQty;
    group.currentPrice = totalQty > 0 ? priceWeightedSum / totalQty : 0;
    group.marketValue = totalMktVal;
    group.returnValue = totalRetVal;
    group.returnPct = totalCostBasis > 0 ? (totalRetVal / totalCostBasis) * 100 : 0;
    group.hasBonusEligible = group.tranches.some((t) => t.eligible_for_bonus);
    group.allBonusEligible = group.tranches.length > 0 && group.tranches.every((t) => t.eligible_for_bonus);
    group.accruedInterest = accruedWeight > 0 ? accruedWeightedSum / accruedWeight : null;
    group.dirtyPrice = dirtyWeight > 0 ? dirtyWeightedSum / dirtyWeight : null;

    if (isBond) {
      const weightedClean = group.tranches.reduce((sum, t) => sum + asNumber(t.quantity) * asNumber(t.avg_cost), 0);
      group.avgCost = totalQty > 0 ? weightedClean / totalQty : 0;
      group.weightedYtmNet = ytmWeight > 0 ? ytmWeightedSum / ytmWeight : null;
    } else {
      group.avgCost = totalQty > 0 ? totalCostBasis / totalQty : 0;
    }

    group.tranches.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  }

  return Array.from(map.values());
}

function ChartPanel({
  history,
  totalValue,
  totalCost,
}: {
  history: { date: string; value: number }[];
  totalValue: number;
  totalCost: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  const validHistory = history.filter((p) => p.value > 0);
  let points = validHistory.length > 0 ? validHistory : [];
  if (points.length === 0 && totalValue > 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    points = [{ date: todayStr, value: totalValue }];
  }

  if (points.length === 1) {
    const p0 = points[0];
    const prevDate = new Date(new Date(p0.date).getTime() - 86400000 * 7).toISOString().split("T")[0];
    points = [
      { date: prevDate, value: totalCost > 0 ? totalCost : p0.value },
      p0,
    ];
  }

  const latestVal = points.length > 0 ? points[points.length - 1].value : totalValue;

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    const width = ref.current.clientWidth || 700;
    const chart = createChart(ref.current, {
      width,
      height: 280,
      layout: {
        background: { color: isDark ? "#0f172a" : "#ffffff" },
        textColor: isDark ? "#94a3b8" : "#475569",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)" },
        horzLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
      },
      timeScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
      },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: isDark ? "#2dd4bf" : "#0d9488",
      topColor: isDark ? "rgba(45,212,191,0.28)" : "rgba(13,148,136,0.22)",
      bottomColor: isDark ? "rgba(45,212,191,0.02)" : "rgba(13,148,136,0.02)",
      lineWidth: 2,
    });
    series.setData(points.map((p) => ({ time: p.date, value: p.value })));
    chart.timeScale().fitContent();

    const resize = () => {
      if (ref.current) {
        chart.applyOptions({ width: ref.current.clientWidth });
      }
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [points, isDark]);

  return (
    <div className="card w-full overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-3 dark:border-slate-200">
        <div>
          <h3 className="text-sm font-semibold text-teal-200 dark:text-teal-900">
            {t("portfolio.history_chart_title", "Andamento del Valore di Portafoglio")}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {t("portfolio.history_chart_subtitle", "Evoluzione storica del controvalore di mercato complessivo")}
          </p>
        </div>
        {latestVal > 0 && (
          <div className="text-right">
            <span className="font-mono text-lg font-bold text-teal-300 dark:text-teal-900">
              {formatMoney(latestVal)}
            </span>
          </div>
        )}
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}

function DatePickerWidget({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = ref.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") pickerInput.showPicker();
  };
  return (
    <div className="relative">
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 pr-11 text-sm text-slate-200 dark:text-slate-900"
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-slate-700 dark:bg-slate-200 px-2 py-1 text-xs text-slate-200 dark:text-slate-900 hover:bg-slate-600 dark:hover:bg-slate-300"
        aria-label="Open date picker"
        title="Open date picker"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
    </div>
  );
}
function BondRateoInput({
  quantity,
  avgCost,
  accruedInterestIn,
  onChangeAccruedInterestIn,
}: {
  quantity: string;
  avgCost: string;
  accruedInterestIn: string;
  onChangeAccruedInterestIn: (val: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = getNumberLocale(i18n.resolvedLanguage);
  const [mode, setMode] = useState<"pct" | "eur" | "total">("pct");
  const [localEur, setLocalEur] = useState("");
  const [localTotal, setLocalTotal] = useState("");

  const nominal = parseLocaleNumber(quantity);
  const cleanPrice = parseLocaleNumber(avgCost);
  const currentAccruedPct = parseLocaleNumber(accruedInterestIn);

  // Capital value (corso secco) = nominal * cleanPrice / 100
  const cleanCapital = nominal > 0 && cleanPrice > 0 ? (nominal * cleanPrice) / 100 : 0;
  // Accrued euro amount = nominal * currentAccruedPct / 100
  const accruedEur = nominal > 0 ? (nominal * currentAccruedPct) / 100 : 0;
  // Total dirty settlement = cleanCapital + accruedEur
  const dirtyTotal = cleanCapital + accruedEur;

  // Keep localEur and localTotal in sync when in pct mode or when nominal/cleanPrice change
  useEffect(() => {
    if (mode === "pct") {
      setLocalEur(accruedEur > 0 ? accruedEur.toFixed(2) : "");
      setLocalTotal(dirtyTotal > 0 ? dirtyTotal.toFixed(2) : "");
    }
  }, [mode, accruedEur, dirtyTotal]);

  const handlePctChange = (val: string) => {
    onChangeAccruedInterestIn(val);
  };

  const handleEurChange = (val: string) => {
    setLocalEur(val);
    const parsedEur = parseLocaleNumber(val);
    if (!isNaN(parsedEur) && nominal > 0) {
      const calculatedPct = (parsedEur / nominal) * 100;
      onChangeAccruedInterestIn(String(Number(calculatedPct.toFixed(6))));
    } else if (!val.trim()) {
      onChangeAccruedInterestIn("0");
    }
  };

  const handleTotalChange = (val: string) => {
    setLocalTotal(val);
    const parsedTotal = parseLocaleNumber(val);
    if (!isNaN(parsedTotal) && nominal > 0) {
      const diffEur = parsedTotal - cleanCapital;
      const calculatedPct = (diffEur / nominal) * 100;
      onChangeAccruedInterestIn(String(Number(calculatedPct.toFixed(6))));
      setLocalEur(diffEur.toFixed(2));
    } else if (!val.trim()) {
      onChangeAccruedInterestIn("0");
      setLocalEur("");
    }
  };

  const handleSwitchMode = (newMode: "pct" | "eur" | "total") => {
    setMode(newMode);
    if (newMode === "eur") {
      setLocalEur(accruedEur > 0 ? accruedEur.toFixed(2) : "");
    } else if (newMode === "total") {
      setLocalTotal(dirtyTotal > 0 ? dirtyTotal.toFixed(2) : "");
    }
  };

  const isNegativeDiff =
    mode === "total" && localTotal.trim() !== "" && Number(localTotal.replace(",", ".")) < cleanCapital;

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-700/60 dark:border-slate-300/80 bg-slate-800/40 dark:bg-slate-100/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <label
          className="text-xs font-semibold text-slate-300 dark:text-slate-800"
          title={t("portfolio.accrued_interest_in_hint")}
        >
          {mode === "pct" && t("portfolio.rateo_pct_label", "Rateo all'Acquisto (% base 100)")}
          {mode === "eur" && t("portfolio.rateo_eur_label", "Importo Rateo all'Acquisto (€)")}
          {mode === "total" && t("portfolio.rateo_total_label", "Totale Pagato Regolato (€)")}
        </label>
        {/* Mode selector pills */}
        <div className="flex rounded-md bg-slate-900/80 dark:bg-slate-200/80 p-0.5 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode("pct")}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              mode === "pct"
                ? "bg-teal-500 text-slate-950 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("portfolio.rateo_mode_pct", "% Base 100")}
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("eur")}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              mode === "eur"
                ? "bg-teal-500 text-slate-950 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("portfolio.rateo_mode_eur", "Importo in €")}
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("total")}
            className={`px-2 py-0.5 rounded font-medium transition-colors ${
              mode === "total"
                ? "bg-teal-500 text-slate-950 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 dark:text-slate-600 dark:hover:text-slate-900"
            }`}
          >
            {t("portfolio.rateo_mode_total", "Totale Pagato (€)")}
          </button>
        </div>
      </div>

      {mode === "pct" && (
        <div>
          <input
            type="text"
            value={accruedInterestIn}
            onChange={(e) => handlePctChange(e.target.value)}
            className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900 font-mono"
            placeholder="0.00"
          />
          {currentAccruedPct > 15 && (
            <p className="mt-1 text-xs text-amber-400">
              {t("portfolio.accrued_warning", "Attenzione: inserisci il rateo in percentuale (es. 0.50 per 0,50%), non in Euro. Un rateo > 15% è anomalo.")}
            </p>
          )}
        </div>
      )}

      {mode === "eur" && (
        <div>
          <div className="relative">
            <input
              type="text"
              value={localEur}
              onChange={(e) => handleEurChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 pr-8 text-sm text-slate-200 dark:text-slate-900 font-mono"
              placeholder="0.00"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
          </div>
          {nominal <= 0 && (
            <p className="mt-1 text-[11px] text-amber-400">
              {t("portfolio.nominal_needed_hint", "Inserisci prima il valore nominale per convertire l'importo in percentuale.")}
            </p>
          )}
        </div>
      )}

      {mode === "total" && (
        <div>
          <div className="relative">
            <input
              type="text"
              value={localTotal}
              onChange={(e) => handleTotalChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 pr-8 text-sm text-slate-200 dark:text-slate-900 font-mono"
              placeholder={cleanCapital > 0 ? cleanCapital.toFixed(2) : "0.00"}
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("portfolio.rateo_total_hint", "Inserisci il totale titoli pagato sul conto (escluse commissioni banca)")}
          </p>
          {isNegativeDiff && (
            <p className="mt-1 text-[11px] text-amber-400">
              {t("portfolio.rateo_negative_warning", "Attenzione: il totale pagato risulta inferiore al controvalore capitale (rateo negativo).")}
            </p>
          )}
        </div>
      )}

      {/* Live transparency card */}
      {nominal > 0 && cleanPrice > 0 && (
        <div className="mt-2 rounded-lg border border-slate-700/40 dark:border-slate-300/40 bg-slate-900/60 dark:bg-white/80 p-2.5 text-xs space-y-1">
          <div className="flex justify-between text-slate-400 dark:text-slate-600">
            <span>{t("portfolio.clean_capital_value", "Controvalore Corso Secco:")}</span>
            <span className="font-mono text-slate-200 dark:text-slate-800">
              {formatMoney(cleanCapital, undefined, locale)} <span className="text-[11px] text-slate-400">({formatNumber(cleanPrice, { minDecimals: 2, maxDecimals: 2, locale })}%)</span>
            </span>
          </div>
          <div className="flex justify-between text-teal-300 dark:text-teal-800 font-medium">
            <span>{t("portfolio.accrued_amount_label", "Rateo all'acquisto:")}</span>
            <span className="font-mono">
              +{formatMoney(accruedEur, undefined, locale)} <span className="text-[11px]">(+{formatNumber(currentAccruedPct, { minDecimals: 4, maxDecimals: 4, locale })}%)</span>
            </span>
          </div>
          <div className="border-t border-slate-700/50 dark:border-slate-200 pt-1 flex justify-between font-semibold text-slate-200 dark:text-slate-900">
            <span>{t("portfolio.dirty_total_value", "Controvalore Tel Quel (Totale):")}</span>
            <span className="font-mono text-teal-300 dark:text-teal-900">
              {formatMoney(dirtyTotal, undefined, locale)} <span className="text-[11px] font-normal text-slate-400">({formatNumber(cleanPrice + currentAccruedPct, { minDecimals: 4, maxDecimals: 4, locale })}%)</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function HoldingFormModal({
  open,
  onClose,
  initialAccountId,
  initialAssetId,
}: {
  open: boolean;
  onClose: () => void;
  initialAccountId?: number;
  initialAssetId?: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["assets"], queryFn: fetchAssets });

  const [accountId, setAccountId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitDate, setExitDate] = useState("");
  const [accruedInterestIn, setAccruedInterestIn] = useState("");
  const [eligibleForBonus, setEligibleForBonus] = useState(false);
  const [feeIn, setFeeIn] = useState("");

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId(
        initialAccountId
          ? String(initialAccountId)
          : accounts.length === 1
          ? String(accounts[0].id)
          : ""
      );
      setAssetId(initialAssetId ? String(initialAssetId) : "");
      setQuantity("");
      setAvgCost("");
      setAccruedInterestIn("");
      setEligibleForBonus(false);
      setFeeIn("");
      setEntryDate(new Date().toISOString().slice(0, 10));
      setExitDate("");
    }
  }, [open, accounts, initialAccountId, initialAssetId]);

  const createMutation = useMutation({
    mutationFn: () =>
      createHolding({
        account_id: Number(accountId),
        asset_id: Number(assetId),
        quantity: cleanNumberInput(quantity),
        avg_cost: cleanNumberInput(avgCost),
        entry_date: entryDate,
        exit_date: exitDate || null,
        accrued_interest_in: cleanNumberInput(accruedInterestIn) || "0",
        eligible_for_bonus: eligibleForBonus,
        fee_in: cleanNumberInput(feeIn) || "0",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("portfolio.holding_created", "Posizione registrata con successo"));
      onClose();
      setAccountId("");
      setAssetId("");
      setQuantity("");
      setAvgCost("");
      setEntryDate("");
      setExitDate("");
    },
    onError: (err: Error) => {
      console.error("Holding creation error:", err);
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
          <h2 className="mb-4 text-lg font-semibold text-teal-200 dark:text-teal-900">{t("portfolio.add_holding")}</h2>

          {accounts.length === 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center justify-between">
              <span>{t("portfolio.no_accounts_hint", "Non hai ancora nessun conto. Creane uno per registrare la posizione.")}</span>
              <button
                type="button"
                onClick={() => setShowAddAccount(true)}
                className="ml-2 rounded bg-amber-400 text-slate-950 px-2.5 py-1 text-xs font-semibold whitespace-nowrap hover:bg-amber-300"
              >
                + {t("portfolio.create_account", "Crea Conto")}
              </button>
            </div>
          )}

          {assets.length === 0 && (
            <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-200 flex items-center justify-between">
              <span>{t("portfolio.no_assets_hint", "Nessun asset disponibile. Crea un ETF o titolo con ricerca ticker.")}</span>
              <button
                type="button"
                onClick={() => setShowAddAsset(true)}
                className="ml-2 rounded bg-teal-400 text-slate-950 px-2.5 py-1 text-xs font-semibold whitespace-nowrap hover:bg-teal-300"
              >
                + {t("portfolio.create_asset", "Crea Asset")}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.account")} *</label>
                <button
                  type="button"
                  onClick={() => setShowAddAccount(true)}
                  className="text-[11px] font-medium text-teal-400 hover:text-teal-300"
                >
                  + {t("portfolio.new_account", "Nuovo Conto")}
                </button>
              </div>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              >
                <option value="">{t("portfolio.select_account")}</option>
                {accounts?.map((a: Account) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.asset")} *</label>
                <button
                  type="button"
                  onClick={() => setShowAddAsset(true)}
                  className="text-[11px] font-medium text-teal-400 hover:text-teal-300"
                >
                  + {t("portfolio.new_asset", "Nuovo Asset")}
                </button>
              </div>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              >
                <option value="">{t("portfolio.select_asset")}</option>
                {assets?.map((a: Asset) => (
                  <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>
                ))}
              </select>
            </div>
          {(() => {
            const selectedAsset = assets?.find((a: Asset) => String(a.id) === assetId);
            const isBond = isBondInstrumentType(selectedAsset?.instrument_type);
            return (
              <>
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                    {isBond ? t("portfolio.nominal_value", "Valore Nominale (€)") : t("portfolio.quantity")}
                  </label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                    placeholder={isBond ? "10000" : "100"}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                    {isBond ? t("portfolio.bond_clean_price", "Prezzo di Carico (% base 100)") : t("portfolio.avg_cost")}
                  </label>
                  <input
                    type="text"
                    value={avgCost}
                    onChange={(e) => setAvgCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                    placeholder={isBond ? "98.50" : "120.50"}
                  />
                </div>
                {isBond && (
                  <>
                    <BondRateoInput
                      quantity={quantity}
                      avgCost={avgCost}
                      accruedInterestIn={accruedInterestIn}
                      onChangeAccruedInterestIn={setAccruedInterestIn}
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="eligibleForBonusCreate"
                        checked={eligibleForBonus}
                        onChange={(e) => setEligibleForBonus(e.target.checked)}
                        className="rounded border-slate-700 text-teal-500 focus:ring-teal-400"
                      />
                      <label htmlFor="eligibleForBonusCreate" className="text-xs text-slate-300 dark:text-slate-800 cursor-pointer">
                        {t("portfolio.eligible_for_bonus", "Acquistato all'emissione (Diritto a Premio Fedeltà / CUM)")}
                      </label>
                    </div>
                  </>
                )}
                <div>
                  <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                    {t("portfolio.fee_in", "Commissioni di acquisto")}
                  </label>
                  <input
                    type="text"
                    value={feeIn}
                    onChange={(e) => setFeeIn(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                  />
                </div>
              </>
            );
          })()}
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.entry_date")}</label>
            <DatePickerWidget value={entryDate} onChange={setEntryDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.exit_date")}</label>
            <DatePickerWidget value={exitDate} onChange={setExitDate} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 dark:text-slate-900 hover:bg-slate-800 dark:bg-slate-100"
          >
            {t("portfolio.cancel")}
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!accountId || !assetId || !quantity || createMutation.isPending}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50"
          >
            {createMutation.isPending ? t("portfolio.saving") : t("portfolio.save")}
          </button>
        </div>
      </div>
    </div>

      <QuickAccountModal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onCreated={(newAcc) => {
          setAccountId(String(newAcc.id));
        }}
      />

      <AssetFormModal
        open={showAddAsset}
        onClose={() => setShowAddAsset(false)}
        onCreated={(newAst) => {
          setAssetId(String(newAst.id));
        }}
      />
    </>
  );
}

export function HoldingEditFormModal({
  open,
  holding,
  onClose,
  onUpdated,
}: {
  open: boolean;
  holding: {
    id: number;
    account_id: number;
    asset_id: number;
    instrument_type?: string;
    quantity: string;
    avg_cost: string;
    entry_date: string;
    exit_date?: string | null;
    accrued_interest_in?: string;
    eligible_for_bonus?: boolean;
    fee_in?: string;
  } | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [accountId, setAccountId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [exitDate, setExitDate] = useState("");
  const [accruedInterestIn, setAccruedInterestIn] = useState("");
  const [eligibleForBonus, setEligibleForBonus] = useState(false);
  const [feeIn, setFeeIn] = useState("");

  useEffect(() => {
    if (holding) {
      setAccountId(String(holding.account_id));
      setAssetId(String(holding.asset_id));
      setQuantity(holding.quantity);
      setAvgCost(holding.avg_cost);
      setAccruedInterestIn(holding.accrued_interest_in || "0");
      setEligibleForBonus(Boolean(holding.eligible_for_bonus));
      setFeeIn(holding.fee_in || "0");
      setEntryDate(holding.entry_date);
      setExitDate(holding.exit_date ?? "");
    }
  }, [holding]);

  useEffect(() => {
    if (!open) {
      setAccountId("");
      setAssetId("");
      setQuantity("");
      setAvgCost("");
      setAccruedInterestIn("");
      setEligibleForBonus(false);
      setFeeIn("");
      setEntryDate("");
      setExitDate("");
    }
  }, [open]);
  const updateMutation = useMutation({
    mutationFn: () =>
      updateHolding(holding!.id, {
        quantity: cleanNumberInput(quantity),
        avg_cost: cleanNumberInput(avgCost),
        entry_date: entryDate,
        exit_date: exitDate || null,
        accrued_interest_in: cleanNumberInput(accruedInterestIn) || "0",
        eligible_for_bonus: eligibleForBonus,
        fee_in: cleanNumberInput(feeIn) || "0",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      if (onUpdated) onUpdated();
      toast.success(t("portfolio.holding_updated", "Posizione aggiornata con successo"));
      onClose();
    },
    onError: (err: Error) => {
      console.error("Holding update error:", err);
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!open || !holding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-teal-200 dark:text-teal-900">{t("portfolio.edit_holding")}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {isBondInstrumentType(holding.instrument_type) ? t("portfolio.nominal_value", "Valore Nominale (€)") : t("portfolio.quantity")}
            </label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {isBondInstrumentType(holding.instrument_type) ? t("portfolio.bond_clean_price", "Prezzo di Carico (% base 100)") : t("portfolio.avg_cost")}
            </label>
            <input
              type="text"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            />
          </div>
          {isBondInstrumentType(holding.instrument_type) && (
            <>
              <BondRateoInput
                quantity={quantity}
                avgCost={avgCost}
                accruedInterestIn={accruedInterestIn}
                onChangeAccruedInterestIn={setAccruedInterestIn}
              />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="eligibleForBonusEdit"
                  checked={eligibleForBonus}
                  onChange={(e) => setEligibleForBonus(e.target.checked)}
                  className="rounded border-slate-700 text-teal-500 focus:ring-teal-400"
                />
                <label htmlFor="eligibleForBonusEdit" className="text-xs text-slate-300 dark:text-slate-800 cursor-pointer">
                  {t("portfolio.eligible_for_bonus", "Acquistato all'emissione (Diritto a Premio Fedeltà / CUM)")}
                </label>
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {t("portfolio.fee_in", "Commissioni di acquisto")}
            </label>
            <input
              type="text"
              value={feeIn}
              onChange={(e) => setFeeIn(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.entry_date")}</label>
            <DatePickerWidget value={entryDate} onChange={setEntryDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.exit_date")}</label>
            <DatePickerWidget value={exitDate} onChange={setExitDate} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 dark:text-slate-900 hover:bg-slate-800 dark:bg-slate-100"
          >
            {t("portfolio.cancel")}
          </button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400 disabled:opacity-50"
          >
            {updateMutation.isPending ? t("portfolio.saving") : t("portfolio.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PortfolioPage() {
  const { t, i18n } = useTranslation();
  const locale = getNumberLocale(i18n.resolvedLanguage);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [addTrancheTarget, setAddTrancheTarget] = useState<{ accountId?: number; assetId?: number } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editHolding, setEditHolding] = useState<HoldingDetail | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "bonds" | "exits">("all");
  const queryClient = useQueryClient();
  const toast = useToast();

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { data: summaries } = useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: () => fetchPortfolioSummary(),
  });

  const { data: details } = useQuery({
    queryKey: ["portfolio", "details"],
    queryFn: () => fetchPortfolioDetails(),
  });

  const { data: history } = useQuery({
    queryKey: ["portfolio", "history"],
    queryFn: () => fetchPortfolioHistory(),
  });

  const { data: bondMetrics } = useQuery<BondPortfolioMetrics>({
    queryKey: ["bonds", "metrics"],
    queryFn: () => fetchBondMetrics(),
  });

  const { data: bondCalendar } = useQuery<BondCalendarItem[]>({
    queryKey: ["bonds", "calendar"],
    queryFn: () => fetchBondCalendar(undefined, undefined, undefined, true),
  });

  const { data: portfolioExits } = useQuery<HoldingExit[]>({
    queryKey: ["portfolio", "exits"],
    queryFn: () => fetchPortfolioExits(),
    enabled: activeTab === "exits",
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      toast.success(t("portfolio.holding_deleted", "Posizione eliminata con successo"));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      console.error("Holding delete error:", err);
      toast.error(err.message || "Errore durante l'eliminazione della posizione");
      setDeleteId(null);
    },
  });

  const totalValue = summaries?.reduce((s: number, a: PortfolioSummary) => s + asNumber(a.total_value), 0) ?? 0;
  const totalCost = summaries?.reduce((s: number, a: PortfolioSummary) => s + asNumber(a.total_cost), 0) ?? 0;
  const totalReturn = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  const kpiCards = [
    { label: t("portfolio.kpi_total_value"), value: formatMoney(totalValue, undefined, locale) },
    { label: t("portfolio.kpi_total_cost"), value: formatMoney(totalCost, undefined, locale) },
    {
      label: t("portfolio.kpi_total_return"),
      value: formatMoney(totalReturn, undefined, locale),
      color: colorForPct(totalReturn),
    },
    {
      label: t("portfolio.kpi_return_pct"),
      value: formatPct(totalReturnPct, 2, locale),
      color: colorForPct(totalReturnPct),
    },
  ];

  const chartHistory = (history ?? []).map((p: { date: string; value: number }) => ({
    date: p.date,
    value: p.value,
  }));
  const bondHoldings = (details ?? []).filter((h: HoldingDetail) => {
    if (!isBondInstrumentType(h.instrument_type)) return false;
    if (h.exit_date) {
      const exitD = new Date(h.exit_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (exitD < today) return false;
    }
    return Number(h.quantity) > 0;
  });
  const bondsCount = bondMetrics?.bonds_count ?? bondHoldings.length;

  const groupedDetails = useMemo(() => groupHoldings(details ?? []), [details]);
  const groupedBondHoldings = useMemo(() => groupHoldings(bondHoldings), [bondHoldings]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("portfolio.title")}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setAddTrancheTarget(null);
            setShowAddHolding(true);
          }}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400"
        >
          {t("portfolio.add_holding")}
        </button>
      </div>

      <div className="flex border-b border-slate-700 dark:border-slate-300 gap-6">
        <button
          onClick={() => setActiveTab("all")}
          className={`pb-2.5 text-sm font-semibold transition-colors ${
            activeTab === "all"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-900"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-200"
          }`}
        >
          {t("portfolio.tab_all", "Tutte le Posizioni")}
        </button>
        <button
          onClick={() => setActiveTab("bonds")}
          className={`pb-2.5 text-sm font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === "bonds"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-900"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-200"
          }`}
        >
          <span>{t("portfolio.tab_bonds", "Obbligazioni & Rendite")}</span>
          {bondsCount > 0 && (
            <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300 dark:text-teal-800">
              {bondsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("exits")}
          className={`pb-2.5 text-sm font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === "exits"
              ? "border-b-2 border-teal-400 text-teal-300 dark:text-teal-900"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-200"
          }`}
        >
          <span>{t("portfolio.tab_exits", "Uscite registrate")}</span>
          {(portfolioExits?.length ?? 0) > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300 dark:text-amber-800">
              {portfolioExits?.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "all" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <article key={card.label} className="card p-4">
                <div className="text-sm text-slate-400 dark:text-slate-900">{card.label}</div>
                <div className={`mt-2 text-2xl font-semibold ${card.color ?? "text-teal-200 dark:text-teal-900"}`}>
                  {card.value}
                </div>
              </article>
            ))}
          </section>

          <ChartPanel history={chartHistory} totalValue={totalValue} totalCost={totalCost} />

          <section>
            <h2 className="mb-3 text-lg font-semibold text-teal-200 dark:text-teal-900">{t("portfolio.holdings_title")}</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-900">
                    <th className="p-3">{t("portfolio.col_symbol")}</th>
                    <th className="p-3">{t("portfolio.col_name")}</th>
                    <th className="p-3">{t("portfolio.col_type")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_qty")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_avg_cost")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_entry_date")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_exit_date")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_hold_duration")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_price")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_market_value")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_return")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_return_pct")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDetails.length === 0 && (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-slate-500 dark:text-slate-400">
                        {t("portfolio.no_holdings")}
                      </td>
                    </tr>
                  )}
                  {groupedDetails.map((g: GroupedHolding) => {
                    const isBond = isBondInstrumentType(g.instrument_type);
                    const isExpanded = Boolean(expandedGroups[g.key]);
                    const hasMulti = g.tranches.length > 1;

                    if (!hasMulti) {
                      const h = g.tranches[0];
                      return (
                        <tr key={h.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                          <td className="p-3 font-medium text-teal-300 dark:text-teal-900 flex items-center gap-1.5">
                            <Link
                              to={`/portfolio/holdings/${h.id}`}
                              className="font-semibold text-teal-300 hover:text-teal-200 dark:text-teal-900 dark:hover:text-teal-700 hover:underline"
                              title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                            >
                              {h.asset_symbol}
                            </Link>
                            {h.eligible_for_bonus && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                {t("portfolio.cum_badge", "CUM")}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-300 dark:text-slate-900">{h.asset_name}</td>
                          <td className="p-3 text-slate-400 dark:text-slate-900 uppercase text-xs">{h.instrument_type}</td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {formatQuantity(h.quantity, isBond, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {formatPrice(h.avg_cost, isBond, h.asset_currency, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.entry_date}</td>
                          <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.exit_date ?? "—"}</td>
                          <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">
                            {h.hold_duration_days != null ? `${h.hold_duration_days}d` : "—"}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {formatPrice(h.current_price, isBond, h.asset_currency, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-medium">{formatMoney(h.market_value, h.asset_currency, locale)}</td>
                          <td className={`p-3 text-right ${colorForPct(h.return_value)}`}>
                            {formatMoney(h.return_value, h.asset_currency, locale)}
                          </td>
                          <td className={`p-3 text-right ${colorForPct(h.return_pct)}`}>
                            {formatPct(h.return_pct, 2, locale)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAddTrancheTarget({ accountId: h.account_id, assetId: h.asset_id });
                                  setShowAddHolding(true);
                                }}
                                className="rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 dark:text-teal-900 border border-teal-500/40 p-2"
                                title={t("portfolio.add_tranche", "Nuova tranche")}
                                aria-label={t("portfolio.add_tranche", "Nuova tranche")}
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditHolding(h)}
                                className="rounded bg-sky-500 p-2 text-slate-950"
                                title={t("portfolio.edit_holding")}
                                aria-label={t("portfolio.edit_holding")}
                              >
                                <EditIcon />
                              </button>
                              <button
                                onClick={() => setDeleteId(h.id)}
                                className="rounded bg-red-500 p-2 text-white"
                                title={t("portfolio.delete_holding")}
                                aria-label={t("portfolio.delete_holding")}
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <Fragment key={g.key}>
                        <tr className="border-b border-slate-800 bg-slate-900/40 dark:bg-slate-100/40 hover:bg-slate-800/50">
                          <td className="p-3 font-medium text-teal-300 dark:text-teal-900 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleGroup(g.key)}
                              className="p-1 rounded text-slate-400 hover:text-teal-300 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                              title={isExpanded ? t("portfolio.collapse_tranches") : t("portfolio.expand_tranches")}
                            >
                              <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            </button>
                            <Link
                              to={`/portfolio/holdings/${g.tranches[0].id}`}
                              className="font-semibold text-teal-300 hover:text-teal-200 dark:text-teal-900 dark:hover:text-teal-700 hover:underline"
                              title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                            >
                              {g.asset_symbol}
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggleGroup(g.key)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-300 dark:text-teal-800 border border-teal-500/20 hover:bg-teal-500/20 cursor-pointer"
                            >
                              {t("portfolio.tranches_count", { count: g.tranches.length })}
                            </button>
                            {g.allBonusEligible ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                {t("portfolio.cum_badge", "CUM")}
                              </span>
                            ) : g.hasBonusEligible ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 dark:text-amber-800 border border-amber-500/30" title={t("portfolio.cum_partial_tooltip", "Alcune tranche con diritto al CUM")}>
                                {t("portfolio.cum_partial", "CUM parz.")}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-slate-300 dark:text-slate-900">{g.asset_name}</td>
                          <td className="p-3 text-slate-400 dark:text-slate-900 uppercase text-xs">{g.instrument_type}</td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold">
                            {formatQuantity(g.totalQuantity, isBond, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold" title={t("portfolio.weighted_avg", "Media ponderata")}>
                            {formatPrice(g.avgCost, isBond, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-400 dark:text-slate-600 text-xs">
                            {g.tranches[0].entry_date}..
                          </td>
                          <td className="p-3 text-right text-slate-400 dark:text-slate-600 text-xs">—</td>
                          <td className="p-3 text-right text-slate-400 dark:text-slate-600 text-xs">—</td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {formatPrice(g.currentPrice, isBond, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-bold">{formatMoney(g.marketValue, undefined, locale)}</td>
                          <td className={`p-3 text-right font-semibold ${colorForPct(g.returnValue)}`}>
                            {formatMoney(g.returnValue, undefined, locale)}
                          </td>
                          <td className={`p-3 text-right font-semibold ${colorForPct(g.returnPct)}`}>
                            {formatPct(g.returnPct, 2, locale)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAddTrancheTarget({ accountId: g.account_id, assetId: g.asset_id });
                                  setShowAddHolding(true);
                                }}
                                className="rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 dark:text-teal-900 border border-teal-500/40 p-2 flex items-center gap-1 text-xs font-semibold"
                                title={t("portfolio.add_tranche", "Nuova tranche")}
                                aria-label={t("portfolio.add_tranche", "Nuova tranche")}
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded &&
                          g.tranches.map((tItem: HoldingDetail, idx: number) => (
                            <tr key={tItem.id} className="border-b border-slate-800/60 bg-slate-800/30 dark:bg-slate-100/70 text-xs text-slate-300 dark:text-slate-800">
                              <td className="p-2.5 pl-8 font-mono flex items-center gap-2">
                                <span className="text-slate-500 dark:text-slate-400">↳</span>
                                <Link
                                  to={`/portfolio/holdings/${tItem.id}`}
                                  className="font-medium text-teal-300 hover:text-teal-200 dark:text-teal-800 dark:hover:text-teal-700 hover:underline"
                                  title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                                >
                                  {t("portfolio.tranche_number", { number: idx + 1 })}
                                </Link>
                                {tItem.eligible_for_bonus && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                    CUM
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-400 dark:text-slate-600 truncate max-w-[200px]">{tItem.asset_name}</td>
                              <td className="p-2.5 text-slate-400 dark:text-slate-600 uppercase text-[10px]">{tItem.instrument_type}</td>
                              <td className="p-2.5 text-right font-mono">
                                {formatQuantity(tItem.quantity, isBond, locale)}
                              </td>
                              <td className="p-2.5 text-right font-mono">
                                {formatPrice(tItem.avg_cost, isBond, tItem.asset_currency, locale)}
                              </td>
                              <td className="p-2.5 text-right text-slate-400 dark:text-slate-600">{tItem.entry_date}</td>
                              <td className="p-2.5 text-right text-slate-400 dark:text-slate-600">{tItem.exit_date ?? "—"}</td>
                              <td className="p-2.5 text-right text-slate-400 dark:text-slate-600">
                                {tItem.hold_duration_days != null ? `${tItem.hold_duration_days}d` : "—"}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-400 dark:text-slate-600">
                                {formatPrice(tItem.current_price, isBond, tItem.asset_currency, locale)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-medium">{formatMoney(tItem.market_value, tItem.asset_currency, locale)}</td>
                              <td className={`p-2.5 text-right font-mono ${colorForPct(tItem.return_value)}`}>
                                {formatMoney(tItem.return_value, tItem.asset_currency, locale)}
                              </td>
                              <td className={`p-2.5 text-right font-mono ${colorForPct(tItem.return_pct)}`}>
                                {formatPct(tItem.return_pct, 2, locale)}
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditHolding(tItem)}
                                    className="rounded bg-sky-500/80 hover:bg-sky-500 p-1.5 text-slate-950"
                                    title={t("portfolio.edit_holding")}
                                    aria-label={t("portfolio.edit_holding")}
                                  >
                                    <EditIcon />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(tItem.id)}
                                    className="rounded bg-red-500/80 hover:bg-red-500 p-1.5 text-white"
                                    title={t("portfolio.delete_holding")}
                                    aria-label={t("portfolio.delete_holding")}
                                  >
                                    <DeleteIcon />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : activeTab === "bonds" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_total_nominal")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.total_nominal, undefined, locale)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_market_value")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.total_market_value, undefined, locale)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_weighted_ytm")}</div>
              <div className="mt-2 text-2xl font-semibold text-green-400 dark:text-green-700">
                {formatPct(bondMetrics?.weighted_ytm_net, 2, locale)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_annual_income")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.estimated_annual_income_net, undefined, locale)}
              </div>
            </article>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-teal-200 dark:text-teal-900">
              {t("portfolio.tab_bonds", "Obbligazioni")}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-900">
                    <th className="p-3">{t("portfolio.col_symbol")}</th>
                    <th className="p-3">{t("portfolio.col_name")}</th>
                    <th className="p-3 text-right">{t("portfolio.nominal_value")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_clean_price")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_accrued")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_dirty_price")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_market_value")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_ytm_net")}</th>
                    <th className="p-3 text-right">{t("portfolio.col_return")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedBondHoldings.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-500 dark:text-slate-400">
                        {t("portfolio.no_holdings")}
                      </td>
                    </tr>
                  )}
                  {groupedBondHoldings.map((g: GroupedHolding) => {
                    const isExpanded = Boolean(expandedGroups[g.key]);
                    const hasMulti = g.tranches.length > 1;

                    if (!hasMulti) {
                      const h = g.tranches[0];
                      return (
                        <tr key={h.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                          <td className="p-3 font-medium text-teal-300 dark:text-teal-900 flex items-center gap-1.5">
                            <Link
                              to={`/portfolio/holdings/${h.id}`}
                              className="font-semibold text-teal-300 hover:text-teal-200 dark:text-teal-900 dark:hover:text-teal-700 hover:underline"
                              title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                            >
                              {h.asset_symbol}
                            </Link>
                            {h.eligible_for_bonus && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                {t("portfolio.cum_badge", "CUM")}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-300 dark:text-slate-900">{h.asset_name}</td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {Number(h.quantity).toLocaleString()} €
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                            {formatPrice(h.current_price, true, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono text-xs">
                            +{formatNumber(h.accrued_interest ?? 0, { minDecimals: 4, maxDecimals: 4, locale })}%
                          </td>
                          <td className="p-3 text-right text-teal-300 dark:text-teal-800 font-mono font-medium">
                            {formatPrice(h.dirty_price ?? h.current_price, true, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold">
                            {formatMoney(h.market_value, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-green-400 dark:text-green-700 font-mono font-medium">
                            {formatPct(h.ytm_net, 2, locale)}
                          </td>
                          <td className={`p-3 text-right ${colorForPct(h.return_value)} font-mono`}>
                            {formatMoney(h.return_value, undefined, locale)} ({formatPct(h.return_pct, 2, locale)})
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAddTrancheTarget({ accountId: h.account_id, assetId: h.asset_id });
                                  setShowAddHolding(true);
                                }}
                                className="rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 dark:text-teal-900 border border-teal-500/40 p-2"
                                title={t("portfolio.add_tranche", "Nuova tranche")}
                                aria-label={t("portfolio.add_tranche", "Nuova tranche")}
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditHolding(h)}
                                className="rounded bg-sky-500 p-2 text-slate-950"
                                title={t("portfolio.edit_holding")}
                                aria-label={t("portfolio.edit_holding")}
                              >
                                <EditIcon />
                              </button>
                              <button
                                onClick={() => setDeleteId(h.id)}
                                className="rounded bg-red-500 p-2 text-white"
                                title={t("portfolio.delete_holding")}
                                aria-label={t("portfolio.delete_holding")}
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <Fragment key={g.key}>
                        <tr className="border-b border-slate-800 bg-slate-900/40 dark:bg-slate-100/40 hover:bg-slate-800/50">
                          <td className="p-3 font-medium text-teal-300 dark:text-teal-900 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleGroup(g.key)}
                              className="p-1 rounded text-slate-400 hover:text-teal-300 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                              title={isExpanded ? t("portfolio.collapse_tranches") : t("portfolio.expand_tranches")}
                            >
                              <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                            </button>
                            <Link
                              to={`/portfolio/holdings/${g.tranches[0].id}`}
                              className="font-semibold text-teal-300 hover:text-teal-200 dark:text-teal-900 dark:hover:text-teal-700 hover:underline"
                              title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                            >
                              {g.asset_symbol}
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggleGroup(g.key)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-300 dark:text-teal-800 border border-teal-500/20 hover:bg-teal-500/20 cursor-pointer"
                            >
                              {t("portfolio.tranches_count", { count: g.tranches.length })}
                            </button>
                            {g.allBonusEligible ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                {t("portfolio.cum_badge", "CUM")}
                              </span>
                            ) : g.hasBonusEligible ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 dark:text-amber-800 border border-amber-500/30" title={t("portfolio.cum_partial_tooltip", "Alcune tranche con diritto al CUM")}>
                                {t("portfolio.cum_partial", "CUM parz.")}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-slate-300 dark:text-slate-900">{g.asset_name}</td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold">
                            {Number(g.totalQuantity).toLocaleString(locale)} €
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold" title={t("portfolio.weighted_avg", "Media ponderata")}>
                            {formatPrice(g.avgCost, true, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono text-xs">
                            +{formatNumber(g.accruedInterest ?? 0, { minDecimals: 4, maxDecimals: 4, locale })}%
                          </td>
                          <td className="p-3 text-right text-teal-300 dark:text-teal-800 font-mono font-semibold">
                            {formatPrice(g.dirtyPrice ?? g.currentPrice, true, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-bold">
                            {formatMoney(g.marketValue, undefined, locale)}
                          </td>
                          <td className="p-3 text-right text-green-400 dark:text-green-700 font-mono font-semibold">
                            {formatPct(g.weightedYtmNet, 2, locale)}
                          </td>
                          <td className={`p-3 text-right ${colorForPct(g.returnValue)} font-mono font-semibold`}>
                            {formatMoney(g.returnValue, undefined, locale)} ({formatPct(g.returnPct, 2, locale)})
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAddTrancheTarget({ accountId: g.account_id, assetId: g.asset_id });
                                  setShowAddHolding(true);
                                }}
                                className="rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 dark:text-teal-900 border border-teal-500/40 p-2"
                                title={t("portfolio.add_tranche", "Nuova tranche")}
                                aria-label={t("portfolio.add_tranche", "Nuova tranche")}
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded &&
                          g.tranches.map((tItem: HoldingDetail, idx: number) => (
                            <tr key={tItem.id} className="border-b border-slate-800/60 bg-slate-800/30 dark:bg-slate-100/70 text-xs text-slate-300 dark:text-slate-800">
                              <td className="p-2.5 pl-8 font-mono flex items-center gap-2">
                                <span className="text-slate-500 dark:text-slate-400">↳</span>
                                <Link
                                  to={`/portfolio/holdings/${tItem.id}`}
                                  className="font-medium text-teal-300 hover:text-teal-200 dark:text-teal-800 dark:hover:text-teal-700 hover:underline"
                                  title={t("portfolio.view_detail", "Vedi dettaglio completo")}
                                >
                                  {t("portfolio.tranche_number", { number: idx + 1 })}
                                </Link>
                                {tItem.eligible_for_bonus && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30">
                                    CUM
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-400 dark:text-slate-600 truncate max-w-[200px]">
                                {tItem.entry_date} {asNumber(tItem.accrued_interest_in) > 0 ? ` (${t("portfolio.accrued_label", "Rateo")}: +${formatNumber(tItem.accrued_interest_in, { minDecimals: 2, maxDecimals: 4, locale })}%)` : ""}
                              </td>
                              <td className="p-2.5 text-right font-mono">
                                {Number(tItem.quantity).toLocaleString(locale)} €
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-400 dark:text-slate-600" title={t("portfolio.clean_price_tooltip", "Prezzo di carico (clean)")}>
                                {formatPrice(tItem.avg_cost, true, undefined, locale)}
                              </td>
                              <td className="p-2.5 text-right text-slate-400 dark:text-slate-600 font-mono text-[11px]">
                                +{formatNumber(tItem.accrued_interest ?? 0, { minDecimals: 4, maxDecimals: 4, locale })}%
                              </td>
                              <td className="p-2.5 text-right text-slate-300 dark:text-slate-700 font-mono">
                                {formatPrice(tItem.dirty_price ?? tItem.current_price, true, undefined, locale)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-medium">
                                {formatMoney(tItem.market_value, undefined, locale)}
                              </td>
                              <td className="p-2.5 text-right text-green-400 dark:text-green-700 font-mono">
                                {formatPct(tItem.ytm_net, 2, locale)}
                              </td>
                              <td className={`p-2.5 text-right font-mono ${colorForPct(tItem.return_value)}`}>
                                {formatMoney(tItem.return_value, undefined, locale)} ({formatPct(tItem.return_pct, 2, locale)})
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditHolding(tItem)}
                                    className="rounded bg-sky-500/80 hover:bg-sky-500 p-1.5 text-slate-950"
                                    title={t("portfolio.edit_holding")}
                                    aria-label={t("portfolio.edit_holding")}
                                  >
                                    <EditIcon />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(tItem.id)}
                                    className="rounded bg-red-500/80 hover:bg-red-500 p-1.5 text-white"
                                    title={t("portfolio.delete_holding")}
                                    aria-label={t("portfolio.delete_holding")}
                                  >
                                    <DeleteIcon />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-teal-200 dark:text-teal-900">
              {t("portfolio.calendar_title", "Scadenzario Cedole e Flussi Futuri")}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-900">
                    <th className="p-3">{t("portfolio.calendar_date")}</th>
                    <th className="p-3">{t("portfolio.calendar_holding")}</th>
                    <th className="p-3">{t("portfolio.calendar_account")}</th>
                    <th className="p-3">{t("portfolio.calendar_type")}</th>
                    <th className="p-3 text-right">{t("portfolio.calendar_rate")}</th>
                    <th className="p-3 text-right">{t("portfolio.calendar_gross")}</th>
                    <th className="p-3 text-right">{t("portfolio.calendar_tax")}</th>
                    <th className="p-3 text-right">{t("portfolio.calendar_net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(bondCalendar ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500 dark:text-slate-400">
                        {t("portfolio.no_holdings")}
                      </td>
                    </tr>
                  )}
                  {(bondCalendar ?? []).map((item: BondCalendarItem, idx: number) => {
                    const isBonus = item.flow_type === "bonus";
                    const isRedemption = item.flow_type === "redemption";
                    const flowLabel = isBonus
                      ? t("portfolio.flow_bonus", "Premio Fedeltà")
                      : isRedemption
                      ? t("portfolio.flow_redemption", "Rimborso Capitale")
                      : t("portfolio.flow_coupon", "Cedola");

                    return (
                      <tr key={`${item.holding_id}-${item.date}-${idx}`} className="border-b border-slate-800 hover:bg-slate-800/40">
                        <td className="p-3 text-slate-200 dark:text-slate-900 font-mono font-medium">{item.date}</td>
                        <td className="p-3">
                          <span className="font-semibold text-teal-300 dark:text-teal-900">{item.asset_symbol}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-600 block truncate max-w-xs">{item.asset_name}</span>
                        </td>
                        <td className="p-3 text-slate-400 dark:text-slate-600 text-xs">{item.account_name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              isBonus
                                ? "bg-amber-500/20 text-amber-300 dark:text-amber-800 border border-amber-500/30"
                                : isRedemption
                                ? "bg-purple-500/20 text-purple-300 dark:text-purple-800 border border-purple-500/30"
                                : "bg-teal-500/20 text-teal-300 dark:text-teal-800 border border-teal-500/30"
                            }`}
                          >
                            {flowLabel}
                          </span>
                        </td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono text-xs">
                          {formatNumber(item.rate, { minDecimals: 2, maxDecimals: 2, locale })}%
                        </td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono">
                          {formatMoney(item.gross_amount, undefined, locale)}
                        </td>
                        <td className="p-3 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">
                          {formatMoney(item.tax_amount, undefined, locale)}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-green-400 dark:text-green-700">
                          {formatMoney(item.net_amount, undefined, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-5 dark:border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
                {t("portfolio.tab_exits", "Uscite registrate")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">
                {t(
                  "portfolio.exit_history_hint",
                  "Vendite a mercato, rimborsi a scadenza e rimborsi anticipati dell'emittente.",
                )}
              </p>
            </div>
            <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 dark:bg-slate-100 dark:text-slate-800">
              {portfolioExits?.length ?? 0} {t("portfolio.exit_count", "uscite")}
            </span>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-850 text-xs uppercase text-slate-400 dark:border-slate-300 dark:bg-slate-50 dark:text-slate-600">
                <th className="p-3">{t("portfolio.exit_col_date", "Data")}</th>
                <th className="p-3">{t("portfolio.asset", "Asset")}</th>
                <th className="p-3">{t("portfolio.account", "Conto")}</th>
                <th className="p-3">{t("portfolio.exit_col_type", "Tipo")}</th>
                <th className="p-3 text-right">{t("portfolio.exit_col_quantity", "Quantità")}</th>
                <th className="p-3 text-right">{t("portfolio.exit_col_net", "Incasso netto")}</th>
                <th className="p-3 text-right">{t("portfolio.exit_col_pnl", "P&L realizzato")}</th>
                <th className="p-3 text-right">{t("portfolio.exit_col_taxes", "Tasse")}</th>
                <th className="p-3">{t("portfolio.exit_col_notes", "Note")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(!portfolioExits || portfolioExits.length === 0) && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-slate-400">
                    {t("portfolio.no_exits", "Nessuna uscita registrata.")}
                  </td>
                </tr>
              )}
              {(portfolioExits ?? []).map((item) => (
                <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/40 dark:border-slate-100 dark:hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-200 dark:text-slate-900">{item.exit_date}</td>
                  <td className="p-3">
                    <span className="font-semibold text-teal-300 dark:text-teal-900">{item.asset_symbol}</span>
                    <span className="block max-w-xs truncate text-xs text-slate-400 dark:text-slate-600">{item.asset_name}</span>
                  </td>
                  <td className="p-3 text-xs text-slate-400 dark:text-slate-600">{item.account_name}</td>
                  <td className="p-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        item.exit_type === "maturity"
                          ? "bg-purple-500/20 text-purple-300 dark:text-purple-800"
                          : item.exit_type === "early_redemption"
                            ? "bg-amber-500/20 text-amber-300 dark:text-amber-800"
                            : "bg-teal-500/20 text-teal-300 dark:text-teal-800"
                      }`}
                    >
                      {exitTypeLabel(item.exit_type)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-200 dark:text-slate-900">
                    {formatNumber(item.quantity, { minDecimals: 0, maxDecimals: 6, locale })}
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-teal-300 dark:text-teal-800">
                    {formatMoney(item.net_proceeds, item.currency, locale)}
                  </td>
                  <td className={`p-3 text-right font-mono font-semibold ${item.realized_pnl.startsWith("-") ? "text-red-400 dark:text-red-600" : "text-green-400 dark:text-green-700"}`}>
                    {formatMoney(item.realized_pnl, item.currency, locale)}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-400 dark:text-slate-600">
                    {formatMoney(item.taxes, item.currency, locale)}
                  </td>
                  <td className="p-3 max-w-[220px] truncate text-xs text-slate-400 dark:text-slate-600">
                    {item.notes || "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      to={`/portfolio/holdings/${item.holding_id}`}
                      className="text-xs font-semibold text-teal-400 hover:text-teal-300 dark:text-teal-700"
                    >
                      {t("portfolio.view_detail", "Dettaglio")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <HoldingFormModal
        open={showAddHolding}
        initialAccountId={addTrancheTarget?.accountId}
        initialAssetId={addTrancheTarget?.assetId}
        onClose={() => {
          setShowAddHolding(false);
          setAddTrancheTarget(null);
        }}
      />

      <HoldingEditFormModal
        open={editHolding !== null}
        holding={editHolding}
        onClose={() => setEditHolding(null)}
      />

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
            <p className="mb-4 text-slate-200 dark:text-slate-900">{t("portfolio.confirm_delete")}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 dark:text-slate-900 hover:bg-slate-800 dark:bg-slate-100"
              >
                {t("portfolio.cancel")}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                {t("portfolio.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
