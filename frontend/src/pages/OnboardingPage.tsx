import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  createAccount,
  createBroker,
  getMe,
  listBrokers,
  updateMe,
} from "../lib/api";

const STEPS = ["password", "profile", "broker", "account", "done"] as const;

function flagOn(): boolean {
  return localStorage.getItem("must_change_password") === "1";
}

export function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const brokersQuery = useQuery({
    queryKey: ["brokers"],
    queryFn: listBrokers,
    enabled: step >= 2,
  });

  useEffect(() => {
    if (meQuery.data && !meQuery.data.must_change_password) {
      localStorage.setItem("must_change_password", "0");
      navigate("/", { replace: true });
    }
  }, [meQuery.data, navigate]);

  const next = () => {
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = () => {
    localStorage.setItem("must_change_password", "0");
    qc.invalidateQueries({ queryKey: ["me"] });
    navigate("/", { replace: true });
  };

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (meQuery.isError && !flagOn()) {
    navigate("/login", { replace: true });
    return null;
  }

  const stepName = STEPS[step];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="card w-full max-w-lg p-6">
        <h1 className="mb-1 text-2xl font-semibold text-teal-200 dark:text-teal-900">
          {t("onboarding.title")}
        </h1>
        <p className="mb-2 text-sm text-slate-400 dark:text-slate-900">
          {t("onboarding.subtitle")}
        </p>
        <ol className="mb-6 flex gap-1">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-teal-500" : "bg-slate-700 dark:bg-slate-300"
              }`}
            />
          ))}
        </ol>

        {error ? (
          <div className="mb-4 text-sm text-red-400 dark:text-red-600">{error}</div>
        ) : null}

        {stepName === "password" && (
          <PasswordStep
            onDone={(changed) => {
              if (changed) localStorage.setItem("must_change_password", "0");
              next();
            }}
            onError={setError}
          />
        )}
        {stepName === "profile" && (
          <ProfileStep
            initialTimezone={meQuery.data?.timezone ?? ""}
            onDone={next}
            onSkip={next}
            onError={setError}
          />
        )}
        {stepName === "broker" && (
          <BrokerStep
            existingCount={brokersQuery.data?.length ?? 0}
            onDone={next}
            onSkip={next}
            onError={setError}
          />
        )}
        {stepName === "account" && (
          <AccountStep onDone={next} onSkip={next} onError={setError} />
        )}
        {stepName === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300 dark:text-slate-900">
              {t("onboarding.done_message")}
            </p>
            <button
              onClick={finish}
              className="w-full rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900"
            >
              {t("onboarding.go_dashboard")}
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-slate-500">
          {t("onboarding.step_of", { current: step + 1, total: STEPS.length })}
        </p>
      </div>
    </div>
  );
}

function PasswordStep({
  onDone,
  onError,
}: {
  onDone: (changed: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    onError(null);
    if (!current || !next) {
      onError(t("onboarding.password_required"));
      return;
    }
    if (next !== confirm) {
      onError(t("settings.account.password_mismatch"));
      return;
    }
    setSaving(true);
    try {
      await updateMe({ current_password: current, new_password: next });
      onDone(true);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("login.errors.api_connection"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 dark:text-slate-900">
        {t("onboarding.password_message")}
      </p>
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder={t("onboarding.current_password")}
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder={t("onboarding.new_password")}
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder={t("onboarding.confirm_password")}
      />
      <button
        onClick={submit}
        disabled={saving}
        className="w-full rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900 disabled:opacity-50"
      >
        {t("onboarding.continue")}
      </button>
    </div>
  );
}

function ProfileStep({
  initialTimezone,
  onDone,
  onSkip,
  onError,
}: {
  initialTimezone: string;
  onDone: () => void;
  onSkip: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const zones =
    (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      "timeZone",
    ) ?? [];

  const save = async () => {
    onError(null);
    if (!timezone) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      await updateMe({ timezone });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("login.errors.api_connection"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 dark:text-slate-900">
        {t("onboarding.profile_message")}
      </p>
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
      >
        <option value="">{t("settings.account.timezone_placeholder")}</option>
        {zones.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-200"
        >
          {t("onboarding.skip")}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900 disabled:opacity-50"
        >
          {t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}

function BrokerStep({
  existingCount,
  onDone,
  onSkip,
  onError,
}: {
  existingCount: number;
  onDone: () => void;
  onSkip: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    onError(null);
    if (!name.trim()) {
      onError(t("onboarding.broker_name_required"));
      return;
    }
    setSaving(true);
    try {
      await createBroker({ name: name.trim() });
      qc.invalidateQueries({ queryKey: ["brokers"] });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("login.errors.api_connection"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 dark:text-slate-900">
        {existingCount > 0
          ? t("onboarding.broker_exists", { count: existingCount })
          : t("onboarding.broker_message")}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder={t("onboarding.broker_name")}
      />
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-200"
        >
          {t("onboarding.skip")}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900 disabled:opacity-50"
        >
          {t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}

function AccountStep({
  onDone,
  onSkip,
  onError,
}: {
  onDone: () => void;
  onSkip: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [saving, setSaving] = useState(false);
  const brokersQuery = useQuery({ queryKey: ["brokers"], queryFn: listBrokers });

  const save = async () => {
    onError(null);
    if (!name.trim()) {
      onError(t("onboarding.account_name_required"));
      return;
    }
    setSaving(true);
    try {
      await createAccount({
        name: name.trim(),
        broker_id: brokerId ? Number(brokerId) : null,
        base_currency: currency.trim().toUpperCase() || "EUR",
      });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("login.errors.api_connection"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 dark:text-slate-900">
        {t("onboarding.account_message")}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder={t("onboarding.account_name")}
      />
      <select
        value={brokerId}
        onChange={(e) => setBrokerId(e.target.value)}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
      >
        <option value="">{t("onboarding.no_broker")}</option>
        {(brokersQuery.data ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <input
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        maxLength={8}
        className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
        placeholder="EUR"
      />
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 rounded-lg bg-slate-700 px-3 py-2 font-medium text-slate-200"
        >
          {t("onboarding.skip")}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900 disabled:opacity-50"
        >
          {t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}
