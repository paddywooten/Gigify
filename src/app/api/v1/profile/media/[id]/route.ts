import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { deleteMedia } from "@/server/services/media-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** DELETE: remove one of the signed-in musician's portfolio files. */
export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser(req, ["MUSICIAN"]);
  await deleteMedia(user, params.id);
  return json({ ok: true });
});
