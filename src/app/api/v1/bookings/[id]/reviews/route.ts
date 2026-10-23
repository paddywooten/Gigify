import { NextRequest } from "next/server";
import { created, handle, parseBody } from "@/server/http";
import { reviewSchema } from "@/server/validation/schemas";
import { createReview } from "@/server/services/review-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: leave a review for a completed booking. */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  const input = parseBody(reviewSchema, await req.json());
  return created(await createReview(user, params.id, input));
});
