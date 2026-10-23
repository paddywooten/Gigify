import { NextRequest, NextResponse } from "next/server";
import {
  STATE_COOKIE,
  decodeState,
  exchangeCode,
  fetchGoogleUser,
  getGoogleConfig,
} from "@/server/auth/google";
import { loginWithGoogle } from "@/server/services/auth-service";
import { setSessionCookie } from "@/server/auth/session";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Sends the browser back to /login with a machine-readable error code. */
function fail(origin: string, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin), 307);
}

/**
 * GET: OAuth callback — validate state, exchange the code, sign the user in.
 * On success: session cookie set, redirect to the requested (safe) path.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  const sp = req.nextUrl.searchParams;

  const code = sp.get("code");
  if (sp.get("error") || !code) return fail(origin, "google_denied");

  // State must match the cookie we issued to this browser (CSRF protection).
  const cookie = req.cookies.get(STATE_COOKIE)?.value;
  const stateParam = sp.get("state");
  const payload = decodeState(cookie);
  if (!cookie || !payload || !stateParam || cookie !== stateParam) {
    return fail(origin, "google_state");
  }

  if (!getGoogleConfig()) return fail(origin, "google_unconfigured");

  try {
    const accessToken = await exchangeCode(code, origin);
    const googleUser = await fetchGoogleUser(accessToken);

    if (googleUser.email_verified === false) return fail(origin, "google_email");

    const { token } = await loginWithGoogle(
      {
        sub: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name?.trim() || googleUser.email.split("@")[0],
        picture: googleUser.picture ?? null,
      },
      payload.r,
    );

    const res = NextResponse.redirect(new URL(payload.n, origin), 307);
    setSessionCookie(res, token);
    // One-shot state: clear it so the link can't be replayed.
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/v1/auth/google",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof ApiError && err.message.toLowerCase().includes("suspended")) {
      return fail(origin, "google_suspended");
    }
    if (err instanceof ApiError && err.status === 400) {
      // loginWithGoogle validation (e.g. missing email) — profile-level problem.
      return fail(origin, "google_email");
    }
    console.warn("[auth] google callback failed:", err instanceof Error ? err.message : err);
    return fail(origin, "google_exchange");
  }
}
