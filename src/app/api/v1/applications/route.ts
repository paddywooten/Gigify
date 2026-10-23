import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { listMyApplications } from "@/server/services/application-service";
import { requireUser } from "@/server/auth/session";
import { paginationFrom } from "@/server/services/helpers";

export const dynamic = "force-dynamic";

/** GET: the signed-in musician's applications. */
export const GET = handle(async (req: NextRequest) => {
  const user = await requireUser(req, ["MUSICIAN"]);
  const { page, limit } = paginationFrom(req);
  const status = req.nextUrl.searchParams.get("status") || undefined;
  return json(await listMyApplications(user, { page, limit, status }));
});
