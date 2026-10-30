/**
 * Utility functions for locale-aware number parsing and formatting.
 * Seamlessly supports both comma (,) and dot (.) decimal separators.
 */

/**
 * Returns BCP 47 language tag ("it-IT" or "en-US") from i18n language string.
 */
export function getNumberLocale(lang?: string): string {
  if (!lang) return "it-IT";
  return lang.startsWith("en") ? "en-US" : "it-IT";
}

/**
 * Parses user input or API values into a valid finite JavaScript number.
 * Accepts both dot (.) and comma (,) as decimal separators, as well as thousand separators.
 * Examples:
 *   "12,50" -> 12.5
 *   "10.50" -> 10.5
 *   "1.234,56" -> 1234.56
 *   "1,234.56" -> 1234.56
 *   "0,45" -> 0.45
 */
export function parseLocaleNumber(value: string | number | null | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  let normalized = raw.replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma > lastDot) {
      // European format: 1.234,56 -> 1234.56
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,234.56 -> 1234.56
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    // Single comma as decimal separator: 12,50 -> 12.50
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Cleans string input for backend API payloads by normalizing decimal commas to dots.
 * e.g. "98,50" -> "98.50"
 */
export function cleanNumberInput(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return "";
  const str = String(value).trim();
  if (!str) return "";
  const num = parseLocaleNumber(str);
  return Number.isFinite(num) ? String(num) : str.replace(",", ".");
}

/**
 * Formats a monetary amount according to the given locale (or defaults to it-IT / en-US).
 */
export function formatMoney(
  value: string | number | null | undefined,
  currency = "EUR",
  locale = "it-IT"
): string {
  const n = parseLocaleNumber(value);
  const normalized = (currency || "EUR").trim().toUpperCase();
  if (!normalized || normalized === "MIX") {
    const formatted = n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
    return normalized ? `${formatted} ${normalized}` : formatted;
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: normalized, useGrouping: true }).format(n);
  } catch {
    return `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} ${normalized}`;
  }
}

/**
 * Formats signed monetary value (with explicit + or -).
 */
export function formatSignedMoney(
  value: string | number | null | undefined,
  currency = "EUR",
  locale = "it-IT"
): string {
  const n = parseLocaleNumber(value);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}${formatMoney(Math.abs(n), currency, locale)}`;
}

/**
 * Formats a number with locale-appropriate decimal and thousand separators.
 */
export function formatNumber(
  value: string | number | null | undefined,
  options?: { minDecimals?: number; maxDecimals?: number; locale?: string }
): string {
  const n = parseLocaleNumber(value);
  const loc = options?.locale || "it-IT";
  return n.toLocaleString(loc, {
    minimumFractionDigits: options?.minDecimals ?? 2,
    maximumFractionDigits: options?.maxDecimals ?? 2,
    useGrouping: true,
  });
}

/**
 * Formats percentage with sign and locale-appropriate decimal separator.
 */
export function formatPct(
  value: string | number | null | undefined,
  decimals = 2,
  locale = "it-IT"
): string {
  const n = parseLocaleNumber(value);
  const formatted = Math.abs(n).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
  return `${n >= 0 ? "+" : "-"}${formatted}%`;
}

/**
 * Formats a security price.
 * For bonds (priced in base 100 percentage points): outputs percentage (e.g. 100,04% in IT or 100.04% in US).
 * For other assets (stocks/ETFs): outputs currency (e.g. 120,50 € in IT or €120.50 in US).
 */
export function formatPrice(
  value: string | number | null | undefined,
  isBond = false,
  currency = "EUR",
  locale = "it-IT",
  decimals = 2
): string {
  const n = parseLocaleNumber(value);
  if (isBond) {
    const formatted = n.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true,
    });
    return `${formatted}%`;
  }
  return formatMoney(n, currency, locale);
}

/**
 * Formats an asset quantity.
 * For bonds: formats nominal value with thousand separator (e.g. 25.000 in IT or 25,000 in US).
 * For stocks/ETFs: preserves exact fractional shares up to 4 decimals, or no decimals if integer.
 */
export function formatQuantity(
  value: string | number | null | undefined,
  isBond = false,
  locale = "it-IT"
): string {
  const n = parseLocaleNumber(value);
  if (isBond) {
    return Math.round(n).toLocaleString(locale, { useGrouping: true });
  }
  const isInt = Number.isInteger(n);
  return n.toLocaleString(locale, {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 4,
    useGrouping: true,
  });
}
