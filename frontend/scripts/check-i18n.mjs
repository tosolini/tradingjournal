#!/usr/bin/env node
/**
 * i18n guardrail.
 *
 * Checks performed:
 *  1. en/it key parity (same keys, same interpolation placeholders).
 *  2. Keys used in source code that are missing from the locales.
 *  3. Keys present in the locales but never used (warning only: some keys are
 *     resolved dynamically and cannot be detected statically).
 *  4. Hardcoded Italian UI strings outside `t()` (error).
 *  5. `t("key", "default value")` calls still carrying a positional default
 *     (warning only: migration debt, the locales are the source of truth).
 *
 * Usage: node scripts/check-i18n.mjs [--strict]
 * `--strict` turns warnings into errors (used to ratchet the migration down).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const LOCALES = path.join(SRC, "locales");
const STRICT = process.argv.includes("--strict");

const ITALIAN_WORDS = new Set(
  `salva annulla cancella elimina modifica modifiche aggiungi nuovo nuova nuovi nuove nessun nessuna nessuno
  chiudi apri cerca cercare impostazioni riepilogo attenzione errore errori conto conti operazione operazioni titolo titoli
  prezzo prezzi quantita quantità giorno giorni mese mesi anno anni nota note idea idee analisi rischio rendimento perdita
  perdite profitto profitti guadagno valore totale scadenza scadenze rimborso rimborsi cedola cedole rateo premi premio
  fedelta fedeltà liquidita liquidità carica scarica importa esporta crea invia seleziona selezione inserisci conferma
  salvataggio nome descrizione data date oggi ieri settimana settimane mercato mercati portafoglio posizione posizioni
  transazione transazioni vendita acquisto acquisti commissioni commissione tassa tasse banca banche broker simbolo simboli
  filtro filtri ordina visualizza dettaglio dettagli panoramica statistiche cronologia storico obiettivo obiettivi strategia
  suggerimento suggerimenti avviso avvisi aggiorna rimuovi benvenuto accedi esci registrati profilo utente utenti lingua tema
  chiaro scuro sistema tutti tutte tutto tutta trova trovato trovata raggiunto raggiunta disponibile disponibili caricamento
  caricare obbligazione obbligazioni azione azioni azionario obbligazionario fiscale aliquota capitale nominale netto lordo
  complessivo complessiva media medio massimo minimo ultima ultimo prossima prossimo valuta valori importo importi costo costi
  spesa spese entrata uscita entrate uscite ingresso apertura chiusura mensile annuale trimestrale semestrale giornaliero
  giornaliera settimanale periodo periodi ricerca risultati vendite rimborsato nominali cedolari giacenza maturato maturata
  scaduto scaduta emittente quotazione corso secco tel quel ritenuta accredito nette lordi flusso flussi cedolare incassate
  incassati registra registrare monitoraggio confronto visivo quotazioni prevista garantito calcolato calcolata residui residuo
  residua tranche attive archiviata prossimi prossime corrente dettagli scaglioni fascia fasce mese canone aliquota ord tds
  percentuale fissa fisso immediato amministrato mercato dettagliata complessiva grafico linea scrivi anche solo molto perche
  perché quindi quando della delle degli nella nelle sul sulla dal dei`
    .split(/\s+/)
    .filter(Boolean)
);

const ACCENTED = /[àèéìòùÀÈÉÌÒÙ]/;

/** Single tokens that are clearly Italian UI copy (not technical identifiers). */
const STRONG_ITALIAN = new Set(
  `salva annulla elimina modifica aggiungi chiudi apri cerca carica scarica importa esporta invia conferma rimuovi
  aggiorna seleziona crea nessun nessuna nuovo nuova totale cedola rateo nominale mercato portafoglio conto titolo prezzo
  quantita quantità scadenza rimborso commissioni aliquota canone fiscale patrimonio perdita profitto rendimento
  riepilogo impostazioni operazione dettagli giornaliero settimanale mensile annuale scaglioni fascia`
    .split(/\s+/)
    .filter(Boolean)
);

