import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { fundBooking } from "@/server/services/booking-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/**
 * POST: client funds the escrow (moves money through the payment provider).
 * Optional body `{ providerRef }` confirms a pending charge for real providers
 * (stripe/paystack) after the card-entry client action completed.
 */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req, ["CLIENT", "ADMIN"]);
  const raw = await req.text().catch(() => "");
  let providerRef: string | undefined;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const value = (parsed as { providerRef?: unknown })?.providerRef;
      if (typeof value === "string" && value.length > 0 && value.length <= 255) {
        providerRef = value;
      }
    } catch {
      /* no/invalid body — treat as an instant-fund call */
    }
  }
  return json(await fundBooking(user, params.id, { providerRef }));
});
