import { describe, expect, it } from "vitest";
import {
  computeCommission,
  parseCommissionRate,
  MAX_COMMISSION_RATE,
} from "@/server/domain/commission";
import { ApiError } from "@/server/errors";
import { DEFAULT_COMMISSION_RATE } from "@/lib/constants";

describe("computeCommission", () => {
  it("splits a round total at 15%", () => {
    const split = computeCommission(100_000, 0.15);
    expect(split.platformFeeCents).toBe(15_000);
    expect(split.musicianPayoutCents).toBe(85_000);
  });

  it("always makes fee + payout equal the total (no lost cents)", () => {
    const rates = [0, 0.05, 0.1, 0.15, 0.175, 0.33, 0.5];
    for (const rate of rates) {
      for (const total of [500, 999, 1001, 33_333, 100_000, 123_457, 1_000_000]) {
        const split = computeCommission(total, rate);
        expect(split.platformFeeCents + split.musicianPayoutCents).toBe(total);
        expect(split.platformFeeCents).toBeGreaterThanOrEqual(0);
        expect(split.musicianPayoutCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rounds the platform fee half-up", () => {
    // 100001 * 0.15 = 15000.15 -> 15000
    expect(computeCommission(100_001, 0.15).platformFeeCents).toBe(15_000);
    // 99999 * 0.15 = 14999.85 -> 15000
    expect(computeCommission(99_999, 0.15).platformFeeCents).toBe(15_000);
  });

  it("supports a zero commission", () => {
    const split = computeCommission(50_000, 0);
    expect(split.platformFeeCents).toBe(0);
    expect(split.musicianPayoutCents).toBe(50_000);
  });

  it("supports the maximum commission rate", () => {
    const split = computeCommission(100_000, MAX_COMMISSION_RATE);
    expect(split.platformFeeCents).toBe(50_000);
    expect(split.musicianPayoutCents).toBe(50_000);
  });

  it("rejects non-positive or non-integer totals", () => {
    expect(() => computeCommission(0, 0.15)).toThrow(ApiError);
    expect(() => computeCommission(-100, 0.15)).toThrow(ApiError);
    expect(() => computeCommission(100.5, 0.15)).toThrow(ApiError);
  });

  it("rejects out-of-range rates", () => {
    expect(() => computeCommission(10_000, 0.6)).toThrow(ApiError);
    expect(() => computeCommission(10_000, -0.1)).toThrow(ApiError);
  });
});

describe("parseCommissionRate", () => {
  it("falls back to the default for missing or garbage values", () => {
    expect(parseCommissionRate(null)).toBe(DEFAULT_COMMISSION_RATE);
    expect(parseCommissionRate(undefined)).toBe(DEFAULT_COMMISSION_RATE);
    expect(parseCommissionRate("")).toBe(DEFAULT_COMMISSION_RATE);
    expect(parseCommissionRate("not-a-number")).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("parses valid stored values", () => {
    expect(parseCommissionRate("0.2")).toBe(0.2);
    expect(parseCommissionRate("0")).toBe(0);
    expect(parseCommissionRate("0.5")).toBe(0.5);
  });

  it("throws for out-of-range stored values", () => {
    expect(() => parseCommissionRate("0.9")).toThrow(ApiError);
  });
});
