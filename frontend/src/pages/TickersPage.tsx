import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ticker, tickersApi } from "../lib/api";

export default function TickersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [previewResults, setPreviewResults] = useState<Ticker[]>([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [activeSyncMarket, setActiveSyncMarket] = useState<string | null>(null);

  const { data: countData } = useQuery({
    queryKey: ["tickers-count"],
    queryFn: () => tickersApi.count(),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => tickersApi.import(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["tickers-count"] });
      setImportError(null);
      setImportMsg(
        t("tickers.import_success", {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          total: result.total,
        })
      );
    },
    onError: () => {
      setImportMsg(null);
      setImportError(t("tickers.import_error"));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => tickersApi.clear(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickers-count"] });
      setPreviewResults([]);
      setImportMsg(t("tickers.clear_success"));
      setImportError(null);
      setClearConfirm(false);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (market: string) => tickersApi.syncEuronext(market),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["tickers-count"] });
      setActiveSyncMarket(null);
      setImportError(null);
      setImportMsg(
        t("tickers.sync_success", {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          total: result.total,
        })
      );
    },
    onError: () => {
      setActiveSyncMarket(null);
      setImportMsg(null);
      setImportError(t("tickers.sync_error"));
    },
  });

  function handleSyncEuronext(market: string) {
    setImportMsg(null);
    setImportError(null);
    setActiveSyncMarket(market);
    syncMutation.mutate(market);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    setImportError(null);
    importMutation.mutate(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handleSearch(q: string) {
    setSearchQ(q);
    if (q.trim().length < 1) {
      setPreviewResults([]);
      return;
    }
    const results = await tickersApi.search(q, 50);
    setPreviewResults(results);
  }

  const total = countData?.total ?? 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-100 dark:text-slate-900">
          {t("tickers.page_title")}
        </h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
          {t("tickers.page_subtitle")}
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900/50 dark:bg-white/60 px-4 py-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">{t("tickers.col_symbol")}</p>
          <p className="text-2xl font-bold text-teal-400 dark:text-teal-700">
            {total.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">ticker nel DB</p>
        </div>
      </div>

      {/* Euronext Live Sync */}
      <div className="rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900/30 dark:bg-white/40 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-200 dark:text-slate-800">
            {t("tickers.sync_euronext_title")}
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {t("tickers.sync_euronext_hint")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleSyncEuronext("milan")}
            disabled={syncMutation.isPending || importMutation.isPending}
            className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition-colors"
          >
            {activeSyncMarket === "milan" ? t("tickers.syncing") : t("tickers.sync_btn_milan")}
          </button>

          <button
            type="button"
            onClick={() => handleSyncEuronext("all")}
            disabled={syncMutation.isPending || importMutation.isPending}
            className="rounded border border-teal-500/60 bg-teal-500/10 px-4 py-2 text-sm font-semibold text-teal-300 dark:text-teal-700 hover:bg-teal-500/20 disabled:opacity-50 transition-colors"
          >
            {activeSyncMarket === "all" ? t("tickers.syncing") : t("tickers.sync_btn_all")}
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div className="rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900/30 dark:bg-white/40 p-5 space-y-4">
        <h2 className="font-semibold text-slate-200 dark:text-slate-800">
          {t("tickers.import_title")}
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500">{t("tickers.import_hint")}</p>

        <div className="flex flex-wrap gap-3">
          {/* File upload button */}
          <label className="cursor-pointer rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 transition-colors">
            {importMutation.isPending ? "Importazione…" : t("tickers.import_btn")}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={importMutation.isPending}
            />
          </label>

          {/* Clear button */}
          {total > 0 && (
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              disabled={clearMutation.isPending}
              className="rounded border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {t("tickers.import_clear_btn")}
            </button>
          )}
        </div>

        {importMsg && (
          <p className="rounded border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-300 dark:text-teal-700">
            {importMsg}
          </p>
        )}
        {importError && (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {importError}
          </p>
        )}
      </div>

      {/* Confirm clear */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 dark:bg-slate-100/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-6 space-y-4 shadow-2xl">
            <p className="text-sm text-slate-200 dark:text-slate-800">{t("tickers.clear_confirm")}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setClearConfirm(false)}
                className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-300 dark:text-slate-700"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="rounded bg-red-500 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Elimina tutto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search / Preview */}
      {total > 0 && (
        <div className="space-y-3">
          <input
            type="text"
            value={searchQ}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("tickers.search_placeholder")}
            className="w-full rounded border border-slate-700 dark:border-slate-300 bg-slate-950 dark:bg-white px-3 py-2 text-sm text-slate-100 dark:text-slate-900 placeholder:text-slate-500"
          />

          {searchQ && (
            <div className="overflow-x-auto rounded border border-slate-700 dark:border-slate-300">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60 dark:bg-slate-100/60 text-left text-xs uppercase text-slate-400 dark:text-slate-600">
                  <tr>
                    <th className="px-3 py-2">{t("tickers.col_symbol")}</th>
                    <th className="px-3 py-2">{t("tickers.col_name")}</th>
                    <th className="px-3 py-2">{t("tickers.col_isin")}</th>
                    <th className="px-3 py-2">{t("tickers.col_market")}</th>
                    <th className="px-3 py-2">{t("tickers.col_currency")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                        {t("tickers.no_results")}
                      </td>
                    </tr>
                  ) : (
                    previewResults.map((tk) => (
                      <tr
                        key={tk.id}
                        className="border-t border-slate-800 dark:border-slate-200 hover:bg-slate-800/30 dark:hover:bg-slate-100/30"
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-teal-400 dark:text-teal-700">
                          {tk.symbol}
                        </td>
                        <td className="px-3 py-2 text-slate-200 dark:text-slate-800">{tk.name}</td>
                        <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{tk.isin ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-300 dark:text-slate-700">{tk.market}</td>
                        <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{tk.currency ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
