/**
 * One-time migration: encrypt existing plaintext OAuth tokens on the
 * `account` table in place.
 *
 * Usage:
 *   TOKEN_ENC_KEY must be set (in the environment or .env), then:
 *   npx tsx scripts/migrate-encrypt-account-tokens.ts
 *
 * - Skips NULL values and values already prefixed with `enc:v1:`.
 * - Idempotent: safe to re-run.
 *
 * IMPORTANT: this script uses a RAW (un-extended) PrismaClient on purpose.
 * Going through `app/.server/prisma.ts` would re-encrypt values through the
 * query extension and double-encrypt them.
 */
import "dotenv/config";
import { PrismaClient } from "../app/.server/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
    ACCOUNT_TOKEN_FIELDS,
    type AccountTokenField,
    encryptToken,
    isEncryptedToken,
    isTokenEncryptionEnabled,
} from "../app/.server/utils/tokenCrypto";

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL must be set in environment variables.");
        process.exit(1);
    }
    if (!isTokenEncryptionEnabled()) {
        console.error(
            "TOKEN_ENC_KEY is not set. Refusing to run: nothing would be encrypted.",
        );
        process.exit(1);
    }

    const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
    const prisma = new PrismaClient({ adapter });

    let scannedRows = 0;
    let updatedRows = 0;
    let encryptedFields = 0;
    let alreadyEncryptedFields = 0;

    try {
        const accounts = await prisma.account.findMany({
            select: {
                id: true,
                accessToken: true,
                refreshToken: true,
                idToken: true,
            },
        });
        scannedRows = accounts.length;

        for (const account of accounts) {
            const data: Partial<Record<AccountTokenField, string>> = {};

            for (const field of ACCOUNT_TOKEN_FIELDS) {
                const value = account[field];
                if (value === null) continue;
                if (isEncryptedToken(value)) {
                    alreadyEncryptedFields++;
                    continue;
                }
                data[field] = encryptToken(value);
                encryptedFields++;
            }

            if (Object.keys(data).length === 0) continue;

            await prisma.account.update({
                where: { id: account.id },
                data,
            });
            updatedRows++;
        }
    } finally {
        await prisma.$disconnect();
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
