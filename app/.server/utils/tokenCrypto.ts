import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from "node:crypto";
import logger from "../logger";

/**
 * Transparent at-rest encryption for OAuth tokens (AES-256-GCM).
 *
 * Ciphertext format: `enc:v1:<base64(iv || authTag || ciphertext)>`
 * - iv: 12 bytes, authTag: 16 bytes
 * - Key derived from TOKEN_ENC_KEY via scrypt with a fixed application salt.
 *
 * Values that do not carry the `enc:v1:` prefix are treated as legacy
 * plaintext and passed through unchanged on decrypt.
 */

export const ENC_PREFIX = "enc:v1:";

/** Account model columns that are encrypted at rest with this scheme. */
export const ACCOUNT_TOKEN_FIELDS = [
    "accessToken",
    "refreshToken",
    "idToken",
] as const;

export type AccountTokenField = (typeof ACCOUNT_TOKEN_FIELDS)[number];

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KDF_SALT = "muid:account-token-crypto:v1";

let cachedKey: Buffer | null | undefined;
let warnedMissingKey = false;

function getKey(): Buffer | null {
    if (cachedKey !== undefined) return cachedKey;

    const secret = process.env.TOKEN_ENC_KEY;
    if (!secret) {
        cachedKey = null;
        return cachedKey;
    }

    cachedKey = scryptSync(secret, KDF_SALT, KEY_LENGTH);
    return cachedKey;
}

function warnMissingKey(action: string) {
    if (warnedMissingKey) return;
    warnedMissingKey = true;
    logger.warn(
        `TOKEN_ENC_KEY is not set; cannot ${action} OAuth tokens. ` +
            "Account tokens will be stored/read as plaintext until it is configured.",
    );
}

/** Whether the encryption key is configured. */
export function isTokenEncryptionEnabled(): boolean {
    return getKey() !== null;
}

/** Whether a stored value is already encrypted with this scheme. */
export function isEncryptedToken(value: string): boolean {
    return value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt a token value. Already-encrypted values are returned unchanged.
 * If TOKEN_ENC_KEY is unset, the plaintext is returned unchanged (with a
 * one-time warning) so the app keeps working before the key is configured.
 */
export function encryptToken(value: string): string {
    if (isEncryptedToken(value)) return value;

    const key = getKey();
    if (!key) {
        warnMissingKey("encrypt");
        return value;
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return (
        ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64")
    );
}

/**
 * Decrypt a stored token value. Values without the `enc:v1:` prefix are
 * treated as legacy plaintext and returned unchanged.
 */
export function decryptToken(value: string): string {
    if (!isEncryptedToken(value)) return value;

    const key = getKey();
    if (!key) {
        warnMissingKey("decrypt");
        return value;
    }

    const payload = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error("Malformed encrypted token payload");
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]).toString("utf8");
    } catch (error) {
        logger.error(
            "Failed to decrypt account token (wrong TOKEN_ENC_KEY or corrupted data)",
            error instanceof Error ? error : undefined,
        );
        throw new Error(
            "Failed to decrypt account token: wrong TOKEN_ENC_KEY or corrupted ciphertext",
            { cause: error },
        );
    }
}
