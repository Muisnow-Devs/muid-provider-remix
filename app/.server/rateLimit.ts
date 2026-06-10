import type { NextFunction, Request, Response } from "express";
import redis from "./redis";
import logger from "./logger";

/**
 * Reads a positive integer from the environment, falling back to a default.
 * Used to make every rate-limit knob overridable without code changes.
 */
export function rateLimitEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        logger.warn(
            `[RateLimit] Ignoring invalid value for ${name}: "${raw}", using default ${fallback}`,
        );
        return fallback;
    }

    return parsed;
}

const TOKEN_WINDOW = rateLimitEnv("RATE_LIMIT_TOKEN_WINDOW", 60);
const TOKEN_MAX = rateLimitEnv("RATE_LIMIT_TOKEN_MAX", 30);
const AUTHORIZE_WINDOW = rateLimitEnv("RATE_LIMIT_AUTHORIZE_WINDOW", 60);
const AUTHORIZE_MAX = rateLimitEnv("RATE_LIMIT_AUTHORIZE_MAX", 60);

const REDIS_KEY_PREFIX = "rl:oidc:";

/**
 * Extracts the OAuth client_id from an HTTP Basic Authorization header
 * (client_secret_basic). The request body is intentionally NOT parsed here:
 * consuming the stream would break oidc-provider's own body parsing.
 */
function clientIdFromBasicAuth(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header?.startsWith("Basic ")) return undefined;

    try {
        const decoded = Buffer.from(header.slice(6), "base64").toString(
            "utf8",
        );
        const separator = decoded.indexOf(":");
        if (separator <= 0) return undefined;
        return decodeURIComponent(decoded.slice(0, separator));
    } catch {
        return undefined;
    }
}

/**
 * Fixed-window counter backed by Redis (INCR + EXPIRE).
 * Returns the number of seconds to wait when the limit is exceeded,
 * or null when the request is allowed.
 */
async function consume(
    key: string,
    windowSeconds: number,
    max: number,
): Promise<number | null> {
    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, windowSeconds);
    }

    if (count <= max) return null;

    let ttl = await redis.ttl(key);
    if (ttl < 0) {
        // The key lost its TTL (e.g. crash between INCR and EXPIRE);
        // re-arm it so the block always expires.
        await redis.expire(key, windowSeconds);
        ttl = windowSeconds;
    }
    return ttl;
}

/**
 * Express middleware rate limiting the OIDC provider's sensitive endpoints.
 * Mount it on the same path prefix as the provider (e.g. `/oauth2`) so that
 * `req.path` is relative to the mount point:
 *
 * - `/token` (token endpoint): per IP + client_id, default 30/min
 *   (`RATE_LIMIT_TOKEN_MAX` / `RATE_LIMIT_TOKEN_WINDOW`)
 * - `/auth` (authorization endpoint, incl. interaction resume): per IP,
 *   default 60/min (`RATE_LIMIT_AUTHORIZE_MAX` / `RATE_LIMIT_AUTHORIZE_WINDOW`)
 *
 * Fails open if Redis is unavailable so login is never hard-down because of
 * the limiter itself.
 */
export async function oidcRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    let key: string;
    let windowSeconds: number;
    let max: number;

    const ip = req.ip ?? "unknown";

    if (req.path === "/token") {
        const clientId = clientIdFromBasicAuth(req) ?? "-";
        key = `${REDIS_KEY_PREFIX}token:${ip}:${clientId}`;
        windowSeconds = TOKEN_WINDOW;
        max = TOKEN_MAX;
    } else if (req.path === "/auth" || req.path.startsWith("/auth/")) {
        key = `${REDIS_KEY_PREFIX}authorize:${ip}`;
        windowSeconds = AUTHORIZE_WINDOW;
        max = AUTHORIZE_MAX;
    } else {
        return next();
    }

    try {
        const retryAfter = await consume(key, windowSeconds, max);
        if (retryAfter === null) return next();

        logger.warn("[RateLimit] OIDC rate limit exceeded", {
            path: req.path,
            ip,
        });
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({
            error: "too_many_requests",
            error_description:
                "Rate limit exceeded. Please retry after some time.",
        });
    } catch (error) {
        // Fail open: a Redis hiccup should not take down the OIDC endpoints.
        logger.error(
            "[RateLimit] Failed to evaluate OIDC rate limit, allowing request",
            error instanceof Error ? error : { error },
        );
        next();
    }
}
