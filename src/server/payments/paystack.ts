// Paystack implementation of PaymentProvider against the plain REST API.
// Paystack is the primary gateway for African markets (NGN, GHS, ZAR, KES, USD).
//
// Escrow model:
//   fund:    /transaction/initialize → payer completes Paystack Inline →
//            server confirms via /transaction/verify (amount-checked)
//   payout:  /transfer to the musician's transfer recipient after completion
//   dispute: /refund of the original transaction reference
//
// Configure with PAYSTACK_SECRET_KEY (test mode: sk_test_...). The frontend
// client-action step (Paystack Inline popup) activates once
// NEXT_PUBLIC / PAYSTACK_PUBLIC_KEY exists — until then, only `mock` runs.

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

const PAYSTACK_API = "https://api.paystack.co";

export type PaystackConfig = {
  secretKey?: string;
  publicKey?: string;
  currency?: Currency;
  baseUrl?: string;
  fetchFn?: FetchLike;
};

type PaystackEnvelope = {
  status: boolean;
  message?: string;
  data?: Record<string, unknown> | null;
};

type InitializeData = { access_code: string; authorization_url: string; reference: string };

export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = "paystack";
  readonly defaultCurrency: Currency;

  private secretKey?: string;
  private publicKey?: string;
  private baseUrl: string;
  private fetchFn?: FetchLike;

  constructor(cfg: PaystackConfig) {
    this.secretKey = cfg.secretKey;
    this.publicKey = cfg.publicKey;
    this.defaultCurrency = (cfg.currency ?? "GHS").toLowerCase();
    this.baseUrl = (cfg.baseUrl ?? PAYSTACK_API).replace(/\/$/, "");
    this.fetchFn = cfg.fetchFn;
  }

  private notConfigured(): PaymentResult {
    return {
      success: false,
      provider: this.name,
      providerRef: "paystack_unconfigured",
      failureReason:
        "Paystack is not configured. Set PAYSTACK_SECRET_KEY (test mode) or keep PAYMENT_PROVIDER=mock for development.",
    };
  }

  private async post<T>(path: string, fields: Record<string, string | number | undefined>): Promise<T> {
    if (!this.secretKey) throw new Error("Paystack secret key missing.");
    const envelope = (await postForm(`${this.baseUrl}${path}`, {
      bearer: this.secretKey,
      fields,
      fetchFn: this.fetchFn,
    })) as PaystackEnvelope;
    if (!envelope.status) throw new Error(envelope.message ?? "Paystack request failed.");
    return envelope.data as T;
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.secretKey) throw new Error("Paystack secret key missing.");
    const envelope = (await getJson(`${this.baseUrl}${path}`, {
      bearer: this.secretKey,
      fetchFn: this.fetchFn,
    })) as PaystackEnvelope;
    if (!envelope.status) throw new Error(envelope.message ?? "Paystack request failed.");
    return envelope.data as T;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.secretKey) {
      return {
        status: "FAILED",
        provider: this.name,
        providerRef: "paystack_unconfigured",
        failureReason: this.notConfigured().failureReason,
      };
    }
    try {
      const reference = `gigify-${input.bookingId}-${Date.now().toString(36)}`;
      const data = (await this.post("/transaction/initialize", {
        email: input.payerEmail,
        amount: input.amountCents,
        currency: input.currency.toUpperCase(),
        reference,
        callback_url: undefined, // Inline popup handles the callback; no redirect needed
        metadata: JSON.stringify({
          bookingId: input.bookingId,
          payerUserId: input.payerUserId,
          platform: "gigify",
        }),
      })) as InitializeData;

      const clientAction: ClientAction = {
        kind: "paystack_inline",
        reference: data.reference || reference,
        email: input.payerEmail,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        publicKey: this.publicKey,
      };
      return { status: "PENDING", provider: this.name, providerRef: clientAction.reference, clientAction };
    } catch (err) {
      return {
        status: "FAILED",
        provider: this.name,
        providerRef: "paystack_error",
        failureReason: err instanceof Error ? err.message : "Paystack charge failed.",
      };
    }
  }

  async confirmCharge(input: ConfirmChargeInput): Promise<PaymentResult> {
    if (!this.secretKey) return this.notConfigured();
    try {
      const data = (await this.get(`/transaction/verify/${encodeURIComponent(input.providerRef)}`)) as {
        status?: string;
        amount?: number;
        reference?: string;
        gateway_response?: string;
      };

      if (data.status !== "success") {
        return {
          success: false,
          provider: this.name,
          providerRef: input.providerRef,
          failureReason: `Payment not completed (Paystack status: ${data.status ?? "unknown"}).`,
        };
      }
      if (data.amount !== undefined && data.amount !== input.expectedAmountCents) {
        return {
          success: false,
          provider: this.name,
          providerRef: input.providerRef,
          failureReason: "Payment amount does not match the booking total.",
        };
      }
      return { success: true, provider: this.name, providerRef: input.providerRef };
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
    const recipient = input.destinationAccount ?? process.env.PAYSTACK_DEFAULT_RECIPIENT;
    if (!recipient) {
      return {
        success: false,
        provider: this.name,
        providerRef: "trf_none",
        failureReason:
          "Musician has no Paystack payout recipient. Onboard them via /transferrecipient (or set PAYSTACK_DEFAULT_RECIPIENT for test mode).",
      };
    }
    try {
      const data = (await this.post("/transfer", {
        source: "balance",
        amount: input.amountCents,
        recipient,
        currency: input.currency.toUpperCase(),
        reference: `gigify-payout-${input.bookingId}`,
        reason: input.description.slice(0, 100),
      })) as { reference?: string };
      return { success: true, provider: this.name, providerRef: data.reference ?? `gigify-payout-${input.bookingId}` };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        providerRef: "trf_error",
        failureReason: err instanceof Error ? err.message : "Paystack payout failed.",
      };
    }
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    if (!this.secretKey) return this.notConfigured();
    if (!input.originalRef) {
      return {
        success: false,
        provider: this.name,
        providerRef: "ref_none",
        failureReason: "Original charge reference missing — cannot refund.",
      };
    }
    try {
      const data = (await this.post("/refund", {
        reference: input.originalRef,
        amount: input.amountCents,
      })) as { id?: number | string };
      return {
        success: true,
        provider: this.name,
        providerRef: data.id !== undefined ? String(data.id) : `ref_${input.originalRef}`,
      };
    } catch (err) {
      return {
        success: false,
        provider: this.name,
        providerRef: "ref_error",
        failureReason: err instanceof Error ? err.message : "Paystack refund failed.",
      };
    }
  }
}

/**
 * Verifies Paystack's `x-paystack-signature` header: hex HMAC-SHA512 of the
 * raw request body using the secret key, constant-time compared.
 */
export function verifyPaystackSignature(
  payload: string,
  header: string,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha512", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
