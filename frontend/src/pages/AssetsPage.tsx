import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Asset, api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

const INSTRUMENT_TYPES = ["etf", "stock", "bond", "fund"];

function AssetFormModal({
  open,
  onClose,
  editAsset,
}: {
  open: boolean;
  onClose: () => void;
  editAsset?: Asset | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [symbol, setSymbol] = useState(editAsset?.symbol ?? "");
  const [name, setName] = useState(editAsset?.name ?? "");
  const [isin, setIsin] = useState(editAsset?.isin ?? "");
  const [instrumentType, setInstrumentType] = useState(editAsset?.instrument_type ?? "etf");
  const [exchange, setExchange] = useState(editAsset?.exchange ?? "");
  const [currency, setCurrency] = useState(editAsset?.currency ?? "EUR");

  const isEditing = !!editAsset;

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { symbol, name, isin: isin || null, instrument_type: instrumentType, exchange: exchange || null, currency };
      if (isEditing) {
        return api(`/api/assets/${editAsset.id}/`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return api("/api/assets/", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(isEditing ? t("assets.updated_success", "Asset aggiornato") : t("assets.created_success", "Asset creato"));
      onClose();
    },
    onError: (err: Error) => {
      console.error("Asset mutation error:", err);
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-teal-200 dark:text-teal-900">
          {isEditing ? t("assets.edit_title") : t("assets.add_title")}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.symbol")}</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="VWCE"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="FTSE All-World UCITS ETF"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.isin")}</label>
            <input
              value={isin}
              onChange={(e) => setIsin(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="IE00BK5BQT80"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.instrument_type")}</label>
            <select
              value={instrumentType}
              onChange={(e) => setInstrumentType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
            >
              {INSTRUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.exchange")}</label>
            <input
              value={exchange}
              onChange={(e) => setExchange(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="XETRA"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">{t("assets.currency")}</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              placeholder="EUR"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 dark:text-slate-900"
          >
            {t("assets.cancel")}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!symbol || !name || mutation.isPending}
            className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {mutation.isPending ? t("assets.saving") : (isEditing ? t("assets.save") : t("assets.create"))}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssetsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<Asset[]>("/api/assets/"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/api/assets/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("assets.title")}</h1>
          <p className="text-sm text-slate-400 dark:text-slate-900">{t("assets.subtitle")}</p>
        </div>
        <button
          onClick={() => { setEditAsset(null); setShowForm(true); }}
          className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900"
        >
          {t("assets.add")}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 dark:border-slate-300 text-xs uppercase text-slate-400 dark:text-slate-900">
              <th className="px-3 py-2">{t("assets.col_symbol")}</th>
              <th className="px-3 py-2">{t("assets.col_name")}</th>
              <th className="px-3 py-2">{t("assets.col_isin")}</th>
              <th className="px-3 py-2">{t("assets.col_type")}</th>
              <th className="px-3 py-2">{t("assets.col_exchange")}</th>
              <th className="px-3 py-2">{t("assets.col_currency")}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(assets ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-2 text-center text-slate-400 dark:text-slate-900">
                  {t("assets.no_assets")}
                </td>
              </tr>
            )}
            {(assets ?? []).map((asset: Asset) => (
              <tr key={asset.id} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                <td className="px-3 py-2 font-medium text-teal-200 dark:text-teal-900">{asset.symbol}</td>
                <td className="px-3 py-2 text-slate-300 dark:text-slate-900">{asset.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400 dark:text-slate-900">{asset.isin ?? "—"}</td>
                <td className="px-3 py-2 text-slate-400 dark:text-slate-900">{asset.instrument_type}</td>
                <td className="px-3 py-2 text-slate-400 dark:text-slate-900">{asset.exchange ?? "—"}</td>
                <td className="px-3 py-2 text-slate-400 dark:text-slate-900">{asset.currency}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditAsset(asset); setShowForm(true); }}
                      className="rounded bg-sky-500 p-2 text-slate-950"
                      title={t("assets.edit")}
                      aria-label={t("assets.edit")}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteId(asset.id)}
                      className="rounded bg-red-500 p-2 text-white"
                      title={t("assets.delete")}
                      aria-label={t("assets.delete")}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AssetFormModal open={showForm} onClose={() => { setShowForm(false); setEditAsset(null); }} editAsset={editAsset} />

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 shadow-2xl">
            <p className="mb-4 text-slate-200 dark:text-slate-900">{t("assets.confirm_delete")}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 dark:text-slate-900"
              >
                {t("assets.cancel")}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="rounded bg-red-500 px-3 py-2 text-sm font-semibold text-white"
              >
                {t("assets.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
