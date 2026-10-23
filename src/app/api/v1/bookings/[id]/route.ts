import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { getBooking } from "@/server/services/booking-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  return json(await getBooking(params.id, user));
});
