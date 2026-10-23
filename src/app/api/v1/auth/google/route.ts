import { NextRequest, NextResponse } from "next/server";
import {
  STATE_COOKIE,
  buildAuthUrl,
  encodeState,
  getGoogleConfig,
  newStatePayload,
  stateCookieOptions,
} from "@/server/auth/google";

export const dynamic = "force-dynamic";

/**
 * GET: start "Sign in with Google".
 * Query: `role` (MUSICIAN | CLIENT — only used for brand-new accounts),
 *        `next` (path to return to after signing in).
 * Unconfigured deployments are redirected back with a friendly error instead
 * of a raw 500, so the UI can explain what's missing.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = getGoogleConfig();
  if (!cfg) {
    return NextResponse.redirect(
      new URL("/login?error=google_unconfigured", req.nextUrl.origin),
      307,
    );
  }

  const sp = req.nextUrl.searchParams;
  const payload = newStatePayload(sp.get("role"), sp.get("next"));
  const authUrl = buildAuthUrl(cfg, req.nextUrl.origin, payload);

  const res = NextResponse.redirect(authUrl, 307);
  res.cookies.set(STATE_COOKIE, encodeState(payload), stateCookieOptions());
  return res;
}
