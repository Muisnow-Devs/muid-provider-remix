import {
    data,
    isRouteErrorResponse,
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { Providers } from "./provider";
import { getLocale, i18nCookies, i18nextMiddleware } from "./.server/i18n";
import { useTranslation } from "react-i18next";
import { PropsWithChildren, useEffect } from "react";

export const middleware: Route.MiddlewareFunction[] = [i18nextMiddleware];
export const links: Route.LinksFunction = () => [
    { rel: "preconnect", href: "https://objects.sanziusercontent.com" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
    },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
    },
];

export async function loader({ context }: Route.LoaderArgs) {
    const locale = getLocale(context);
    return data(
        { locale },
        { headers: { "Set-Cookie": await i18nCookies.serialize(locale) } }
    );
}

export function Layout({ children }: Readonly<PropsWithChildren>) {
    const { i18n } = useTranslation();

    return (
        <html lang={i18n.language} dir={i18n.dir(i18n.language)}>
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <Links />
            </head>
            <body className="dark bg-neutral-950!">
                <Providers>{children}</Providers>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App({ loaderData: { locale } }: Route.ComponentProps) {
    const { i18n } = useTranslation();
    useEffect(() => {
        if (i18n.language === locale) return;
        i18n.changeLanguage(locale);
    }, [i18n, locale]);

    return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let message = "Oops!";
    let details = "An unexpected error occurred.";
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? "404" : "Error";
        details =
            error.status === 404
                ? "The requested page could not be found."
                : error.statusText || details;
    } else if (import.meta.env.DEV && error && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <main className="pt-16 p-4 container mx-auto min-h-screen flex flex-col gap-4">
            <h1 className="text-2xl font-black">{message}</h1>
            <p className="text-xl">{details}</p>
            {stack && (
                <pre className="w-full p-4 overflow-x-auto">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}
