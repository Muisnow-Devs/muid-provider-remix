import "dotenv/config";
import compression from "compression";
import express from "express";
import morgan from "morgan";

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "3000");

const app = express();

app.use(compression());
app.disable("x-powered-by");

// Trust only the configured proxy hops/addresses instead of blanket trust,
// so clients cannot spoof X-Forwarded-For (which would defeat IP rate limiting).
// TRUST_PROXY: integer hop count, comma-separated CIDRs/addresses, or "false"/"0"
// to disable. Defaults to 1 (a single reverse proxy in front of the app).
const trustProxyEnv = process.env.TRUST_PROXY?.trim();
let trustProxy = 1;
if (trustProxyEnv !== undefined && trustProxyEnv !== "") {
    if (trustProxyEnv === "false" || trustProxyEnv === "0") {
        trustProxy = false;
    } else if (trustProxyEnv === "true") {
        // Explicit opt-in to trusting every hop (not recommended).
        trustProxy = true;
    } else if (/^\d+$/.test(trustProxyEnv)) {
        trustProxy = Number.parseInt(trustProxyEnv, 10);
    } else {
        trustProxy = trustProxyEnv.split(",").map((entry) => entry.trim());
    }
}
app.set("trust proxy", trustProxy);

if (DEVELOPMENT) {
    console.log("Starting development server");
    const viteDevServer = await import("vite").then((vite) =>
        vite.createServer({
            server: { middlewareMode: true },
        }),
    );
    app.use(viteDevServer.middlewares);
    app.use(async (req, res, next) => {
        try {
            const source = await viteDevServer.ssrLoadModule("./server/app.ts");
            return await source.app(req, res, next);
        } catch (error) {
            if (typeof error === "object" && error instanceof Error) {
                viteDevServer.ssrFixStacktrace(error);
            }
            next(error);
        }
    });
} else {
    console.log("Starting production server");
    app.use(
        "/assets",
        express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
    );
    app.use(morgan("tiny"));
    app.use(express.static("build/client", { maxAge: "1h" }));
    app.use(await import(BUILD_PATH).then((mod) => mod.app));
}

app.listen(PORT, "localhost", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});