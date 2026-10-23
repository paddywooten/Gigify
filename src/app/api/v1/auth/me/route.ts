import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { getSessionUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  if (!user) return json({ user: null }, { status: 401 });
  return json(user);
});
