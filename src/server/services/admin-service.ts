// Admin: platform stats, user management, settings.

import { prisma } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import type { AdminGigDTO, AdminStatsDTO, AdminUserDTO } from "@/lib/types";
import { paginated } from "./helpers";
import { notify } from "./notification-service";
import type { Paginated } from "@/lib/types";

export async function getAdminStats(): Promise<AdminStatsDTO> {
  const [
    roleCounts,
    gigCounts,
    bookingTotal,
    bookingsByStatus,
    revenueAgg,
    pendingDisputes,
    pendingApplications,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.gig.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.booking.count(),
    prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.booking.aggregate({
      where: { status: { in: ["COMPLETED", "IN_PROGRESS", "FUNDED"] } },
      _sum: { totalCents: true, platformFeeCents: true, musicianPayoutCents: true },
    }),
    prisma.booking.count({ where: { status: "DISPUTED" } }),
    prisma.application.count({ where: { status: "PENDING", gig: { status: "OPEN" } } }),
  ]);

  const byRole = (role: string) =>
    roleCounts.find((r) => r.role === role)?._count._all ?? 0;
  const byGigStatus = (status: string) =>
    gigCounts.find((g) => g.status === status)?._count._all ?? 0;
  return {
    users: {
      total: roleCounts.reduce((sum, r) => sum + r._count._all, 0),
      musicians: byRole("MUSICIAN"),
      clients: byRole("CLIENT"),
      admins: byRole("ADMIN"),
    },
    gigs: {
      open: byGigStatus("OPEN"),
      booked: byGigStatus("BOOKED"),
      completed: byGigStatus("COMPLETED"),
      total: gigCounts.reduce((sum, g) => sum + g._count._all, 0),
    },
    bookings: {
      total: bookingTotal,
      byStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count._all])),
    },
    revenue: {
      grossVolumeCents: revenueAgg._sum.totalCents ?? 0,
      platformRevenueCents: revenueAgg._sum.platformFeeCents ?? 0,
      musicianEarningsCents: revenueAgg._sum.musicianPayoutCents ?? 0,
    },
    pendingDisputes,
    pendingApplications,
  };
}

export async function listUsers(
  opts: { search?: string; role?: string; page: number; limit: number },
): Promise<Paginated<AdminUserDTO>> {
  const where = {
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.search
      ? { OR: [{ name: { contains: opts.search } }, { email: { contains: opts.search } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        location: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return paginated(
    rows.map((u) => ({ ...u, role: u.role as AdminUserDTO["role"], createdAt: u.createdAt.toISOString() })),
    total,
    opts.page,
    opts.limit,
  );
}

export async function updateUserByAdmin(
  admin: SessionUser,
  userId: string,
  input: { isActive?: boolean; role?: string },
): Promise<AdminUserDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found.");
  if (user.id === admin.id && input.isActive === false) {
    throw badRequest("You cannot suspend your own account.");
  }
  if (user.role === "ADMIN" && input.role && input.role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (adminCount <= 1) throw forbidden("Cannot demote the last admin.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: input.isActive, role: input.role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      location: true,
      createdAt: true,
    },
  });

  return { ...updated, role: updated.role as AdminUserDTO["role"], createdAt: updated.createdAt.toISOString() };
}

// --- Gig moderation ----------------------------------------------------------

/** Admin view of every gig on the platform (with organizer + application context). */
export async function listGigsForAdmin(
  opts: { status?: string; page: number; limit: number },
): Promise<Paginated<AdminGigDTO>> {
  const where = opts.status ? { status: opts.status } : {};

  const [rows, total] = await Promise.all([
    prisma.gig.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        applications: { select: { status: true } },
        booking: { select: { status: true } },
      },
    }),
    prisma.gig.count({ where }),
  ]);

  const items = rows.map((g): AdminGigDTO => ({
    id: g.id,
    title: g.title,
    gigType: g.gigType,
    status: g.status,
    eventDate: g.eventDate.toISOString(),
    location: g.location,
    budgetCents: g.budgetCents,
    createdAt: g.createdAt.toISOString(),
    organizer: g.organizer,
    pendingApplications: g.applications.filter((a) => a.status === "PENDING").length,
    bookingStatus: g.booking?.status ?? null,
  }));

  return paginated(items, total, opts.page, opts.limit);
}

/**
 * Takes a gig down (moderation): OPEN → CANCELLED, pending applications
 * rejected, organizer notified. Booked/completed gigs must be resolved
 * through the booking flow first — never yanked from under a booking.
 */
export async function adminCancelGig(
  admin: SessionUser,
  gigId: string,
): Promise<{ id: string; status: string; rejectedApplications: number }> {
  if (admin.role !== "ADMIN") throw forbidden("Only admins can take gigs down.");

  const gig = await prisma.gig.findUnique({ where: { id: gigId }, include: { booking: true } });
  if (!gig) throw notFound("Gig not found.");
  if (gig.status === "CANCELLED") throw conflict("This gig is already cancelled.");
  if (gig.status === "COMPLETED") throw conflict("Completed gigs can't be taken down.");
  if (gig.status === "BOOKED" || gig.booking) {
    throw conflict("This gig has an active booking — resolve the booking before taking it down.");
  }

  const [, rejected] = await prisma.$transaction([
    prisma.gig.update({ where: { id: gigId }, data: { status: "CANCELLED" } }),
    prisma.application.updateMany({
      where: { gigId, status: "PENDING" },
      data: { status: "REJECTED" },
    }),
  ]);

  await notify({
    userId: gig.organizerId,
    type: "GIG_TAKEN_DOWN",
    title: "Your gig was taken down",
    body: `Gigify moderation removed "${gig.title}". Contact support if you believe this was a mistake.`,
    link: "/dashboard",
  });

  return { id: gig.id, status: "CANCELLED", rejectedApplications: rejected.count };
}
