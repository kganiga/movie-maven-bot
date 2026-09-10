const axios = require("axios");
require("dotenv").config();

const setWebhook = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let baseUrl =
    process.env.VERCEL_PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "");

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !baseUrl) {
    console.log(
      "setWebhook: TELEGRAM_BOT_TOKEN or VERCEL URL not available. Skipping webhook setup."
    );
    return;
  }

  // Ensure protocol
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }

  const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/bot`;

  try {
    const payload = {
      url: webhookUrl,
    };

    if (secretToken) {
      payload.secret_token = secretToken;
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      payload
    );

    if (response.data.ok) {
      console.log(`Webhook set successfully to: ${webhookUrl}`);
    } else {
      console.error("Error setting webhook:", response.data.description);
    }
  } catch (error) {
    console.error("Error setting webhook:", error.message);
  }
};

setWebhook();
