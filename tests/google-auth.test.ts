// Google sign-in: OAuth entry redirect, state (CSRF) validation, account
// creation/linking, and the verified-email guard. Google's token + userinfo
// endpoints are fully mocked; everything else runs through the real routes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as entry } from "@/app/api/v1/auth/google/route";
import { GET as callback } from "@/app/api/v1/auth/google/callback/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import {
  STATE_COOKIE,
  encodeState,
  newStatePayload,
  safeNextPath,
} from "@/server/auth/google";
import { prisma } from "@/server/db";
import { cookieFrom, json, makeReq, registerUser } from "./helpers/app";

// --- Env hygiene -------------------------------------------------------------
const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "GOCSPX-test-secret";
  delete process.env.GOOGLE_REDIRECT_URI;
  resetGoogleStub();
  globalThis.fetch = stubFetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// --- Fetch stubbing: only Google's endpoints are intercepted -----------------

const realFetch = globalThis.fetch;

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

let googleProfile: GoogleProfile = {
  sub: "g-sub-123",
  email: "kwame.google@gmail.com",
  email_verified: true,
  name: "Kwame Google",
  picture: "https://lh3.googleusercontent.com/pic.jpg",
};
let tokenExchangeFails = false;

const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("oauth2.googleapis.com/token")) {
    if (tokenExchangeFails) {
      return { ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ access_token: "tok_test" }) } as Response;
  }
  if (url.includes("openidconnect.googleapis.com")) {
    return { ok: true, status: 200, json: async () => googleProfile } as Response;
  }
  return realFetch.call(globalThis, input, init);
}) as typeof fetch;

let stubCounter = 0;

function resetGoogleStub() {
  const n = ++stubCounter;
  googleProfile = {
    // Unique per test: a repeated sub would silently link to a prior test's user.
    sub: `g-sub-${n}-${Date.now()}`,
    email: `guser.${n}.${Date.now()}@gmail.com`,
    email_verified: true,
    name: "Kwame Google",
    picture: "https://lh3.googleusercontent.com/pic.jpg",
  };
  tokenExchangeFails = false;
}

// --- Callback driver ---------------------------------------------------------

/** Builds a callback request whose cookie and `state` param come from the same payload. */
function callbackReq(
  overrides: {
    state?: string;
    cookieState?: string;
    code?: string | null;
    role?: string;
    next?: string;
  } = {},
) {
  const payload = newStatePayload(overrides.role ?? null, overrides.next ?? null);
  const encoded = encodeState(payload);
  const state = overrides.state ?? encoded;
  const cookieState = overrides.cookieState ?? encoded;
  const code = overrides.code === null ? "" : (overrides.code ?? "test-code");
  const qs = new URLSearchParams({ state });
  if (code) qs.set("code", code);
  return makeReq(`/auth/google/callback?${qs.toString()}`, {
    cookie: `${STATE_COOKIE}=${cookieState}`,
  });
}

const locationOf = (res: Response) => res.headers.get("location") ?? "";
const errorCodeOf = (res: Response) => new URL(locationOf(res)).searchParams.get("error");

describe("safeNextPath", () => {
  it("accepts internal paths and rejects anything else", () => {
    expect(safeNextPath("/gigs")).toBe("/gigs");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/path?q=1#x")).toBe("/dashboard"); // no query/hash allowed
  });
});

describe("Google OAuth entry route", () => {
  it("redirects to /login with google_unconfigured when credentials are missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const res = await entry(makeReq("/auth/google"));
    expect([302, 307]).toContain(res.status);
    expect(locationOf(res)).toContain("/login?error=google_unconfigured");
  });

  it("redirects to Google with state and sets the state cookie", async () => {
    const res = await entry(makeReq("/auth/google?role=MUSICIAN&next=/gigs"));
    expect([302, 307]).toContain(res.status);

    const url = new URL(locationOf(res));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/v1/auth/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${STATE_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");

    // Cookie and state param carry the same payload (role + next survive).
    const cookieValue = setCookie.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
    expect(cookieValue).toBe(url.searchParams.get("state"));
  });

  it("honours an explicit GOOGLE_REDIRECT_URI override", async () => {
    process.env.GOOGLE_REDIRECT_URI = "https://gigify.example.com/api/v1/auth/google/callback";
    const res = await entry(makeReq("/auth/google"));
    const url = new URL(locationOf(res));
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://gigify.example.com/api/v1/auth/google/callback",
    );
  });
});

