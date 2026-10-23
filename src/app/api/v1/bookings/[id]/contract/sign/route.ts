import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { signContract } from "@/server/services/contract-service";
import { signContractSchema } from "@/server/validation/schemas";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** POST: a booking party signs the contract (typed signature + audit trail). */
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req);
  const body = parseBody(signContractSchema, await req.json().catch(() => ({})));
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent");
  return json(await signContract(user, params.id, { ...body, ip, userAgent }));
});
