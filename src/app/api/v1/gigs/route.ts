import { NextRequest } from "next/server";
import { created, handle, json, parseBody } from "@/server/http";
import { gigInputSchema } from "@/server/validation/schemas";
import { createGig, gigListParamsFrom, listGigs } from "@/server/services/gig-service";
import { getSessionUser, requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const user = await getSessionUser(req);
  const params = gigListParamsFrom(req);
  return json(await listGigs(params, user));
});

export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser(req, ["CLIENT", "ADMIN"]);
  const input = parseBody(gigInputSchema, await req.json());
  return created(await createGig(user, input));
});
