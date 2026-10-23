import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { listGigsForAdmin } from "@/server/services/admin-service";
import { paginationFrom } from "@/server/services/helpers";

export const dynamic = "force-dynamic";

/** GET: admin moderation list of every gig (filterable by status). */
export const GET = handle(async (req: NextRequest) => {
  await requireUser(req, ["ADMIN"]);
  const { page, limit } = paginationFrom(req);
  const sp = req.nextUrl.searchParams;
  return json(
    await listGigsForAdmin({
      status: sp.get("status") || undefined,
      page,
      limit,
    }),
  );
});
