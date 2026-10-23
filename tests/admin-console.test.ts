// Admin console: page settings (announcement + currency) and gig moderation.
// Covers the public settings endpoint, admin-only guards, and takedown rules.

import { describe, expect, it } from "vitest";
import { GET as publicSettings } from "@/app/api/v1/settings/route";
import { PATCH as patchAdminSettings } from "@/app/api/v1/admin/settings/route";
import { GET as listAdminGigs } from "@/app/api/v1/admin/gigs/route";
import { POST as cancelGig } from "@/app/api/v1/admin/gigs/[id]/cancel/route";
import { POST as createGig } from "@/app/api/v1/gigs/route";
import { POST as applyToGig } from "@/app/api/v1/gigs/[id]/applications/route";
import { prisma } from "@/server/db";
import {
  ctxFor,
  createBookingFixture,
  json,
  makeReq,
  registerAdmin,
  registerUser,
} from "./helpers/app";

async function makeGig(
  cookie: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await createGig(
    makeReq("/gigs", {
      method: "POST",
      cookie,
      body: {
        title: `Moderation gig ${Date.now()}`,
        description: "A perfectly valid gig description used by the admin console tests.",
        gigType: "CHURCH_SERVICE",
        genres: ["Gospel"],
        eventDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        durationHours: 2,
        location: "Accra, GH",
        venueName: "Test Chapel",
        budgetCents: 45000,
        ...overrides,
      },
    }),
  );
  if (res.status !== 201) throw new Error(`gig create failed: ${res.status} ${await json(res)}`);
  return json(res);
}

