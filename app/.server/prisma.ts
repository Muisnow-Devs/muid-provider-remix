import { PrismaClient } from "./generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
    ACCOUNT_TOKEN_FIELDS,
    decryptToken,
    encryptToken,
} from "./utils/tokenCrypto";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in environment variables");
}

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const baseClient = new PrismaClient({ adapter });

/**
 * Account OAuth token fields encrypted at rest (see utils/tokenCrypto.ts).
 * better-auth never filters WHERE clauses on these fields, so encrypting
 * write payloads and decrypting returned rows is sufficient.
 */
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

/**
 * Encrypt token fields in a write payload in place. Handles a single data
 * object, an array of objects (createMany) and the update `{ set: ... }`
 * field shape.
 */
function encryptWritePayload(data: unknown): void {
    if (Array.isArray(data)) {
        for (const item of data) encryptWritePayload(item);
        return;
    }
    if (!isRecord(data)) return;

    for (const field of ACCOUNT_TOKEN_FIELDS) {
        const value = data[field];
        if (typeof value === "string") {
            data[field] = encryptToken(value);
        } else if (isRecord(value) && typeof value.set === "string") {
            value.set = encryptToken(value.set);
        }
    }
}

/**
 * Decrypt token fields on rows returned by any account operation. Handles a
 * single row or an array of rows; leaves non-row results (counts, etc.)
 * untouched.
 */
function decryptResult<T>(result: T): T {
    if (Array.isArray(result)) {
        for (const row of result) decryptResult(row);
        return result;
    }
    if (!isRecord(result)) return result;

    const row: UnknownRecord = result;
    for (const field of ACCOUNT_TOKEN_FIELDS) {
        const value = row[field];
        if (typeof value === "string") {
            row[field] = decryptToken(value);
        }
    }
    return result;
}

const prisma = baseClient.$extends({
    query: {
        account: {
            async $allOperations({ args, query }) {
                if (isRecord(args)) {
                    // create / update / updateMany / createMany
                    if ("data" in args) encryptWritePayload(args.data);
                    // upsert
                    if ("create" in args) encryptWritePayload(args.create);
                    if ("update" in args) encryptWritePayload(args.update);
                }

                const result = await query(args);
                return decryptResult(result);
            },
        },
    },
});

export default prisma;
