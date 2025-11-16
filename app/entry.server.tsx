import { PassThrough } from "node:stream";

import type { EntryContext, RouterContextProvider } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { getInstance } from "./.server/i18n";
import { i18n } from "i18next";

export const streamTimeout = 5_000;

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: RouterContextProvider
    // If you have middleware enabled:
    // loadContext: RouterContextProvider
) {
    return new Promise((resolve, reject) => {
        let shellRendered = false;
        let userAgent = request.headers.get("user-agent");

        // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
        // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
        let readyOption: keyof RenderToPipeableStreamOptions =
            (userAgent && isbot(userAgent)) || routerContext.isSpaMode
                ? "onAllReady"
                : "onShellReady";
        
        // Abort the rendering stream after the `streamTimeout` so it has time to
        // flush down the rejected boundaries
        let abort: () => void;
        let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
            () => typeof abort === "function" && abort(),
            streamTimeout + 1000
        );

        const { pipe, abort: abortFn } = renderToPipeableStream(
            <I18nextProvider i18n={getInstance(loadContext)} defaultNS="default">
                <ServerRouter context={routerContext} url={request.url} />
            </I18nextProvider>,
            {
                [readyOption]() {
                    shellRendered = true;
                    const body = new PassThrough({
                        final(callback) {
                            // Clear the timeout to prevent retaining the closure and memory leak
                            clearTimeout(timeoutId);
                            timeoutId = undefined;
                            callback();
                        },
                    });
                    const stream = createReadableStreamFromReadable(body);

                    responseHeaders.set("Content-Type", "text/html");

                    pipe(body);

                    resolve(
                        new Response(stream, {
                            headers: responseHeaders,
                            status: responseStatusCode,
                        })
                    );
                },
                onShellError(error: unknown) {
                    reject(error);
                },
                onError(error: unknown) {
                    responseStatusCode = 500;
                    // Log streaming rendering errors from inside the shell.  Don't log
                    // errors encountered during initial shell rendering since they'll
                    // reject and get logged in handleDocumentRequest.
                    if (shellRendered) {
                        console.error(error);
                    }
                },
            }
        );

        abort = abortFn;
    });
}
