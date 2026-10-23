import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { fundBooking } from "@/server/services/booking-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: client funds the escrow (moves money through the payment provider). */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req, ["CLIENT", "ADMIN"]);
  return json(await fundBooking(user, params.id));
});
