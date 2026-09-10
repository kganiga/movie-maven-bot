const axios = require("axios");
require("dotenv").config();

const setWebhook = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = process.env.VERCEL_PUBLIC_URL;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !baseUrl) {
    console.log(
      "setWebhook: TELEGRAM_BOT_TOKEN or VERCEL_PUBLIC_URL not provided. Skipping webhook setup."
    );
    return;
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
