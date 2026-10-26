import { Broker, BrokerProfile, FeeMode } from "./api";

export interface BrokerPresetConfig {
  profile: BrokerProfile;
  name: string;
  label: string;
  fee_mode: FeeMode;
  fee_value: number;
  fee_min?: number | null;
  fee_max?: number | null;
  fee_us_value?: number | null;
  fee_currency: string;
  monthly_fee: number;
  fee_tier_override?: number | null;
  capital_gain_mode: "immediate" | "year_end";
  capital_gain_rate: number;
  capital_gain_rate_gov: number;
  description: string;
}

export const BROKER_PRESETS: BrokerPresetConfig[] = [
  {
    profile: "custom",
    name: "Broker Personalizzato",
    label: "Personalizzato",
    fee_mode: "fixed",
    fee_value: 0,
    fee_currency: "EUR",
    monthly_fee: 0,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Configurazione manuale libera",
  },
  {
    profile: "fineco_trading",
    name: "Fineco - Conto Trading",
    label: "Fineco (Conto Trading)",
    fee_mode: "percent_min_max",
    fee_value: 0.19,
    fee_min: 2.95,
    fee_max: 19.0,
    fee_currency: "EUR",
    monthly_fee: 0,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "0,19% (min 2,95 € / max 19 €) su azioni, ETF e obbligazioni. Canone 0 €.",
  },
  {
    profile: "fineco_trading_under30",
    name: "Fineco - Conto Trading (Under 30)",
    label: "Fineco (Conto Trading Under 30)",
    fee_mode: "under_30",
    fee_value: 2.95,
    fee_us_value: 3.95,
    fee_currency: "EUR",
    monthly_fee: 0,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Fisso 2,95 € su Italia/Europa, 3,95 $ su USA. Canone 0 €.",
  },
  {
    profile: "fineco_one",
    name: "Fineco - Conto One",
    label: "Fineco (Conto One - a fasce)",
    fee_mode: "tiered_volume",
    fee_value: 19,
    fee_currency: "EUR",
    monthly_fee: 0,
    fee_tier_override: null,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Fasce commissioni mensili (19€ / 9,95€ / 6,95€ / 2,95€). Canone 0 €.",
  },
  {
    profile: "fineco_classic",
    name: "Fineco - Conto Classic",
    label: "Fineco (Conto Classic - a fasce)",
    fee_mode: "tiered_volume",
    fee_value: 19,
    fee_currency: "EUR",
    monthly_fee: 3.95,
    fee_tier_override: null,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Fasce commissioni mensili (19€ / 9,95€ / 6,95€ / 2,95€). Canone 3,95 €/mese.",
  },
  {
    profile: "fineco_max",
    name: "Fineco - Conto Max",
    label: "Fineco (Conto Max - a fasce)",
    fee_mode: "tiered_volume",
    fee_value: 19,
    fee_currency: "EUR",
    monthly_fee: 29.95,
    fee_tier_override: null,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Fasce commissioni mensili (19€ / 9,95€ / 6,95€ / 2,95€). Canone 29,95 €/mese.",
  },
  {
    profile: "directa_semplice",
    name: "Directa - Profilo Semplice",
    label: "Directa (Profilo Semplice)",
    fee_mode: "fixed",
    fee_value: 5.0,
    fee_currency: "EUR",
    monthly_fee: 0,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "Commissione fissa 5,00 € per eseguito. Canone 0 €.",
  },
  {
    profile: "directa_variabile",
    name: "Directa - Profilo Variabile",
    label: "Directa (Profilo Variabile)",
    fee_mode: "percent_min_max",
    fee_value: 0.19,
    fee_min: 1.5,
    fee_max: 18.0,
    fee_currency: "EUR",
    monthly_fee: 0,
    capital_gain_mode: "immediate",
    capital_gain_rate: 26,
    capital_gain_rate_gov: 12.5,
    description: "0,19% (min 1,50 € / max 18,00 €). Canone 0 €.",
  },
];

export interface FeeCalculationParams {
  broker?: Broker | null;
  quantity: number;
  price: number;
  market?: string;
  currency?: string;
}

