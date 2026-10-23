import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { bookingActionSchema } from "@/server/validation/schemas";
import { transitionBooking } from "@/server/services/booking-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: lifecycle transitions — START / COMPLETE / CANCEL / DISPUTE. */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  const { action, reason } = parseBody(bookingActionSchema, await req.json());
  return json(await transitionBooking(user, params.id, action, reason));
});
