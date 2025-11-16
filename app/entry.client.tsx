import Fetch from "i18next-fetch-backend";
import i18next from "i18next";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { HydratedRouter } from "react-router/dom";
import I18nextBrowserLanguageDetector from "i18next-browser-languagedetector";

async function entry() {
    await i18next
        .use(initReactI18next)
        .use(Fetch)
        .use(I18nextBrowserLanguageDetector)
        .init({
            fallbackLng: "en",
            defaultNS: "default",
            ns: ["default", "errors", "authorize", "accounts"],
            detection: {
                order: ["htmlTag", "querystring", "localStorage", "navigator"],
                caches: ["localStorage"],
            },
            backend: {
                loadPath: "/api/locales/{{lng}}/{{ns}}",
            },
        });
    
    startTransition(() => {
        hydrateRoot(
            document,
            <I18nextProvider i18n={i18next}>
                <StrictMode>
                    <HydratedRouter />
                </StrictMode>
            </I18nextProvider>
        );
    });
}

entry().catch((error) => {
    console.error("Failed to hydrate app:", error);
});
