import i18n, { t } from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

export const getTranslatedLabel = (label: string) => {
  if (!label) return "";

  return t(`${label.replace(/\s+/g, "_").toLowerCase()}`, { ns: "objects" });
};

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializeI18n = () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = i18n
    .use(initReactI18next)
    .use(HttpBackend)
    .init({
      fallbackLng: "en",
      backend: {
        loadPath: "locales/{{lng}}/{{ns}}.json",
      },
      ns: [
        "common",
        "objects",
        "audio",
        "components/camera",
        "components/dialog",
        "components/filter",
        "components/icons",
        "components/player",
        "views/events",
        "views/explore",
        "views/live",
        "views/settings",
        "views/system",
        "views/exports",
        "views/explore",
      ],
      defaultNS: "common",
      react: {
        transSupportBasicHtmlNodes: true,
        transKeepBasicHtmlNodesFor: [
          "br",
          "strong",
          "i",
          "em",
          "li",
          "p",
          "code",
          "span",
          "p",
          "ul",
          "li",
          "ol",
        ],
      },
      interpolation: {
        escapeValue: false,
      },
      keySeparator: ".",
      parseMissingKeyHandler: (key: string) => {
        const parts = key.split(".");

        if (parts[0] === "object" || parts[0] === "audio") {
          return (
            parts[1]
              ?.split("_")
              .map(
                (word) =>
                  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
              )
              .join(" ") || key
          );
        }

        if (parts.length > 1) {
          const lastPart = parts[parts.length - 1];
          return lastPart
            .split("_")
            .map(
              (word) =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
            )
            .join(" ");
        }

        return key
          .split("_")
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join(" ");
      },
    })
    .then(() => {
      isInitialized = true;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Failed to initialize i18n:", error);
      isInitialized = true;
    });

  return initializationPromise;
};

initializeI18n();

export const isI18nReady = () => isInitialized;

export const waitForI18nReady = () => {
  if (isInitialized) {
    return Promise.resolve();
  }
  return initializationPromise || Promise.resolve();
};

export default i18n;