describe("Google OAuth callback", () => {
  it("creates a new CLIENT account (no password) and starts a session", async () => {
    resetGoogleStub();
    const email = googleProfile.email;

    const res = await callback(callbackReq());
    expect([302, 307]).toContain(res.status);
    expect(locationOf(res)).toBe("http://localhost:3000/dashboard");

    const user = await prisma.user.findUnique({ where: { email }, include: { clientProfile: true } });
    expect(user).toBeTruthy();
    expect(user!.role).toBe("CLIENT");
    expect(user!.passwordHash).toBeNull();
    expect(user!.googleSub).toBe(googleProfile.sub);
    expect(user!.avatarUrl).toBe(googleProfile.picture);
    expect(user!.clientProfile).toBeTruthy();

    // Session works through the normal /auth/me endpoint.
    const sessionCookie = cookieFrom(res);
    const meRes = await me(makeReq("/auth/me", { cookie: sessionCookie }));
    expect(meRes.status).toBe(200);
    expect((await json(meRes)).email).toBe(email);
  });

  it("creates a MUSICIAN with a profile when the register page passes role=…", async () => {
    resetGoogleStub();
    const res = await callback(callbackReq({ role: "MUSICIAN", next: "/gigs" }));
    expect(locationOf(res)).toBe("http://localhost:3000/gigs");

    const user = await prisma.user.findUnique({
      where: { email: googleProfile.email },
      include: { musicianProfile: true },
    });
    expect(user!.role).toBe("MUSICIAN");
    expect(user!.musicianProfile).toBeTruthy();
  });

  it("is idempotent: the same Google account signs in without duplicating users", async () => {
    resetGoogleStub();
    await callback(callbackReq());
    const res2 = await callback(callbackReq());
    expect([302, 307]).toContain(res2.status);

    const count = await prisma.user.count({ where: { email: googleProfile.email } });
    expect(count).toBe(1);
  });

  it("links Google to an existing password account; both sign-in methods keep working", async () => {
    const existing = await registerUser("CLIENT", { email: `link.${Date.now()}@test.dev` });

    googleProfile = { ...googleProfile, email: existing.email, sub: "g-sub-linked" };
    const res = await callback(callbackReq());
    expect([302, 307]).toContain(res.status);

    const user = await prisma.user.findUnique({ where: { email: existing.email } });
    expect(user!.googleSub).toBe("g-sub-linked");
    expect(user!.passwordHash).toBeTruthy(); // password untouched

    // Password login still works after linking…
    const pw = await login(
      makeReq("/auth/login", {
        method: "POST",
        body: { email: existing.email, password: "password123" },
      }),
    );
    expect(pw.status).toBe(200);

    // …and so does Google.
    const res2 = await callback(callbackReq());
    expect([302, 307]).toContain(res2.status);
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
  });

  it("rejects a state mismatch (CSRF) and creates nothing", async () => {
    resetGoogleStub();
    const res = await callback(callbackReq({ cookieState: "tampered-state" }));
    expect(errorCodeOf(res)).toBe("google_state");
    expect(await prisma.user.count({ where: { email: googleProfile.email } })).toBe(0);
  });

  it("rejects a missing state cookie entirely", async () => {
    resetGoogleStub();
    const payload = newStatePayload(null, null);
    const res = await callback(
      makeReq(`/auth/google/callback?code=x&state=${encodeState(payload)}`), // no cookie
    );
    expect(errorCodeOf(res)).toBe("google_state");
  });

  it("rejects an unverified Google email with google_email", async () => {
    resetGoogleStub();
    googleProfile = { ...googleProfile, email_verified: false };
    const res = await callback(callbackReq());
    expect(errorCodeOf(res)).toBe("google_email");
    expect(await prisma.user.count({ where: { email: googleProfile.email } })).toBe(0);
  });

  it("maps a provider denial to google_denied", async () => {
    const res = await callback(
      makeReq(`/auth/google/callback?error=access_denied&state=whatever`, {
        cookie: `${STATE_COOKIE}=whatever`,
      }),
    );
    expect(errorCodeOf(res)).toBe("google_denied");
  });

  it("maps a failed token exchange to google_exchange", async () => {
    resetGoogleStub();
    tokenExchangeFails = true;
    const res = await callback(callbackReq());
    expect(errorCodeOf(res)).toBe("google_exchange");
    expect(await prisma.user.count({ where: { email: googleProfile.email } })).toBe(0);
  });

  it("refuses to sign in suspended accounts", async () => {
    const user = await registerUser("CLIENT", { email: `susp.${Date.now()}@test.dev` });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    googleProfile = { ...googleProfile, email: user.email, sub: "g-sub-suspended" };
    const res = await callback(callbackReq());
    expect(errorCodeOf(res)).toBe("google_suspended");
  });
});

describe("password login vs Google-only accounts", () => {
  it("tells Google-only users to use Continue with Google", async () => {
    resetGoogleStub();
    await callback(callbackReq());

    const res = await login(
      makeReq("/auth/login", {
        method: "POST",
        body: { email: googleProfile.email, password: "password123" },
      }),
    );
    expect(res.status).toBe(401);
    expect(JSON.stringify(await json(res))).toContain("Google");
  });
});
