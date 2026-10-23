// Platform settings (key/value store) — commission rate + the site-wide
// announcement banner. `currency` is a code-level constant (GHS), exposed
// here so the admin console can display it.

import { prisma } from "@/server/db";
import {
  ANNOUNCEMENT_KEY,
  COMMISSION_RATE_KEY,
  CURRENCY,
  DEFAULT_COMMISSION_RATE,
} from "@/lib/constants";
import { parseCommissionRate } from "@/server/domain/commission";
import type { PlatformSettingsDTO } from "@/lib/types";

async function readKey(key: string): Promise<string | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettings(): Promise<PlatformSettingsDTO> {
  const [rate, announcement] = await Promise.all([
    readKey(COMMISSION_RATE_KEY),
    readKey(ANNOUNCEMENT_KEY),
  ]);
  return {
    commissionRate: parseCommissionRate(rate),
    announcement: announcement ?? "",
    currency: CURRENCY,
  };
}

/** Rate used when creating a new booking (snapshot onto the booking). */
export async function getCurrentCommissionRate(): Promise<number> {
  return (await getSettings()).commissionRate;
}

export async function updateSettings(input: {
  commissionRate: number;
  announcement?: string;
}): Promise<PlatformSettingsDTO> {
  const rate = parseCommissionRate(String(input.commissionRate));
  const announcement = input.announcement?.trim();

  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: COMMISSION_RATE_KEY },
      create: { key: COMMISSION_RATE_KEY, value: String(rate) },
      update: { value: String(rate) },
    }),
    ...(announcement !== undefined
      ? [
          prisma.platformSetting.upsert({
            where: { key: ANNOUNCEMENT_KEY },
            create: { key: ANNOUNCEMENT_KEY, value: announcement },
            update: { value: announcement },
          }),
        ]
      : []),
  ]);

  return getSettings();
}

export { DEFAULT_COMMISSION_RATE };
