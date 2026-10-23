// Gig CRUD + marketplace search.

import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import type { GigInput } from "@/server/validation/schemas";
import { toGigDTO, toJsonArray } from "./serializers";
import { paginated } from "./helpers";
import { notify } from "./notification-service";
import type { GigDTO, Paginated } from "@/lib/types";

const GIG_INCLUDE = {
  organizer: { include: { clientProfile: true } },
  _count: { select: { applications: true } },
  applications: true,
} satisfies Prisma.GigInclude;

export type GigListParams = {
  search?: string;
  gigType?: string;
  genre?: string;
  minBudgetCents?: number;
  maxBudgetCents?: number;
  dateFrom?: Date;
  dateTo?: Date;
  mine?: boolean;
  status?: string;
  page: number;
  limit: number;
};

export async function listGigs(params: GigListParams, viewer?: SessionUser | null): Promise<Paginated<GigDTO>> {
  const where: Prisma.GigWhereInput = {
    AND: [
      params.mine && viewer ? { organizerId: viewer.id } : {},
      // Public viewers only see open gigs; organizers also see their own non-open gigs.
      params.status
        ? { status: params.status }
        : viewer
          ? { OR: [{ status: "OPEN" }, { organizerId: viewer.id }] }
          : { status: "OPEN" },
      params.gigType ? { gigType: params.gigType } : {},
      params.minBudgetCents !== undefined ? { budgetCents: { gte: params.minBudgetCents } } : {},
      params.maxBudgetCents !== undefined ? { budgetCents: { lte: params.maxBudgetCents } } : {},
      params.dateFrom ? { eventDate: { gte: params.dateFrom } } : {},
      params.dateTo ? { eventDate: { lte: params.dateTo } } : {},
      params.search
        ? {
            OR: [
              { title: { contains: params.search } },
              { description: { contains: params.search } },
              { location: { contains: params.search } },
            ],
          }
        : {},
      // Genre is stored as a JSON string array; exact-token match via contains.
      params.genre ? { genres: { contains: `\"${params.genre}\"` } } : {},
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.gig.findMany({
      where,
      include: GIG_INCLUDE,
      orderBy: { eventDate: "asc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.gig.count({ where }),
  ]);

  return paginated(
    rows.map((g) => toGigDTO(g, viewer?.id)),
    total,
    params.page,
    params.limit,
  );
}

export async function getGig(id: string, viewer?: SessionUser | null): Promise<GigDTO> {
  const gig = await prisma.gig.findUnique({ where: { id }, include: GIG_INCLUDE });
  if (!gig) throw notFound("Gig not found.");
  const isPrivate = gig.status !== "OPEN";
  if (isPrivate && viewer?.id !== gig.organizerId && viewer?.role !== "ADMIN") {
    throw notFound("Gig not found.");
  }
  return toGigDTO(gig, viewer?.id);
}

export async function createGig(user: SessionUser, input: GigInput): Promise<GigDTO> {
  const gig = await prisma.gig.create({
    data: {
      organizerId: user.id,
      title: input.title.trim(),
      description: input.description.trim(),
      gigType: input.gigType,
      genres: toJsonArray(input.genres),
      eventDate: input.eventDate,
      durationHours: input.durationHours,
      location: input.location.trim(),
      venueName: input.venueName?.trim() || null,
      budgetCents: input.budgetCents,
      requirements: input.requirements?.trim() || null,
    },
    include: GIG_INCLUDE,
  });
  return toGigDTO(gig, user.id);
}

export async function updateGig(
  user: SessionUser,
  id: string,
  input: Partial<GigInput> & { status?: "OPEN" | "CANCELLED" },
): Promise<GigDTO> {
  const gig = await prisma.gig.findUnique({ where: { id } });
  if (!gig) throw notFound("Gig not found.");
  if (gig.organizerId !== user.id && user.role !== "ADMIN") throw forbidden();
  if (gig.status !== "OPEN") {
    throw forbidden("This gig is no longer open for changes.");
  }

  const updated = await prisma.gig.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      description: input.description?.trim(),
      gigType: input.gigType,
      genres: input.genres ? toJsonArray(input.genres) : undefined,
      eventDate: input.eventDate,
      durationHours: input.durationHours,
      location: input.location?.trim(),
      venueName: input.venueName !== undefined ? (input.venueName?.trim() || null) : undefined,
      budgetCents: input.budgetCents,
      requirements:
        input.requirements !== undefined ? (input.requirements?.trim() || null) : undefined,
      status: input.status,
    },
    include: GIG_INCLUDE,
  });

  if (input.status === "CANCELLED") {
    const pending = await prisma.application.findMany({
      where: { gigId: id, status: "PENDING" },
      select: { musicianId: true },
    });
    await Promise.all(
      pending.map((a) =>
        notify({
          userId: a.musicianId,
          type: "GIG_CANCELLED",
          title: "A gig you applied to was cancelled",
          body: `“${gig.title}” has been cancelled by the organizer.`,
          link: "/gigs",
        }),
      ),
    );
  }

  return toGigDTO(updated, user.id);
}

/** Parses the gig list query params from the request URL. */
export function gigListParamsFrom(req: NextRequest): GigListParams {
  const sp = req.nextUrl.searchParams;
  const num = (key: string) => {
    const raw = sp.get(key);
    if (raw === null || raw === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const date = (key: string) => {
    const raw = sp.get(key);
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };
  return {
    search: sp.get("search") || undefined,
    gigType: sp.get("gigType") || undefined,
    genre: sp.get("genre") || undefined,
    minBudgetCents: num("minBudgetCents"),
    maxBudgetCents: num("maxBudgetCents"),
    dateFrom: date("dateFrom"),
    dateTo: date("dateTo"),
    mine: sp.get("mine") === "true" || sp.get("mine") === "1",
    status: sp.get("status") || undefined,
    page: Math.max(1, num("page") ?? 1),
    limit: Math.min(100, Math.max(1, num("limit") ?? 20)),
  };
}
