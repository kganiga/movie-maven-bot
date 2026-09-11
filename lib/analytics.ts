import { getRedis, isRedisConfigured } from "./storage";
import { getTodayDateString } from "./quota";

export interface BotStats {
  totalUsers: number;
  activeToday: number;
  searchesToday: number;
  totalSearches: number;
}

export class AnalyticsService {
  /**
   * Tracks user interaction (all-time unique user and daily active user).
   */
  static async trackUser(
    userIdInput: string | number,
    username?: string,
    firstName?: string
  ): Promise<void> {
    const userId = String(userIdInput);
    const dateStr = getTodayDateString();
    const redis = getRedis();

    if (!redis || !isRedisConfigured()) return;

    try {
      const p = redis.pipeline();
      // Track unique users all-time in a Redis Set
      p.sadd("bot:users:all", userId);

      // Track daily active users in a 48h expiring Set
      p.sadd(`bot:users:daily:${dateStr}`, userId);
      p.expire(`bot:users:daily:${dateStr}`, 172800);

      // Store/update user profile info
      p.hset(`bot:user:${userId}`, {
        id: userId,
        username: username || "",
        firstName: firstName || "",
        lastSeen: new Date().toISOString(),
      });

      await p.exec();
    } catch (err) {
      console.error("Analytics trackUser error:", err);
    }
  }

  /**
   * Tracks an executed search query.
   */
  static async trackSearch(): Promise<void> {
    const dateStr = getTodayDateString();
    const redis = getRedis();

    if (!redis || !isRedisConfigured()) return;

    try {
      const p = redis.pipeline();
      p.incr(`bot:searches:daily:${dateStr}`);
      p.expire(`bot:searches:daily:${dateStr}`, 172800);
      p.incr("bot:searches:total");
      await p.exec();
    } catch (err) {
      console.error("Analytics trackSearch error:", err);
    }
  }

  /**
   * Retrieves bot member and usage statistics.
   */
  static async getStats(): Promise<BotStats> {
    const dateStr = getTodayDateString();
    const redis = getRedis();

    if (!redis || !isRedisConfigured()) {
      return { totalUsers: 0, activeToday: 0, searchesToday: 0, totalSearches: 0 };
    }

    try {
      const [totalUsers, activeToday, searchesToday, totalSearches] = await Promise.all([
        redis.scard("bot:users:all"),
        redis.scard(`bot:users:daily:${dateStr}`),
        redis.get<number>(`bot:searches:daily:${dateStr}`),
        redis.get<number>("bot:searches:total"),
      ]);

      return {
        totalUsers: Number(totalUsers || 0),
        activeToday: Number(activeToday || 0),
        searchesToday: Number(searchesToday || 0),
        totalSearches: Number(totalSearches || 0),
      };
    } catch (err) {
      console.error("Analytics getStats error:", err);
      return { totalUsers: 0, activeToday: 0, searchesToday: 0, totalSearches: 0 };
    }
  }
}
