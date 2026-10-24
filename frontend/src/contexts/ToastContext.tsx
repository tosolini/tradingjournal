import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertCircleIcon, CheckIcon, InfoIcon, XIcon } from "../components/icons";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const success = useCallback((msg: string) => showToast(msg, "success"), [showToast]);
  const error = useCallback((msg: string) => showToast(msg, "error"), [showToast]);
  const info = useCallback((msg: string) => showToast(msg, "info"), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      {/* Toast container */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all fade-up ${
                isSuccess
                  ? "border-teal-500/40 bg-slate-900/95 text-teal-200 dark:border-teal-600/40 dark:bg-white dark:text-teal-900"
                  : isError
                  ? "border-red-500/40 bg-slate-900/95 text-red-200 dark:border-red-600/40 dark:bg-white dark:text-red-900"
                  : "border-slate-700/60 bg-slate-900/95 text-slate-200 dark:border-slate-300 dark:bg-white dark:text-slate-900"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isSuccess && <CheckIcon className="h-5 w-5 text-teal-400 dark:text-teal-600" />}
                {isError && <AlertCircleIcon className="h-5 w-5 text-red-400 dark:text-red-600" />}
                {!isSuccess && !isError && <InfoIcon className="h-5 w-5 text-sky-400 dark:text-sky-600" />}
              </div>
              <div className="flex-1 text-sm font-medium leading-snug">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-200 dark:text-slate-500 dark:hover:text-slate-800 transition"
                aria-label="Close notification"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
