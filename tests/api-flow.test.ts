// End-to-end flow through the API: gig → application → booking → escrow →
// completion payouts → reviews, plus commission snapshots and dispute handling.

import { describe, expect, it } from "vitest";
import { POST as createGig } from "@/app/api/v1/gigs/route";
import { GET as getGig } from "@/app/api/v1/gigs/[id]/route";
import { GET as gigApplications } from "@/app/api/v1/gigs/[id]/applications/route";
import { POST as applyToGig } from "@/app/api/v1/gigs/[id]/applications/route";
import { PATCH as decideApplication } from "@/app/api/v1/applications/[id]/route";
import { GET as listBookings } from "@/app/api/v1/bookings/route";
import { GET as getBooking } from "@/app/api/v1/bookings/[id]/route";
import { POST as fundBooking } from "@/app/api/v1/bookings/[id]/fund/route";
import { POST as bookingAction } from "@/app/api/v1/bookings/[id]/action/route";
import { POST as reviewBooking } from "@/app/api/v1/bookings/[id]/reviews/route";
import { PATCH as updateSettings } from "@/app/api/v1/admin/settings/route";
import { GET as adminStats } from "@/app/api/v1/admin/stats/route";
import { POST as resolveDispute } from "@/app/api/v1/admin/bookings/[id]/resolve/route";
import { ctxFor, json, makeReq, registerAdmin, registerUser, type TestUser } from "./helpers/app";

const day = 86_400_000;

// --- Thin wrappers so every dynamic route gets its { params } context --------

async function postGig(client: TestUser, budgetCents: number, title = "Test gig for the suite") {
  const res = await createGig(
    makeReq("/gigs", {
      method: "POST",
      cookie: client.cookie,
      body: {
        title,
        description: "A perfectly valid gig description used by the integration test suite.",
        gigType: "CHURCH_SERVICE",
        genres: ["Gospel"],
        eventDate: new Date(Date.now() + 10 * day).toISOString(),
        durationHours: 2,
        location: "Austin, TX",
        venueName: "Test Chapel",
        budgetCents,
      },
    }),
  );
  expect(res.status).toBe(201);
  return (await json(res)) as unknown as { id: string; status: string };
}

const apply = (musician: TestUser, gigId: string, rateCents: number) =>
  applyToGig(
    makeReq(`/gigs/${gigId}/applications`, {
      method: "POST",
      cookie: musician.cookie,
      body: { message: "I would love to play this gig, here is my introduction.", proposedRateCents: rateCents },
    }),
    ctxFor(gigId),
  );

const accept = (client: TestUser, applicationId: string) =>
  decideApplication(
    makeReq(`/applications/${applicationId}`, {
      method: "PATCH",
      cookie: client.cookie,
      body: { action: "ACCEPT" },
    }),
    ctxFor(applicationId),
  );

const fund = (id: string, cookie: string) =>
  fundBooking(makeReq(`/bookings/${id}/fund`, { method: "POST", cookie }), ctxFor(id));

const act = (id: string, cookie: string, body: Record<string, unknown>) =>
  bookingAction(makeReq(`/bookings/${id}/action`, { method: "POST", cookie, body }), ctxFor(id));

const review = (id: string, cookie: string, body: Record<string, unknown>) =>
  reviewBooking(makeReq(`/bookings/${id}/reviews`, { method: "POST", cookie, body }), ctxFor(id));

const resolve = (id: string, cookie: string, body: Record<string, unknown>) =>
  resolveDispute(
    makeReq(`/admin/bookings/${id}/resolve`, { method: "POST", cookie, body }),
    ctxFor(id),
  );

const showBooking = (id: string, cookie: string) =>
  getBooking(makeReq(`/bookings/${id}`, { cookie }), ctxFor(id));

/** Gig detail; pass the organizer's cookie to see non-open gigs. */
const showGig = (id: string, cookie?: string) =>
  getGig(makeReq(`/gigs/${id}`, cookie ? { cookie } : {}), ctxFor(id));

