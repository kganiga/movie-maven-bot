import axios from "axios";
import { config } from "./config";
import { getRedis, isRedisConfigured } from "./storage";

export const normalizeQuery = (query: string): string => {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
};

// In-memory fallback caches for local development
const memorySearchCache = new Map<string, any[]>();
const memoryDetailsCache = new Map<string, any>();

export class TMDBService {
  /**
   * Search TMDB for movies/TV shows with query normalization and Redis caching.
   */
  static async searchTMDB(rawQuery: string): Promise<any[]> {
    const query = normalizeQuery(rawQuery);
    if (!query) return [];

    const cacheKey = `cache:tmdb:search:${query}`;
    const redis = getRedis();

    // Check Redis cache
    if (redis && isRedisConfigured()) {
      try {
        const cached = await redis.get<any[]>(cacheKey);
        if (cached && Array.isArray(cached)) {
          console.log(`TMDB Search Cache HIT: "${query}"`);
          return cached;
        }
      } catch (error) {
        console.error("Redis search cache read error:", error);
      }
    } else {
      const memCached = memorySearchCache.get(cacheKey);
      if (memCached) {
        console.log(`Memory Search Cache HIT: "${query}"`);
        return memCached;
      }
    }

    try {
      console.log(`TMDB Search API call: "${query}"`);
      const response = await axios.get("https://api.themoviedb.org/3/search/multi", {
        params: {
          api_key: config.tmdb.apiKey,
          query: query,
          language: config.tmdb.locale,
        },
        timeout: 8000,
      });

      const results = response.data?.results || [];

      // Cache results for 24 hours (86400 seconds)
      if (redis && isRedisConfigured()) {
        try {
          await redis.set(cacheKey, results, { ex: 86400 });
        } catch (error) {
          console.error("Redis search cache write error:", error);
        }
      } else {
        memorySearchCache.set(cacheKey, results);
      }

      return results;
    } catch (error: any) {
      console.error("TMDB API Search Error:", error?.message || error);
      return [];
    }
  }

  /**
   * Fetch details for a movie or TV show with Redis caching.
   */
  static async getDetails(type: string, id: string | number): Promise<any> {
    const cacheKey = `cache:tmdb:details:${type}:${id}`;
    const redis = getRedis();

    // Check Redis cache
    if (redis && isRedisConfigured()) {
      try {
        const cached = await redis.get<any>(cacheKey);
        if (cached) {
          console.log(`TMDB Details Cache HIT: ${type} ${id}`);
          return cached;
        }
      } catch (error) {
        console.error("Redis details cache read error:", error);
      }
    } else {
      const memCached = memoryDetailsCache.get(cacheKey);
      if (memCached) {
        console.log(`Memory Details Cache HIT: ${type} ${id}`);
        return memCached;
      }
    }

    try {
      console.log(`TMDB Details API call: ${type} ${id}`);
      const response = await axios.get(`https://api.themoviedb.org/3/${type}/${id}`, {
        params: {
          api_key: config.tmdb.apiKey,
          append_to_response: "credits,watch/providers",
          language: config.tmdb.locale,
        },
        timeout: 8000,
      });

      const details = response.data || {};

      // Cache details for 7 days (604800 seconds)
      if (redis && isRedisConfigured()) {
        try {
          await redis.set(cacheKey, details, { ex: 604800 });
        } catch (error) {
          console.error("Redis details cache write error:", error);
        }
      } else {
        memoryDetailsCache.set(cacheKey, details);
      }

      return details;
    } catch (error: any) {
      console.error("TMDB Details API Error:", error?.message || error);
      return {};
    }
  }
}
