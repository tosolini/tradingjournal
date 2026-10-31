import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createHoldingBulkExit,
  createHoldingExit,
  HoldingDetail,
  HoldingExit,
  HoldingExitPayload,
  HoldingExitType,
  HoldingSingleDetail,
  previewHoldingBulkExit,
  previewHoldingExit,
} from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import {
  formatMoney,
  formatNumber,
  getNumberLocale,
  parseLocaleNumber as asNumber,
} from "../lib/numbers";

type ExitHolding = HoldingDetail | HoldingSingleDetail;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isBondType(instrumentType: string | null | undefined): boolean {
  return ["bond", "government_bond", "titolo_di_stato"].includes(
    (instrumentType || "").toLowerCase(),
  );
}

export function HoldingExitModal({
  open,
  holding,
  maturityDate,
  bulk = false,
  onClose,
  onDone,
}: {
  open: boolean;
  holding: ExitHolding | null;
  maturityDate?: string | null;
  bulk?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = getNumberLocale(i18n.resolvedLanguage);
  const toast = useToast();

  const isBond = isBondType(holding?.instrument_type);
  const maturity = maturityDate || null;
  const canMature = Boolean(
    isBond && maturity && new Date(maturity).getTime() <= new Date().getTime(),
  );

  const [exitType, setExitType] = useState<HoldingExitType>("market_sale");
  const [exitDate, setExitDate] = useState(todayIso());
  const [quantity, setQuantity] = useState("");
  const [cleanPrice, setCleanPrice] = useState("");
  const [accruedOut, setAccruedOut] = useState("");
  const [fees, setFees] = useState("0");
  const [taxes, setTaxes] = useState("");
  const [couponsReceived, setCouponsReceived] = useState("");
  const [bonusReceived, setBonusReceived] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !holding) return;
    const defaultType: HoldingExitType = canMature ? "maturity" : "market_sale";
    setExitType(defaultType);
    setExitDate(defaultType === "maturity" && maturity ? maturity : todayIso());
    setQuantity(holding.quantity);
    setCleanPrice(
      defaultType === "maturity" ? "100" : holding.current_price,
    );
    setAccruedOut(defaultType === "maturity" ? "0" : "");
    setFees("0");
    setTaxes("");
    setCouponsReceived("");
    setBonusReceived("");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holding?.id]);

  const payload = useMemo<HoldingExitPayload>(
    () => ({
      exit_type: exitType,
      exit_date: exitDate || undefined,
      quantity: bulk ? undefined : quantity || undefined,
      clean_price: cleanPrice || undefined,
      accrued_interest_out: accruedOut || undefined,
      fees: fees || "0",
      taxes: taxes || undefined,
      coupons_received: couponsReceived || undefined,
      bonus_received: bonusReceived || undefined,
      notes: notes || undefined,
    }),
    [exitType, exitDate, quantity, cleanPrice, accruedOut, fees, taxes, couponsReceived, bonusReceived, notes, bulk],
  );

  const canPreview = Boolean(
    holding && exitDate && asNumber(quantity) > 0 && asNumber(cleanPrice) > 0,
  );

  const {
    data: preview,
    error: previewError,
    isFetching: previewLoading,
  } = useQuery({
    queryKey: ["holding-exit-preview", bulk ? "bulk" : "single", holding?.id, payload],
    queryFn: () =>
      bulk
        ? previewHoldingBulkExit(holding!.id, payload)
        : previewHoldingExit(holding!.id, payload),
    enabled: open && canPreview,
    retry: false,
  });

  const mutation = useMutation<HoldingExit | HoldingExit[], Error>({
    mutationFn: () =>
      bulk
        ? createHoldingBulkExit(holding!.id, payload)
        : createHoldingExit(holding!.id, payload),
    onSuccess: () => {
      toast.success(
        t("portfolio.exit_success", "Uscita registrata con successo"),
      );
      onDone();
    },
    onError: (err: Error) => {
      toast.error(`Errore registrazione uscita: ${err.message}`);
    },
  });

  if (!open || !holding) return null;

  const holdingTranches = (holding as HoldingSingleDetail).tranches ?? [];

  const currency = holding.asset_currency || "EUR";
  const remaining = preview
    ? asNumber(preview.quantity_after)
    : Math.max(0, asNumber(holding.quantity) - asNumber(quantity));
  const isMaturity = exitType === "maturity";

  const handleTypeChange = (value: HoldingExitType) => {
    setExitType(value);
    setCouponsReceived("");
    setBonusReceived("");
    if (value === "maturity" && maturity) {
      setExitDate(maturity);
      setQuantity(holding.quantity);
      setCleanPrice("100");
      setAccruedOut("0");
    } else if (value === "early_redemption") {
      setCleanPrice("100");
    } else {
      setCleanPrice(holding.current_price);
      setAccruedOut("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl dark:border-slate-300 dark:bg-white">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-teal-200 dark:text-teal-900">
              {bulk
                ? t("portfolio.sell_all_position", "Vendi tutta la posizione")
                : t("portfolio.register_exit", "Registra uscita")}
            </h2>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
              {holding.asset_symbol} ·{" "}
              {bulk
                ? `${holdingTranches.filter((item) => asNumber(item.quantity) > 0).length} ${t("portfolio.exit_tranches", "tranche")}`
                : holding.entry_date}
            </p>
            {bulk && (
              <p className="mt-1 text-xs text-amber-300 dark:text-amber-800">
                {t(
                  "portfolio.bulk_exit_hint",
                  "Verrà registrata un'uscita per ogni tranche attiva con data e prezzo indicati.",
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 dark:border-slate-300 dark:text-slate-700 dark:hover:bg-slate-100"
          >
            {t("common.close", "Chiudi")}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {t("portfolio.exit_type", "Tipo uscita")}
            <select
              value={exitType}
              onChange={(e) => handleTypeChange(e.target.value as HoldingExitType)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            >
              <option value="market_sale">
                {t("portfolio.exit_market_sale", "Vendita a mercato")}
              </option>
              {canMature && (
                <option value="maturity">
                  {t("portfolio.exit_maturity", "Rimborso a scadenza")}
                </option>
              )}
              {isBond && (
                <option value="early_redemption">
                  {t("portfolio.exit_early_redemption", "Rimborso anticipato emittente")}
                </option>
              )}
            </select>
          </label>

          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {t("portfolio.exit_date", "Data uscita")}
            <input
              type="date"
              value={exitDate}
              disabled={isMaturity}
              onChange={(e) => setExitDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm text-slate-200 disabled:opacity-60 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
          </label>

          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {isBond
              ? t("portfolio.exit_quantity_nominal", "Nominale da uscire (€)")
              : t("portfolio.exit_quantity", "Quantità da uscire")}
            <input
              type="text"
              value={quantity}
              disabled={isMaturity || bulk}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 disabled:opacity-60 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              {t("portfolio.exit_available", "Disponibile")}:{" "}
              {Number(holding.quantity).toLocaleString(locale)}
            </span>
          </label>

          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {isBond
              ? t("portfolio.exit_clean_price", "Prezzo secco di uscita (% base 100)")
              : t("portfolio.exit_price", "Prezzo di uscita")}
            <input
              type="text"
              value={cleanPrice}
              onChange={(e) => setCleanPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
          </label>

          {isBond && (
            <>
              <label className="block text-xs text-slate-400 dark:text-slate-600">
                {t("portfolio.exit_accrued", "Rateo di uscita (% base 100)")}
                <input
                  type="text"
                  value={accruedOut}
                  onChange={(e) => setAccruedOut(e.target.value)}
                  placeholder={t("portfolio.auto_value", "Automatico")}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
                />
              </label>
              <label className="block text-xs text-slate-400 dark:text-slate-600">
                {t("portfolio.exit_coupons", "Cedole incassate (lordo)")}
                <input
                  type="text"
                  value={couponsReceived}
                  disabled={bulk}
                  onChange={(e) => setCouponsReceived(e.target.value)}
                  placeholder={t("portfolio.auto_value", "Automatico")}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 disabled:opacity-60 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
                />
              </label>
              {isMaturity && (
                <label className="block text-xs text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_bonus", "Premio CUM (lordo)")}
                  <input
                    type="text"
                    value={bonusReceived}
                    disabled={bulk}
                    onChange={(e) => setBonusReceived(e.target.value)}
                    placeholder={t("portfolio.auto_value", "Automatico")}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 disabled:opacity-60 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
                  />
                </label>
              )}
            </>
          )}

          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {t("portfolio.exit_fees", "Commissioni di uscita")}
            <input
              type="text"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
          </label>

          <label className="block text-xs text-slate-400 dark:text-slate-600">
            {t("portfolio.exit_taxes", "Imposte stimate")}
            <input
              type="text"
              value={taxes}
              disabled={bulk}
              onChange={(e) => setTaxes(e.target.value)}
              placeholder={t("portfolio.auto_value", "Automatico")}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 font-mono text-sm text-slate-200 disabled:opacity-60 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
          </label>

          <label className="block text-xs text-slate-400 dark:text-slate-600 sm:col-span-2">
            {t("portfolio.exit_notes", "Note")}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm text-slate-200 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900"
            />
          </label>
        </div>

        {previewError && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 dark:text-red-700">
            {(previewError as Error).message}
          </div>
        )}

        {preview && (
          <div className="mt-5 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 dark:border-slate-200 dark:bg-slate-50">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 dark:text-slate-900">
                {t("portfolio.exit_preview", "Anteprima uscita")}
              </h3>
              {previewLoading && (
                <span className="text-xs text-slate-400">
                  {t("common.loading", "Calcolo...")}
                </span>
              )}
            </div>

            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_cost_basis", "Costo fiscale venduto")}
                </span>
                <span className="font-mono text-slate-200 dark:text-slate-900">
                  {formatMoney(preview.cost_basis, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_capital_gain", "Plus/minus capitale")}
                </span>
                <span className="font-mono text-slate-200 dark:text-slate-900">
                  {formatMoney(preview.realized_capital_gain, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_interest_income", "Interessi/cedole")}
                </span>
                <span className="font-mono text-slate-200 dark:text-slate-900">
                  {formatMoney(preview.realized_interest_income, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_gross", "Incasso lordo")}
                </span>
                <span className="font-mono text-slate-200 dark:text-slate-900">
                  {formatMoney(preview.gross_proceeds, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_taxes", "Imposte stimate")}
                </span>
                <span className="font-mono text-slate-200 dark:text-slate-900">
                  {formatMoney(preview.taxes, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_net", "Incasso netto")}
                </span>
                <span className="font-mono font-semibold text-teal-300 dark:text-teal-800">
                  {formatMoney(preview.net_proceeds, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <span className="text-slate-400 dark:text-slate-600">
                  {t("portfolio.exit_realized_pnl", "P&L realizzato")}
                </span>
                <span
                  className={`font-mono font-bold ${
                    asNumber(preview.realized_pnl) >= 0
                      ? "text-green-400 dark:text-green-700"
                      : "text-red-400 dark:text-red-600"
                  }`}
                >
                  {formatMoney(preview.realized_pnl, currency, locale)}
                </span>
              </div>
            </div>

            <div className="mt-3 border-t border-slate-700/60 pt-3 text-xs text-slate-400 dark:border-slate-200 dark:text-slate-600">
              {t("portfolio.exit_remaining", "Quantità residua")}:{" "}
              <span className="font-mono text-slate-200 dark:text-slate-900">
                {formatNumber(remaining, { minDecimals: 0, maxDecimals: 6, locale })}
              </span>
              {preview.accrued_interest_out && asNumber(preview.accrued_interest_out) > 0 && (
                <span className="ml-3">
                  {t("portfolio.exit_accrued_short", "Rateo")}:{" "}
                  <span className="font-mono text-slate-200 dark:text-slate-900">
                    {formatNumber(preview.accrued_interest_out, {
                      minDecimals: 2,
                      maxDecimals: 4,
                      locale,
                    })}
                    %
                  </span>
                </span>
              )}
            </div>

            {preview.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-300 dark:text-amber-800">
                {preview.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 dark:border-slate-300 dark:text-slate-700 dark:hover:bg-slate-100"
          >
            {t("portfolio.cancel", "Annulla")}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!preview || mutation.isPending}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {mutation.isPending
              ? t("portfolio.saving", "Salvataggio...")
              : t("portfolio.exit_confirm", "Conferma uscita")}
          </button>
        </div>
      </div>
    </div>
  );
}
