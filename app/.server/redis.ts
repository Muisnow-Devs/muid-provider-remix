import IORedis from "ioredis";
import logger from "./logger";

const client = new IORedis(
    Number(process.env.REDIS_PORT) || 6379,
    process.env.REDIS_HOST || "localhost",
    {
        username: process.env.REDIS_USER || undefined,
        password: process.env.REDIS_PASS || undefined,
        db: Number(process.env.REDIS_DB) || 0,
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
    },
);

export async function connectRedis() {
    logger.info("[Redis] Connecting to Redis...");
    if (client.status === "connecting" || client.status === "ready") {
        logger.info("[Redis] Already connected or connecting.");
        return;
    }

    await client.connect();
    logger.info("[Redis] Connected to Redis.");
}

export default client;
