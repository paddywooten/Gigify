import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { listMusicians } from "@/server/services/musician-service";
import { paginationFrom } from "@/server/services/helpers";

export const dynamic = "force-dynamic";

/** GET: public musician directory with filters. */
export const GET = handle(async (req: NextRequest) => {
  const { page, limit } = paginationFrom(req);
  const sp = req.nextUrl.searchParams;
  return json(
    await listMusicians({
      search: sp.get("search") || undefined,
      genre: sp.get("genre") || undefined,
      instrument: sp.get("instrument") || undefined,
      maxRateCents: sp.get("maxRateCents") ? Number(sp.get("maxRateCents")) : undefined,
      availableOnly: sp.get("availableOnly") === "true",
      page,
      limit,
    }),
  );
});
