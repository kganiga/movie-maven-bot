import { getRedis, isRedisConfigured } from "./storage";

const memorySearchSessions = new Map<string, { query: string; expiresAt: number }>();

export class SearchSessionService {
  /**
   * Saves the active search query for a user with a 2-hour TTL.
   */
  static async saveUserSearch(userIdInput: string | number, query: string): Promise<void> {
    const userId = String(userIdInput);
    const key = `session:user:${userId}:last_search`;
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        await redis.set(key, query, { ex: 7200 }); // 2 hours
        return;
      } catch (error) {
        console.error("Redis session save error:", error);
      }
    }

    memorySearchSessions.set(userId, {
      query,
      expiresAt: Date.now() + 7200000,
    });
  }

  /**
   * Retrieves the active search query for a user.
   */
  static async getUserSearch(userIdInput: string | number): Promise<string | null> {
    const userId = String(userIdInput);
    const key = `session:user:${userId}:last_search`;
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        const query = await redis.get<string>(key);
        return query || null;
      } catch (error) {
        console.error("Redis session get error:", error);
      }
    }

    const session = memorySearchSessions.get(userId);
    if (session && session.expiresAt > Date.now()) {
      return session.query;
    }

    return null;
  }
}
