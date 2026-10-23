import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { badRequest } from "@/server/errors";
import { listOwnMedia, uploadMedia } from "@/server/services/media-service";
import { requireUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** GET: the signed-in musician's uploaded portfolio media. */
export const GET = handle(async (req: NextRequest) => {
  const user = await requireUser(req, ["MUSICIAN"]);
  return json({ items: await listOwnMedia(user) });
});

/**
 * POST: upload one portfolio file (multipart/form-data with a `file` field and
 * optional `title` text field).
 */
export const POST = handle(async (req: NextRequest) => {
  const user = await requireUser(req, ["MUSICIAN"]);

  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Expected multipart/form-data with a \"file\" field.");
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw badRequest("Attach a file under the \"file\" field.");
  }
  const title = form.get("title");
  const data = Buffer.from(await file.arrayBuffer());

  const asset = await uploadMedia(user, {
    mimeType: file.type || "application/octet-stream",
    data,
    title: typeof title === "string" ? title : null,
  });
  return json(asset, { status: 201 });
});
