import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircleIcon } from "./icons";

type Props = {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
};

export function ConfirmModal({ message, confirmLabel, onConfirm, onCancel, isPending }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isPending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl dark:border-slate-300 dark:bg-white fade-up">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-500/15 p-2 text-red-400 dark:bg-red-100 dark:text-red-600 shrink-0">
            <AlertCircleIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-100 dark:text-slate-900">
              {t("common.confirm", "Conferma operazione")}
            </h3>
            <p className="mt-1 text-sm text-slate-300 dark:text-slate-600 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-slate-700/80 bg-slate-800/80 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-200"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "..." : (confirmLabel ?? t("assets.delete", "Elimina"))}
          </button>
        </div>
      </div>
    </div>
  );
}
