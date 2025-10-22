import os from "os";

/**
 * Lightweight JSON logger
 * - Reads LOG_LEVEL from env (debug|info|warn|error)
 * - Exposes: logger (default), createLogger(context)
 * - Methods: debug, info, warn, error, child (alias of createLogger)
 */

type LogLevel = "debug" | "info" | "warn" | "error";
type Meta = Record<string, unknown> | Error | undefined;

const LEVELS: Record<LogLevel, number> = {
    "debug": 10,
    "info": 20,
    "warn": 30,
    "error": 40,
};

const envLevel = (process?.env?.LOG_LEVEL as LogLevel) ?? "info";
const CURRENT_LEVEL_NUM = LEVELS[envLevel] ?? LEVELS.info;

const getHost = () => {
    try {
        // Node
        return os.hostname();
    } catch {
        // Browser or fallback
        return typeof location !== "undefined" ? location.hostname : "unknown";
    }
};

function formatMeta(meta?: Meta) {
    if (!meta) return undefined;
    if (meta instanceof Error) {
        return { message: meta.message, stack: meta.stack };
    }
    return meta;
}

function shouldLog(level: LogLevel) {
    return LEVELS[level] >= CURRENT_LEVEL_NUM;
}

export interface Logger {
    debug: (msg: string, meta?: Meta) => void;
    info: (msg: string, meta?: Meta) => void;
    warn: (msg: string, meta?: Meta) => void;
    error: (msg: string, meta?: Meta) => void;
    child: (ctx?: Record<string, unknown>) => Logger;
}

function createLogger(defaultContext: Record<string, unknown> = {}): Logger {
    const host = getHost();
    const pid = typeof process !== "undefined" && process.pid ? process.pid : undefined;

    function log(level: LogLevel, msg: string, meta?: Meta) {
        if (!shouldLog(level)) return;
        const entry: Record<string, unknown> = {
            timestamp: new Date().toISOString(),
            level,
            message: msg,
            ...defaultContext,
            pid,
            host,
        };
        const m = formatMeta(meta);
        if (m !== undefined) entry.meta = m;
        // Format: timestamp TAG [level] message
        const tag = defaultContext.tag ? `${defaultContext.tag} ` : "";
        const metaStr = m !== undefined ? ` ${JSON.stringify(m)}` : "";

        // ANSI color codes
        const gray = "\x1b[90m";
        const bold = "\x1b[1m";
        const cyan = "\x1b[36m";
        const reset = "\x1b[0m";

        // Color by level
        let levelColor = "";
        if (level === "debug") levelColor = "\x1b[37m"; // white
        else if (level === "info") levelColor = "\x1b[32m"; // green
        else if (level === "warn") levelColor = "\x1b[33m"; // yellow
        else if (level === "error") levelColor = "\x1b[31m"; // red

        const out = `${gray}${entry.timestamp}${reset} ${cyan}${tag}${reset}${levelColor}${bold}[${level.toUpperCase()}]${reset} ${msg}${metaStr}`;
        // route by level (console methods)
        if (level === "error") {
            console.error(out);
        } else if (level === "warn") {
            console.warn(out);
        } else if (level === "debug") {
            if (console.debug) {
                console.debug(out);
            } else {
                console.log(out);
            }
        } else {
            console.log(out);
        }
    }

    return {
        debug: (msg, meta) => log("debug", msg, meta),
        info: (msg, meta) => log("info", msg, meta),
        warn: (msg, meta) => log("warn", msg, meta),
        error: (msg, meta) => log("error", msg, meta),
        child: (ctx = {}) => createLogger({ ...defaultContext, ...ctx }),
    };
}

// default logger instance
export const logger = createLogger();

// convenience default export
export default logger;
