/**
 * One-time migration: encrypt existing plaintext OAuth tokens on the
 * `account` table in place.
 *
 * Plain Node.js, no npm/tsx required:
 *   node scripts/migrate-encrypt-account-tokens.mjs
 *
 * DATABASE_URL and TOKEN_ENC_KEY must be set (in the environment or .env).
 *
 * - Skips NULL values and values already prefixed with `enc:v1:`.
 * - Idempotent: safe to re-run.
 *
 * IMPORTANT: this script talks to the database with raw SQL on purpose.
 * Going through the app's extended Prisma client would re-encrypt values
 * through the query extension and double-encrypt them. The crypto below
 * MUST stay in sync with app/.server/utils/tokenCrypto.ts.
 */
import "dotenv/config";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import mariadb from "mariadb";

const ENC_PREFIX = "enc:v1:";
const ACCOUNT_TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"];

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const KDF_SALT = "muid:account-token-crypto:v1";

function deriveKey(secret) {
    return scryptSync(secret, KDF_SALT, KEY_LENGTH);
}

function isEncryptedToken(value) {
    return value.startsWith(ENC_PREFIX);
}

function encryptToken(key, value) {
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

function connectionConfigFromUrl(databaseUrl) {
    const url = new URL(databaseUrl);
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
    };
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL must be set in environment variables.");
        process.exit(1);
    }
    if (!process.env.TOKEN_ENC_KEY) {
        console.error(
            "TOKEN_ENC_KEY is not set. Refusing to run: nothing would be encrypted."
        );
        process.exit(1);
    }

    const key = deriveKey(process.env.TOKEN_ENC_KEY);
    const connection = await mariadb.createConnection(
        connectionConfigFromUrl(process.env.DATABASE_URL)
    );

    let scannedRows = 0;
    let updatedRows = 0;
    let encryptedFields = 0;
    let alreadyEncryptedFields = 0;

    try {
        const accounts = await connection.query(
            "SELECT `id`, `accessToken`, `refreshToken`, `idToken` FROM `account`"
        );
        scannedRows += accounts.length;

        for (const account of accounts) {
            const assignments = [];
            const values = [];

            for (const field of ACCOUNT_TOKEN_FIELDS) {
                const value = account[field];
                if (value === null || value === undefined) continue;
                if (isEncryptedToken(value)) {
                    alreadyEncryptedFields++;
                    continue;
                }
                assignments.push(`\`${field}\` = ?`);
                values.push(encryptToken(key, value));
                encryptedFields++;
            }

            if (assignments.length === 0) continue;

            await connection.query(
                `UPDATE \`account\` SET ${assignments.join(", ")} WHERE \`id\` = ?`,
                [...values, account.id]
            );
            updatedRows++;
        }
    } finally {
        await connection.end();
    }

    console.log("Account token encryption migration complete.");
    console.log(`  Rows scanned:              ${scannedRows}`);
    console.log(`  Rows updated:              ${updatedRows}`);
    console.log(`  Fields encrypted:          ${encryptedFields}`);
    console.log(`  Fields already encrypted:  ${alreadyEncryptedFields}`);
}

main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
});