async function bookingIdFor(musician: TestUser, gigId: string): Promise<string> {
  const bookings = (await json(
    await listBookings(makeReq("/bookings", { cookie: musician.cookie })),
  )) as { items: { id: string; gigId: string }[] };
  const booking = bookings.items.find((b) => b.gigId === gigId);
  if (!booking) throw new Error(`No booking found for gig ${gigId}`);
  return booking.id;
}

type BookingBody = {
  id: string;
  status: string;
  totalCents: number;
  platformFeeRate: number;
  platformFeeCents: number;
  musicianPayoutCents: number;
  payments?: { type: string; amountCents: number; status: string }[];
  reviews?: unknown[];
};

describe("booking & escrow flow", () => {
  it("runs the full happy path with correct commission accounting", async () => {
    const client = await registerUser("CLIENT");
    const musician = await registerUser("MUSICIAN");

    const gig = await postGig(client, 100_000);

    const applyRes = await apply(musician, gig.id, 100_000);
    expect(applyRes.status).toBe(201);
    const application = (await json(applyRes)) as { id: string; status: string };
    expect(application.status).toBe("PENDING");

    // Duplicate application is rejected.
    expect((await apply(musician, gig.id, 90_000)).status).toBe(409);

    // The musician cannot see other people's application lists.
    expect((await gigApplications(makeReq(`/gigs/${gig.id}/applications`, { cookie: musician.cookie }), ctxFor(gig.id))).status).toBe(403);

    // Client accepts → application ACCEPTED + booking created at the default 15%.
    const acceptRes = await accept(client, application.id);
    expect(acceptRes.status).toBe(200);
    expect((await json(acceptRes)).status).toBe("ACCEPTED");

    const bookings = (await json(
      await listBookings(makeReq("/bookings", { cookie: musician.cookie })),
    )) as { items: BookingBody[] };
    const booking = bookings.items[0];
    expect(booking.status).toBe("PENDING_FUNDING");
    expect(booking.totalCents).toBe(100_000);
    expect(booking.platformFeeRate).toBe(0.15);
    expect(booking.platformFeeCents).toBe(15_000);
    expect(booking.musicianPayoutCents).toBe(85_000);

    // The gig closes to new applications once booked.
    const gigAfter = (await json(await showGig(gig.id, client.cookie))) as { status: string };
    expect(gigAfter.status).toBe("BOOKED");
    expect((await apply(await registerUser("MUSICIAN"), gig.id, 80_000)).status).toBe(409);

    // Only the client can fund the escrow.
    expect((await fund(booking.id, musician.cookie)).status).toBe(403);

    const fundRes = await fund(booking.id, client.cookie);
    expect(fundRes.status).toBe(200);
    expect((await json(fundRes)).status).toBe("FUNDED");

    // Musician starts; client confirms completion.
    const startRes = await act(booking.id, musician.cookie, { action: "START" });
    expect(startRes.status).toBe(200);
    expect((await json(startRes)).status).toBe("IN_PROGRESS");

    const completeRes = await act(booking.id, client.cookie, { action: "COMPLETE" });
    expect(completeRes.status).toBe(200);

    const done = (await json(await showBooking(booking.id, client.cookie))) as BookingBody;
    expect(done.status).toBe("COMPLETED");
    const entries = (done.payments ?? []).map((p) => `${p.type}:${p.amountCents}:${p.status}`);
    expect(entries).toContain("CLIENT_FUNDING:100000:SUCCEEDED");
    expect(entries).toContain("MUSICIAN_PAYOUT:85000:SUCCEEDED");
    expect(entries).toContain("PLATFORM_FEE:15000:SUCCEEDED");

    // Both parties review once; a duplicate review is rejected.
    expect(
      (await review(booking.id, client.cookie, { rating: 5, comment: "Outstanding musician, would book again." }))
        .status,
    ).toBe(201);
    expect(
      (await review(booking.id, client.cookie, { rating: 4, comment: "Trying to review twice." })).status,
    ).toBe(409);
    expect(
      (await review(booking.id, musician.cookie, { rating: 5, comment: "Great client to work with." })).status,
    ).toBe(201);

    // A stranger cannot review someone else's booking.
    const stranger = await registerUser("MUSICIAN");
    expect((await review(booking.id, stranger.cookie, { rating: 5, comment: "Not mine." })).status).toBe(403);
  });

  it("locks the commission rate at booking time", async () => {
    const admin = await registerAdmin();
    const client = await registerUser("CLIENT");
    const musician = await registerUser("MUSICIAN");

    // Raise the platform commission to 20%.
    const update = await updateSettings(
      makeReq("/admin/settings", {
        method: "PATCH",
        cookie: admin.cookie,
        body: { commissionRate: 0.2 },
      }),
    );
    expect(update.status).toBe(200);
    expect((await json(update)).commissionRate).toBe(0.2);

    // New bookings snapshot the new rate.
    const gig = await postGig(client, 50_000, "Post-rate-change gig");
    const application = (await json(await apply(musician, gig.id, 50_000))) as { id: string };
    await accept(client, application.id);

    const bookings = (await json(
      await listBookings(makeReq("/bookings?limit=1", { cookie: musician.cookie })),
    )) as { items: BookingBody[] };
    const booking = bookings.items[0];
    expect(booking.platformFeeRate).toBe(0.2);
    expect(booking.platformFeeCents).toBe(10_000);
    expect(booking.musicianPayoutCents).toBe(40_000);
  });

  it("supports pre-funding cancellation and post-funding disputes", async () => {
    const admin = await registerAdmin();
    const client = await registerUser("CLIENT");
    const musician = await registerUser("MUSICIAN");

    // --- Cancellation before funding returns the gig to OPEN.
    const gigA = await postGig(client, 40_000, "Will be cancelled");
    const appA = (await json(await apply(musician, gigA.id, 40_000))) as { id: string };
    await accept(client, appA.id);
    const bookingA = await bookingIdFor(musician, gigA.id);

    const cancelRes = await act(bookingA, client.cookie, { action: "CANCEL", reason: "Venue double-booked." });
    expect(cancelRes.status).toBe(200);
    expect((await json(cancelRes)).status).toBe("CANCELLED");

    const gigAAfter = (await json(await showGig(gigA.id, client.cookie))) as { status: string };
    expect(gigAAfter.status).toBe("OPEN");

    // --- Dispute after funding, resolved by an admin with a full refund.
    const gigB = await postGig(client, 60_000, "Will be disputed");
    const appB = (await json(await apply(musician, gigB.id, 60_000))) as { id: string };
    await accept(client, appB.id);
    const bookingB = await bookingIdFor(musician, gigB.id);

    expect((await fund(bookingB, client.cookie)).status).toBe(200);

    // Cancelling after funding is refused — disputes are the path.
    expect((await act(bookingB, client.cookie, { action: "CANCEL" })).status).toBe(409);

    const dispute = await act(bookingB, client.cookie, {
      action: "DISPUTE",
      reason: "Musician never arrived.",
    });
    expect(dispute.status).toBe(200);
    expect((await json(dispute)).status).toBe("DISPUTED");

    // Only admins can resolve a dispute.
    expect((await resolve(bookingB, client.cookie, { outcome: "CLIENT_REFUND" })).status).toBe(403);

    const adminResolve = await resolve(bookingB, admin.cookie, { outcome: "CLIENT_REFUND" });
    expect(adminResolve.status).toBe(200);
    const resolved = (await json(adminResolve)) as BookingBody;
    expect(resolved.status).toBe("REFUNDED");
    expect((resolved.payments ?? []).some((p) => p.type === "REFUND" && p.amountCents === 60_000)).toBe(true);

    const gigBAfter = (await json(await showGig(gigB.id, client.cookie))) as { status: string };
    expect(gigBAfter.status).toBe("CANCELLED");
  });

  it("reports platform revenue in the admin stats", async () => {
    const admin = await registerAdmin();
    const stats = (await json(await adminStats(makeReq("/admin/stats", { cookie: admin.cookie })))) as {
      revenue: { platformRevenueCents: number; grossVolumeCents: number };
      bookings: { total: number };
    };
    // The happy-path test completed a $1,000 gig at 15%.
    expect(stats.revenue.platformRevenueCents).toBeGreaterThanOrEqual(15_000);
    expect(stats.revenue.grossVolumeCents).toBeGreaterThanOrEqual(100_000);
  });
});
