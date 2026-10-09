import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, login } from "../lib/api";

const schema = z.object({
  username_or_email: z.string().min(1),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      setError(null);
      const result = await login(data.username_or_email, data.password);
      localStorage.setItem("token", result.access_token);
      localStorage.setItem("must_change_password", result.must_change_password ? "1" : "0");
      navigate(result.must_change_password ? "/onboarding" : "/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "errors.invalid_credentials") {
        setError(t("login.errors.invalid_credentials"));
        return;
      }
      if (err instanceof ApiError && err.code === "errors.password_change_required") {
        setError(t("login.errors.password_change_required"));
        return;
      }
      setError(t("login.errors.api_connection"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit(onSubmit)} className="card w-full max-w-md p-6">
        <h1 className="mb-2 text-2xl font-semibold text-teal-200 dark:text-teal-900">TradeJournal</h1>
        <p className="mb-6 text-sm text-slate-400 dark:text-slate-900">{t("login.subtitle")}</p>
        <div className="space-y-4">
          <input
            {...register("username_or_email")}
            className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
            placeholder={t("login.username_or_email")}
          />
          <input
            type="password"
            {...register("password")}
            className="w-full rounded-lg border border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-3 py-2"
            placeholder={t("login.password")}
          />
          {error ? <div className="text-sm text-red-400 dark:text-red-600">{error}</div> : null}
          <button className="w-full rounded-lg bg-teal-500 px-3 py-2 font-medium text-slate-900">
            {t("login.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
