# 🎬 Movie Maven Telegram Bot

Movie Maven is an intelligent Telegram bot that helps users discover movies and TV shows, fetch synopses, cast, ratings, genres, and find available streaming platforms (OTT) in India.

The bot is engineered for high-performance serverless deployment on **Vercel** with **₹0 infrastructure cost**, strict abuse prevention, persistent daily rate limiting, and TMDB API caching.

---

## ✨ Features

- 🔍 **Multi-Search**: Find movies and TV shows via The Movie Database (TMDB).
- 🍿 **Rich Details**: Poster, release date, cast (top 5), IMDb rating, genres, spoken language, and Indian OTT availability (Netflix, Prime Video, Disney+ Hotstar, Zee5, SonyLIV, etc.).
- 🔄 **Stateless Result Pagination**: Navigate through results ("Show Next Result") seamlessly across serverless instances without losing session state or burning quota.
- 🛡️ **Daily Quota Enforcement**: Configurable limit of **5 free requests / day / Telegram user** (`Asia/Kolkata` timezone).
- ⚡ **Redis Caching**: Normalized search queries and title details are cached in Upstash Redis, preventing redundant TMDB API calls.
- 🔒 **Duplicate Update Protection**: Atomic distributed locking prevents duplicate webhook retries from being processed concurrently.
- 🚀 **Serverless Optimized**: Configured with 256MB RAM in `vercel.json` (cutting GB-hours compute by 75%) and fast-path drops for non-text updates (< 2ms).
- 📊 **/usage & /help Commands**: Instant view of daily quota usage and usage guide.

---

## 🛠️ Tech Stack & ₹0 Architecture

- **Framework**: Next.js 14 (Pages API Route for Webhook)
- **Bot Engine**: Telegraf 4.x
- **Hosting**: Vercel (Serverless Functions - Free Hobby Tier)
- **Persistent Storage**: [Upstash Redis](https://upstash.com/) (Serverless REST API - Free Tier: 10,000 commands/day, no credit card required)
- **Movie Data**: TMDB API (Free Developer Tier)

---

## 🚀 Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/BotFather) | - | **Yes** |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token to authenticate incoming Telegram webhooks | - | No (Recommended) |
| `ADMIN_CHAT_ID` | Your personal Telegram user ID to receive real-time user feedback | - | No |
| `APP_URL` | Deployed URL (e.g. `https://your-bot.vercel.app`) | Auto-detected | No |
| `TMDB_API_KEY` | Free API key from [TMDB](https://www.themoviedb.org/settings/api) | - | **Yes** |
| `BOT_ID` | Identifier for this bot | `movie-maven` | No |
| `FREE_REQUESTS_PER_DAY` | Max free search requests per Telegram user per day | `5` | No |
| `QUOTA_TIMEZONE` | Timezone for daily quota reset | `Asia/Kolkata` | No |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | - | **Yes** (in production) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token | - | **Yes** (in production) |

> **Note on URLs**: Do **NOT** name custom environment variables starting with `VERCEL_` (e.g., `VERCEL_PUBLIC_URL`), as Vercel reserves this prefix. Our code automatically detects Vercel's built-in system URL if `APP_URL` is omitted.

---

## 📦 Setting Up Upstash Redis (100% Free Forever)

1. Go to [https://console.upstash.com/](https://console.upstash.com/) and sign up with GitHub or Google (no credit card required).
2. Click **Create Database**:
   - **Name**: e.g., `movie-maven-db`
   - **Type**: Regional
   - **Region**: Select a region close to your deployment (e.g., Mumbai `ap-south-1` or Singapore `ap-southeast-1`).
3. Under the **Details** tab, scroll down to the **REST API** section.
4. Click on the `.env` tab and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Add these to your `.env` file (locally) and into your Vercel Project Settings under **Environment Variables**.

---

## 🤖 Setting Up the Telegram Bot via @BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions to choose a name and username for your bot.
3. BotFather will give you an API token (e.g. `7123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`). Copy this as `TELEGRAM_BOT_TOKEN`.
4. **Configure Bot Commands Menu**:
   - Send `/setcommands` to @BotFather.
   - Select your bot.
   - Paste:
     ```text
     start - Start the bot and get instructions
     usage - Check your daily request quota
     feedback - Send suggestions or report an issue
     help - How to use this bot
     ```
5. *(Optional)* Send `/setdescription` to set the welcome screen, `/setabouttext` for the bio, and `/setuserpic` for the profile photo.

---

## 🎬 Getting Your Free TMDB API Key

1. Create a free account at [The Movie Database (TMDB)](https://www.themoviedb.org/signup).
2. Go to **Account Settings > API** (`https://www.themoviedb.org/settings/api`).
3. Click **Create** or **Request an API Key** (choose "Developer").
4. Fill in the required application details.
5. Copy your **API Key (v3 auth)** and set it as `TMDB_API_KEY`.

---

## 🚢 Deploying to Vercel

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "feat: serverless hardening, redis quota, tmdb caching"
   git push origin master
   ```
2. In the [Vercel Dashboard](https://vercel.com/), open your project settings or import the repository.
3. Under **Environment Variables**, ensure all required variables are set:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET` *(optional)*
   - `TMDB_API_KEY`
   - `BOT_ID` = `movie-maven`
   - `FREE_REQUESTS_PER_DAY` = `5`
   - `QUOTA_TIMEZONE` = `Asia/Kolkata`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Click **Deploy**.
5. Once deployed, the webhook is automatically registered with Telegram via the `postbuild` script (`node setWebhook.js`).

---

## 🤖 Bot Commands & Usage

- `/start` — Welcome message and instructions.
- `/usage` — Displays current user quota usage for today:
  ```text
  Your usage today:
  Free requests: 3 / 5
  Remaining: 2

  Resets at midnight (Asia/Kolkata)
  ```
- `/help` — Quick guide on how to search and available commands.
- `/feedback <message>` — Send feedback, feature requests, or report an issue directly to the team.
- Send any movie or TV show name (e.g. `Inception`, `Stranger Things`, `Interstellar`) to search.
- Click **"Show Next Result"** to page through items without consuming extra quota.
