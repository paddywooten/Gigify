// Stripe implementation of PaymentProvider against the plain REST API
// (no SDK dependency — keeps the surface small and fully mockable in tests).
//
// Escrow model (separate charges & transfers):
//   fund:    PaymentIntent charge held on the platform balance
//   payout:  Transfer to the musician's connected account after completion
//   dispute: Refund of the original PaymentIntent
//
// Configure with STRIPE_SECRET_KEY (test keys: sk_test_...). The frontend
// client-action step (Stripe Payment Element) activates once
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY exists — until then, only `mock` runs.

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ChargeInput,
  ChargeResult,
  ClientAction,
  ConfirmChargeInput,
  Currency,
  PaymentProvider,
  PaymentResult,
  PayoutInput,
  RefundInput,
} from "./provider";
import { getJson, postForm, type FetchLike } from "./rest";

const STRIPE_API = "https://api.stripe.com/v1";

export type StripeConfig = {
  secretKey?: string;
  currency?: Currency;
  fetchFn?: FetchLike;
};

type StripePaymentIntent = {
  id: string;
  status: string;
  client_secret?: string;
  amount?: number;
  last_payment_error?: { message?: string } | null;
};

type StripeTransfer = { id: string; status?: string };
type StripeRefund = { id: string; status?: string };

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly defaultCurrency: Currency;

  private secretKey?: string;
  private fetchFn?: FetchLike;

  constructor(cfg: StripeConfig) {
    this.secretKey = cfg.secretKey;
    this.defaultCurrency = (cfg.currency ?? "usd").toLowerCase();
    this.fetchFn = cfg.fetchFn;
  }

  private notConfigured(): PaymentResult {
    return {
      success: false,
      provider: this.name,
      providerRef: "pi_unconfigured",
      failureReason:
        "Stripe is not configured. Set STRIPE_SECRET_KEY (test mode) or keep PAYMENT_PROVIDER=mock for development.",
    };
  }

  private async post(path: string, fields: Record<string, string | number | undefined>, idempotencyKey?: string) {
    if (!this.secretKey) throw new Error("Stripe secret key missing.");
    return (await postForm(`${STRIPE_API}${path}`, {
      bearer: this.secretKey,
      fields,
      fetchFn: this.fetchFn,
      idempotencyKey,
    })) as unknown;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.secretKey) {
      return { status: "FAILED", provider: this.name, providerRef: "pi_unconfigured", failureReason: this.notConfigured().failureReason };
    }
    try {
      const pi = (await this.post(
        "/payment_intents",
        {
          amount: input.amountCents,
          currency: input.currency,
          description: input.description,
          transfer_group: input.bookingId,
          "metadata[bookingId]": input.bookingId,
          "metadata[payerUserId]": input.payerUserId,
          "metadata[platform]": "gigify",
          "automatic_payment_methods[enabled]": "true",
        },
        `gigify:charge:${input.bookingId}`,
      )) as StripePaymentIntent;

      if (pi.status === "succeeded") {
        return { status: "SUCCEEDED", provider: this.name, providerRef: pi.id };
      }
      const clientAction: ClientAction = {
        kind: "stripe_payment_element",
        clientSecret: pi.client_secret ?? "",
      };
      return { status: "PENDING", provider: this.name, providerRef: pi.id, clientAction };
    } catch (err) {
      return {
        status: "FAILED",
        provider: this.name,
        providerRef: "pi_error",
        failureReason: err instanceof Error ? err.message : "Stripe charge failed.",
      };
    }
  }

  async confirmCharge(input: ConfirmChargeInput): Promise<PaymentResult> {
    if (!this.secretKey) return this.notConfigured();
    try {
      const pi = (await getJson(
        `${STRIPE_API}/payment_intents/${encodeURIComponent(input.providerRef)}`,
        { bearer: this.secretKey, fetchFn: this.fetchFn },
      )) as StripePaymentIntent;

      if (pi.status === "succeeded") {
        if (pi.amount !== undefined && pi.amount !== input.expectedAmountCents) {
          return {
            success: false,
            provider: this.name,
            providerRef: pi.id,
            failureReason: "Payment amount does not match the booking total.",
          };
        }
        return { success: true, provider: this.name, providerRef: pi.id };
      }
      return {
        success: false,
        provider: this.name,
        providerRef: pi.id,
        failureReason:
          pi.last_payment_error?.message ??
          `Payment not completed (Stripe status: ${pi.status}).`,
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        providerRef: input.providerRef,
        failureReason: err instanceof Error ? err.message : "Could not verify payment.",
      };
    }
  }

  async payout(input: PayoutInput): Promise<PaymentResult> {
    if (!this.secretKey) return this.notConfigured();
    const destination = input.destinationAccount ?? process.env.STRIPE_DEFAULT_DESTINATION;
    if (!destination) {
      return {
        success: false,
        provider: this.name,
        providerRef: "tr_none",
        failureReason:
          "Musician has no Stripe payout account. Complete Stripe Connect onboarding (or set STRIPE_DEFAULT_DESTINATION for test mode).",
      };
    }
    try {
      const transfer = (await this.post(
        "/transfers",
        {
          amount: input.amountCents,
          currency: input.currency,
          destination,
          transfer_group: input.bookingId,
          description: input.description,
        },
        `gigify:payout:${input.bookingId}`,
      )) as StripeTransfer;
      return { success: true, provider: this.name, providerRef: transfer.id };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        providerRef: "tr_error",
        failureReason: err instanceof Error ? err.message : "Stripe payout failed.",
      };
    }
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    if (!this.secretKey) return this.notConfigured();
    if (!input.originalRef) {
      return {
        success: false,
        provider: this.name,
        providerRef: "re_none",
        failureReason: "Original charge reference missing — cannot refund.",
      };
    }
    try {
      const refund = (await this.post(
        "/refunds",
        {
          amount: input.amountCents,
          currency: input.currency,
          payment_intent: input.originalRef,
          reason: "requested_by_customer",
          "metadata[bookingId]": input.bookingId,
        },
        `gigify:refund:${input.bookingId}`,
      )) as StripeRefund;
      return { success: true, provider: this.name, providerRef: refund.id };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        providerRef: "re_error",
        failureReason: err instanceof Error ? err.message : "Stripe refund failed.",
      };
    }
  }
}

/**
 * Verifies a `stripe-signature` webhook header (t=...,v1=...) against the raw
 * payload using constant-time comparison and a freshness window.
 */
export function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): boolean {
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.nowSec ?? Date.now() / 1000;

  const parts = header.split(",").map((p) => p.split("="));
  const timestamp = parts.find((p) => p[0] === "t")?.[1];
  const signatures = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(now - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig ?? "", "utf8");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
