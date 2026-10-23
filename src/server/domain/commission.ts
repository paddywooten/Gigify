// Commission domain logic — pure functions, fully unit-tested.
// All money is handled as integer cents to avoid floating point drift.

import { DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import { badRequest } from "@/server/errors";

/** Hard bounds for the platform commission rate. */
export const MIN_COMMISSION_RATE = 0;
export const MAX_COMMISSION_RATE = 0.5;

export type CommissionSplit = {
  totalCents: number;
  rate: number;
  platformFeeCents: number;
  musicianPayoutCents: number;
};

/**
 * Splits a gig total between the platform and the musician.
 * The platform fee is rounded half-up; the musician absorbs the rounding
 * remainder so that fee + payout always equals the total exactly.
 */
export function computeCommission(totalCents: number, rate: number): CommissionSplit {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw badRequest("Total must be a positive whole number of cents.");
  }
  if (rate < MIN_COMMISSION_RATE || rate > MAX_COMMISSION_RATE) {
    throw badRequest(
      `Commission rate must be between ${MIN_COMMISSION_RATE} and ${MAX_COMMISSION_RATE}.`,
    );
  }
  const platformFeeCents = Math.round(totalCents * rate);
  return {
    totalCents,
    rate,
    platformFeeCents,
    musicianPayoutCents: totalCents - platformFeeCents,
  };
}

/** Parses/validates a stored commission rate string (e.g. "0.15" from settings). */
export function parseCommissionRate(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_COMMISSION_RATE;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_COMMISSION_RATE;
  if (value < MIN_COMMISSION_RATE || value > MAX_COMMISSION_RATE) {
    throw badRequest(
      `Commission rate must be between ${MIN_COMMISSION_RATE} and ${MAX_COMMISSION_RATE}.`,
    );
  }
  return value;
}
