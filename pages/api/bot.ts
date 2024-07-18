import { Telegraf, Context, Markup, session } from "telegraf";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface SessionData {
  lastQuery?: string;
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

bot.on("text", async (ctx) => {
  const query = ctx.message.text.trim();
  if (query === "/start") return;

  console.log(`Received text message: ${query}`);

  ctx.session.lastQuery = query;

  try {
    const results = await searchTMDB(query);

    if (results.length === 0) {
      ctx.reply("No results found.");
      return;
    }

    // Sort results by release date (descending)
    results.sort(
      (a, b) =>
        new Date(b.release_date || b.first_air_date).getTime() -
        new Date(a.release_date || a.first_air_date).getTime()
    );

    // Take only the first result
    const firstResult = results[0];
    const type = firstResult.media_type;
    const details = await getDetails(type, firstResult.id);
    const message = formatMessage(details, type);

    await ctx.replyWithHTML(
      message,
      Markup.inlineKeyboard([
        Markup.button.callback(
          "Is this the one you are looking for?",
          `yes_${firstResult.id}`
        ),
      ])
    );

    ctx.reply("Glad I could help!");
  } catch (error) {
    console.error("Error fetching data:", error.message);
    ctx.reply("An error occurred while fetching details.");
  }
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
    console.log(
      `TMDB search results: ${JSON.stringify(response.data.results)}`
    );
    return response.data.results;
  } catch (error) {
    console.error("TMDB API Error:", error.message);
    return [];
  }
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
