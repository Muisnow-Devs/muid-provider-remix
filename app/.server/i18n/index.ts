import { Resource } from "i18next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initReactI18next } from "react-i18next";
import { createCookie } from "react-router";
import { createI18nextMiddleware } from "remix-i18next/middleware";
import "i18next";
import Backend from "i18next-fs-backend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("i18n directory:", resolve(__dirname, "../../locales"));

export const i18nCookies = createCookie("_i18n", {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
});

export type TranslationDict = {
    [key: string]: string | TranslationDict;
};
const translationModules = import.meta.glob<TranslationDict>(
    "../../locales/*/*.json",
    {
        eager: true,
        import: "default",
    }
);

export const translations = Object.entries(translationModules).reduce<Resource>(
    (acc, [filePath, module]) => {
        const [, , , locale, namespace] = filePath.split("/");
        const ns = namespace.replace(".json", "");

        if (!acc[locale]) {
            acc[locale] = {};
        }

        acc[locale][ns] = module;
        return acc;
    },
    {}
);
export const namespaces = Array.from(
    new Set(
        Object.values(translations).flatMap((locale) => Object.keys(locale))
    )
);

export const [i18nextMiddleware, getLocale, getInstance] =
    createI18nextMiddleware({
        detection: {
            supportedLanguages: Object.keys(translations),
            fallbackLanguage: "en",
            cookie: i18nCookies,
        },
        i18next: {
            fallbackLng: "en",
            supportedLngs: Object.keys(translations),
            defaultNS: "default",
            ns: namespaces,
            debug: process.env.NODE_ENV !== "production",
            react: {
                useSuspense: false,
            },
            backend: {
                loadPath: resolve(__dirname, "../../locales/{{lng}}/{{ns}}.json"),
            },
        },
        plugins: [initReactI18next, Backend],
    });

declare module "i18next" {
    interface CustomTypeOptions {
        defaultNS: "default";
        resources: {
            errors: typeof import("../../locales/en/errors.json");
            default: typeof import("../../locales/en/default.json");
            authorize: typeof import("../../locales/en/authorize.json");
            accounts: typeof import("../../locales/en/accounts.json");
        }
    }
}
