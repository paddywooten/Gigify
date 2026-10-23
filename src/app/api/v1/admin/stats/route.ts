import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { getAdminStats } from "@/server/services/admin-service";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  await requireUser(req, ["ADMIN"]);
  return json(await getAdminStats());
});
