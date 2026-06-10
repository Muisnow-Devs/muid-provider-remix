/**
 * One-time migration: hash existing plaintext OAuth client secrets.
 *
 * Usage:
 *     npx tsx scripts/migrate-hash-client-secrets.ts
 *
 * Loads every `oauthApplication` row, skips secrets that are empty or already
 * in the `scrypt:<saltHex>:<hashHex>` format, and replaces the remaining
 * plaintext values with their scrypt hash in place.
 *
 * WARNING: This is a one-way migration. After it runs, plaintext client
 * secrets are irrecoverable (standard IdP behavior). Relying parties keep
 * working unchanged because verification compares against the hash.
 */
import "dotenv/config";

import prisma from "../app/.server/prisma";
import redis from "../app/.server/redis";
import { invalidateClientCache } from "../app/.server/cache/clients";
import { logger } from "../app/.server/logger";
import { hashSecret, isHashedSecret } from "../app/.server/utils/secretHash";

/**
 * Remove any plaintext `client_secret` leaked into the stored metadata JSON
 * (older dynamic registrations persisted the full payload, secret included).
 * Returns the scrubbed metadata string, or `null` if no change is needed.
 */
function scrubMetadata(metadata: string | null): string | null {
    if (!metadata) return null;
    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
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

async function main() {
    const applications = await prisma.oauthApplication.findMany({
        select: {
            id: true,
            clientId: true,
            clientSecret: true,
            metadata: true,
        },
    });

    let hashed = 0;
    let skippedEmpty = 0;
    let skippedAlreadyHashed = 0;
    let metadataScrubbed = 0;

    for (const app of applications) {
        const data: { clientSecret?: string; metadata?: string } = {};

        if (!app.clientSecret) {
            skippedEmpty += 1;
        } else if (isHashedSecret(app.clientSecret)) {
            skippedAlreadyHashed += 1;
        } else {
            data.clientSecret = await hashSecret(app.clientSecret);
            hashed += 1;
        }

        const scrubbed = scrubMetadata(app.metadata);
        if (scrubbed !== null) {
            data.metadata = scrubbed;
            metadataScrubbed += 1;
        }

        if (Object.keys(data).length === 0) continue;

        await prisma.oauthApplication.update({
            where: { id: app.id },
            data,
        });
        if (app.clientId) {
            await invalidateClientCache(app.clientId);
        }
        logger.info("Migrated client secret storage", {
            clientId: app.clientId,
            hashedSecret: data.clientSecret !== undefined,
            scrubbedMetadata: data.metadata !== undefined,
        });
    }

    logger.info("Client secret hashing migration complete", {
        total: applications.length,
        hashed,
        skippedEmpty,
        skippedAlreadyHashed,
        metadataScrubbed,
    });
}

main()
    .catch((error) => {
        logger.error("Client secret hashing migration failed", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        redis.disconnect();
    });
