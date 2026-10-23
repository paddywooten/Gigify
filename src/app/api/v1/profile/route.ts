import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { profileUpdateSchema } from "@/server/validation/schemas";
import { getProfile, updateProfile } from "@/server/services/auth-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** GET: the signed-in user's full profile (for the settings form). */
export const GET = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  return json(await getProfile(user.id));
});

/** PATCH: update the signed-in user's profile (both role-specific parts). */
export const PATCH = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  const input = parseBody(profileUpdateSchema, await req.json());
  return json(await updateProfile(user.id, input));
});
