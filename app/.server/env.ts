import { logger } from "./logger";

/**
 * Startup environment validation.
 *
 * Checks every required environment variable up front and throws a single,
 * aggregated error listing all problems so misconfiguration is caught
 * before the server starts serving traffic.
 *
 * See `.env.example` at the repository root for the full list of variables.
 */

const MIN_SECRET_LENGTH = 32;

/** Substrings that indicate a placeholder / example value (checked case-insensitively). */
const PLACEHOLDER_MARKERS = [
    "change_me",
    "changeme",
    "secret_key",
    "example",
];

/** Variables that must be present and non-empty. */
const REQUIRED_VARS = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "JWKS_ENC_KEY",
    "BETTER_AUTH_SECRET",
    "AUTH_GOOGLE_CLIENT_ID",
    "AUTH_GOOGLE_CLIENT_SECRET",
    "TURNSTILE_SECRET_KEY",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
] as const;

/** Variables that hold secrets and must meet strength requirements. */
const SECRET_VARS = [
    "SESSION_SECRET",
    "JWKS_ENC_KEY",
    "BETTER_AUTH_SECRET",
] as const;

const OIDC_ISSUER_DEV_DEFAULT = "http://localhost:3000";

function isProduction(): boolean {
    return process.env.NODE_ENV === "production";
}

function findPlaceholderMarker(value: string): string | undefined {
    const lowered = value.toLowerCase();
    return PLACEHOLDER_MARKERS.find((marker) => lowered.includes(marker));
}

export interface EnvValidationResult {
    errors: string[];
    warnings: string[];
}

/**
 * Collect all environment problems without throwing.
 * Exposed mainly for testability; use {@link validateEnv} at startup.
 */
export function collectEnvProblems(): EnvValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const production = isProduction();

    for (const name of REQUIRED_VARS) {
        const value = process.env[name];
        if (!value || value.trim() === "") {
            errors.push(`${name} is required and must not be empty.`);
        }
    }

    // OIDC_ISSUER: required in production; defaulted (with a warning) in development.
    const issuer = process.env.OIDC_ISSUER;
    if (!issuer || issuer.trim() === "") {
        if (production) {
            errors.push("OIDC_ISSUER is required and must not be empty in production.");
        } else {
            warnings.push(
                `OIDC_ISSUER is not set; defaulting to ${OIDC_ISSUER_DEV_DEFAULT} (development only).`
            );
            process.env.OIDC_ISSUER = OIDC_ISSUER_DEV_DEFAULT;
        }
    }

    for (const name of SECRET_VARS) {
        const value = process.env[name];
        if (!value || value.trim() === "") {
            // Missing entirely - already reported by the required check above.
            continue;
        }

        if (value.length < MIN_SECRET_LENGTH) {
            const message =
                `${name} must be at least ${MIN_SECRET_LENGTH} characters long ` +
                `(got ${value.length}). Generate one with: openssl rand -hex 32`;
            if (production) {
                errors.push(message);
            } else {
                warnings.push(`${message} (allowed in development only)`);
            }
        }

        const marker = findPlaceholderMarker(value);
        if (marker) {
            const message =
                `${name} looks like a placeholder value (contains "${marker}"). ` +
                "Set a real secret. Generate one with: openssl rand -hex 32";
            if (production) {
                errors.push(message);
            } else {
                warnings.push(`${message} (allowed in development only)`);
            }
        }
    }

    return { errors, warnings };
}

let validated = false;

/**
 * Validate the process environment. Logs warnings via the server logger and
 * throws a single aggregated error if any hard requirement is violated.
 * Safe to call multiple times; only the first call performs the checks.
 */
export function validateEnv(): void {
    if (validated) return;
    validated = true;

    const { errors, warnings } = collectEnvProblems();

    for (const warning of warnings) {
        logger.warn(`[env] ${warning}`);
    }

    if (errors.length > 0) {
        const details = errors.map((error) => `  - ${error}`).join("\n");
        throw new Error(
            `Environment validation failed with ${errors.length} problem(s):\n${details}\n` +
            "See .env.example for the expected configuration."
        );
    }

    logger.info("[env] Environment validation passed.");
}

// Run once at import time so validation happens before any other server
// module reads its configuration (this module must be imported first).
validateEnv();