export function estimateExecutionFee(params: FeeCalculationParams): {
  value: number;
  currency: string;
} {
  const { broker, quantity, price, market = "", currency } = params;
  if (!broker || quantity <= 0 || price <= 0) {
    return { value: 0, currency: currency || "EUR" };
  }

  const notional = quantity * price;
  const marketUpper = market.toUpperCase();
  const tradeCurr = (currency || broker.fee_currency || "EUR").toUpperCase();
  const isUsd = tradeCurr === "USD" || ["US", "NYSE", "NASDAQ", "AMEX"].some((m) => marketUpper.includes(m));

  const feeMode = broker.fee_mode || "fixed";
  const feeValue = Number(broker.fee_value || 0);

  if (feeMode === "fixed") {
    return { value: feeValue, currency: broker.fee_currency || "EUR" };
  }

  if (feeMode === "percent") {
    return { value: (notional * feeValue) / 100, currency: broker.fee_currency || "EUR" };
  }

  if (feeMode === "percent_min_max") {
    let calc = (notional * feeValue) / 100;
    const min = broker.fee_min !== null && broker.fee_min !== undefined ? Number(broker.fee_min) : null;
    const max = broker.fee_max !== null && broker.fee_max !== undefined ? Number(broker.fee_max) : null;
    if (min !== null && calc < min) calc = min;
    if (max !== null && calc > max) calc = max;
    return { value: calc, currency: isUsd ? "USD" : (broker.fee_currency || "EUR") };
  }

  if (feeMode === "under_30") {
    if (isUsd) {
      const usVal = broker.fee_us_value !== null && broker.fee_us_value !== undefined ? Number(broker.fee_us_value) : 3.95;
      return { value: usVal, currency: "USD" };
    }
    return { value: feeValue > 0 ? feeValue : 2.95, currency: "EUR" };
  }

  if (feeMode === "tiered_volume") {
    const tier = broker.fee_tier_override && [1, 2, 3, 4].includes(Number(broker.fee_tier_override))
      ? Number(broker.fee_tier_override)
      : 1;

    const tierEur: Record<number, number> = { 1: 19.0, 2: 9.95, 3: 6.95, 4: 2.95 };
    const tierUsd: Record<number, number> = { 1: 12.95, 2: 9.95, 3: 8.95, 4: 3.95 };

    if (isUsd) {
      return { value: tierUsd[tier] ?? 12.95, currency: "USD" };
    }
    return { value: tierEur[tier] ?? 19.0, currency: "EUR" };
  }

  return { value: feeValue, currency: broker.fee_currency || "EUR" };
}

export interface InstrumentTypeOption {
  value: string;
  labelIt: string;
  labelEn: string;
  taxRateDefault: number;
  isGovBond?: boolean;
}

export const INSTRUMENT_TYPES: InstrumentTypeOption[] = [
  { value: "stock", labelIt: "Azione (26%)", labelEn: "Stock (26%)", taxRateDefault: 26 },
  { value: "etf", labelIt: "ETF (26%)", labelEn: "ETF (26%)", taxRateDefault: 26 },
  { value: "bond", labelIt: "Obbligazione corporate (26%)", labelEn: "Corporate Bond (26%)", taxRateDefault: 26 },
  { value: "government_bond", labelIt: "Titolo di Stato (12,5%)", labelEn: "Government Bond (12.5%)", taxRateDefault: 12.5, isGovBond: true },
  { value: "crypto", labelIt: "Criptovaluta (26%)", labelEn: "Crypto (26%)", taxRateDefault: 26 },
  { value: "other", labelIt: "Altro (26%)", labelEn: "Other (26%)", taxRateDefault: 26 },
];

export function isGovernmentBond(instrumentType?: string | null): boolean {
  if (!instrumentType) return false;
  const lower = instrumentType.trim().toLowerCase();
  return lower === "government_bond" || lower === "titolo_di_stato";
}

export function detectIsGovernmentBond(symbol?: string | null, market?: string | null, isin?: string | null): boolean {
  const s = (symbol || "").toUpperCase();
  const m = (market || "").toUpperCase();
  const i = (isin || "").toUpperCase();
  if (i.startsWith("IT0005")) return true;
  if (s.startsWith("BTP") || s.startsWith("BOT") || s.startsWith("CCT") || s.startsWith("CTZ")) return true;
  if (m === "MOT" || m === "XMOT") return true;
  return false;
}
