import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createChart, AreaSeries } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Account,
  Asset,
  BondCalendarItem,
  BondPortfolioMetrics,
  HoldingDetail,
  PortfolioSummary,
  createHolding,
  deleteHolding,
  fetchAccounts,
  fetchAssets,
  fetchBondCalendar,
  fetchBondMetrics,
  fetchPortfolioDetails,
  fetchPortfolioHistory,
  fetchPortfolioSummary,
  updateHolding,
} from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { AssetFormModal } from "./AssetsPage";
import { QuickAccountModal } from "../components/QuickAccountModal";

function asNumber(value: string | number | null | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined, currency?: string): string {
  const n = asNumber(value);
  const ccy = (currency || "EUR").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy }).format(n);
  } catch {
    return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;
  }
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

function formatPct(value: string | number | null | undefined): string {
  const n = asNumber(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function colorForPct(value: string | number | null | undefined): string {
  const n = asNumber(value);
  if (n > 0) return "text-green-400 dark:text-green-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-900";
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

function HoldingFormModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
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

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId((prev) => prev || (accounts.length === 1 ? String(accounts[0].id) : ""));
      setAssetId((prev) => prev || "");
      setQuantity("");
      setAvgCost("");
      setAccruedInterestIn("");
      setEligibleForBonus(false);
      setEntryDate(new Date().toISOString().slice(0, 10));
      setExitDate("");
    }
  }, [open, accounts]);

  const createMutation = useMutation({
    mutationFn: () =>
      createHolding({
        account_id: Number(accountId),
        asset_id: Number(assetId),
        quantity,
        avg_cost: avgCost,
        entry_date: entryDate,
        exit_date: exitDate || null,
        accrued_interest_in: accruedInterestIn || "0",
        eligible_for_bonus: eligibleForBonus,
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
            const isBond = selectedAsset?.instrument_type === "bond";
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
                    <div>
                      <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900" title={t("portfolio.accrued_interest_in_hint")}>
                        {t("portfolio.accrued_interest_in", "Rateo all'Acquisto (% base 100)")}
                      </label>
                      <input
                        type="text"
                        value={accruedInterestIn}
                        onChange={(e) => setAccruedInterestIn(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                        placeholder="0.00"
                      />
                      {Number(accruedInterestIn) > 15 && (
                        <p className="mt-1 text-xs text-amber-400">
                          {t("portfolio.accrued_warning", "Attenzione: inserisci il rateo in percentuale (es. 0.50 per 0,50%), non in Euro. Un rateo > 15% è anomalo.")}
                        </p>
                      )}
                    </div>
                    {Number(quantity) > 0 && Number(avgCost) > 0 && (
                      <div className="rounded bg-slate-800/60 dark:bg-slate-200/60 p-2 text-xs text-slate-300 dark:text-slate-800 flex justify-between">
                        <span>{t("portfolio.estimated_cost_basis", "Controvalore di Carico stimato:")}</span>
                        <span className="font-mono font-semibold">
                          {formatMoney((Number(quantity) * (Number(avgCost) + (Number(accruedInterestIn) || 0))) / 100)}
                        </span>
                      </div>
                    )}
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

  useEffect(() => {
    if (holding) {
      setAccountId(String(holding.account_id));
      setAssetId(String(holding.asset_id));
      setQuantity(holding.quantity);
      setAvgCost(holding.avg_cost);
      setAccruedInterestIn(holding.accrued_interest_in || "0");
      setEligibleForBonus(Boolean(holding.eligible_for_bonus));
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
      setEntryDate("");
      setExitDate("");
    }
  }, [open]);
  const updateMutation = useMutation({
    mutationFn: () =>
      updateHolding(holding!.id, {
        quantity,
        avg_cost: avgCost,
        entry_date: entryDate,
        exit_date: exitDate || null,
        accrued_interest_in: accruedInterestIn || "0",
        eligible_for_bonus: eligibleForBonus,
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
              {holding.instrument_type === "bond" ? t("portfolio.nominal_value", "Valore Nominale (€)") : t("portfolio.quantity")}
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
              {holding.instrument_type === "bond" ? t("portfolio.bond_clean_price", "Prezzo di Carico (% base 100)") : t("portfolio.avg_cost")}
            </label>
            <input
              type="text"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            />
          </div>
          {holding.instrument_type === "bond" && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900" title={t("portfolio.accrued_interest_in_hint")}>
                  {t("portfolio.accrued_interest_in", "Rateo all'Acquisto (% base 100)")}
                </label>
                <input
                  type="text"
                  value={accruedInterestIn}
                  onChange={(e) => setAccruedInterestIn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                />
                {Number(accruedInterestIn) > 15 && (
                  <p className="mt-1 text-xs text-amber-400">
                    {t("portfolio.accrued_warning", "Attenzione: inserisci il rateo in percentuale (es. 0.50 per 0,50%), non in Euro. Un rateo > 15% è anomalo.")}
                  </p>
                )}
              </div>
              {Number(quantity) > 0 && Number(avgCost) > 0 && (
                <div className="rounded bg-slate-800/60 dark:bg-slate-200/60 p-2 text-xs text-slate-300 dark:text-slate-800 flex justify-between">
                  <span>{t("portfolio.estimated_cost_basis", "Controvalore di Carico stimato:")}</span>
                  <span className="font-mono font-semibold">
                    {formatMoney((Number(quantity) * (Number(avgCost) + (Number(accruedInterestIn) || 0))) / 100)}
                  </span>
                </div>
              )}
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
  const { t } = useTranslation();
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [editHolding, setEditHolding] = useState<HoldingDetail | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "bonds">("all");
  const queryClient = useQueryClient();
  const toast = useToast();

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
    queryFn: () => fetchBondCalendar(),
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
    { label: t("portfolio.kpi_total_value"), value: formatMoney(totalValue) },
    { label: t("portfolio.kpi_total_cost"), value: formatMoney(totalCost) },
    {
      label: t("portfolio.kpi_total_return"),
      value: formatMoney(totalReturn),
      color: colorForPct(totalReturn),
    },
    {
      label: t("portfolio.kpi_return_pct"),
      value: formatPct(totalReturnPct),
      color: colorForPct(totalReturnPct),
    },
  ];

  const chartHistory = (history ?? []).map((p: { date: string; value: number }) => ({
    date: p.date,
    value: p.value,
  }));
  const bondHoldings = (details ?? []).filter((h: HoldingDetail) => {
    const isBond =
      (h.instrument_type || "").toLowerCase() === "bond" ||
      (h.instrument_type || "").toLowerCase() === "government_bond";
    if (!isBond) return false;
    if (h.exit_date) {
      const exitD = new Date(h.exit_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (exitD < today) return false;
    }
    return Number(h.quantity) > 0;
  });
  const bondsCount = bondMetrics?.bonds_count ?? bondHoldings.length;


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("portfolio.title")}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowAddHolding(true)}
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
                  {(details ?? []).length === 0 && (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-slate-500 dark:text-slate-400">
                        {t("portfolio.no_holdings")}
                      </td>
                    </tr>
                  )}
                  {(details ?? []).map((h: HoldingDetail) => {
                    const isBond = h.instrument_type === "bond";
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
                          {isBond ? Number(h.quantity).toLocaleString() : Number(h.quantity).toFixed(4)}
                        </td>
                        <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                          {isBond ? `${Number(h.avg_cost).toFixed(2)}%` : formatMoney(h.avg_cost)}
                        </td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.entry_date}</td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.exit_date ?? "—"}</td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">
                          {h.hold_duration_days != null ? `${h.hold_duration_days}d` : "—"}
                        </td>
                        <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono">
                          {isBond ? `${Number(h.current_price).toFixed(2)}%` : formatMoney(h.current_price)}
                        </td>
                        <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-medium">{formatMoney(h.market_value)}</td>
                        <td className={`p-3 text-right ${colorForPct(h.return_value)}`}>
                          {formatMoney(h.return_value)}
                        </td>
                        <td className={`p-3 text-right ${colorForPct(h.return_pct)}`}>
                          {formatPct(h.return_pct)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2">
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
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_total_nominal")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.total_nominal)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_market_value")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.total_market_value)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_weighted_ytm")}</div>
              <div className="mt-2 text-2xl font-semibold text-green-400 dark:text-green-700">
                {formatPct(bondMetrics?.weighted_ytm_net)}
              </div>
            </article>
            <article className="card p-4">
              <div className="text-sm text-slate-400 dark:text-slate-900">{t("portfolio.bonds_annual_income")}</div>
              <div className="mt-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">
                {formatMoney(bondMetrics?.estimated_annual_income_net)}
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
                  {bondHoldings.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-500 dark:text-slate-400">
                        {t("portfolio.no_holdings")}
                      </td>
                    </tr>
                  )}
                  {bondHoldings.map((h: HoldingDetail) => (
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
                        {Number(h.current_price).toFixed(2)}%
                      </td>
                      <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono text-xs">
                        +{Number(h.accrued_interest ?? 0).toFixed(4)}%
                      </td>
                      <td className="p-3 text-right text-teal-300 dark:text-teal-800 font-mono font-medium">
                        {Number(h.dirty_price ?? h.current_price).toFixed(2)}%
                      </td>
                      <td className="p-3 text-right text-slate-200 dark:text-slate-900 font-mono font-semibold">
                        {formatMoney(h.market_value)}
                      </td>
                      <td className="p-3 text-right text-green-400 dark:text-green-700 font-mono font-medium">
                        {formatPct(h.ytm_net)}
                      </td>
                      <td className={`p-3 text-right ${colorForPct(h.return_value)} font-mono`}>
                        {formatMoney(h.return_value)} ({formatPct(h.return_pct)})
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
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
                  ))}
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
                          {Number(item.rate).toFixed(2)}%
                        </td>
                        <td className="p-3 text-right text-slate-300 dark:text-slate-700 font-mono">
                          {formatMoney(item.gross_amount)}
                        </td>
                        <td className="p-3 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">
                          {formatMoney(item.tax_amount)}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-green-400 dark:text-green-700">
                          {formatMoney(item.net_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <HoldingFormModal open={showAddHolding} onClose={() => setShowAddHolding(false)} />

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
