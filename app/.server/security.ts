import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    createHash,
    scryptSync,
    timingSafeEqual,
} from "node:crypto";
import { commitSession, getSession } from "./sessions";
import { getPrivateJwkForSigning } from "./jwks";
import { importJWK } from "jose";
import { auth } from "./auth";
import { logger } from "./logger";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

// Versioned ciphertext format. v2 payload layout (hex encoded, after the
// "v2:" prefix): salt(16) | iv(12) | authTag(16) | encryptedData
const V2_PREFIX = "v2:";
const V2_SALT_LENGTH = 16;
const V2_IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Legacy (unversioned) payload layout (hex encoded):
// encryptedData | iv(16) | authTag(16)
const LEGACY_IV_LENGTH = 16;

export function generateCSRFToken() {
    return randomBytes(128).toString("hex");
}

/**
 * Derive the value stored in the session for a CSRF token, bound to the
 * authenticated user.
 */
export function hashCSRFToken(csrfToken: string, userId: string) {
    return createHash("sha256")
        .update(csrfToken)
        .update(userId)
        .digest("hex");
}

/**
 * Timing-safe string comparison. Both inputs are hashed to fixed-length
 * digests first so `timingSafeEqual` never throws on length mismatch and
 * no length information is leaked through the comparison.
 */
export function safeCompare(a: string, b: string) {
    const digestA = createHash("sha256").update(a).digest();
    const digestB = createHash("sha256").update(b).digest();
    return timingSafeEqual(digestA, digestB);
}

function deriveLegacyKey(encryptKey: string) {
    return Buffer.from(encryptKey.padEnd(KEY_LENGTH, "0").slice(0, KEY_LENGTH));
}

// scrypt is intentionally expensive (~tens of ms, blocking). Stored
// ciphertexts (e.g. the JWKS row) are decrypted repeatedly with the same
// salt, so memoize derived keys for salts we have already seen. The cache
// is bounded; salts only come from our own ciphertexts.
const DERIVED_KEY_CACHE_LIMIT = 32;
const derivedKeyCache = new Map<string, Buffer>();

function deriveKey(encryptKey: string, salt: Buffer) {
    const cacheId = createHash("sha256")
        .update(salt)
        .update(encryptKey)
        .digest("hex");

    const cached = derivedKeyCache.get(cacheId);
    if (cached) {
        return cached;
    }

    const key = scryptSync(encryptKey, salt, KEY_LENGTH);
    if (derivedKeyCache.size >= DERIVED_KEY_CACHE_LIMIT) {
        // Evict the oldest entry (Map preserves insertion order).
        const oldest = derivedKeyCache.keys().next().value;
        if (oldest !== undefined) {
            derivedKeyCache.delete(oldest);
        }
    }
    derivedKeyCache.set(cacheId, key);
    return key;
}

/**
 * Encrypt data with AES-256-GCM. The key is derived from `encryptKey` via
 * scrypt with a random per-ciphertext salt. Output is always in the "v2:"
 * versioned format.
 */
export function encryption(data: Buffer, encryptKey: string) {
    const salt = randomBytes(V2_SALT_LENGTH);
    const key = deriveKey(encryptKey, salt);
    const iv = randomBytes(V2_IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return (
        V2_PREFIX +
        Buffer.concat([salt, iv, authTag, encryptedData]).toString("hex")
    );
}

function decryptV2(encryptedHex: string, encryptKey: string) {
    const encryptedBuffer = Buffer.from(
        encryptedHex.slice(V2_PREFIX.length),
        "hex"
    );

    const headerLength = V2_SALT_LENGTH + V2_IV_LENGTH + AUTH_TAG_LENGTH;
    if (encryptedBuffer.length < headerLength) {
        throw new Error("Invalid v2 ciphertext: payload too short");
    }

    const salt = encryptedBuffer.subarray(0, V2_SALT_LENGTH);
    const iv = encryptedBuffer.subarray(
        V2_SALT_LENGTH,
        V2_SALT_LENGTH + V2_IV_LENGTH
    );
    const authTag = encryptedBuffer.subarray(
        V2_SALT_LENGTH + V2_IV_LENGTH,
        headerLength
    );
    const data = encryptedBuffer.subarray(headerLength);

    const key = deriveKey(encryptKey, salt);
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
}

function decryptLegacy(encryptedHex: string, encryptKey: string) {
    const encryptedBuffer = Buffer.from(encryptedHex, "hex");
    const key = deriveLegacyKey(encryptKey);

    const authTag = encryptedBuffer.subarray(-AUTH_TAG_LENGTH);
    const iv = encryptedBuffer.subarray(
        -(LEGACY_IV_LENGTH + AUTH_TAG_LENGTH),
        -AUTH_TAG_LENGTH
    );
    const data = encryptedBuffer.subarray(
        0,
        -(LEGACY_IV_LENGTH + AUTH_TAG_LENGTH)
    );

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Decrypt data produced by `encryption`. Supports both the current "v2:"
 * versioned format (scrypt KDF) and the legacy unversioned format so that
 * previously stored ciphertexts (e.g. JWKS rows) still decrypt.
 */
export function decryption(encryptedHex: string, encryptKey: string) {
    if (encryptedHex.startsWith(V2_PREFIX)) {
        return decryptV2(encryptedHex, encryptKey);
    }

    return decryptLegacy(encryptedHex, encryptKey);
}

export async function commitCSRFToken(headers: Headers) {
    const session = await getSession(headers.get("Cookie"));
    const user = await auth.api.getSession({ headers });
    if (!user) {
        throw new Response("Unauthorized", { status: 401 });
    }

    const csrfToken = generateCSRFToken();
    session.set("csrfToken", hashCSRFToken(csrfToken, user.user.id));
    return {
        csrfToken,
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    };
}

export async function validateCSRFToken(request: Request, csrfToken?: string) {
    const session = await getSession(request.headers.get("Cookie"));
    const user = await auth.api.getSession({ headers: request.headers });
    if (!user) {
        throw new Response("Unauthorized", { status: 401 });
    }

    const storedToken = session.get("csrfToken");

    // CSRF tokens are single-use: rotate (clear) the stored token on every
    // validation attempt, but keep the rest of the session intact so other
    // tabs and the user's auth state are unaffected.
    session.unset("csrfToken");
    const sessionCookie = await commitSession(session);

    const isValid =
        typeof storedToken === "string" &&
        typeof csrfToken === "string" &&
        safeCompare(storedToken, hashCSRFToken(csrfToken, user.user.id));

    if (!isValid) {
        logger.warn("CSRF token validation failed", { userId: user.user.id });
        throw new Response(
            "Invalid CSRF token. Please refresh the page and try again.",
            {
                status: 403,
                headers: {
                    "Set-Cookie": sessionCookie,
                },
            }
        );
    }

    return { headers: { "Set-Cookie": sessionCookie } };
}

export async function calculateWebhookSignature(data: string) {
    const privateJwk = await getPrivateJwkForSigning();
    const secret = await importJWK(privateJwk, "RS512");
    if (!(secret instanceof CryptoKey)) {
        throw new Error("Failed to import JWK as CryptoKey");
    }

    const dataBuffer = Buffer.from(data);
    const signatureBuffer = await crypto.subtle.sign(
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-512",
        },
        secret,
        dataBuffer
    );
    return {
        signature: Buffer.from(signatureBuffer).toString("base64url"),
        kid: privateJwk.kid!,
    };
}
