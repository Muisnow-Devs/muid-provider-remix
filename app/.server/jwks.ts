import prisma from "./prisma";
import { logger } from "./logger";
import { generateKeyPair, exportJWK, JWK } from "jose";

interface KeyStore {
    keys: JWK[];
}

/**
 * Generate a new RSA key pair for JWT signing using jose
 */
async function generateRSAKeyPair(): Promise<{ publicJwk: JWK; privateJwk: JWK; kid: string }> {
    // Generate key pair using jose
    const { publicKey, privateKey } = await generateKeyPair("RS512", {
        extractable: true,
    });

    // Generate kid
    const kid = crypto.randomUUID();

    // Export to JWK format
    const publicJwkExport = await exportJWK(publicKey);
    const privateJwkExport = await exportJWK(privateKey);

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
                const privateJwk = JSON.parse(key.privateKey) as JWK;
                
                return {
                    keys: [privateJwk],
                };
            } catch (error) {
                logger.error("Failed to parse stored keys, generating new keys", { error });
                // Fall through to generate new keys
            }
        }

        // Generate new keys if none exist or conversion failed
        logger.info("Generating new JWKS...");
        const { publicJwk, privateJwk, kid } = await generateRSAKeyPair();

        // Save to database: both as JWK JSON strings
        await prisma.jwks.create({
            data: {
                id: kid,
                publicKey: JSON.stringify(publicJwk),
                privateKey: JSON.stringify(privateJwk),
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
 * Get JWKS in the format expected by oidc-provider
 */
export async function getJwks(): Promise<{ keys: JWK[] }> {
    const keystore = await loadJwks();
    return keystore;
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
            privateKey: JSON.stringify(privateJwk),
            createdAt: new Date(),
        },
    });

    logger.info("JWKS rotated successfully", { kid });
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
