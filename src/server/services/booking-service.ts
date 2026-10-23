// Booking lifecycle: escrow funding, completion payouts, cancellation, disputes.
// Money movement always goes through the PaymentProvider abstraction and is
// recorded as immutable Payment rows for auditability.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { computeCommission } from "@/server/domain/commission";
import { getPaymentProvider } from "@/server/payments/provider";
import { toBookingDTO } from "./serializers";
import { paginated } from "./helpers";
import { notify, notifyAdmins } from "./notification-service";
import { getCurrentCommissionRate } from "./settings-service";
import type { BookingDTO, Paginated } from "@/lib/types";
import { formatMoney } from "@/lib/format";

const BOOKING_INCLUDE = {
  gig: true,
  client: true,
  musician: true,
  reviews: { include: { reviewer: true, reviewee: true } },
  payments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export type BookingActor = "CLIENT" | "MUSICIAN" | "ADMIN";

/** Creates the escrow booking when a client accepts a musician's application. */
export async function createBookingFromApplication(applicationId: string): Promise<BookingRecord> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { gig: true },
  });
  if (!application) throw notFound("Application not found.");

  const rate = await getCurrentCommissionRate();
  const split = computeCommission(application.proposedRateCents, rate);

  return prisma.booking.create({
    data: {
      gigId: application.gigId,
      applicationId: application.id,
      clientId: application.gig.organizerId,
      musicianId: application.musicianId,
      totalCents: split.totalCents,
      platformFeeRate: split.rate,
      platformFeeCents: split.platformFeeCents,
      musicianPayoutCents: split.musicianPayoutCents,
      status: "PENDING_FUNDING",
    },
    include: BOOKING_INCLUDE,
  });
}

export async function listBookings(
  user: SessionUser,
  opts: { status?: string; page: number; limit: number },
): Promise<Paginated<BookingDTO>> {
  const where: Prisma.BookingWhereInput = {
    ...(user.role === "ADMIN" ? {} : { OR: [{ clientId: user.id }, { musicianId: user.id }] }),
    ...(opts.status ? { status: opts.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return paginated(rows.map(toBookingDTO), total, opts.page, opts.limit);
}

async function loadBookingForUser(id: string, user: SessionUser): Promise<BookingRecord> {
  const booking = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
  if (!booking) throw notFound("Booking not found.");
  const isParty = booking.clientId === user.id || booking.musicianId === user.id;
  if (!isParty && user.role !== "ADMIN") throw forbidden();
  return booking;
}

export async function getBooking(id: string, user: SessionUser): Promise<BookingDTO> {
  return toBookingDTO(await loadBookingForUser(id, user));
}

/** Client funds the escrow for a booking. */
export async function fundBooking(user: SessionUser, id: string): Promise<BookingDTO> {
  const booking = await loadBookingForUser(id, user);
  if (booking.clientId !== user.id) throw forbidden("Only the client can fund this booking.");
  if (booking.status !== "PENDING_FUNDING") {
    throw conflict("This booking is not awaiting payment.");
  }

  const provider = getPaymentProvider();
  const result = await provider.charge({
    amountCents: booking.totalCents,
    bookingId: booking.id,
    payerUserId: user.id,
    description: `Escrow funding for “${booking.gig.title}”`,
  });

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        bookingId: booking.id,
        payerId: user.id,
        amountCents: booking.totalCents,
        type: "CLIENT_FUNDING",
        status: result.success ? "SUCCEEDED" : "FAILED",
        provider: result.provider,
        providerRef: result.providerRef,
      },
    });
    if (!result.success) return;
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "FUNDED", fundedAt: new Date() },
    });
  });

  if (!result.success) {
    throw badRequest(result.failureReason ?? "Payment failed. Please try another method.");
  }

  await notify({
    userId: booking.musicianId,
    type: "BOOKING_FUNDED",
    title: "Funds are secured in escrow 💰",
    body: `${user.name} has funded “${booking.gig.title}”. You'll be paid ${formatMoney(booking.musicianPayoutCents)} after the gig is completed.`,
    link: `/bookings/${booking.id}`,
  });

  return getBooking(id, user);
}

