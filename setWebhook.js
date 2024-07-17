const axios = require("axios");
require("dotenv").config();

const setWebhook = async () => {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        url: `${process.env.VERCEL_PUBLIC_URL}/api/bot`,
      }
    );
    if (response.data.ok) {
      console.log("Webhook set successfully.");
    } else {
      console.error("Error setting webhook:", response.data.description);
    }
  } catch (error) {
    console.error("Error setting webhook:", error.message);
  }
};

setWebhook();
