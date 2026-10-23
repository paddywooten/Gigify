// Admin: platform stats, user management, settings.

import { prisma } from "@/server/db";
import { badRequest, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import type { AdminStatsDTO, AdminUserDTO } from "@/lib/types";
import { paginated } from "./helpers";
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