describe("public page settings", () => {
  it("serves commission, announcement and GHS currency without auth", async () => {
    const res = await publicSettings(makeReq("/settings"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.commissionRate).toBe(0.15);
    expect(body.announcement).toBe("");
    expect(body.currency).toBe("GHS");
  });

  it("shows an admin-published announcement to everyone (and hides it again when cleared)", async () => {
    const admin = await registerAdmin();
    const message = `Maintenance window ${Date.now()} — payouts pause 2–4 AM.`;

    const update = await patchAdminSettings(
      makeReq("/admin/settings", {
        method: "PATCH",
        cookie: admin.cookie,
        body: { commissionRate: 0.15, announcement: message },
      }),
    );
    expect(update.status).toBe(200);
    expect((await json(update)).announcement).toBe(message);

    const publicView = await json(await publicSettings(makeReq("/settings")));
    expect(publicView.announcement).toBe(message);

    // Clearing it hides the banner again.
    const clear = await patchAdminSettings(
      makeReq("/admin/settings", {
        method: "PATCH",
        cookie: admin.cookie,
        body: { commissionRate: 0.15, announcement: "   " },
      }),
    );
    expect((await json(clear)).announcement).toBe("");
    expect((await json(await publicSettings(makeReq("/settings")))).announcement).toBe("");
  });

  it("rejects non-admins and oversized banners", async () => {
    const musician = await registerUser("MUSICIAN");

    const forbidden = await patchAdminSettings(
      makeReq("/admin/settings", {
        method: "PATCH",
        cookie: musician.cookie,
        body: { commissionRate: 0.2 },
      }),
    );
    expect(forbidden.status).toBe(403);

    const admin = await registerAdmin();
    const tooLong = await patchAdminSettings(
      makeReq("/admin/settings", {
        method: "PATCH",
        cookie: admin.cookie,
        body: { commissionRate: 0.15, announcement: "x".repeat(301) },
      }),
    );
    expect(tooLong.status).toBe(400);
  });
});

describe("admin gig moderation", () => {
  it("lists every gig for admins (403 for everyone else)", async () => {
    const client = await registerUser("CLIENT");
    const gig = await makeGig(client.cookie);
    const musician = await registerUser("MUSICIAN");
    await applyToGig(
      makeReq(`/gigs/${gig.id}/applications`, {
        method: "POST",
        cookie: musician.cookie,
        body: {
          message: "I would love to play this gig, here is my introduction.",
          proposedRateCents: 45000,
        },
      }),
      ctxFor(String(gig.id)),
    );

    const denied = await listAdminGigs(makeReq("/admin/gigs", { cookie: musician.cookie }));
    expect(denied.status).toBe(403);

    const admin = await registerAdmin();
    const res = await listAdminGigs(makeReq("/admin/gigs?limit=50", { cookie: admin.cookie }));
    expect(res.status).toBe(200);
    const list = await json(res);
    const row = (list.items as Array<Record<string, unknown>>).find((g) => g.id === gig.id);
    expect(row).toBeTruthy();
    expect((row!.organizer as { name: string }).name).toBe(client.name);
    expect(row!.pendingApplications).toBe(1);
    expect(row!.budgetCents).toBe(45000);

    // Status filter narrows the list.
    const openOnly = await json(
      await listAdminGigs(makeReq("/admin/gigs?status=OPEN", { cookie: admin.cookie })),
    );
    expect((openOnly.items as Array<{ status: string }>).every((g) => g.status === "OPEN")).toBe(
      true,
    );
  });

  it("takes an OPEN gig down, rejects its pending applications and notifies the organizer", async () => {
    const client = await registerUser("CLIENT");
    const gig = await makeGig(client.cookie);
    const musician = await registerUser("MUSICIAN");
    await applyToGig(
      makeReq(`/gigs/${gig.id}/applications`, {
        method: "POST",
        cookie: musician.cookie,
        body: {
          message: "I would love to play this gig, here is my introduction.",
          proposedRateCents: 45000,
        },
      }),
      ctxFor(String(gig.id)),
    );

    const admin = await registerAdmin();
    const res = await cancelGig(
      makeReq(`/admin/gigs/${gig.id}/cancel`, { method: "POST", cookie: admin.cookie }),
      ctxFor(String(gig.id)),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("CANCELLED");
    expect(body.rejectedApplications).toBe(1);

    const updated = await prisma.gig.findUnique({ where: { id: String(gig.id) } });
    expect(updated!.status).toBe("CANCELLED");

    const applications = await prisma.application.findMany({ where: { gigId: String(gig.id) } });
    expect(applications.every((a) => a.status === "REJECTED")).toBe(true);

    const note = await prisma.notification.findFirst({
      where: { userId: client.id, type: "GIG_TAKEN_DOWN" },
    });
    expect(note).toBeTruthy();

    // Cancelled gigs leave the open marketplace feed.
    const stillOpen = await prisma.gig.findFirst({
      where: { id: String(gig.id), status: "OPEN" },
    });
    expect(stillOpen).toBeNull();
  });

  it("enforces takedown rules: non-admins, repeats, booked and completed gigs", async () => {
    const client = await registerUser("CLIENT");
    const admin = await registerAdmin();

    // Non-admin → 403 (route guard).
    const outsiderGig = await makeGig(client.cookie);
    const denied = await cancelGig(
      makeReq(`/admin/gigs/${outsiderGig.id}/cancel`, {
        method: "POST",
        cookie: client.cookie,
      }),
      ctxFor(String(outsiderGig.id)),
    );
    expect(denied.status).toBe(403);

    // Second takedown of the same gig → 409.
    const first = await cancelGig(
      makeReq(`/admin/gigs/${outsiderGig.id}/cancel`, { method: "POST", cookie: admin.cookie }),
      ctxFor(String(outsiderGig.id)),
    );
    expect(first.status).toBe(200);
    const again = await cancelGig(
      makeReq(`/admin/gigs/${outsiderGig.id}/cancel`, { method: "POST", cookie: admin.cookie }),
      ctxFor(String(outsiderGig.id)),
    );
    expect(again.status).toBe(409);

    // Booked gig (live booking) → 409: resolve the booking first.
    const booking = await createBookingFixture();
    const booked = await cancelGig(
      makeReq(`/admin/gigs/${booking.gigId}/cancel`, {
        method: "POST",
        cookie: admin.cookie,
      }),
      ctxFor(booking.gigId),
    );
    expect(booked.status).toBe(409);
    expect(JSON.stringify(await json(booked))).toContain("booking");

    // Completed gig → 409.
    const completed = await makeGig(client.cookie);
    await prisma.gig.update({
      where: { id: String(completed.id) },
      data: { status: "COMPLETED" },
    });
    const done = await cancelGig(
      makeReq(`/admin/gigs/${completed.id}/cancel`, { method: "POST", cookie: admin.cookie }),
      ctxFor(String(completed.id)),
    );
    expect(done.status).toBe(409);

    // Unknown gig → 404.
    const missing = await cancelGig(
      makeReq("/admin/gigs/nope/cancel", { method: "POST", cookie: admin.cookie }),
      ctxFor("nope"),
    );
    expect(missing.status).toBe(404);
  });
});
