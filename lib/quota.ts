import { getRedis, isRedisConfigured } from "./storage";
import { config } from "./config";

export interface UserQuotaStatus {
  userId: string;
  date: string;
  freeUsed: number;
  freeLimit: number;
  freeRemaining: number;
  paidUsedToday: number;
  paidAvailable: number;
  totalRemaining: number;
  canMakeRequest: boolean;
}

export interface ConsumeQuotaResult {
  allowed: boolean;
  type: "free" | "paid" | "exhausted";
  freeUsed: number;
  freeLimit: number;
  freeRemaining: number;
  paidUsedToday: number;
  paidAvailable: number;
  totalRemaining: number;
}

// In-memory fallback for local dev when Redis is not configured
const memoryDailyQuota = new Map<string, { freeUsed: number; paidUsedToday: number; [key: string]: number }>();
const memoryPaidQuota = new Map<string, { paidAvailable: number; paidUsedTotal: number }>();

/**
 * Returns today's date string (YYYY-MM-DD) in the configured timezone (Asia/Kolkata).
 */
export const getTodayDateString = (tz: string = config.quota.timezone): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (error) {
    console.error(`Invalid timezone "${tz}", falling back to Asia/Kolkata:`, error);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
};

const getDailyKey = (userId: string | number, dateStr: string): string => {
  return `quota:daily:${userId}:${dateStr}`;
};

const getPaidKey = (userId: string | number): string => {
  return `quota:paid:${userId}`;
};

const CONSUME_LUA_SCRIPT = `
local dailyKey = KEYS[1]
local paidKey = KEYS[2]
local freeLimit = tonumber(ARGV[1])
local botId = ARGV[2]
local dailyTTL = tonumber(ARGV[3])

local freeUsed = tonumber(redis.call('HGET', dailyKey, 'free_used') or '0')
local paidAvailable = tonumber(redis.call('HGET', paidKey, 'paid_available') or '0')
local paidUsedToday = tonumber(redis.call('HGET', dailyKey, 'paid_used_today') or '0')

if freeUsed < freeLimit then
  local newFreeUsed = redis.call('HINCRBY', dailyKey, 'free_used', 1)
  redis.call('HINCRBY', dailyKey, botId .. ':requests', 1)
  redis.call('EXPIRE', dailyKey, dailyTTL)
  return {1, newFreeUsed, paidUsedToday, paidAvailable}
elseif paidAvailable > 0 then
  local newPaidAvailable = redis.call('HINCRBY', paidKey, 'paid_available', -1)
  redis.call('HINCRBY', paidKey, 'paid_used_total', 1)
  local newPaidUsedToday = redis.call('HINCRBY', dailyKey, 'paid_used_today', 1)
  redis.call('HINCRBY', dailyKey, botId .. ':requests', 1)
  redis.call('EXPIRE', dailyKey, dailyTTL)
  return {2, freeUsed, newPaidUsedToday, newPaidAvailable}
else
  return {0, freeUsed, paidUsedToday, paidAvailable}
end
`;

