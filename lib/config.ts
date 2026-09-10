import dotenv from "dotenv";

dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    webhookUrl: process.env.VERCEL_PUBLIC_URL
      ? `${process.env.VERCEL_PUBLIC_URL}/api/bot`
      : "",
  },
  tmdb: {
    apiKey: process.env.TMDB_API_KEY || "",
    locale: "en-IN",
    country: "IN",
  },
  quota: {
    botId: process.env.BOT_ID || "movie-maven",
    freeRequestsPerDay: parseInt(process.env.FREE_REQUESTS_PER_DAY || "5", 10),
    timezone: process.env.QUOTA_TIMEZONE || "Asia/Kolkata",
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
  },
};
