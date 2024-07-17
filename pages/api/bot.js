import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false});

const setWebhook = async () => {
  try {
    await bot.setWebHook(`${process.env.VERCEL_PUBLIC_URL}/api/bot`);
    console.log("Webhook set successfully.");
  } catch (error) {
    console.error("Error setting webhook:", error.message);
  }
};

setWebhook();

const locale = "en-IN";
const country = locale.split("-")[1].toUpperCase();

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Welcome! Send me the name of a movie or TV show and I will fetch the details for you."
  );
});

bot.on("message", async (msg) => {
  if (msg.text === "/start") return;

  const chatId = msg.chat.id;
  const query = msg.text.trim();

  try {
    const results = await searchTMDB(query);

    if (results.length === 0) {
      bot.sendMessage(chatId, "No results found.");
      return;
    }

    results.sort(
      (a, b) =>
        new Date(b.release_date || b.first_air_date) -
        new Date(a.release_date || a.first_air_date)
    );

    await handleResults(chatId, results);
  } catch (error) {
    console.error("Error fetching data:", error.message);
    bot.sendMessage(chatId, "An error occurred while fetching details.");
  }
});

const searchTMDB = async (query) => {
  try {
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
    return response.data.results;
  } catch (error) {
    console.error("TMDB API Error:", error.message);
    return [];
  }
};

const getDetails = async (type, id) => {
  try {
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
    return response.data;
  } catch (error) {
    console.error("TMDB Details Error:", error.message);
    return {};
  }
};

const handleResults = async (chatId, results) => {
  try {
    for (const result of results) {
      const type = result.media_type;
      const details = await getDetails(type, result.id);
      const message = formatMessage(details, type);

      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Is this the one you are looking for?",
                callback_data: `yes_${result.id}`,
              },
              { text: "Show next result", callback_data: `no_${result.id}` },
            ],
          ],
        },
      });

      const answer = await waitForAnswer(chatId, result.id);
      if (answer === "yes") {
        bot.sendMessage(chatId, "Glad I could help!");
        break;
      }
    }
  } catch (error) {
    console.error("Error handling results:", error.message);
  }
};

const formatMessage = (details, type) => {
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
      .map((c) => c.name)
      .join(", ");

    const originalLanguage = spoken_languages
      .map((lang) => lang.english_name)
      .join(", ");

    const ottInfo =
      watchProviders.results && watchProviders.results[country]
        ? watchProviders.results[country].flatrate
            .map((provider) => provider.provider_name)
            .join(", ")
        : "Not available";

    return `<b>Title:</b> ${titleOrName} (${type})\n<b>Year of Release:</b> ${date}\n<b>Cast:</b> ${cast}\n<b>Language:</b> ${originalLanguage}\n<b>Plot:</b> ${overview}\n<b>IMDb Rating:</b> ${vote_average}\n<b>Genres:</b> ${genres
      .map((g) => g.name)
      .join(", ")}\n<b>Available on:</b> ${ottInfo}`;
  } catch (error) {
    console.error("Error formatting message:", error.message);
    return "Error formatting message";
  }
};

const waitForAnswer = (chatId, id) => {
  return new Promise((resolve) => {
    const callbackQueryListener = (callbackQuery) => {
      const { data } = callbackQuery;
      const [answer, resultId] = data.split("_");

      if (parseInt(resultId) === id) {
        bot.removeListener("callback_query", callbackQueryListener);
        resolve(answer);
      }
    };

    bot.on("callback_query", callbackQueryListener);
  });
};

export default (req, res) => {
  if (req.method === "POST") {
    bot.processUpdate(req.body);
    res.status(200).json({ status: "ok" });
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end("Method Not Allowed");
  }
};
