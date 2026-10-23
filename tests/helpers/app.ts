// Helpers for driving the API route handlers directly in tests.

import { NextRequest } from "next/server";
import type { Role } from "@/lib/constants";
import type { SessionUser } from "@/server/auth/session";

export const BASE = "http://localhost:3000/api/v1";

export function makeReq(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers["cookie"] = opts.cookie;
  return new NextRequest(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Builds the `{ params }` context expected by dynamic-segment route handlers. */
export const ctxFor = (id: string) => ({ params: { id } });

export function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  const match = header.match(/sb_session=([^;]+)/);
  if (!match) throw new Error(`No session cookie in response: ${header}`);
  return `sb_session=${match[1]}`;
}

export type TestUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  cookie: string;
};

/**
 * Widens a TestUser to the SessionUser shape the service layer expects.
 * Only the fields services actually read are meaningful here.
 */
export function toSessionUser(user: TestUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    bio: null,
    location: null,
    createdAt: new Date(),
  };
}

let userCounter = 0;

/** Registers a user through the real route handler and returns their session cookie. */
export async function registerUser(
  role: "MUSICIAN" | "CLIENT",
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const { POST } = await import("@/app/api/v1/auth/register/route");
  const n = ++userCounter;
  const email = String(overrides.email ?? `user${n}.${Date.now()}@test.dev`);

  const res = await POST(
    makeReq("/auth/register", {
      method: "POST",
      body: {
        email,
        password: "password123",
        name: String(overrides.name ?? `Test ${role} ${n}`),
        role,
        location: "Testville",
        ...(role === "MUSICIAN"
          ? { instruments: ["Vocals"], genres: ["Gospel"], dayRateCents: 50000 }
          : { organizationName: `Org ${n}`, organizationType: "CHURCH" }),
        ...overrides,
      },
    }),
  );

  const payload = (await res.json()) as {
    user: { id: string; email: string; name: string; role: Role };
  };
  return { ...payload.user, email, cookie: cookieFrom(res) };
}

export async function registerAdmin(): Promise<TestUser> {
  const user = await registerUser("CLIENT", { name: "Test Admin" });
  const { prisma } = await import("@/server/db");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  return { ...user, role: "ADMIN" };
}

/** Dumps a route handler response into a comparable object. */
export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

export type BookingFixture = {
  client: TestUser;
  musician: TestUser;
  gigId: string;
  applicationId: string;
  bookingId: string;
  totalCents: number;
};

/**
 * Drives the real routes through gig → application → accept, which leaves a
 * booking in PENDING_FUNDING. Reused by flow tests that exercise payments.
 */
export async function createBookingFixture(rateCents = 30000): Promise<BookingFixture> {
  const day = 86_400_000;
  const client = await registerUser("CLIENT");
  const musician = await registerUser("MUSICIAN");

  const { POST: createGig } = await import("@/app/api/v1/gigs/route");
  const gigRes = await createGig(
    makeReq("/gigs", {
      method: "POST",
      cookie: client.cookie,
      body: {
        title: "Fixture gig for payment tests",
        description: "A perfectly valid gig description used by the integration test suite.",
        gigType: "CHURCH_SERVICE",
        genres: ["Gospel"],
        eventDate: new Date(Date.now() + 10 * day).toISOString(),
        durationHours: 2,
        location: "Austin, TX",
        venueName: "Test Chapel",
        budgetCents: rateCents,
      },
    }),
  );
  if (gigRes.status !== 201) throw new Error(`fixture gig failed: ${gigRes.status}`);
  const gig = await json(gigRes);

  const { POST: applyToGig } = await import("@/app/api/v1/gigs/[id]/applications/route");
  const appRes = await applyToGig(
    makeReq(`/gigs/${gig.id}/applications`, {
      method: "POST",
      cookie: musician.cookie,
      body: {
        message: "I would love to play this gig, here is my introduction.",
        proposedRateCents: rateCents,
      },
    }),
    ctxFor(String(gig.id)),
  );
  if (appRes.status !== 201) throw new Error(`fixture application failed: ${appRes.status}`);
  const application = await json(appRes);

  const { PATCH: decideApplication } = await import("@/app/api/v1/applications/[id]/route");
  const acceptRes = await decideApplication(
    makeReq(`/applications/${application.id}`, {
      method: "PATCH",
      cookie: client.cookie,
      body: { action: "ACCEPT" },
    }),
    ctxFor(String(application.id)),
  );
  if (acceptRes.status !== 200) throw new Error(`fixture accept failed: ${acceptRes.status}`);

  // ACCEPT responds with the application; the booking is fetched from the list.
  const { GET: listBookings } = await import("@/app/api/v1/bookings/route");
  const listRes = await listBookings(makeReq("/bookings", { cookie: client.cookie }));
  const list = await json(listRes);
  const booking = (list.items as Array<{ id: string; gigId: string }>).find(
    (b) => b.gigId === String(gig.id),
  );
  if (!booking) throw new Error("fixture booking not found after accept");

  return {
    client,
    musician,
    gigId: String(gig.id),
    applicationId: String(application.id),
    bookingId: booking.id,
    totalCents: rateCents,
  };
}
