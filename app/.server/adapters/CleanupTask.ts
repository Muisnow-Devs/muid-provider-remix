import prisma from "../prisma";
import logger from "../logger";

/**
 * Clean up expired OIDC models from database
 * @deprecated Use OidcCleanupTask with BullMQ instead
 * This function is kept for backward compatibility and manual cleanup
 */
export async function cleanupExpiredOidcModels(): Promise<number> {
    try {
        const result = await prisma.oidcModel.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired OIDC models`);
        }

        return result.count;
    } catch (error) {
        logger.error("Error cleaning up expired OIDC models:", { error });
        throw error;
    }
}

/**
 * Get statistics about stored OIDC models
 */
export async function getOidcModelStats() {
    const [total, expired, consumed, byType] = await Promise.all([
        // Total count
        prisma.oidcModel.count(),

        // Expired count
        prisma.oidcModel.count({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        }),

        // Consumed count
        prisma.oidcModel.count({
            where: {
                consumedAt: {
                    not: null,
                },
            },
        }),

        // Count by type
        prisma.oidcModel.groupBy({
            by: ['type'],
            _count: true,
        }),
    ]);

    return {
        total,
        expired,
        consumed,
        active: total - expired,
        byType: byType.reduce((acc, item) => {
            acc[item.type] = item._count;
            return acc;
        }, {} as Record<string, number>),
    };
}
