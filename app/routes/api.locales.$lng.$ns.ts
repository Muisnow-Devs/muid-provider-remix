import { data, LoaderFunctionArgs } from "react-router";
import { cacheHeader } from "pretty-cache-header";
import { z } from "zod";
import { namespaces, translations } from "@/.server/i18n";

export async function loader({ params }: LoaderFunctionArgs) {
    const lng = z.enum(Object.keys(translations)).safeParse(params.lng);
    if (lng.error) return data({ error: lng.error }, { status: 400 });

    const ns = z.enum(namespaces).safeParse(params.ns);
    if (ns.error) return data({ error: ns.error.message }, { status: 400 });

    try {
        const translation = translations[lng.data][ns.data];
        if (!translation) {
            return data({ error: "Translation not found" }, { status: 404 });
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
        console.error("Error loading translation:", error);
        return data({ error: "Translation file not found" }, { status: 404 });
    }
}
