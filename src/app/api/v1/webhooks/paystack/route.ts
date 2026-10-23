// Paystack webhook: charge.success flips bookings to FUNDED.
// Auth = x-paystack-signature verification (HMAC-SHA512 of raw body).
// Requires PAYSTACK_WEBHOOK_SECRET (the secret hash you set on the dashboard).

import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { ApiError } from "@/server/errors";
import { verifyPaystackSignature } from "@/server/payments/paystack";
import { settleFundedBooking } from "@/server/services/webhook-service";

export const dynamic = "force-dynamic";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    metadata?: { bookingId?: string };
  };
};

export const POST = handle(async (req: NextRequest) => {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("Paystack webhook secret not configured.", 503);

  const payload = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  if (!verifyPaystackSignature(payload, signature, secret)) {
    throw new ApiError("Invalid Paystack signature.", 401);
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(payload) as PaystackEvent;
  } catch {
    throw new ApiError("Malformed webhook payload.", 400);
  }

  if (event.event === "charge.success") {
    const data = event.data;
    await settleFundedBooking({
      bookingId: data?.metadata?.bookingId,
      provider: "paystack",
      providerRef: data?.reference ?? "",
      expectedAmountCents: data?.amount,
    });
  }

  return json({ received: true });
});
