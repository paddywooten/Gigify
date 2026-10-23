import { NextRequest, NextResponse } from "next/server";
import { created, handle, parseBody } from "@/server/http";
import { registerSchema } from "@/server/validation/schemas";
import { register } from "@/server/services/auth-service";
import { setSessionCookie } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const input = parseBody(registerSchema, await req.json());
  const { user, token } = await register(input);

  const res = created({ user });
  setSessionCookie(res, token);
  return res;
});
