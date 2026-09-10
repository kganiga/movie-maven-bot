import type { NextApiRequest, NextApiResponse } from "next";
import type { IncomingMessage } from "http";
import { Telegraf } from "telegraf";
import { config as appConfig } from "../../lib/config";
import { RazorpayService } from "../../lib/razorpay";
import { QuotaService } from "../../lib/quota";
import { getRedis, isRedisConfigured } from "../../lib/storage";

// Disable Next.js automatic body parser to read raw buffer for HMAC verification
export const config = {
  api: {
    bodyParser: false,
  },
};

const getRawBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

// In-memory fallback for payment deduplication in local dev
const memoryProcessedPayments = new Set<string>();

const isNewPayment = async (paymentId: string): Promise<boolean> => {
  const redis = getRedis();
  if (redis && isRedisConfigured()) {
    try {
      const result = await redis.set(`payment:processed:${paymentId}`, "1", {
        nx: true,
        ex: 604800, // 7 days
      });
      return result === "OK";
    } catch (error) {
      console.error("Redis payment dedup error:", error);
    }
  }

  if (memoryProcessedPayments.has(paymentId)) {
    return false;
  }
  memoryProcessedPayments.add(paymentId);
  return true;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature || typeof signature !== "string") {
    console.warn("Razorpay webhook rejected: missing x-razorpay-signature header");
    return res.status(400).json({ status: "missing_signature" });
  }

  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req);
  } catch (err: any) {
    console.error("Error reading request stream:", err);
    return res.status(500).json({ status: "stream_error" });
  }

  const isValid = RazorpayService.verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    console.warn("Razorpay webhook rejected: invalid signature");
    return res.status(401).json({ status: "invalid_signature" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf-8"));
  } catch (err) {
    console.error("Invalid JSON payload from Razorpay:", err);
    return res.status(400).json({ status: "invalid_json" });
  }

  const eventName = event.event;
  console.log(`Received Razorpay webhook event: ${eventName}`);

  // Handle successful payment events
  if (
    eventName === "payment_link.paid" ||
    eventName === "payment.captured" ||
    eventName === "order.paid"
  ) {
    const paymentLinkEntity = event.payload?.payment_link?.entity;
    const paymentEntity = event.payload?.payment?.entity;

    const paymentId =
      paymentEntity?.id ||
      paymentLinkEntity?.id ||
      event.payload?.order?.entity?.id ||
      event.id;

    const userId =
      paymentLinkEntity?.notes?.userId ||
      paymentEntity?.notes?.userId;

    if (!userId) {
      console.warn(`Payment ${paymentId} has no Telegram userId in notes, cannot credit quota.`);
      return res.status(200).json({ status: "skipped_no_user_id" });
    }

    if (paymentId) {
      const isNew = await isNewPayment(paymentId);
      if (!isNew) {
        console.log(`Payment ${paymentId} was already processed, skipping duplicate credit.`);
        return res.status(200).json({ status: "duplicate_skipped" });
      }
    }

    try {
      // Credit 20 paid requests to the user
      const result = await QuotaService.addPaidQuota(userId, 20);
      console.log(`Successfully credited 20 requests to user ${userId}. New balance: ${result.paidAvailable}`);

      // Send Telegram confirmation to user
      if (appConfig.telegram.botToken) {
        try {
          const bot = new Telegraf(appConfig.telegram.botToken);
          await bot.telegram.sendMessage(
            userId,
            `🎉 <b>Payment Successful!</b>\n\n` +
            `Your payment of ₹5 was received successfully.\n` +
            `<b>20 search requests</b> have been added to your balance!\n\n` +
            `<i>Use /usage anytime to view your updated quota.</i>`,
            { parse_mode: "HTML" }
          );
        } catch (tgErr: any) {
          console.error(`Failed to send Telegram notification to user ${userId}:`, tgErr?.message || tgErr);
        }
      }

      return res.status(200).json({ status: "ok", credited: 20, userId });
    } catch (error: any) {
      console.error("Error processing quota credit:", error);
      return res.status(500).json({ status: "error", message: error?.message || error });
    }
  }

  // Acknowledge other webhook events without error
  return res.status(200).json({ status: "event_ignored", event: eventName });
};

export default handler;
