import type { NextApiRequest, NextApiResponse } from "next";
import { Telegraf, Context, Markup } from "telegraf";
import { config } from "../../lib/config";
import { TMDBService, normalizeQuery } from "../../lib/tmdb";
import { QuotaService } from "../../lib/quota";
import { DedupService } from "../../lib/dedup";
import { SearchSessionService } from "../../lib/session";
import { getRedis, isRedisConfigured } from "../../lib/storage";
import { AnalyticsService } from "../../lib/analytics";

const bot = new Telegraf<Context>(config.telegram.botToken);

bot.start(async (ctx) => {
  console.log("Received /start command");
  if (ctx.from?.id) {
    await AnalyticsService.trackUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
  }
  await ctx.reply(
    "Welcome! Send me the name of a movie or TV show and I will fetch the details for you."
  );
});

bot.help(async (ctx) => {
  await ctx.replyWithHTML(
    `🎬 <b>How to use Movie Maven:</b>\n\n` +
    `Simply send the name of any movie or TV show (e.g., <i>Inception</i>, <i>Stranger Things</i>, <i>Interstellar</i>).\n\n` +
    `<b>Commands:</b>\n` +
    `/start - Welcome message\n` +
    `/usage - Check your remaining daily requests\n` +
    `/feedback &lt;message&gt; - Send feedback or suggestions\n` +
    `/help - How to use this bot`
  );
});

// /feedback command
bot.command("feedback", async (ctx) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || "User");
  const text = ctx.message.text.replace(/^\/feedback\s*/i, "").trim();

  if (!text) {
    await ctx.replyWithHTML(
      `💬 <b>We'd Love Your Feedback!</b>\n\n` +
      `Have a suggestion, found a bug, or want a new feature? Let us know!\n\n` +
      `<b>How to send feedback:</b>\n` +
      `Type: <code>/feedback your message here</code>\n\n` +
      `<i>Example:</i>\n` +
      `<code>/feedback Please add release dates for upcoming movies!</code>`
    );
    return;
  }

  try {
    const redis = getRedis();
    const feedbackItem = {
      userId,
      username,
      message: text,
      date: new Date().toISOString(),
    };

    if (redis && isRedisConfigured()) {
      await redis.lpush("bot:feedback", JSON.stringify(feedbackItem));
    }

    // Forward to admin chat if configured
    if (config.telegram.adminChatId) {
      try {
        await ctx.telegram.sendMessage(
          config.telegram.adminChatId,
          `📬 <b>New Feedback Received!</b>\n\n` +
          `<b>From:</b> ${username} (ID: <code>${userId}</code>)\n` +
          `<b>Message:</b>\n${text}`,
          { parse_mode: "HTML" }
        );
      } catch (adminErr) {
        console.error("Error forwarding feedback to admin:", adminErr);
      }
    }

    await ctx.replyWithHTML(
      `✅ <b>Thank you for your feedback!</b>\n\n` +
      `Your message has been received by the Movie Maven team. We appreciate your support and ideas! 🍿`
    );
  } catch (error: any) {
    console.error("Error saving feedback:", error);
    await ctx.reply("Thank you for your feedback! It has been noted.");
  }
});

// Admin command to view recent feedback
bot.command("feedbacks", async (ctx) => {
  const userId = String(ctx.from?.id);
  const adminId = config.telegram.adminChatId;

  // Only allow admin to view feedback
  if (!adminId || userId !== String(adminId)) {
    return;
  }

  const redis = getRedis();
  if (!redis || !isRedisConfigured()) {
    await ctx.reply("Storage is not configured.");
    return;
  }

  try {
    const rawList = await redis.lrange<any>("bot:feedback", 0, 9);
    if (!rawList || rawList.length === 0) {
      await ctx.reply("No feedback received yet.");
      return;
    }

    let message = `📋 <b>Latest User Feedbacks (${rawList.length}):</b>\n\n`;
    rawList.forEach((item: any, index: number) => {
      try {
        const parsed = typeof item === "string" ? JSON.parse(item) : item;
        const time = parsed.date
          ? new Date(parsed.date).toLocaleString("en-IN", {
              timeZone: config.quota.timezone,
            })
          : "N/A";
        message += `<b>#${index + 1} From:</b> ${parsed.username || "Anonymous"} (ID: <code>${parsed.userId}</code>)\n`;
        message += `🕒 <i>${time}</i>\n`;
        message += `💬 <i>"${parsed.message}"</i>\n\n`;
      } catch (err) {
        message += `<b>#${index + 1}</b> ${item}\n\n`;
      }
    });

    await ctx.replyWithHTML(message);
  } catch (error: any) {
    console.error("Error fetching feedback list:", error);
    await ctx.reply("Error fetching feedback.");
  }
});

