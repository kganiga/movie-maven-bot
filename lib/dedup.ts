import { getRedis, isRedisConfigured } from "./storage";

// Fallback in-memory map with timestamps for local development
const memoryUpdates = new Map<number, number>();

export class DedupService {
  /**
   * Attempts to acquire an atomic distributed lock for the given Telegram update_id.
   * Returns true if this update is NEW and acquired the lock.
   * Returns false if this update is a DUPLICATE (already processing or processed).
   */
  static async isNewUpdate(updateId: number): Promise<boolean> {
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        const key = `telegram:update:${updateId}`;
        // SET key 1 EX 300 NX -> only sets if not exists, expires in 5 minutes (300s)
        const result = await redis.set(key, "1", {
          nx: true,
          ex: 300,
        });

        // If result is "OK", this is a new update.
        // If result is null, key already existed -> duplicate!
        return result === "OK";
      } catch (error) {
        console.error("Redis dedup check error, falling back to memory:", error);
      }
    }

    // Memory fallback for local development
    const now = Date.now();
    // Clean up entries older than 5 minutes
    memoryUpdates.forEach((ts, id) => {
      if (now - ts > 300000) {
        memoryUpdates.delete(id);
      }
    });

    if (memoryUpdates.has(updateId)) {
      return false;
    }

    memoryUpdates.set(updateId, now);
    return true;
  }
}
