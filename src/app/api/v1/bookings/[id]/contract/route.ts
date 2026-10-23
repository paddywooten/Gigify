import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { getContractForBooking } from "@/server/services/contract-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET: the gig contract for a booking (generated on first read after funding). */
export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  return json(await getContractForBooking(user, params.id));
});
