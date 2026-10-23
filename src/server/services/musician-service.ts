// Public musician directory + profiles.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { notFound } from "@/server/errors";
import { toPublicMusicianDTO, toReviewDTO } from "./serializers";
import { listProfileMedia } from "./media-service";
import { paginated } from "./helpers";
import type { MediaAssetDTO, Paginated, PublicMusicianDTO, ReviewDTO } from "@/lib/types";

export type MusicianListParams = {
  search?: string;
  genre?: string;
  instrument?: string;
  maxRateCents?: number;
  availableOnly?: boolean;
  page: number;
  limit: number;
};

/** Parses/validates the musician directory query params. */
export async function listMusicians(params: MusicianListParams): Promise<Paginated<PublicMusicianDTO>> {
  const where: Prisma.MusicianProfileWhereInput = {
    user: { isActive: true, role: "MUSICIAN" },
    ...(params.availableOnly ? { isAvailable: true } : {}),
    ...(params.maxRateCents !== undefined ? { dayRateCents: { lte: params.maxRateCents } } : {}),
    ...(params.genre ? { genres: { contains: `\"${params.genre}\"` } } : {}),
    ...(params.instrument ? { instruments: { contains: `\"${params.instrument}\"` } } : {}),
    ...(params.search
      ? {
          OR: [
            { user: { name: { contains: params.search } } },
            { headline: { contains: params.search } },
            { genres: { contains: params.search } },
            { instruments: { contains: params.search } },
            { user: { location: { contains: params.search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.musicianProfile.findMany({
      where,
      include: {
        user: {
          include: {
            reviewsReceived: { include: { reviewer: true } },
            _count: { select: { bookingsAsMusician: true } },
          },
        },
      },
      orderBy: { dayRateCents: "asc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.musicianProfile.count({ where }),
  ]);

  return paginated(
    rows.map((r) => ({
      ...toPublicMusicianDTO(r, r.user.reviewsReceived),
      completedBookings: r.user._count.bookingsAsMusician,
    })),
    total,
    params.page,
    params.limit,
  );
}

export async function getMusicianProfile(userId: string): Promise<{
  musician: PublicMusicianDTO;
  reviews: ReviewDTO[];
  media: MediaAssetDTO[];
}> {
  const profile = await prisma.musicianProfile.findUnique({
    where: { userId },
    include: {
      user: {
        include: {
          reviewsReceived: { include: { reviewer: true, reviewee: true } },
          _count: { select: { bookingsAsMusician: true } },
        },
      },
    },
  });
  if (!profile || !profile.user.isActive) throw notFound("Musician not found.");

  const reviews = profile.user.reviewsReceived;
  const media: MediaAssetDTO[] = await listProfileMedia(userId);
  return {
    musician: {
      ...toPublicMusicianDTO(profile, reviews),
      completedBookings: profile.user._count.bookingsAsMusician,
    },
    reviews: reviews.map(toReviewDTO),
    media,
  };
}
