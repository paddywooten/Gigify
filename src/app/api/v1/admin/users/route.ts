import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { listUsers } from "@/server/services/admin-service";
import { paginationFrom } from "@/server/services/helpers";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  await requireUser(req, ["ADMIN"]);
  const { page, limit } = paginationFrom(req);
  const sp = req.nextUrl.searchParams;
  return json(
    await listUsers({
      search: sp.get("search") || undefined,
      role: sp.get("role") || undefined,
      page,
      limit,
    }),
  );
});
