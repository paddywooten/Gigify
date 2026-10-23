// Mutual post-gig reviews (both parties, once per booking).

import { prisma } from "@/server/db";
import { conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { toReviewDTO } from "./serializers";
import { notify } from "./notification-service";
import type { ReviewDTO } from "@/lib/types";

export async function createReview(
  user: SessionUser,
  bookingId: string,
  input: { rating: number; comment: string },
): Promise<ReviewDTO> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { gig: true } });
  if (!booking) throw notFound("Booking not found.");

  const isClient = booking.clientId === user.id;
  const isMusician = booking.musicianId === user.id;
  if (!isClient && !isMusician) throw forbidden();
  if (booking.status !== "COMPLETED") {
    throw conflict("Reviews can only be left after a booking is completed.");
  }

  const revieweeId = isClient ? booking.musicianId : booking.clientId;

  const existing = await prisma.review.findUnique({
    where: { bookingId_reviewerId: { bookingId, reviewerId: user.id } },
  });
  if (existing) throw conflict("You have already reviewed this booking.");

  const review = await prisma.review.create({
    data: {
      bookingId,
      reviewerId: user.id,
      revieweeId,
      rating: input.rating,
      comment: input.comment.trim(),
    },
    include: { reviewer: true, reviewee: true },
  });

  await notify({
    userId: revieweeId,
    type: "REVIEW_RECEIVED",
    title: `You received a ${input.rating}-star review ⭐`,
    body: `${user.name} reviewed “${booking.gig.title}” — “${input.comment.trim()}”`,
    link: isClient ? `/musicians/${revieweeId}` : "/dashboard",
  });

  return toReviewDTO(review);
}

export async function listReviewsForUser(userId: string): Promise<ReviewDTO[]> {
  const rows = await prisma.review.findMany({
    where: { revieweeId: userId },
    include: { reviewer: true, reviewee: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(toReviewDTO);
}
