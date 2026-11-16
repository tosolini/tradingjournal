import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import it from "../locales/it.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "it"],
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tradejournal-language",
    },
  });

function syncHtmlLang() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
}

i18n.on("languageChanged", syncHtmlLang);
syncHtmlLang();

export default i18n;
