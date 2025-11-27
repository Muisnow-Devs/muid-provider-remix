import prisma from "./prisma";
import { logger } from "./logger";
import { generateKeyPair, exportJWK, JWK } from "jose";
import { decryption, encryption } from "./security";

// Validate JWKS_ENC_KEY is set
if (!process.env.JWKS_ENC_KEY) {
    throw new Error("JWKS_ENC_KEY must be set and cannot be a default value");
}

const encKey = process.env.JWKS_ENC_KEY;

interface KeyStore {
    keys: JWK[];
}

/**
 * Generate a new RSA key pair for JWT signing using jose
 */
async function generateRSAKeyPair(): Promise<{
    publicJwk: JWK;
    privateJwk: JWK;
    kid: string;
}> {
    // Generate key pair using jose
    const { publicKey, privateKey } = await generateKeyPair("RS512", {
        extractable: true,
    });

    // Generate kid
    const kid = crypto.randomUUID();

    // Export to JWK format
    const publicJwkExport = await exportJWK(publicKey);
    const privateJwkExport = await exportJWK(privateKey);

    publicJwkExport.kid = kid;
    privateJwkExport.kid = kid;

    return { publicJwk: publicJwkExport, privateJwk: privateJwkExport, kid };
}

/**
 * Load or generate JWKS from database
 */
export async function loadJwks(): Promise<KeyStore> {
    try {
        // Try to load existing keys from database
        const existingKeys = await prisma.jwks.findMany({
            orderBy: {
                createdAt: "desc",
            },
            take: 1,
        });

        if (existingKeys.length > 0) {
            const key = existingKeys[0];
            logger.info("Loaded existing JWKS from database", { kid: key.id });

            try {
                // Parse private key (stored as JWK JSON string) - contains all components
                const privateJwk = JSON.parse(
                    decryption(key.privateKey, encKey).toString("utf-8")
                ) as JWK;

                return {
                    keys: [privateJwk],
                };
            } catch (error) {
                logger.error(
                    "Failed to parse stored keys, generating new keys",
                    { error }
                );
                // Fall through to generate new keys
            }
        }

        // Generate new keys if none exist or conversion failed
        logger.info("Generating new JWKS...");
        const { publicJwk, privateJwk, kid } = await generateRSAKeyPair();

        await prisma.jwks.create({
            data: {
                id: kid,
                publicKey: JSON.stringify(publicJwk),
                privateKey: encryption(
                    Buffer.from(JSON.stringify(privateJwk)),
                    encKey
                ),
                createdAt: new Date(),
            },
        });

        logger.info("Generated and saved new JWKS", { kid });

        return {
            keys: [privateJwk],
        };
    } catch (error) {
        logger.error("Failed to load or generate JWKS", { error });
        throw error;
    }
}

/**
 * Sanitize JWK to remove private parameters
 */
function sanitizeJwk(jwk: JWK): JWK {
    const { d, p, q, dp, dq, qi, ...publicJwk } = jwk;
    return publicJwk;
}

/**
 * Get public JWKS for discovery endpoints (only public key parameters)
 */
let publicJwksCache: { keys: JWK[] } | null = null;

export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
    if (publicJwksCache) {
        return publicJwksCache;
    }

    try {
        const existingKeys = await prisma.jwks.findMany({
            orderBy: {
                createdAt: "desc",
            },
            take: 1,
        });

        if (existingKeys.length > 0) {
            const key = existingKeys[0];
            const publicJwk = JSON.parse(key.publicKey) as JWK;

            publicJwksCache = {
                keys: [sanitizeJwk(publicJwk)],
            };
            return publicJwksCache;
        }

        // If no keys exist, generate new ones
        logger.info("No existing keys found, generating new JWKS...");
        const { publicJwk, privateJwk, kid } = await generateRSAKeyPair();

        await prisma.jwks.create({
            data: {
                id: kid,
                publicKey: JSON.stringify(publicJwk),
                privateKey: encryption(
                    Buffer.from(JSON.stringify(privateJwk)),
                    encKey
                ),
                createdAt: new Date(),
            },
        });

        logger.info("Generated and saved new JWKS", { kid });

        publicJwksCache = {
            keys: [sanitizeJwk(publicJwk)],
        };
        return publicJwksCache;
    } catch (error) {
        logger.error("Failed to get public JWKS", { error });
        throw error;
    }
}

/**
 * Get private JWK for internal signing operations only
 */
export async function getPrivateJwkForSigning(): Promise<JWK> {
    try {
        const keyRow = await prisma.jwks.findFirst({
            orderBy: { createdAt: "desc" },
        });

        if (!keyRow) {
            await rotateJwks();
            return getPrivateJwkForSigning();
        }

        try {
            const privateJwk = JSON.parse(
                decryption(keyRow.privateKey, encKey).toString("utf-8")
            ) as JWK;
            return privateJwk;
        } catch (error) {
            logger.error(
                "Failed to parse private JWK from database, regenerating...",
                { error }
            );
            await rotateJwks();
            return getPrivateJwkForSigning();
        }
    } catch (error) {
        logger.error("Failed to get private JWK for signing", { error });
        throw error;
    }
}

/**
 * Rotate keys (generate new keys while keeping old ones for verification)
 */
export async function rotateJwks(): Promise<void> {
    logger.info("Rotating JWKS...");

    const { publicJwk, privateJwk, kid } = await generateRSAKeyPair();

    await prisma.jwks.create({
        data: {
            id: kid,
            publicKey: JSON.stringify(publicJwk),
            privateKey: encryption(
                Buffer.from(JSON.stringify(privateJwk)),
                encKey
            ),
            createdAt: new Date(),
        },
    });

    logger.info("JWKS rotated successfully", { kid });
    publicJwksCache = null;
}

/**
 * Clean up old keys (keep only the latest N keys)
 */
export async function cleanupOldJwks(keepCount: number = 2): Promise<void> {
    const allKeys = await prisma.jwks.findMany({
        orderBy: {
            createdAt: "desc",
        },
    });

    if (allKeys.length <= keepCount) {
        logger.info("No old JWKS to clean up", { total: allKeys.length });
        return;
    }

    const keysToDelete = allKeys.slice(keepCount);
    const deleteIds = keysToDelete.map((k) => k.id);

    await prisma.jwks.deleteMany({
        where: {
            id: {
                in: deleteIds,
            },
        },
    });

    logger.info("Cleaned up old JWKS", {
        deleted: deleteIds.length,
        kept: keepCount,
    });
}
