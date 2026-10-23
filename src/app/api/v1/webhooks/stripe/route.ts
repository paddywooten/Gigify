// Stripe webhook: payment_intent.succeeded flips bookings to FUNDED.
// Auth = stripe-signature verification (no session). Requires
// STRIPE_WEBHOOK_SECRET (from `stripe listen` or the dashboard endpoint).

import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { ApiError } from "@/server/errors";
import { verifyStripeSignature } from "@/server/payments/stripe";
import { settleFundedBooking } from "@/server/services/webhook-service";

export const dynamic = "force-dynamic";

type StripeEvent = {
  type?: string;
  data?: { object?: { id?: string; amount?: number; metadata?: { bookingId?: string } } };
};

export const POST = handle(async (req: NextRequest) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("Stripe webhook secret not configured.", 503);

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(payload, signature, secret)) {
    throw new ApiError("Invalid Stripe signature.", 401);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ApiError("Malformed webhook payload.", 400);
  }

  if (event.type === "payment_intent.succeeded") {
    const obj = event.data?.object;
    await settleFundedBooking({
      bookingId: obj?.metadata?.bookingId,
      provider: "stripe",
      providerRef: obj?.id ?? "",
      expectedAmountCents: obj?.amount,
    });
  }

  return json({ received: true });
});
