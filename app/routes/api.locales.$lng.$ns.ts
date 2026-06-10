import { data, LoaderFunctionArgs } from "react-router";
import { cacheHeader } from "pretty-cache-header";
import { z } from "zod";
import { namespaces, translations } from "@/.server/i18n";
import { logger } from "@/.server/logger";

export async function loader({ params }: LoaderFunctionArgs) {
    const lng = z.enum(Object.keys(translations)).safeParse(params.lng);
    if (lng.error) return data({ error: "This language is not allowed." }, { status: 400 });

    const ns = z.enum(namespaces).safeParse(params.ns);
    if (ns.error) return data({ error: "This namespace is not allowed." }, { status: 400 });

    try {
        const translation = translations[lng.data][ns.data];
        if (!translation) {
            return data({ error: "Translation not found, this shouldn't happened." }, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", "application/json");

        if (process.env.NODE_ENV === "production") {
            headers.set(
                "Cache-Control",
                cacheHeader({
                    maxAge: "5m",
                    sMaxage: "1d",
                    staleWhileRevalidate: "7d",
                    staleIfError: "7d",
                })
            );
        }

        return data(translation, { headers });
    } catch (error) {
        logger.error("Error loading translation", error instanceof Error ? error : { error });
        return data({ error: "Translation file not found" }, { status: 404 });
    }
}
