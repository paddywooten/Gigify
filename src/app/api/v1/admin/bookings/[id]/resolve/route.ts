import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { resolveDispute } from "@/server/services/booking-service";
import { disputeResolveSchema } from "@/server/validation/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: admin resolves a disputed booking (payout to musician or refund to client). */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const admin = await requireUser(req, ["ADMIN"]);
  const { outcome } = parseBody(disputeResolveSchema, await req.json());
  return json(await resolveDispute(admin, params.id, outcome));
});
