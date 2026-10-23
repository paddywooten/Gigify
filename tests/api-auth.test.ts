import { describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/v1/auth/register/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { GET as listGigs, POST as createGig } from "@/app/api/v1/gigs/route";
import { GET as getProfile } from "@/app/api/v1/profile/route";
import { cookieFrom, json, makeReq, registerUser } from "./helpers/app";

describe("auth API", () => {
  it("registers a musician with a profile and starts a session", async () => {
    const user = await registerUser("MUSICIAN");
    expect(user.role).toBe("MUSICIAN");

    const meRes = await me(makeReq("/auth/me", { cookie: user.cookie }));
    expect(meRes.status).toBe(200);
    const meBody = await json(meRes);
    expect(meBody.email).toBe(user.email);

    const profileRes = await getProfile(makeReq("/profile", { cookie: user.cookie }));
    const profile = await json(profileRes);
    expect((profile.musician as { dayRateCents: number }).dayRateCents).toBe(50_000);
  });

  it("rejects duplicate emails with 409", async () => {
    const first = await registerUser("CLIENT");
    const res = await register(
      makeReq("/auth/register", {
        method: "POST",
        body: { email: first.email, password: "password123", name: "Dup", role: "CLIENT", organizationName: "Org" },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("requires an organization name for client accounts", async () => {
    const res = await register(
      makeReq("/auth/register", {
        method: "POST",
        body: { email: `no-org-${Date.now()}@test.dev`, password: "password123", name: "No Org", role: "CLIENT" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("logs in, exposes the session, and logs out", async () => {
    const user = await registerUser("MUSICIAN");

    const bad = await login(
      makeReq("/auth/login", { method: "POST", body: { email: user.email, password: "wrong-pass" } }),
    );
    expect(bad.status).toBe(401);

    const good = await login(
      makeReq("/auth/login", { method: "POST", body: { email: user.email, password: "password123" } }),
    );
    expect(good.status).toBe(200);
    const cookie = cookieFrom(good);

    expect((await me(makeReq("/auth/me", { cookie }))).status).toBe(200);

    const out = await logout(makeReq("/auth/logout", { method: "POST", cookie }));
    expect(out.status).toBe(200);
    expect((await me(makeReq("/auth/me", { cookie }))).status).toBe(401);
  });

  it("protects client-only endpoints", async () => {
    // Anonymous
    const anon = await createGig(
      makeReq("/gigs", { method: "POST", body: { title: "x".repeat(10) } }),
    );
    expect(anon.status).toBe(401);

    // Musician (wrong role)
    const musician = await registerUser("MUSICIAN");
    const asMusician = await createGig(
      makeReq("/gigs", {
        method: "POST",
        cookie: musician.cookie,
        body: {
          title: "Should not be allowed",
          description: "A description long enough to pass validation, hopefully.",
          gigType: "CONCERT",
          eventDate: new Date(Date.now() + 86400000).toISOString(),
          location: "Austin, TX",
          budgetCents: 50_000,
        },
      }),
    );
    expect(asMusician.status).toBe(403);
  });

  it("validates gig input", async () => {
    const client = await registerUser("CLIENT");
    const res = await createGig(
      makeReq("/gigs", {
        method: "POST",
        cookie: client.cookie,
        body: {
          title: "short", // too short
          description: "Valid-length description for the gig listing.",
          gigType: "CONCERT",
          eventDate: new Date(Date.now() + 86400000).toISOString(),
          location: "Austin, TX",
          budgetCents: 10_000,
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toContain("title");
  });

  it("lists open gigs publicly without a session", async () => {
    const res = await listGigs(makeReq("/gigs"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.items)).toBe(true);
  });
});
