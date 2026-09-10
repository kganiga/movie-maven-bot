import dotenv from "dotenv";

dotenv.config();

const getBaseUrl = (): string => {
  const url =
    process.env.VERCEL_PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "");

  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url.replace(/\/+$/, "");
};

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    webhookUrl: getBaseUrl() ? `${getBaseUrl()}/api/bot` : "",
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
