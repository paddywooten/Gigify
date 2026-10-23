import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { listBookings } from "@/server/services/booking-service";
import { requireUser } from "@/server/auth/session";
import { paginationFrom } from "@/server/services/helpers";
import { BOOKING_STATUSES } from "@/lib/constants";
import { badRequest } from "@/server/errors";

export const dynamic = "force-dynamic";

/** GET: bookings the signed-in user is party to (or all, for admins). */
export const GET = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  const { page, limit } = paginationFrom(req);
  const status = req.nextUrl.searchParams.get("status") || undefined;
  if (status && !BOOKING_STATUSES.includes(status as (typeof BOOKING_STATUSES)[number])) {
    throw badRequest("Unknown booking status filter.");
  }
  return json(await listBookings(user, { page, limit, status }));
});