// Admin command to view member & search statistics
bot.command("stats", async (ctx) => {
  const userId = String(ctx.from?.id);
  const adminId = config.telegram.adminChatId;

  // Only allow admin to view statistics
  if (!adminId || userId !== String(adminId)) {
    return;
  }

  try {
    const stats = await AnalyticsService.getStats();

    await ctx.replyWithHTML(
      `📊 <b>Movie Maven Analytics</b>\n\n` +
      `👥 <b>Total Users (All-time):</b> ${stats.totalUsers}\n` +
      `📅 <b>Active Users Today:</b> ${stats.activeToday}\n` +
      `🔍 <b>Searches Today:</b> ${stats.searchesToday}\n` +
      `🎬 <b>Total Searches (All-time):</b> ${stats.totalSearches}\n\n` +
      `<i>Timezone: ${config.quota.timezone}</i>`
    );
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    await ctx.reply("Error fetching statistics.");
  }
});

bot.action(/feedback/, async (ctx) => {
  await ctx.replyWithHTML(
    `💬 <b>Send Us Your Feedback</b>\n\n` +
    `Type <code>/feedback your message</code> to send your thoughts directly to our team! 🍿`
  );
  await ctx.answerCbQuery();
});

// /usage command
bot.command("usage", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Unable to identify Telegram user.");
    return;
  }

  const quota = await QuotaService.getUserQuota(userId);

  const message =
    `<b>Your usage today:</b>\n` +
    `Free requests: ${quota.freeUsed} / ${quota.freeLimit}\n` +
    `Remaining: ${quota.freeRemaining}\n\n` +
    `<i>Resets at midnight (${config.quota.timezone})</i>`;

  await ctx.replyWithHTML(message);
});

const formatMessage = (details: any, type: string) => {
  try {
    const {
      title,
      name,
      release_date,
      first_air_date,
      overview,
      vote_average,
      genres = [],
      credits = { cast: [] },
      spoken_languages = [],
      "watch/providers": watchProviders = {},
    } = details;

    const titleOrName = title || name;
    const date = release_date || first_air_date || "N/A";
    const cast =
      credits.cast
        ?.slice(0, 5)
        .map((c: any) => c.name)
        .join(", ") || "N/A";
    const originalLanguage =
      spoken_languages?.map((lang: any) => lang.english_name).join(", ") ||
      "N/A";

    const ottInfo =
      watchProviders.results && watchProviders.results[config.tmdb.country]
        ? watchProviders.results[config.tmdb.country].flatrate
            ?.map((provider: any) => provider.provider_name)
            .join(", ") || "Not available"
        : "Not available";

    // Format vote_average to two decimal places
    const formattedRating = vote_average ? vote_average.toFixed(2) : "N/A";

    return `<b>Title:</b> ${titleOrName} (${type})\n<b>Year of Release:</b> ${date}\n<b>Cast:</b> ${cast}\n<b>Language:</b> ${originalLanguage}\n<b>Plot:</b> ${
      overview || "No overview available"
    }\n<b>IMDb Rating:</b> ${formattedRating}\n<b>Genres:</b> ${
      genres.map((g: any) => g.name).join(", ") || "N/A"
    }\n<b>Available on:</b> ${ottInfo}`;
  } catch (error: any) {
    console.error("Error formatting message:", error?.message || error);
    return "Error formatting message";
  }
};

const showResult = async (ctx: Context, results: any[], currentIndex: number) => {
  if (!results || results.length === 0 || currentIndex >= results.length) {
    await ctx.reply("No more results available.");
    return;
  }

  const currentResult = results[currentIndex];
  const type = currentResult.media_type || "movie";
  const details = await TMDBService.getDetails(type, currentResult.id);
  const message = formatMessage(details, type);

  const imageUrl = currentResult.poster_path
    ? `https://image.tmdb.org/t/p/w500${currentResult.poster_path}`
    : null;

  const keyboardButtons = [
    Markup.button.callback(
      "Is this the one you are looking for?",
      `confirm_${currentIndex}`
    ),
  ];

  if (currentIndex + 1 < results.length) {
    keyboardButtons.push(
      Markup.button.callback("Show Next Result", `next_${currentIndex + 1}`)
    );
  }

  const keyboard = Markup.inlineKeyboard(keyboardButtons);

  try {
    if (imageUrl) {
      await ctx.replyWithPhoto(imageUrl, {
        caption: message,
        parse_mode: "HTML",
        reply_markup: keyboard.reply_markup,
      });
    } else {
      await ctx.replyWithHTML(message, keyboard);
    }
  } catch (error: any) {
    console.error("Error sending image or message:", error?.message || error);
    await ctx.reply("An error occurred while displaying the result.");
  }
};

