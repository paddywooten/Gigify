import { NextRequest, NextResponse } from "next/server";
import { handle, json, parseBody } from "@/server/http";
import { loginSchema } from "@/server/validation/schemas";
import { login } from "@/server/services/auth-service";
import { setSessionCookie } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const input = parseBody(loginSchema, await req.json());
  const { user, token } = await login(input);

  const res = NextResponse.json({ user });
  setSessionCookie(res, token);
  return res;
});
