import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { getSettings, updateSettings } from "@/server/services/settings-service";
import { settingsUpdateSchema } from "@/server/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  await requireUser(req, ["ADMIN"]);
  return json(await getSettings());
});

export const PATCH = handle(async (req: NextRequest) => {
  await requireUser(req, ["ADMIN"]);
  const input = parseBody(settingsUpdateSchema, await req.json());
  return json(await updateSettings(input));
});
