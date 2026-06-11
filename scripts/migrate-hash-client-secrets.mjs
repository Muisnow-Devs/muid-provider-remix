/**
 * One-time migration: hash existing plaintext OAuth client secrets.
 *
 * Plain Node.js, no npm/tsx required:
 *   node scripts/migrate-hash-client-secrets.mjs
 *
 * DATABASE_URL must be set (in the environment or .env); REDIS_* variables
 * are used to invalidate the client cache, same as the app.
 *
 * Loads every `oauthApplication` row, skips secrets that are empty or already
 * in the `scrypt:<saltHex>:<hashHex>` format, and replaces the remaining
 * plaintext values with their scrypt hash in place. The hash format MUST
 * stay in sync with app/.server/utils/secretHash.ts.
 *
 * WARNING: This is a one-way migration. After it runs, plaintext client
 * secrets are irrecoverable (standard IdP behavior). Relying parties keep
 * working unchanged because verification compares against the hash.
 */
import "dotenv/config";
import { randomBytes, scrypt } from "node:crypto";
import mariadb from "mariadb";
import IORedis from "ioredis";

const SCRYPT_PREFIX = "scrypt";
const SALT_LENGTH = 16; // bytes
const KEY_LENGTH = 64; // bytes

function scryptAsync(secret, salt, keyLength) {
    return new Promise((resolve, reject) => {
        scrypt(secret, salt, keyLength, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

async function hashSecret(secret) {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await scryptAsync(secret, salt, KEY_LENGTH);
    return `${SCRYPT_PREFIX}:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

function isHashedSecret(value) {
    return value.startsWith(`${SCRYPT_PREFIX}:`);
}

/**
 * Remove any plaintext `client_secret` leaked into the stored metadata JSON
 * (older dynamic registrations persisted the full payload, secret included).
 * Returns the scrubbed metadata string, or `null` if no change is needed.
 */
function scrubMetadata(metadata) {
    if (!metadata) return null;
    try {
        const parsed = JSON.parse(metadata);
        if (
            parsed === null ||
            typeof parsed !== "object" ||
            !("client_secret" in parsed)
        ) {
            return null;
        }
        delete parsed.client_secret;
        return JSON.stringify(parsed);
    } catch {
        return null;
    }
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

// Same connection settings as app/.server/redis.ts, but with default retry
// limits so the script fails instead of hanging when Redis is unreachable.
function createRedisClient() {
    return new IORedis(
        Number(process.env.REDIS_PORT) || 6379,
        process.env.REDIS_HOST || "localhost",
        {
            username: process.env.REDIS_USER || undefined,
            password: process.env.REDIS_PASS || undefined,
            db: Number(process.env.REDIS_DB) || 0,
        }
    );
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL must be set in environment variables.");
        process.exit(1);
    }

    const connection = await mariadb.createConnection(
        connectionConfigFromUrl(process.env.DATABASE_URL)
    );
    const redis = createRedisClient();

    let hashed = 0;
    let skippedEmpty = 0;
    let skippedAlreadyHashed = 0;
    let metadataScrubbed = 0;

    try {
        const applications = await connection.query(
            "SELECT `id`, `clientId`, `clientSecret`, `metadata` FROM `oauthApplication`"
        );

        for (const app of applications) {
            const assignments = [];
            const values = [];
            let hashedSecret = false;
            let scrubbedMetadata = false;

            if (!app.clientSecret) {
                skippedEmpty += 1;
            } else if (isHashedSecret(app.clientSecret)) {
                skippedAlreadyHashed += 1;
            } else {
                assignments.push("`clientSecret` = ?");
                values.push(await hashSecret(app.clientSecret));
                hashed += 1;
                hashedSecret = true;
            }

            const scrubbed = scrubMetadata(app.metadata);
            if (scrubbed !== null) {
                assignments.push("`metadata` = ?");
                values.push(scrubbed);
                metadataScrubbed += 1;
                scrubbedMetadata = true;
            }

            if (assignments.length === 0) continue;

            await connection.query(
                `UPDATE \`oauthApplication\` SET ${assignments.join(", ")} WHERE \`id\` = ?`,
                [...values, app.id]
            );
            if (app.clientId) {
                // Same cache key as app/.server/cache/clients.ts
                await redis.del(`muid:client:${app.clientId}`);
            }
            console.log("Migrated client secret storage", {
                clientId: app.clientId,
                hashedSecret,
                scrubbedMetadata,
            });
        }

        console.log("Client secret hashing migration complete", {
            total: applications.length,
            hashed,
            skippedEmpty,
            skippedAlreadyHashed,
            metadataScrubbed,
        });
    } finally {
        await connection.end();
        redis.disconnect();
    }
}

main().catch((error) => {
    console.error("Client secret hashing migration failed:", error);
    process.exit(1);
});