/** Lines that legitimately contain Italian-looking data (not UI copy). */
const ALLOWED_LINE = [
  /^\s*(?:const\s+)?aliases:/, // tag aliases used for normalising stored values
  /titolo_di_stato/, // backend enum value
  /^\s*\/\//,
  /^\s*\*/,
  /^\s*\/\*/,
  /localeCompare/,
  /toLocaleString|toLocaleDateString|Intl\./,
  /setAttribute\(\s*["'](?:data-theme|lang)["']/,
  /^\s*(?:name|labelIt|labelEn|subtitle|description|title)\s*:/, // preset/config data (proper names, labels)
  /labelIt\s*:|labelEn\s*:/, // bilingual option labels defined side by side
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function flatten(value, prefix = "", out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, full, out);
    else out[full] = String(child);
  }
  return out;
}

/** Remove comments while preserving newlines, so line numbers stay valid. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + " ".repeat(match.length - lead.length));
}

/**
 * Blank out every `t(...)` / `i18n.t(...)` call, preserving offsets so the
 * remaining text can be scanned for untranslated literals.
 */
function blankTranslateCalls(source) {
  const chars = [...source];
  const pattern = /(?<![\w.$])t\(\s*["'`]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let index = match.index + match[0].length - 1;
    let depth = 1;
    let quote = source[index];
    index += 1;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (quote) {
        if (char === "\\") {
          index += 2;
          continue;
        }
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      index += 1;
    }
    for (let i = match.index; i < Math.min(index, chars.length); i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
    pattern.lastIndex = index;
  }
  return chars.join("");
}

function looksItalian(text) {
  const body = text.trim();
  if (!body || !/[A-Za-zÀ-ÿ]/.test(body)) return false;
  // Identifiers, enum values, CSS classes, paths and template payloads are not UI copy.
  if (/^[a-z0-9_.:\/-]+$/.test(body) || /^[$][{]/.test(body)) return false;
  if (ACCENTED.test(body)) return true;
  const tokens = body.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (!tokens.length) return false;
  const hits = tokens.filter((token) => ITALIAN_WORDS.has(token));
  if (!hits.length) return false;
  if (tokens.length === 1) return STRONG_ITALIAN.has(tokens[0]);
  return hits.length / tokens.length >= 0.34;
}

function extractCandidates(line) {
  const candidates = [];
  for (const match of line.matchAll(/["'`]([^"'`\n]{2,300})["'`]/g)) candidates.push(match[1]);
  for (const match of line.matchAll(/>\s*([^<>{}"'\n]{2,300}?)\s*</g)) candidates.push(match[1]);
  return candidates;
}

const errors = [];
const warnings = [];

// ── Locale loading ────────────────────────────────────────────────────────────
const locales = {};
for (const file of fs.readdirSync(LOCALES).filter((name) => name.endsWith(".json"))) {
  const code = path.basename(file, ".json");
  locales[code] = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8")));
}

const reference = "en";
const referenceKeys = new Set(Object.keys(locales[reference] ?? {}));

for (const [code, entries] of Object.entries(locales)) {
  if (code === reference) continue;
  for (const key of referenceKeys) {
    if (!(key in entries)) errors.push(`[parity] ${code}.json is missing "${key}"`);
  }
  for (const key of Object.keys(entries)) {
    if (!referenceKeys.has(key)) errors.push(`[parity] ${code}.json has extra "${key}"`);
  }
  for (const key of referenceKeys) {
    if (!(key in entries)) continue;
    const placeholders = (value) =>
      new Set([...String(value).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]));
    const a = placeholders(locales[reference][key]);
    const b = placeholders(entries[key]);
    for (const name of a) if (!b.has(name)) errors.push(`[parity] ${code}.json "${key}" is missing {{${name}}}`);
    for (const name of b) if (!a.has(name)) errors.push(`[parity] ${code}.json "${key}" has unknown {{${name}}}`);
  }
}

// Plural forms must interpolate the count with double braces, otherwise
// i18next renders the placeholder literally.
for (const [code, entries] of Object.entries(locales)) {
  const pluralGroups = new Map();
  for (const key of Object.keys(entries)) {
    const match = key.match(/^(.*)_(?:zero|one|two|few|many|other)$/);
    if (!match) continue;
    if (!pluralGroups.has(match[1])) pluralGroups.set(match[1], []);
    pluralGroups.get(match[1]).push(key);
  }
  for (const [base, keys] of pluralGroups) {
    // A single `_zero`/`_one` suffix may just be part of a regular key name.
    if (keys.length < 2) continue;
    for (const key of keys) {
      const value = String(entries[key]);
      if (!value.includes("{{count}}")) {
        errors.push(`[plural] ${code}.json "${key}" must interpolate {{count}}: "${value}"`);
      }
    }
    void base;
  }
  for (const key of Object.keys(entries)) {
    if (/\{\w+\}/.test(String(entries[key]).replace(/\{\{/g, "").replace(/\}\}/g, ""))) {
      if (!/\{\{\w+\}\}/.test(String(entries[key]))) {
        errors.push(`[syntax] ${code}.json "${key}" uses single braces: "${entries[key]}"`);
      }
    }
  }
}

// ── Source scanning ───────────────────────────────────────────────────────────
const used = new Set();
const literalStrings = new Set();
const dynamicPrefixes = new Set();
const files = walk(SRC);

for (const file of files) {
  const relative = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  const clean = stripComments(source);

  for (const match of clean.matchAll(/["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g)) {
    literalStrings.add(match[1]);
  }

  for (const match of clean.matchAll(/(?<![\w.$])t\(\s*["'`]([^"'`]+)["'`]/g)) {
    const key = match[1];
    if (key.includes("${")) {
      const prefix = key.slice(0, key.indexOf("${"));
      if (prefix) dynamicPrefixes.add(prefix);
      continue;
    }
    used.add(key);
  }

  const blanked = blankTranslateCalls(clean);
  blanked.split("\n").forEach((line, index) => {
    if (ALLOWED_LINE.some((pattern) => pattern.test(line))) return;
    for (const candidate of extractCandidates(line)) {
      if (!looksItalian(candidate)) continue;
      errors.push(`[italian] ${relative}:${index + 1} hardcoded text: "${candidate.trim().slice(0, 90)}"`);
    }
  });

  clean.split("\n").forEach((line, index) => {
    if (/(?<![\w.$])t\(\s*["'][^"']+["']\s*,\s*["']/.test(line)) {
      warnings.push(`[defaults] ${relative}:${index + 1} t() call still passes an Italian default value`);
    }
  });
}

const hasPluralVariant = (key) =>
  referenceKeys.has(`${key}_one`) || referenceKeys.has(`${key}_other`) || referenceKeys.has(`${key}_zero`);

for (const key of used) {
  if (!referenceKeys.has(key) && !hasPluralVariant(key)) {
    errors.push(`[missing] key "${key}" is used in code but missing from ${reference}.json`);
  }
}

const isDynamic = (key) => [...dynamicPrefixes].some((prefix) => key.startsWith(prefix));

for (const key of referenceKeys) {
  const base = key.replace(/_(?:zero|one|two|few|many|other)$/, "");
  if (used.has(key) || used.has(base) || literalStrings.has(key) || isDynamic(base)) continue;
  warnings.push(`[unused] "${key}" is defined in ${reference}.json but never referenced`);
}

// ── Report ────────────────────────────────────────────────────────────────────
const uniqueErrors = [...new Set(errors)];
const uniqueWarnings = [...new Set(warnings)];

if (uniqueWarnings.length) {
  console.log(`\n⚠️  ${uniqueWarnings.length} warning(s):`);
  for (const warning of uniqueWarnings) console.log(`   ${warning}`);
}

if (uniqueErrors.length) {
  console.error(`\n❌ ${uniqueErrors.length} error(s):`);
  for (const error of uniqueErrors) console.error(`   ${error}`);
}

const failed = uniqueErrors.length > 0 || (STRICT && uniqueWarnings.length > 0);
if (!failed) console.log("\n✅ i18n check passed");
process.exit(failed ? 1 : 0);
