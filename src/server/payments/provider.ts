// Payment provider abstraction. The booking flow never talks to a specific
// provider directly — swap `mock` for `stripe` in production by implementing
// StripePaymentProvider (see roadmap in README).

export type ChargeInput = {
  amountCents: number;
  bookingId: string;
  payerUserId: string;
  description: string;
};

export type PayoutInput = {
  amountCents: number;
  bookingId: string;
  payeeUserId: string;
  description: string;
};

export type RefundInput = {
  amountCents: number;
  bookingId: string;
  description: string;
};

export type PaymentResult = {
  success: boolean;
  provider: string;
  providerRef: string;
  failureReason?: string;
};

export interface PaymentProvider {
  readonly name: string;
  charge(input: ChargeInput): Promise<PaymentResult>;
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

  async charge(input: ChargeInput): Promise<PaymentResult> {
    return {
      success: true,
      provider: this.name,
      providerRef: ref(`ch_${input.bookingId.slice(-6)}`),
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

/**
 * Stub for the real Stripe integration. Kept explicit so that switching
 * PAYMENT_PROVIDER=stripe fails loudly until it is implemented.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  private fail(): never {
    throw new Error(
      "StripePaymentProvider is not implemented yet. Set PAYMENT_PROVIDER=mock for development, " +
        "or implement PaymentIntents/Payouts in src/server/payments/provider.ts.",
    );
  }

  charge(): Promise<PaymentResult> {
    return this.fail();
  }
  payout(): Promise<PaymentResult> {
    return this.fail();
  }
  refund(): Promise<PaymentResult> {
    return this.fail();
  }
}

export function getPaymentProvider(): PaymentProvider {
  const which = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  if (which === "stripe") return new StripePaymentProvider();
  return new MockPaymentProvider();
}
