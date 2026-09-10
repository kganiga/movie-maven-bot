import { Redis } from "@upstash/redis";
import { config } from "./config";

let redisClient: Redis | null = null;

export const isRedisConfigured = (): boolean => {
  return Boolean(config.redis.url && config.redis.token);
};

export const getRedis = (): Redis | null => {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url: config.redis.url,
      token: config.redis.token,
    });
  }

  return redisClient;
};
