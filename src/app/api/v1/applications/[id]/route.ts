import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { applicationDecisionSchema } from "@/server/validation/schemas";
import { decideOnApplication } from "@/server/services/application-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** PATCH: ACCEPT/REJECT (organizer) or WITHDRAW (musician). */
export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  const { action } = parseBody(applicationDecisionSchema, await req.json());
  return json(await decideOnApplication(user, params.id, action));
});
