import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Account, Broker, createAccount, listBrokers } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { QuickBrokerModal } from "./QuickBrokerModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (account: Account) => void;
}

export function QuickAccountModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [cashBalance, setCashBalance] = useState("0");
  const [showBrokerModal, setShowBrokerModal] = useState(false);

  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: listBrokers,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createAccount({
        name: name.trim(),
        broker_id: brokerId ? Number(brokerId) : null,
        base_currency: currency.trim().toUpperCase() || "EUR",
        cash_balance: cashBalance,
      }),
    onSuccess: (account) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(t("accounts.created_success", "Conto creato con successo"));
      setName("");
      setBrokerId("");
      setCashBalance("0");
      onCreated?.(account);
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white p-5 shadow-2xl">
          <h3 className="mb-3 text-base font-semibold text-teal-200 dark:text-teal-900">
            {t("accounts.quick_add_title", "Nuovo Conto Rapido")}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                {t("accounts.name", "Nome Conto")} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Portafoglio ETF, Trading Scalping"
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-slate-400 dark:text-slate-900">
                  {t("accounts.broker", "Broker (opzionale)")}
                </label>
                <button
                  type="button"
                  onClick={() => setShowBrokerModal(true)}
                  className="text-[11px] font-medium text-teal-400 hover:text-teal-300"
                >
                  + {t("accounts.add_broker", "Nuovo Broker")}
                </button>
              </div>
              <select
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
              >
                <option value="">{t("accounts.no_broker", "Nessun broker")}</option>
                {brokers?.map((b: Broker) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                  {t("accounts.currency", "Valuta")}
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-100 p-2 text-sm text-slate-200 dark:text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400 dark:text-slate-900">
                  {t("accounts.initial_cash", "Liquidità Iniziale")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cashBalance}
                  onChange={(e) => setCashBalance(e.target.value)}
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

      <QuickBrokerModal
        open={showBrokerModal}
        onClose={() => setShowBrokerModal(false)}
        onCreated={(b) => setBrokerId(String(b.id))}
      />
    </>
  );
}
