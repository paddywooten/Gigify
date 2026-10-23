import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { getSettings } from "@/server/services/settings-service";

export const dynamic = "force-dynamic";

/**
 * GET: public page settings — commission rate, announcement banner and
 * currency. All of this is marketing-visible anyway (the fee and currency
 * are shown throughout the UI), so no auth is required.
 */
export const GET = handle(async (_req: NextRequest) => json(await getSettings()));
