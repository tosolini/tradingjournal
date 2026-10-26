import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Broker, createBroker } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (broker: Broker) => void;
}

export function QuickBrokerModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState("");
  const [feeMode, setFeeMode] = useState<"fixed" | "percent">("fixed");
  const [feeValue, setFeeValue] = useState("0");
  const [feeCurrency, setFeeCurrency] = useState("EUR");

  const mutation = useMutation({
    mutationFn: () =>
      createBroker({
        name: name.trim(),
        fee_mode: feeMode,
        fee_value: Number(feeValue) || 0,
        fee_currency: feeCurrency.trim().toUpperCase() || "EUR",
      }),
    onSuccess: (broker) => {
      qc.invalidateQueries({ queryKey: ["brokers"] });
      toast.success(t("brokers.created_success", "Broker creato con successo"));
      setName("");
      setFeeValue("0");
      onCreated?.(broker);
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-5 shadow-2xl">
        <h3 className="mb-3 text-base font-semibold text-teal-200 dark:text-teal-900">
          {t("brokers.quick_add_title", "Nuovo Broker Rapido")}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
              {t("brokers.name", "Nome Broker")} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Directa, Fineco, Degiro"
              className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                {t("brokers.fee_mode", "Tipo Fee")}
              </label>
              <select
                value={feeMode}
                onChange={(e) => setFeeMode(e.target.value as "fixed" | "percent")}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              >
                <option value="fixed">{t("brokers.fixed", "Fissa")}</option>
                <option value="percent">{t("brokers.percent", "Percentuale (%)")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                {t("brokers.fee_value", "Valore Fee")}
              </label>
              <input
                type="number"
                step="0.01"
                value={feeValue}
                onChange={(e) => setFeeValue(e.target.value)}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 dark:border-slate-300 px-3 py-1.5 text-xs text-slate-300 dark:text-slate-700 hover:bg-slate-800 dark:hover:bg-slate-100"
          >
            {t("common.cancel", "Annulla")}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50"
          >
            {mutation.isPending ? t("common.saving", "Salvataggio...") : t("common.save", "Salva")}
          </button>
        </div>
      </div>
    </div>
  );
}
