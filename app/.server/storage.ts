import type { SecondaryStorage } from "better-auth";
import redis from "./redis";

/**
 * Key prefix for all better-auth entries stored in Redis, so they can be
 * distinguished from (and never collide with) other application keys.
 */
const KEY_PREFIX = "ba:";

/**
 * better-auth `SecondaryStorage` backed by the shared ioredis client.
 *
 * Providing this to `betterAuth()` makes rate-limit counters default to
 * `"secondary-storage"` and enables Redis-backed session caching.
 * TTLs are expressed in seconds and map directly to Redis `EX`.
 */
export const secondaryStorage: SecondaryStorage = {
    async get(key) {
        return redis.get(KEY_PREFIX + key);
    },
    async set(key, value, ttl) {
        if (typeof ttl === "number" && ttl > 0) {
            await redis.set(KEY_PREFIX + key, value, "EX", Math.ceil(ttl));
        } else {
            await redis.set(KEY_PREFIX + key, value);
        }
    },
    async delete(key) {
        await redis.del(KEY_PREFIX + key);
    },
};
