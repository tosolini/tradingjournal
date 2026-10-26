import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createChart, AreaSeries } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Account,
  Asset,
  HoldingDetail,
  PortfolioSummary,
  createHolding,
  deleteHolding,
  fetchAccounts,
  fetchAssets,
  fetchPortfolioDetails,
  fetchPortfolioHistory,
  fetchPortfolioSummary,
  updateHolding,
} from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { AssetFormModal } from "./AssetsPage";
import { QuickAccountModal } from "../components/QuickAccountModal";

function asNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | undefined, currency?: string): string {
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

function formatPct(value: string | number | undefined): string {
  const n = asNumber(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function colorForPct(value: string | number | undefined): string {
  const n = asNumber(value);
  if (n > 0) return "text-green-400 dark:text-green-700";
  if (n < 0) return "text-red-400 dark:text-red-600";
  return "text-slate-300 dark:text-slate-900";
}

function ChartPanel({ history }: { history: { date: string; value: number }[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    if (!ref.current || history.length === 0) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 280,
      layout: {
        background: { color: isDark ? "#111827" : "#ffffff" },
        textColor: isDark ? "#94a3b8" : "#475569",
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "rgba(100,116,139,0.14)" },
        horzLines: { color: isDark ? "#1e293b" : "rgba(100,116,139,0.14)" },
      },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: isDark ? "#2dd4bf" : "#0d9488",
      topColor: isDark ? "rgba(45,212,191,0.25)" : "rgba(13,148,136,0.2)",
      bottomColor: isDark ? "rgba(45,212,191,0.04)" : "rgba(13,148,136,0.04)",
    });
    series.setData(history.map((p) => ({ time: p.date, value: p.value })));

    const resize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 700 });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [history, isDark]);

  return <div ref={ref} className="card w-full overflow-hidden" />;
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

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId((prev) => prev || (accounts.length === 1 ? String(accounts[0].id) : ""));
      setAssetId((prev) => prev || "");
      setQuantity("");
      setAvgCost("");
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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
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
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.quantity")}</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.avg_cost")}</label>
            <input
              type="text"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="120.50"
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

function HoldingEditFormModal({
  open,
  holding,
  onClose,
}: {
  open: boolean;
  holding: HoldingDetail | null;
  onClose: () => void;
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

  useEffect(() => {
    if (holding) {
      setAccountId(String(holding.account_id));
      setAssetId(String(holding.asset_id));
      setQuantity(holding.quantity);
      setAvgCost(holding.avg_cost);
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
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
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
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.quantity")}</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("portfolio.avg_cost")}</label>
            <input
              type="text"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
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
  const { t } = useTranslation();
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [editHolding, setEditHolding] = useState<HoldingDetail | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
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

      <ChartPanel history={chartHistory} />

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
              {(details ?? []).map((h: HoldingDetail) => (
                <tr key={h.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="p-3 font-medium text-teal-300 dark:text-teal-900">{h.asset_symbol}</td>
                  <td className="p-3 text-slate-300 dark:text-slate-900">{h.asset_name}</td>
                  <td className="p-3 text-slate-400 dark:text-slate-900">{h.instrument_type}</td>
                  <td className="p-3 text-right text-slate-200 dark:text-slate-900">{Number(h.quantity).toFixed(4)}</td>
                  <td className="p-3 text-right text-slate-200 dark:text-slate-900">{formatMoney(h.avg_cost)}</td>
                  <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.entry_date}</td>
                  <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">{h.exit_date ?? "—"}</td>
                  <td className="p-3 text-right text-slate-300 dark:text-slate-900 text-xs">
                    {h.hold_duration_days != null ? `${h.hold_duration_days}d` : "—"}
                  </td>
                  <td className="p-3 text-right text-slate-200 dark:text-slate-900">{formatMoney(h.current_price)}</td>
                  <td className="p-3 text-right text-slate-200 dark:text-slate-900">{formatMoney(h.market_value)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