export class QuotaService {
  /**
   * Retrieves the current quota status for a Telegram user without consuming a request.
   */
  static async getUserQuota(userIdInput: string | number): Promise<UserQuotaStatus> {
    const userId = String(userIdInput);
    const dateStr = getTodayDateString();
    const freeLimit = config.quota.freeRequestsPerDay;
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        const dailyKey = getDailyKey(userId, dateStr);
        const paidKey = getPaidKey(userId);

        const [dailyData, paidData] = await Promise.all([
          redis.hgetall<Record<string, string | number>>(dailyKey),
          redis.hgetall<Record<string, string | number>>(paidKey),
        ]);

        const freeUsed = Number(dailyData?.free_used || 0);
        const paidUsedToday = Number(dailyData?.paid_used_today || 0);
        const paidAvailable = Number(paidData?.paid_available || 0);

        const freeRemaining = Math.max(0, freeLimit - freeUsed);
        const totalRemaining = freeRemaining + paidAvailable;

        return {
          userId,
          date: dateStr,
          freeUsed,
          freeLimit,
          freeRemaining,
          paidUsedToday,
          paidAvailable,
          totalRemaining,
          canMakeRequest: totalRemaining > 0,
        };
      } catch (error) {
        console.error("Error fetching user quota from Redis, using fallback:", error);
      }
    }

    // In-memory fallback
    const dailyKey = getDailyKey(userId, dateStr);
    const paidKey = getPaidKey(userId);
    const dailyData = memoryDailyQuota.get(dailyKey) || { freeUsed: 0, paidUsedToday: 0 };
    const paidData = memoryPaidQuota.get(paidKey) || { paidAvailable: 0, paidUsedTotal: 0 };

    const freeRemaining = Math.max(0, freeLimit - dailyData.freeUsed);
    const totalRemaining = freeRemaining + paidData.paidAvailable;

    return {
      userId,
      date: dateStr,
      freeUsed: dailyData.freeUsed,
      freeLimit,
      freeRemaining,
      paidUsedToday: dailyData.paidUsedToday,
      paidAvailable: paidData.paidAvailable,
      totalRemaining,
      canMakeRequest: totalRemaining > 0,
    };
  }

  /**
   * Atomically checks and consumes 1 quota request.
   * Order of consumption:
   * 1. Free daily quota (up to FREE_REQUESTS_PER_DAY)
   * 2. Paid quota balance (if free quota exhausted)
   * If both are 0, returns allowed: false.
   */
  static async consumeQuota(
    userIdInput: string | number,
    botId: string = config.quota.botId
  ): Promise<ConsumeQuotaResult> {
    const userId = String(userIdInput);
    const dateStr = getTodayDateString();
    const freeLimit = config.quota.freeRequestsPerDay;
    const dailyTTL = 172800; // 48 hours in seconds
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        const dailyKey = getDailyKey(userId, dateStr);
        const paidKey = getPaidKey(userId);

        const result = (await redis.eval(
          CONSUME_LUA_SCRIPT,
          [dailyKey, paidKey],
          [freeLimit, botId, dailyTTL]
        )) as [number, number, number, number];

        const [status, freeUsed, paidUsedToday, paidAvailable] = result;
        const freeRemaining = Math.max(0, freeLimit - freeUsed);
        const totalRemaining = freeRemaining + paidAvailable;

        if (status === 1) {
          return {
            allowed: true,
            type: "free",
            freeUsed,
            freeLimit,
            freeRemaining,
            paidUsedToday,
            paidAvailable,
            totalRemaining,
          };
        } else if (status === 2) {
          return {
            allowed: true,
            type: "paid",
            freeUsed,
            freeLimit,
            freeRemaining,
            paidUsedToday,
            paidAvailable,
            totalRemaining,
          };
        } else {
          return {
            allowed: false,
            type: "exhausted",
            freeUsed,
            freeLimit,
            freeRemaining: 0,
            paidUsedToday,
            paidAvailable,
            totalRemaining: 0,
          };
        }
      } catch (error) {
        console.error("Error executing quota Lua script in Redis, using fallback:", error);
      }
    }

    // In-memory fallback
    const dailyKey = getDailyKey(userId, dateStr);
    const paidKey = getPaidKey(userId);

    let dailyData = memoryDailyQuota.get(dailyKey) || { freeUsed: 0, paidUsedToday: 0 };
    let paidData = memoryPaidQuota.get(paidKey) || { paidAvailable: 0, paidUsedTotal: 0 };

    if (dailyData.freeUsed < freeLimit) {
      dailyData.freeUsed += 1;
      dailyData[`${botId}:requests`] = (dailyData[`${botId}:requests`] || 0) + 1;
      memoryDailyQuota.set(dailyKey, dailyData);

      const freeRemaining = Math.max(0, freeLimit - dailyData.freeUsed);
      return {
        allowed: true,
        type: "free",
        freeUsed: dailyData.freeUsed,
        freeLimit,
        freeRemaining,
        paidUsedToday: dailyData.paidUsedToday,
        paidAvailable: paidData.paidAvailable,
        totalRemaining: freeRemaining + paidData.paidAvailable,
      };
    } else if (paidData.paidAvailable > 0) {
      paidData.paidAvailable -= 1;
      paidData.paidUsedTotal += 1;
      dailyData.paidUsedToday += 1;
      dailyData[`${botId}:requests`] = (dailyData[`${botId}:requests`] || 0) + 1;
      memoryDailyQuota.set(dailyKey, dailyData);
      memoryPaidQuota.set(paidKey, paidData);

      return {
        allowed: true,
        type: "paid",
        freeUsed: dailyData.freeUsed,
        freeLimit,
        freeRemaining: 0,
        paidUsedToday: dailyData.paidUsedToday,
        paidAvailable: paidData.paidAvailable,
        totalRemaining: paidData.paidAvailable,
      };
    } else {
      return {
        allowed: false,
        type: "exhausted",
        freeUsed: dailyData.freeUsed,
        freeLimit,
        freeRemaining: 0,
        paidUsedToday: dailyData.paidUsedToday,
        paidAvailable: paidData.paidAvailable,
        totalRemaining: 0,
      };
    }
  }

  /**
   * Prepared for future payment integration (₹5 for 20 requests).
   * Adds paid requests to the user's persistent balance.
   */
  static async addPaidQuota(
    userIdInput: string | number,
    amount: number
  ): Promise<{ paidAvailable: number }> {
    const userId = String(userIdInput);
    const redis = getRedis();

    if (redis && isRedisConfigured()) {
      try {
        const paidKey = getPaidKey(userId);
        const newPaidAvailable = await redis.hincrby(paidKey, "paid_available", amount);
        return { paidAvailable: Number(newPaidAvailable) };
      } catch (error) {
        console.error("Error adding paid quota in Redis, using fallback:", error);
      }
    }

    const paidKey = getPaidKey(userId);
    const paidData = memoryPaidQuota.get(paidKey) || { paidAvailable: 0, paidUsedTotal: 0 };
    paidData.paidAvailable += amount;
    memoryPaidQuota.set(paidKey, paidData);
    return { paidAvailable: paidData.paidAvailable };
  }
}
