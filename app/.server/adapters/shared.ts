import { AdapterPayload } from "oidc-provider";
import logger from "../logger";

/**
 * Shared helpers for the OIDC provider adapters.
 */

/**
 * Parse a stored JSON payload string back into an AdapterPayload
 */
export function parseAdapterPayload(raw: string): AdapterPayload {
    return JSON.parse(raw) as AdapterPayload;
}

/**
 * Check whether a stored model instance has expired
 */
export function isExpired(expiresAt: Date | null | undefined): boolean {
    return !!expiresAt && expiresAt.getTime() < Date.now();
}

/**
 * Return a copy of the payload with the OIDC "consumed" flag set
 * (epoch seconds of the given consumption time)
 */
export function withConsumedFlag(
    payload: AdapterPayload,
    consumedAt: Date
): AdapterPayload {
    return {
        ...payload,
        consumed: Math.floor(consumedAt.getTime() / 1000),
    };
}

/**
 * Convert a stored database row (serialized payload + consumedAt marker)
 * into an AdapterPayload, applying the consumed flag when present
 */
export function toAdapterPayload(model: {
    payload: string;
    consumedAt: Date | null;
}): AdapterPayload {
    const payload = parseAdapterPayload(model.payload);
    return model.consumedAt
        ? withConsumedFlag(payload, model.consumedAt)
        : payload;
}

/**
 * Check whether an error is Prisma's "record not found" error (P2025)
 */
function isRecordNotFoundError(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === "P2025"
    );
}

/**
 * Build a `.catch()` handler for prisma delete calls that ignores
 * "record not found" (P2025) errors and logs anything else
 */
export function ignoreRecordNotFound(context: string): (err: unknown) => void {
    return (err: unknown) => {
        if (isRecordNotFoundError(err)) return;
        logger.error(
            `${context} failed`,
            err instanceof Error ? err : { error: String(err) }
        );
    };
}
