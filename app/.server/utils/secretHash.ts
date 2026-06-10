import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Scrypt-based secret hashing for OAuth client secrets.
 *
 * Stored format: `scrypt:<saltHex>:<hashHex>`
 *
 * Uses node:crypto only (no external dependencies).
 */

const SCRYPT_PREFIX = "scrypt";
const SALT_LENGTH = 16; // bytes
const KEY_LENGTH = 64; // bytes

function scryptAsync(
    secret: string,
    salt: Buffer,
    keyLength: number
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(secret, salt, keyLength, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

/**
 * Hash a secret using scrypt with a random salt.
 * Returns a string in the format `scrypt:<saltHex>:<hashHex>`.
 */
export async function hashSecret(secret: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await scryptAsync(secret, salt, KEY_LENGTH);
    return `${SCRYPT_PREFIX}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Check whether a stored value is already in the hashed format.
 */
export function isHashedSecret(value: string): boolean {
    return value.startsWith(`${SCRYPT_PREFIX}:`);
}

/**
 * Timing-safe verification of a presented secret against a stored
 * `scrypt:<saltHex>:<hashHex>` value.
 *
 * Returns `false` (never throws) on malformed or missing input.
 */
export async function verifySecretHash(
    stored: unknown,
    presented: unknown
): Promise<boolean> {
    try {
        if (typeof stored !== "string" || typeof presented !== "string") {
            return false;
        }

        const [prefix, saltHex, hashHex] = stored.split(":");
        if (prefix !== SCRYPT_PREFIX || !saltHex || !hashHex) {
            return false;
        }
        if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
            return false;
        }

        const salt = Buffer.from(saltHex, "hex");
        const expected = Buffer.from(hashHex, "hex");
        const actual = await scryptAsync(presented, salt, expected.length);

        if (actual.length !== expected.length) {
            return false;
        }

        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}
