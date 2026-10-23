import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/server/http";
import { clearSessionCookie, destroySession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  await destroySession(req);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
