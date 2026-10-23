import { NextRequest } from "next/server";
import { created, handle, json, parseBody } from "@/server/http";
import { applicationCreateSchema } from "@/server/validation/schemas";
import { applyToGig, listApplicationsForGig } from "@/server/services/application-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET: applications for a gig (organizer/admin only). */
export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  return json({ items: await listApplicationsForGig(user, params.id) });
});

/** POST: musician applies to a gig. */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req, ["MUSICIAN"]);
  const input = parseBody(applicationCreateSchema, await req.json());
  return created(await applyToGig(user, params.id, input));
});
