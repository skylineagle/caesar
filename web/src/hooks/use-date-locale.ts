import { useState, useEffect } from "react";
import { enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

const localeMap: Record<string, () => Promise<Locale>> = {
  "zh-CN": () =>
    import("date-fns/locale/zh-CN").then((module) => module.default),
  es: () => import("date-fns/locale/es").then((module) => module.default),
  hi: () => import("date-fns/locale/hi").then((module) => module.default),
  fr: () => import("date-fns/locale/fr").then((module) => module.default),
  ar: () => import("date-fns/locale/ar").then((module) => module.default),
  pt: () => import("date-fns/locale/pt").then((module) => module.default),
  ru: () => import("date-fns/locale/ru").then((module) => module.default),
  de: () => import("date-fns/locale/de").then((module) => module.default),
  ja: () => import("date-fns/locale/ja").then((module) => module.default),
  tr: () => import("date-fns/locale/tr").then((module) => module.default),
  it: () => import("date-fns/locale/it").then((module) => module.default),
  nl: () => import("date-fns/locale/nl").then((module) => module.default),
  sv: () => import("date-fns/locale/sv").then((module) => module.default),
  cs: () => import("date-fns/locale/cs").then((module) => module.default),
  "nb-NO": () => import("date-fns/locale/nb").then((module) => module.default),
  ko: () => import("date-fns/locale/ko").then((module) => module.default),
  vi: () => import("date-fns/locale/vi").then((module) => module.default),
  fa: () => import("date-fns/locale/fa-IR").then((module) => module.default),
  pl: () => import("date-fns/locale/pl").then((module) => module.default),
  uk: () => import("date-fns/locale/uk").then((module) => module.default),
  he: () => import("date-fns/locale/he").then((module) => module.default),
  el: () => import("date-fns/locale/el").then((module) => module.default),
  ro: () => import("date-fns/locale/ro").then((module) => module.default),
  hu: () => import("date-fns/locale/hu").then((module) => module.default),
  fi: () => import("date-fns/locale/fi").then((module) => module.default),
  da: () => import("date-fns/locale/da").then((module) => module.default),
  sk: () => import("date-fns/locale/sk").then((module) => module.default),
  "yue-Hant": () =>
    import("date-fns/locale/zh-HK").then((module) => module.default),
  th: () => import("date-fns/locale/th").then((module) => module.default),
  ca: () => import("date-fns/locale/ca").then((module) => module.default),
};

export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  const [locale, setLocale] = useState<Locale>(enUS);

  useEffect(() => {
    const loadLocale = async () => {
      if (i18n.language === "en") {
        setLocale(enUS);
        return;
      }

      const localeLoader = localeMap[i18n.language];
      if (localeLoader) {
        try {
          const loadedLocale = await localeLoader();
          setLocale(loadedLocale);
        } catch (error) {
          setLocale(enUS);
        }
      } else {
        setLocale(enUS);
      }
    };

    loadLocale();
  }, [i18n.language]);

  return locale;
}
