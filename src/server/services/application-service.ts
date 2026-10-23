// Applications (musician bids) and the acceptance flow that creates a booking.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";

import type { SessionUser } from "@/server/auth/session";
import { toApplicationDTO } from "./serializers";
import { paginated } from "./helpers";
import { notify } from "./notification-service";
import { createBookingFromApplication } from "./booking-service";
import type { ApplicationDTO, Paginated } from "@/lib/types";

const APPLICATION_INCLUDE = {
  musician: {
    include: {
      musicianProfile: true,
      reviewsReceived: { include: { reviewer: true } },
    },
  },
  gig: true,
} satisfies Prisma.ApplicationInclude;

export async function applyToGig(
  musician: SessionUser,
  gigId: string,
  input: { message: string; proposedRateCents: number },
): Promise<ApplicationDTO> {
  if (musician.role !== "MUSICIAN") throw forbidden("Only musicians can apply to gigs.");

  const gig = await prisma.gig.findUnique({ where: { id: gigId } });
  if (!gig) throw notFound("Gig not found.");
  if (gig.status !== "OPEN") throw conflict("This gig is no longer accepting applications.");
  if (gig.organizerId === musician.id) throw forbidden("You cannot apply to your own gig.");
  if (!input.message.trim()) throw badRequest("Please include a short message with your application.");


  const existing = await prisma.application.findUnique({
    where: { gigId_musicianId: { gigId, musicianId: musician.id } },
  });
  if (existing) throw conflict("You have already applied to this gig.");

  const application = await prisma.application.create({
    data: {
      gigId,
      musicianId: musician.id,
      message: input.message.trim(),
      proposedRateCents: input.proposedRateCents,
    },
    include: APPLICATION_INCLUDE,
  });

  await notify({
    userId: gig.organizerId,
    type: "APPLICATION_RECEIVED",
    title: "New application received 🎸",
    body: `${musician.name} applied for “${gig.title}” at ${formatRate(input.proposedRateCents)}.`,
    link: `/gigs/${gig.id}`,
  });

  return toApplicationDTO(application);
}

export async function listApplicationsForGig(
  user: SessionUser,
  gigId: string,
): Promise<ApplicationDTO[]> {
  const gig = await prisma.gig.findUnique({ where: { id: gigId } });
  if (!gig) throw notFound("Gig not found.");
  if (gig.organizerId !== user.id && user.role !== "ADMIN") throw forbidden();

  const rows = await prisma.application.findMany({
    where: { gigId },
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApplicationDTO);
}

export async function listMyApplications(
  user: SessionUser,
  opts: { page: number; limit: number; status?: string },
): Promise<Paginated<ApplicationDTO>> {
  const where: Prisma.ApplicationWhereInput = {
    musicianId: user.id,
    ...(opts.status ? { status: opts.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: APPLICATION_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.application.count({ where }),
  ]);
  return paginated(rows.map(toApplicationDTO), total, opts.page, opts.limit);
}

export type ApplicationAction = "ACCEPT" | "REJECT" | "WITHDRAW";

export async function decideOnApplication(
  user: SessionUser,
  applicationId: string,
  action: ApplicationAction,
): Promise<ApplicationDTO> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: APPLICATION_INCLUDE,
  });
  if (!application) throw notFound("Application not found.");

  const gig = await prisma.gig.findUnique({ where: { id: application.gigId } });
  if (!gig) throw notFound("Gig not found.");

  if (action === "WITHDRAW") {
    if (application.musicianId !== user.id) throw forbidden();
    if (application.status !== "PENDING") throw conflict("This application is no longer pending.");
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: "WITHDRAWN" },
      include: APPLICATION_INCLUDE,
    });
    return toApplicationDTO(updated);
  }

  if (gig.organizerId !== user.id && user.role !== "ADMIN") throw forbidden();
  if (application.status !== "PENDING") throw conflict("This application is no longer pending.");
  if (gig.status !== "OPEN") throw conflict("This gig is no longer open.");

  if (action === "REJECT") {
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: "REJECTED" },
      include: APPLICATION_INCLUDE,
    });
    await notify({
      userId: application.musicianId,
      type: "APPLICATION_REJECTED",
      title: "Application not selected",
      body: `The organizer reviewed your application for “${gig.title}” and went with another musician. Keep applying!`,
      link: "/dashboard",
    });
    return toApplicationDTO(updated);
  }

  // ACCEPT: atomically accept this application, reject the rest, book the gig.
  const [accepted] = await prisma.$transaction(async (tx) => {
    const acceptedApp = await tx.application.update({
      where: { id: applicationId },
      data: { status: "ACCEPTED" },
      include: APPLICATION_INCLUDE,
    });
    await tx.application.updateMany({
      where: { gigId: gig.id, status: "PENDING", id: { not: applicationId } },
      data: { status: "REJECTED" },
    });
    await tx.gig.update({ where: { id: gig.id }, data: { status: "BOOKED" } });
    return [acceptedApp];
  });

  const booking = await createBookingFromApplication(applicationId);

  await notify({
    userId: application.musicianId,
    type: "APPLICATION_ACCEPTED",
    title: "You got the gig! 🎉",
    body: `${user.name} accepted your application for “${gig.title}”. Fund the booking to secure your slot — payment lands in escrow.`,
    link: `/bookings/${booking.id}`,
  });
  const rejected = await prisma.application.findMany({
    where: { gigId: gig.id, status: "REJECTED" },
    select: { musicianId: true },
  });
  await Promise.all(
    rejected.map((r) =>
      notify({
        userId: r.musicianId,
        type: "APPLICATION_REJECTED",
        title: "Application not selected",
        body: `The organizer selected another musician for “${gig.title}”.`,
        link: "/dashboard",
      }),
    ),
  );

  return toApplicationDTO(accepted);
}

function formatRate(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
