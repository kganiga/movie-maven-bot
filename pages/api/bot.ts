import { Telegraf, Context, Markup, session } from "telegraf";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface SessionData {
  lastQuery?: string;
  currentIndex?: number;
  results?: any[]; // Store results in session
}

interface BotContext extends Context {
  session: SessionData;
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN as string);
bot.use(session({ defaultSession: () => ({}) }));

const processedUpdates = new Set<number>();

const setWebhook = async () => {
  try {
    const url = `${process.env.VERCEL_PUBLIC_URL}/api/bot`;
    await bot.telegram.setWebhook(url);
    console.log(`Webhook set successfully: ${url}`);
  } catch (error) {
    console.error("Error setting webhook:", error.message);
  }
};

setWebhook();

const locale = "en-IN";
const country = locale.split("-")[1].toUpperCase();

bot.start((ctx) => {
  console.log("Received /start command");
  ctx.reply(
    "Welcome! Send me the name of a movie or TV show and I will fetch the details for you."
  );
});

bot.action(/feedback/, async (ctx) => {
  await ctx.reply(
    "For feedback and suggestions, please visit: https://movie-maven-bot.vercel.app/"
  );
});

bot.on("text", async (ctx) => {
  const query = ctx.message.text.trim();
  if (query === "/start") return;

  console.log(`Received text message: ${query}`);

  ctx.session.lastQuery = query;
  ctx.session.currentIndex = 0; // Initialize current index
  ctx.session.results = []; // Initialize results array

  try {
    const results = await searchTMDB(query);

    if (results.length === 0) {
      ctx.reply("No results found.");
      return;
    }

    // Store results in session
    ctx.session.results = results;

    // Display the first result
    await showResult(ctx);
  } catch (error) {
    console.error("Error fetching data:", error.message);
    ctx.reply("An error occurred while fetching details.");
  }
});

bot.action(/next_(\d+)/, async (ctx) => {
  const index = parseInt(ctx.match[1], 10);

  if (ctx.session.results && index < ctx.session.results.length) {
    ctx.session.currentIndex = index;
    await showResult(ctx);
  } else {
    ctx.reply("No more results available.");
  }

  ctx.answerCbQuery();
});

bot.action(/confirm_(\d+)/, async (ctx) => {
  ctx.answerCbQuery("Glad I could help!");
});

const searchTMDB = async (query: string) => {
  try {
    console.log(`Searching TMDB for query: ${query}`);
    const response = await axios.get(
      "https://api.themoviedb.org/3/search/multi",
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query: query,
          language: locale,
        },
      }
    );

    // Returning results without sorting
    const results = response.data.results;
    console.log(`TMDB search results: ${JSON.stringify(results)}`);
    return results;
  } catch (error) {
    console.error("TMDB API Error:", error.message);
    return [];
  }
};

const showResult = async (ctx: BotContext) => {
  const { results, currentIndex } = ctx.session;

  if (
    !results ||
    results.length === 0 ||
    currentIndex === undefined ||
    currentIndex >= results.length
  ) {
    ctx.reply("No more results available.");
    return;
  }

  const currentResult = results[currentIndex];
  const type = currentResult.media_type;
  const details = await getDetails(type, currentResult.id);
  const message = formatMessage(details, type);
  const thumbnailUrl = `https://image.tmdb.org/t/p/w500${currentResult.poster_path}`;

  await ctx.replyWithPhoto(
    { url: thumbnailUrl },
    {
      caption: message,
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        Markup.button.callback(
          "Is this the one you are looking for?",
          `confirm_${currentIndex}`
        ),
        Markup.button.callback(
          "Show Next Result",
          `next_${currentIndex + 1}` // Increment index for next result
        ),
      ]),
    }
  );
};

const getDetails = async (type: string, id: string) => {
  try {
    console.log(`Fetching details for ${type} with ID: ${id}`);
    const response = await axios.get(
      `https://api.themoviedb.org/3/${type}/${id}`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          append_to_response: "credits,watch/providers",
          language: locale,
        },
      }
    );
    console.log(`Details fetched for ${type} with ID: ${id}`);
    return response.data;
  } catch (error) {
    console.error("TMDB Details Error:", error.message);
    return {};
  }
};

const formatMessage = (details: any, type: string) => {
  try {
    const {
      title,
      name,
      release_date,
      first_air_date,
      overview,
      vote_average,
      genres,
      credits,
      spoken_languages,
      "watch/providers": watchProviders,
    } = details;

    const titleOrName = title || name;
    const date = release_date || first_air_date;
    const cast = credits.cast
      .slice(0, 5)
      .map((c: any) => c.name)
      .join(", ");
    const originalLanguage = spoken_languages
      .map((lang: any) => lang.english_name)
      .join(", ");

    const ottInfo =
      watchProviders.results && watchProviders.results[country]
        ? watchProviders.results[country].flatrate
            .map((provider: any) => provider.provider_name)
            .join(", ")
        : "Not available";

    return `<b>Title:</b> ${titleOrName} (${type})\n<b>Year of Release:</b> ${date}\n<b>Cast:</b> ${cast}\n<b>Language:</b> ${originalLanguage}\n<b>Plot:</b> ${overview}\n<b>IMDb Rating:</b> ${vote_average}\n<b>Genres:</b> ${genres
      .map((g: any) => g.name)
      .join(", ")}\n<b>Available on:</b> ${ottInfo}`;
  } catch (error) {
    console.error("Error formatting message:", error.message);
    return "Error formatting message";
  }
};

export default async (req: any, res: any) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);

  if (req.method === "POST") {
    console.log("Processing update...");
    const updateId = req.body.update_id;

    if (processedUpdates.has(updateId)) {
      console.log("Update already processed, skipping.");
      res.status(200).json({ status: "ok" });
      return;
    }

    try {
      await bot.handleUpdate(req.body);
      processedUpdates.add(updateId);
      console.log("Update processed successfully");
      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Error processing update:", error.message);
      res.status(500).json({ status: "error", message: error.message });
    }
  } else {
    console.log("Method not allowed");
    res.setHeader("Allow", ["POST"]);
    res.status(405).end("Method Not Allowed");
  }
};
