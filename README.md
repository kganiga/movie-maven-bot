# 🎬 Movie Maven Telegram Bot

Movie Maven is an intelligent Telegram bot that helps users discover movies and TV shows, fetch synopses, cast, ratings, genres, and find available streaming platforms (OTT) in India.

The bot is engineered for high-performance serverless deployment on **Vercel** with **₹0 infrastructure cost**, strict abuse prevention, persistent daily rate limiting, and TMDB API caching.

---

## ✨ Features

- 🔍 **Multi-Search**: Find movies and TV shows via The Movie Database (TMDB).
- 🍿 **Rich Details**: Poster, release date, cast (top 5), IMDb rating, genres, spoken language, and Indian OTT availability (Netflix, Prime Video, Disney+ Hotstar, Zee5, SonyLIV, etc.).
- 🔄 **Stateless Result Pagination**: Navigate through results ("Show Next Result") seamlessly across serverless instances without losing session state or burning quota.
- 🛡️ **Daily Quota Enforcement**: Configurable limit of **5 free requests / day / Telegram user** (`Asia/Kolkata` timezone).
- 💳 **Future Paid Architecture Ready**: Built-in methods for ₹5 = 20 additional requests top-ups.
- ⚡ **Redis Caching**: Normalized search queries and title details are cached in Upstash Redis, preventing redundant TMDB API calls.
- 🔒 **Duplicate Update Protection**: Atomic distributed locking prevents duplicate webhook retries from being processed concurrently.
- 📊 **/usage Command**: Instant view of daily quota usage and remaining requests.

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
| `VERCEL_PUBLIC_URL` | Deployed URL (e.g. `https://your-bot.vercel.app`) | - | **Yes** (in production) |
| `TMDB_API_KEY` | Free API key from [TMDB](https://www.themoviedb.org/settings/api) | - | **Yes** |
| `BOT_ID` | Identifier for this bot | `movie-maven` | No |
| `FREE_REQUESTS_PER_DAY` | Max free search requests per Telegram user per day | `5` | No |
| `QUOTA_TIMEZONE` | Timezone for daily quota reset | `Asia/Kolkata` | No |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | - | **Yes** (in production) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token | - | **Yes** (in production) |

---

## 📦 Setting Up Upstash Redis (100% Free Forever)

1. Go to [https://console.upstash.com/](https://console.upstash.com/) and sign up with GitHub or Google (no credit card required).
2. Click **Create Database**.
   - **Name**: e.g., `movie-maven-db`
   - **Type**: Regional
   - **Region**: Select a region close to your deployment (e.g., Mumbai `ap-south-1` or Singapore `ap-southeast-1`).
3. Under the **Details** tab, scroll down to the **REST API** section.
4. Click on the `.env` tab or copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Add these to your `.env` file (locally) and into your Vercel Project Settings under **Environment Variables**.

---

## 🤖 Setting Up the Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions to choose a name and username for your bot.
3. BotFather will provide you with an API token (e.g. `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. Copy this token and set it as `TELEGRAM_BOT_TOKEN`.
5. *(Optional but recommended)* Generate a random string (e.g., `openssl rand -hex 20`) and set it as `TELEGRAM_WEBHOOK_SECRET`.

---

## 🎬 Getting Your Free TMDB API Key

1. Create a free account at [The Movie Database (TMDB)](https://www.themoviedb.org/signup).
2. Go to **Account Settings > API** (`https://www.themoviedb.org/settings/api`).
3. Click **Create** or **Request an API Key** (choose "Developer").
4. Fill in the required details (App name: e.g. `Movie Maven Bot`).
5. Copy your **API Key (v3 auth)** and set it as `TMDB_API_KEY`.

---

## 🚢 Deploying to Vercel

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "feat: serverless hardening, redis quota, and tmdb caching"
   git push origin master
   ```
2. In the [Vercel Dashboard](https://vercel.com/), click **Add New... > Project** and import the `movie-maven-bot` repository.
3. In the project **Settings > Environment Variables**, add all the variables from `.env.example`:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `VERCEL_PUBLIC_URL` (set this to your Vercel project domain, e.g. `https://movie-maven-bot.vercel.app`)
   - `TMDB_API_KEY`
   - `BOT_ID` = `movie-maven`
   - `FREE_REQUESTS_PER_DAY` = `5`
   - `QUOTA_TIMEZONE` = `Asia/Kolkata`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Click **Deploy**.
5. Once deployed, the webhook is automatically configured via the `postbuild` script (`node setWebhook.js`).
   - If you ever change your URL or need to re-register the webhook manually:
     ```bash
     npm run postbuild
     ```

---

## 🤖 Bot Commands & Testing

- `/start` — Welcome message and instructions.
- `/usage` — Displays current user quota usage for today:
  ```
  Your usage today:
  Free requests: 3 / 5
  Paid requests: 0
  Remaining: 2

  Resets at midnight (Asia/Kolkata)
  ```
- Send any movie or TV show name (e.g. `Inception`, `Stranger Things`, `Interstellar`) to search.
- Click **"Show Next Result"** to page through items without consuming quota.
