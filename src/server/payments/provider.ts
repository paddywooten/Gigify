// Payment provider abstraction. The booking flow never talks to a specific
// provider directly — swap `mock` for `stripe` or `paystack` in production by
// setting PAYMENT_PROVIDER. All providers are pure (no DB access): callers
// resolve payout destinations and persist Payment rows.

import { StripePaymentProvider } from "./stripe";
import { PaystackPaymentProvider } from "./paystack";

export type Currency = string; // ISO-4217, lowercase ("usd", "ngn", ...)

export type ChargeInput = {
  amountCents: number;
  bookingId: string;
  payerUserId: string;
  payerEmail: string;
  description: string;
  currency: Currency;
};

export type PayoutInput = {
  amountCents: number;
  bookingId: string;
  payeeUserId: string;
  /** Stripe Connect account id / Paystack transfer recipient code, resolved by the caller. */
  destinationAccount?: string;
  description: string;
  currency: Currency;
};

export type RefundInput = {
  amountCents: number;
  bookingId: string;
  /** providerRef of the original successful funding charge. */
  originalRef?: string;
  description: string;
  currency: Currency;
};

/** Data a real provider needs the frontend to act on (card entry, etc.). */
export type ClientAction =
  | { kind: "stripe_payment_element"; clientSecret: string }
  | {
      kind: "paystack_inline";
      reference: string;
      email: string;
      amountCents: number;
      currency: Currency;
      publicKey?: string;
    };

export type PaymentResult = {
  success: boolean;
  provider: string;
  providerRef: string;
  failureReason?: string;
};

/** charge() may finish instantly (mock) or pend until the payer completes a client action. */
export type ChargeResult = {
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  provider: string;
  providerRef: string;
  failureReason?: string;
  clientAction?: ClientAction;
};

export type ConfirmChargeInput = {
  bookingId: string;
  providerRef: string;
  expectedAmountCents: number;
};

export interface PaymentProvider {
  readonly name: string;
  readonly defaultCurrency: Currency;
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Verifies with the provider whether a pending charge actually succeeded. */
  confirmCharge(input: ConfirmChargeInput): Promise<PaymentResult>;
  payout(input: PayoutInput): Promise<PaymentResult>;
  refund(input: RefundInput): Promise<PaymentResult>;
}

function ref(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Development/test provider: simulates instant, always-successful money movement.
 * Payouts are capped by the caller (booking service) — no real money moves here.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly defaultCurrency: Currency = "usd";

  async charge(input: ChargeInput): Promise<ChargeResult> {
    return {
      status: "SUCCEEDED",
      provider: this.name,
      providerRef: ref(`ch_${input.bookingId.slice(-6)}`),
    };
  }

  async confirmCharge(input: ConfirmChargeInput): Promise<PaymentResult> {
    return {
      success: true,
      provider: this.name,
      providerRef: input.providerRef,
    };
  }

  async payout(input: PayoutInput): Promise<PaymentResult> {
    return {
      success: true,
      provider: this.name,
      providerRef: ref(`po_${input.bookingId.slice(-6)}`),
    };
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    return {
      success: true,
      provider: this.name,
      providerRef: ref(`re_${input.bookingId.slice(-6)}`),
    };
  }
}

// --- Provider selection -----------------------------------------------------

let providerOverride: PaymentProvider | null = null;

/** Test hook: inject a provider (or pass null to restore env-based selection). */
export function setPaymentProviderForTests(provider: PaymentProvider | null): void {
  providerOverride = provider;
}

export function getPaymentProvider(): PaymentProvider {
  if (providerOverride) return providerOverride;
  const which = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  switch (which) {
    case "mock":
      return new MockPaymentProvider();
    case "stripe":
      return new StripePaymentProvider({
        secretKey: process.env.STRIPE_SECRET_KEY,
      });
    case "paystack":
      return new PaystackPaymentProvider({
        secretKey: process.env.PAYSTACK_SECRET_KEY,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      });
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${process.env.PAYMENT_PROVIDER}". Use "mock", "stripe" or "paystack".`,
      );
  }
}

/** Platform currency: env override, else the provider's native default. */
export function platformCurrency(provider: PaymentProvider): Currency {
  return (process.env.PLATFORM_CURRENCY ?? provider.defaultCurrency).toLowerCase();
}
