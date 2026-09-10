import axios from "axios";
import crypto from "crypto";
import { config } from "./config";

export class RazorpayService {
  /**
   * Checks if Razorpay API keys are configured in the environment.
   */
  static isConfigured(): boolean {
    return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
  }

  /**
   * Creates a ₹5.00 (500 paise) Razorpay payment link for 20 search requests.
   * Associates the Telegram userId in the payment link notes.
   */
  static async createPaymentLink(userIdInput: string | number): Promise<string | null> {
    if (!this.isConfigured()) {
      console.warn("Razorpay API keys not configured. Skipping payment link creation.");
      return null;
    }

    const userId = String(userIdInput);
    const authHeader = Buffer.from(
      `${config.razorpay.keyId}:${config.razorpay.keySecret}`
    ).toString("base64");

    try {
      const response = await axios.post(
        "https://api.razorpay.com/v1/payment_links",
        {
          amount: 500, // ₹5.00 in paise
          currency: "INR",
          accept_partial: false,
          description: "20 Search Requests - Movie Maven Bot",
          notes: {
            userId: userId,
            botId: config.quota.botId,
          },
          notify: {
            sms: false,
            email: false,
          },
          reminder_enable: false,
        },
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }
      );

      const shortUrl = response.data?.short_url;
      if (shortUrl) {
        console.log(`Created Razorpay payment link for user ${userId}: ${shortUrl}`);
        return shortUrl;
      }
      return null;
    } catch (error: any) {
      console.error("Error creating Razorpay payment link:", error?.response?.data || error?.message || error);
      return null;
    }
  }

  /**
   * Validates Razorpay webhook cryptographic HMAC-SHA256 signature.
   */
  static verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!config.razorpay.webhookSecret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET is not configured.");
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac("sha256", config.razorpay.webhookSecret)
        .update(rawBody)
        .digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "utf-8"),
        Buffer.from(signature, "utf-8")
      );
    } catch (error) {
      console.error("Error verifying Razorpay webhook signature:", error);
      return false;
    }
  }
}
