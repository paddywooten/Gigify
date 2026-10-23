// Google OAuth 2.0 (authorization-code flow) for "Sign in with Google".
//
// Flow:
//   1. GET /api/v1/auth/google        → sets a short-lived state cookie, 307 → Google
//   2. GET /api/v1/auth/google/callback?code&state
//        → validates state, exchanges the code server-side, loads the user's
//          profile from Google's userinfo endpoint, finds/creates the account,
//          starts a Gigify session, and redirects into the app.
//
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (optional GOOGLE_REDIRECT_URI
// to override the derived callback URL behind a proxy/custom domain).

import { randomBytes } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export const STATE_COOKIE = "gigify_gstate";
const STATE_TTL_SECONDS = 600;

export type GoogleConfig = { clientId: string; clientSecret: string };

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Explicit env wins (production); otherwise derive from the request origin. */
export function redirectUri(origin: string): string {
  const override = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (override) return override;
  return `${origin.replace(/\/$/, "")}/api/v1/auth/google/callback`;
}

export type StatePayload = {
  s: string; // opaque anti-CSRF nonce, echoed by Google and stored in a cookie
  r: "MUSICIAN" | "CLIENT" | null; // role hint for brand-new accounts
  n: string; // post-login path
};

/** Only allow same-site paths — never protocol-relative or external URLs. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (!/^[a-zA-Z0-9/_-]+$/.test(raw)) return "/dashboard";
  return raw;
}

export function newStatePayload(role?: string | null, next?: string | null): StatePayload {
  return {
    s: randomBytes(24).toString("base64url"),
    r: role === "MUSICIAN" || role === "CLIENT" ? role : null,
    n: safeNextPath(next),
  };
}

export function encodeState(payload: StatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeState(value: string | null | undefined): StatePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as StatePayload;
    if (typeof parsed?.s !== "string" || typeof parsed?.n !== "string") return null;
    return { s: parsed.s, r: parsed.r ?? null, n: safeNextPath(parsed.n) };
  } catch {
    return null;
  }
}

export function buildAuthUrl(cfg: GoogleConfig, origin: string, payload: StatePayload): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state: encodeState(payload),
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/v1/auth/google",
    maxAge: STATE_TTL_SECONDS,
  };
}

/** Server-side code exchange → Google access token. Throws on failure. */
export async function exchangeCode(code: string, origin: string): Promise<string> {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error("Google sign-in is not configured.");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status}).`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google token exchange returned no access_token.");
  return data.access_token;
}

export type GoogleUser = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/** Loads the verified profile for an access token. Throws on failure. */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo request failed (HTTP ${res.status}).`);
  const data = (await res.json()) as GoogleUser;
  if (!data?.sub || !data?.email) throw new Error("Google userinfo response was incomplete.");
  return data;
}
