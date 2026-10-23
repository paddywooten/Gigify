import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { gigUpdateSchema } from "@/server/validation/schemas";
import { getGig, updateGig } from "@/server/services/gig-service";
import { getSessionUser, requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await getSessionUser(req);
  return json(await getGig(params.id, user));
});

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req, ["CLIENT", "ADMIN"]);
  const input = parseBody(gigUpdateSchema, await req.json());
  return json(await updateGig(user, params.id, input));
});
