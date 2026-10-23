import { NextRequest } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { updateUserByAdmin } from "@/server/services/admin-service";
import { adminUserUpdateSchema } from "@/server/validation/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const PATCH = handle(async (req: NextRequest, { params }: Ctx) => {
  const admin = await requireUser(req, ["ADMIN"]);
  const input = parseBody(adminUserUpdateSchema, await req.json());
  return json(await updateUserByAdmin(admin, params.id, input));
});
