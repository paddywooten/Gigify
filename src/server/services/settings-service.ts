// Platform settings (key/value) — currently the commission rate.

import { prisma } from "@/server/db";
import { COMMISSION_RATE_KEY, DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import { parseCommissionRate } from "@/server/domain/commission";
import type { PlatformSettingsDTO } from "@/lib/types";

export async function getSettings(): Promise<PlatformSettingsDTO> {
  const row = await prisma.platformSetting.findUnique({ where: { key: COMMISSION_RATE_KEY } });
  return { commissionRate: parseCommissionRate(row?.value) };
}

/** Rate used when creating a new booking (snapshot onto the booking). */
export async function getCurrentCommissionRate(): Promise<number> {
  return (await getSettings()).commissionRate;
}

export async function updateSettings(input: { commissionRate: number }): Promise<PlatformSettingsDTO> {
  const rate = parseCommissionRate(String(input.commissionRate));
  await prisma.platformSetting.upsert({
    where: { key: COMMISSION_RATE_KEY },
    create: { key: COMMISSION_RATE_KEY, value: String(rate) },
    update: { value: String(rate) },
  });
  return { commissionRate: rate };
}

export { DEFAULT_COMMISSION_RATE };