bot.on("text", async (ctx) => {
  const query = ctx.message.text.trim();
  if (query.startsWith("/")) return;

  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Unable to identify Telegram user.");
    return;
  }

  console.log(`Received search query from user ${userId}: "${query}"`);

  // Track user activity
  await AnalyticsService.trackUser(userId, ctx.from?.username, ctx.from?.first_name);

  // Check and consume quota
  const quotaResult = await QuotaService.consumeQuota(userId, config.quota.botId);

  if (!quotaResult.allowed) {
    console.log(`User ${userId} quota exhausted (${quotaResult.freeUsed}/${quotaResult.freeLimit})`);
    await ctx.replyWithHTML(
      `⚠️ <b>Daily Limit Reached</b>\n\n` +
      `You have reached your daily limit of <b>${quotaResult.freeLimit} searches</b> for today.\n\n` +
      `🕒 <b>Reset Time:</b> Tonight at 12:00 AM midnight (${config.quota.timezone}).\n\n` +
      `Thank you for using Movie Maven! Please come back tomorrow to discover more movies and shows. 🍿\n\n` +
      `💬 <i>Have suggestions or feedback? Send us a message anytime using /feedback</i>`
    );
    return;
  }

  try {
    const results = await TMDBService.searchTMDB(query);

    if (results.length === 0) {
      await ctx.reply("No results found.");
      return;
    }

    // Track successful search
    await AnalyticsService.trackSearch();

    // Save active search session for stateless serverless pagination
    await SearchSessionService.saveUserSearch(userId, normalizeQuery(query));

    // Display the first result
    await showResult(ctx, results, 0);
  } catch (error: any) {
    console.error("Error fetching data:", error?.message || error);
    await ctx.reply("An error occurred while fetching details.");
  }
});

bot.action(/next_(\d+)/, async (ctx) => {
  const index = parseInt(ctx.match[1], 10);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.answerCbQuery("Error: User ID not found.");
    return;
  }

  const lastQuery = await SearchSessionService.getUserSearch(userId);
  if (!lastQuery) {
    await ctx.reply("Search session expired. Please send the movie name again to search.");
    await ctx.answerCbQuery();
    return;
  }

  // Uses cached search results (does not consume user quota and avoids TMDB search call)
  const results = await TMDBService.searchTMDB(lastQuery);

  if (results && index < results.length) {
    await showResult(ctx, results, index);
  } else {
    await ctx.reply("No more results available.");
  }

  await ctx.answerCbQuery();
});

bot.action(/confirm_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery("Glad I could help!");
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  // Verify Telegram webhook secret token if configured
  if (config.telegram.webhookSecret) {
    const secretToken = req.headers["x-telegram-bot-api-secret-token"];
    if (secretToken !== config.telegram.webhookSecret) {
      console.warn("Rejected request: invalid or missing x-telegram-bot-api-secret-token header");
      return res.status(401).json({ status: "unauthorized" });
    }
  }

  const update = req.body;
  if (!update || typeof update !== "object") {
    return res.status(400).json({ status: "bad_request" });
  }

  // Fast-path: Immediately ignore irrelevant updates (stickers, voice, edited messages, channel posts)
  // to avoid burning Vercel execution duration and Redis commands
  const isRelevant = Boolean(
    (update.message && typeof update.message.text === "string") ||
    update.callback_query
  );

  if (!isRelevant) {
    return res.status(200).json({ status: "ignored_non_text_update" });
  }

  const updateId = update.update_id;

  // Deduplicate Telegram updates using atomic Redis SET NX
  if (typeof updateId === "number") {
    const isNew = await DedupService.isNewUpdate(updateId);
    if (!isNew) {
      console.log(`Duplicate update ${updateId} skipped.`);
      return res.status(200).json({ status: "duplicate_skipped" });
    }
  }

  try {
    await bot.handleUpdate(update);
    console.log(`Update ${updateId} processed successfully`);
    return res.status(200).json({ status: "ok" });
  } catch (error: any) {
    console.error("Error processing update:", error?.message || error);
    return res.status(500).json({ status: "error", message: error?.message || "Internal Server Error" });
  }
};

export default handler;
