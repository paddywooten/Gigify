// Webhook-driven settlement: idempotently flips a booking to FUNDED when a
// provider confirms a successful charge out-of-band. Used by the Stripe and
// Paystack webhook routes; safe to call more than once (status-guarded).

import { prisma } from "@/server/db";
import { notify } from "./notification-service";
import { tryEnsureContract } from "./contract-service";
import { formatMoney } from "@/lib/format";

export type SettleOutcome = "SETTLED" | "ALREADY_SETTLED" | "IGNORED";

export async function settleFundedBooking(input: {
  bookingId?: string | null;
  provider: string;
  providerRef: string;
  /** Smallest-unit amount reported by the provider (cents/kobo) — must match the booking. */
  expectedAmountCents?: number;
}): Promise<SettleOutcome> {
  if (!input.bookingId) {
    console.warn(`[webhooks] ${input.provider} event without bookingId (ref=${input.providerRef})`);
    return "IGNORED";
  }

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { gig: { select: { title: true } } },
  });
  if (!booking) {
    console.warn(`[webhooks] ${input.provider} event for unknown booking ${input.bookingId}`);
    return "IGNORED";
  }
  if (
    input.expectedAmountCents !== undefined &&
    input.expectedAmountCents !== booking.totalCents
  ) {
    console.warn(
      `[webhooks] ${input.provider} amount mismatch for booking ${booking.id}: ` +
        `got ${input.expectedAmountCents}, expected ${booking.totalCents}`,
    );
    return "IGNORED";
  }
  if (booking.status !== "PENDING_FUNDING") return "ALREADY_SETTLED";

  const fundedAt = new Date();
  const changed = await prisma.$transaction(async (tx) => {
    // Claim the transition first so concurrent webhook/confirm races settle once.
    const claimed = await tx.booking.updateMany({
      where: { id: booking.id, status: "PENDING_FUNDING" },
      data: { status: "FUNDED", fundedAt },
    });
    if (claimed.count === 0) return false;
    await tx.payment.updateMany({
      where: {
        bookingId: booking.id,
        provider: input.provider,
        providerRef: input.providerRef,
        status: "PENDING",
      },
      data: { status: "SUCCEEDED" },
    });
    return true;
  });

  if (!changed) return "ALREADY_SETTLED";

  await notify({
    userId: booking.musicianId,
    type: "BOOKING_FUNDED",
    title: "Funds are secured in escrow 💰",
    body: `Escrow funding for “${booking.gig.title}” confirmed (${formatMoney(booking.totalCents)}). You'll be paid ${formatMoney(booking.musicianPayoutCents)} after the gig is completed.`,
    link: `/bookings/${booking.id}`,
  });
  await tryEnsureContract(booking.id);
  return "SETTLED";
}
