import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { adminCancelGig } from "@/server/services/admin-service";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: moderation takedown — cancels an OPEN gig and rejects its pending applications. */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const admin = await requireUser(req, ["ADMIN"]);
  return json(await adminCancelGig(admin, params.id));
});
