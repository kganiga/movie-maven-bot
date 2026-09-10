import type { NextApiRequest, NextApiResponse } from "next";
import { Telegraf, Context, Markup } from "telegraf";
import { config } from "../../lib/config";
import { TMDBService, normalizeQuery } from "../../lib/tmdb";
import { QuotaService } from "../../lib/quota";
import { DedupService } from "../../lib/dedup";
import { SearchSessionService } from "../../lib/session";

const bot = new Telegraf<Context>(config.telegram.botToken);

bot.start(async (ctx) => {
  console.log("Received /start command");
  await ctx.reply(
    "Welcome! Send me the name of a movie or TV show and I will fetch the details for you."
  );
});

bot.action(/feedback/, async (ctx) => {
  await ctx.reply(
    "For feedback and suggestions, please visit: https://movie-maven-bot.vercel.app/"
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
    `Paid requests: ${quota.paidUsedToday}\n` +
    `Remaining: ${quota.totalRemaining}\n\n` +
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

  // Check and consume quota
  const quotaResult = await QuotaService.consumeQuota(userId, config.quota.botId);

  if (!quotaResult.allowed) {
    console.log(`User ${userId} quota exhausted (${quotaResult.freeUsed}/${quotaResult.freeLimit})`);
    await ctx.reply(
      `⚠️ <b>Daily Limit Reached</b>\n\n` +
      `You have used all your free requests for today (${quotaResult.freeUsed}/${quotaResult.freeLimit}).\n` +
      `Free requests reset daily at midnight (${config.quota.timezone}).\n\n` +
      `💳 <i>Future Upgrade Option:</i>\n` +
      `₹5 for 20 additional requests (Coming soon!)`,
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    const results = await TMDBService.searchTMDB(query);

    if (results.length === 0) {
      await ctx.reply("No results found.");
      return;
    }

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