export type BookingAction = "START" | "COMPLETE" | "CANCEL" | "DISPUTE";

export async function transitionBooking(
  user: SessionUser,
  id: string,
  action: BookingAction,
  reason?: string,
): Promise<BookingDTO> {
  const booking = await loadBookingForUser(id, user);
  const isClient = booking.clientId === user.id;
  const isMusician = booking.musicianId === user.id;

  switch (action) {
    case "START": {
      if (!isMusician) throw forbidden("Only the musician can start the gig.");
      if (booking.status !== "FUNDED") throw conflict("This booking is not funded yet.");
      await prisma.booking.update({
        where: { id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await notify({
        userId: booking.clientId,
        type: "BOOKING_STARTED",
        title: "The gig has started",
        body: `${booking.musician.name} has marked “${booking.gig.title}” as in progress.`,
        link: `/bookings/${id}`,
      });
      break;
    }

    case "COMPLETE": {
      if (!isClient) throw forbidden("Only the client can confirm completion.");
      if (booking.status !== "IN_PROGRESS") {
        throw conflict("This booking cannot be completed from its current state.");
      }

      const provider = getPaymentProvider();
      const [payoutResult, feeResult] = await Promise.all([
        provider.payout({
          amountCents: booking.musicianPayoutCents,
          bookingId: booking.id,
          payeeUserId: booking.musicianId,
          description: `Payout for “${booking.gig.title}”`,
        }),
        Promise.resolve({
          success: true,
          provider: provider.name,
          providerRef: `pf_${booking.id.slice(-6)}`,
        }),
      ]);

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            payerId: booking.clientId,
            amountCents: booking.musicianPayoutCents,
            type: "MUSICIAN_PAYOUT",
            status: payoutResult.success ? "SUCCEEDED" : "FAILED",
            provider: payoutResult.provider,
            providerRef: payoutResult.providerRef,
          },
        });
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            amountCents: booking.platformFeeCents,
            type: "PLATFORM_FEE",
            status: feeResult.success ? "SUCCEEDED" : "FAILED",
            provider: feeResult.provider,
            providerRef: feeResult.providerRef,
          },
        });
        await tx.booking.update({
          where: { id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.gig.update({ where: { id: booking.gigId }, data: { status: "COMPLETED" } });
      });

      await notify({
        userId: booking.musicianId,
        type: "BOOKING_COMPLETED",
        title: "Gig completed — payout sent 🎉",
        body: `“${booking.gig.title}” is complete. ${formatMoney(booking.musicianPayoutCents)} has been paid out to you.`,
        link: `/bookings/${id}`,
      });
      await notify({
        userId: booking.clientId,
        type: "BOOKING_COMPLETED",
        title: "Please review your musician",
        body: `Thanks for using Gigify for “${booking.gig.title}”. Leave a review to help the community.`,
        link: `/bookings/${id}`,
      });
      break;
    }

    case "CANCEL": {
      const allowed = (isClient || isMusician) && booking.status === "PENDING_FUNDING";
      if (!allowed) {
        throw conflict(
          "Bookings can only be cancelled before funding. After funding, open a dispute so the platform can mediate.",
        );
      }
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: new Date(), disputeReason: reason ?? null },
        });
        // Return the gig to the marketplace so other applications can be considered.
        await tx.gig.update({ where: { id: booking.gigId }, data: { status: "OPEN" } });
      });
      const otherId = isClient ? booking.musicianId : booking.clientId;
      await notify({
        userId: otherId,
        type: "BOOKING_CANCELLED",
        title: "Booking cancelled",
        body: `“${booking.gig.title}” was cancelled before funding${reason ? `: ${reason}` : "."}`,
        link: "/bookings",
      });
      break;
    }

    case "DISPUTE": {
      const allowed = (isClient || isMusician) && ["FUNDED", "IN_PROGRESS"].includes(booking.status);
      if (!allowed) throw conflict("This booking cannot be disputed in its current state.");
      if (!reason?.trim()) throw badRequest("Please describe the problem for the platform team.");

      await prisma.booking.update({
        where: { id },
        data: { status: "DISPUTED", disputeReason: reason.trim() },
      });
      await notifyAdmins({
        type: "DISPUTE_OPENED",
        title: "New dispute to resolve",
        body: `“${booking.gig.title}” (${formatMoney(booking.totalCents)}) has been disputed by ${user.name}: ${reason.trim()}`,
        link: `/admin`,
      });
      const otherId = isClient ? booking.musicianId : booking.clientId;
      await notify({
        userId: otherId,
        type: "DISPUTE_OPENED",
        title: "A dispute has been opened",
        body: `${user.name} opened a dispute on “${booking.gig.title}”. The platform team will review it.`,
        link: `/bookings/${id}`,
      });
      break;
    }
  }

  return getBooking(id, user);
}

