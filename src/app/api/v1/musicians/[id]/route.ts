import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { getMusicianProfile } from "@/server/services/musician-service";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** GET: a public musician profile with reviews. */
export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  return json(await getMusicianProfile(params.id));
});