/** Admin-only dispute resolution: release the escrow to the musician or refund the client. */
export async function resolveDispute(
  admin: SessionUser,
  id: string,
  outcome: "MUSICIAN_PAYOUT" | "CLIENT_REFUND",
): Promise<BookingDTO> {
  const booking = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
  if (!booking) throw notFound("Booking not found.");
  if (booking.status !== "DISPUTED") throw conflict("This booking is not in dispute.");

  const provider = getPaymentProvider();

  if (outcome === "MUSICIAN_PAYOUT") {
    const payout = await provider.payout({
      amountCents: booking.musicianPayoutCents,
      bookingId: booking.id,
      payeeUserId: booking.musicianId,
      description: `Dispute resolution payout for “${booking.gig.title}”`,
    });
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          amountCents: booking.musicianPayoutCents,
          type: "MUSICIAN_PAYOUT",
          status: payout.success ? "SUCCEEDED" : "FAILED",
          provider: payout.provider,
          providerRef: payout.providerRef,
        },
      });
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          amountCents: booking.platformFeeCents,
          type: "PLATFORM_FEE",
          status: "SUCCEEDED",
          provider: provider.name,
          providerRef: `pf_${booking.id.slice(-6)}`,
        },
      });
      await tx.booking.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await tx.gig.update({ where: { id: booking.gigId }, data: { status: "COMPLETED" } });
    });
  } else {
    const refund = await provider.refund({
      amountCents: booking.totalCents,
      bookingId: booking.id,
      description: `Dispute resolution refund for “${booking.gig.title}”`,
    });
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          amountCents: booking.totalCents,
          type: "REFUND",
          status: refund.success ? "SUCCEEDED" : "FAILED",
          provider: refund.provider,
          providerRef: refund.providerRef,
        },
      });
      await tx.booking.update({ where: { id }, data: { status: "REFUNDED", cancelledAt: new Date() } });
      await tx.gig.update({ where: { id: booking.gigId }, data: { status: "CANCELLED" } });
    });
  }

  const message =
    outcome === "MUSICIAN_PAYOUT"
      ? `The platform resolved the dispute in favor of the musician. ${formatMoney(booking.musicianPayoutCents)} was released.`
      : `The platform resolved the dispute in favor of the client. ${formatMoney(booking.totalCents)} was refunded.`;

  await notify({
    userId: booking.clientId,
    type: "DISPUTE_RESOLVED",
    title: "Dispute resolved",
    body: message,
    link: `/bookings/${id}`,
  });
  await notify({
    userId: booking.musicianId,
    type: "DISPUTE_RESOLVED",
    title: "Dispute resolved",
    body: message,
    link: `/bookings/${id}`,
  });

  return toBookingDTO(
    (await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE }))!,
  );
}
