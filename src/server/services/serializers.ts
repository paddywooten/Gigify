// Prisma model -> API DTO mapping. Keeps Date/JSON-string handling in one place.

import type {
  Application,
  Booking,
  ClientProfile,
  Gig,
  MusicianProfile,
  Notification,
  Payment,
  Review,
  User,
} from "@prisma/client";
import type {
  ApplicationDTO,
  BookingDTO,
  GigDTO,
  NotificationDTO,
  PaymentDTO,
  PublicMusicianDTO,
  ReviewDTO,
  SessionUser,
} from "@/lib/types";
import type { GigType, OrgType, Role } from "@/lib/constants";

/** Parses the JSON-string[] columns used on SQLite (genres, instruments, ...). */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function toJsonArray(values: string[] | undefined): string {
  return JSON.stringify(Array.from(new Set(values ?? [])));
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    bio: user.bio,
    location: user.location,
    createdAt: user.createdAt.toISOString(),
  };
}

type GigWithRelations = Gig & {
  organizer: User & { clientProfile: ClientProfile | null };
  _count?: { applications: number };
  applications?: Application[];
};

export function toGigDTO(gig: GigWithRelations, viewerId?: string): GigDTO {
  const myApplication = viewerId
    ? gig.applications?.find((a) => a.musicianId === viewerId)
    : undefined;
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    gigType: gig.gigType as GigType,
    genres: parseJsonArray(gig.genres),
    eventDate: gig.eventDate.toISOString(),
    durationHours: gig.durationHours,
    location: gig.location,
    venueName: gig.venueName,
    budgetCents: gig.budgetCents,
    requirements: gig.requirements,
    status: gig.status as GigDTO["status"],
    createdAt: gig.createdAt.toISOString(),
    organizer: {
      id: gig.organizer.id,
      name: gig.organizer.name,
      organizationName: gig.organizer.clientProfile?.organizationName ?? null,
      organizationType: gig.organizer.clientProfile?.organizationType as OrgType | undefined,
      location: gig.organizer.location,
    },
    applicationCount: gig._count?.applications,
    isMine: viewerId ? gig.organizerId === viewerId : false,
    myApplication: myApplication
      ? {
          id: myApplication.id,
          gigId: myApplication.gigId,
          message: myApplication.message,
          proposedRateCents: myApplication.proposedRateCents,
          status: myApplication.status as ApplicationDTO["status"],
          createdAt: myApplication.createdAt.toISOString(),
          musician: { id: "", name: "" } as unknown as ApplicationDTO["musician"],
        }
      : null,
  };
}

type MusicianWithUser = MusicianProfile & {
  user: User;
  _count?: { bookingsAsMusician: number };
};

export function toPublicMusicianDTO(
  profile: MusicianWithUser,
  reviews: Pick<Review, "rating">[] = [],
): PublicMusicianDTO {
  const ratings = reviews.map((r) => r.rating);
  const averageRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  return {
    id: profile.user.id,
    name: profile.user.name,
    headline: profile.headline,
    bio: profile.user.bio,
    location: profile.user.location,
    instruments: parseJsonArray(profile.instruments),
    genres: parseJsonArray(profile.genres),
    dayRateCents: profile.dayRateCents,
    travelRadiusKm: profile.travelRadiusKm,
    experienceYears: profile.experienceYears,
    sampleUrls: parseJsonArray(profile.sampleUrls),
    isAvailable: profile.isAvailable,
    averageRating,
    reviewCount: reviews.length,
    completedBookings: profile._count?.bookingsAsMusician ?? 0,
  };
}

type ApplicationWithRelations = Application & {
  musician: User & { musicianProfile: MusicianProfile | null; reviewsReceived?: Review[] };
  gig?: Gig;
};

export function toApplicationDTO(app: ApplicationWithRelations): ApplicationDTO {
  const profile = app.musician.musicianProfile;
  const reviews = app.musician.reviewsReceived ?? [];
  return {
    id: app.id,
    gigId: app.gigId,
    message: app.message,
    proposedRateCents: app.proposedRateCents,
    status: app.status as ApplicationDTO["status"],
    createdAt: app.createdAt.toISOString(),
    musician: {
      id: app.musician.id,
      name: app.musician.name,
      headline: profile?.headline ?? null,
      bio: app.musician.bio,
      location: app.musician.location,
      instruments: parseJsonArray(profile?.instruments),
      genres: parseJsonArray(profile?.genres),
      dayRateCents: profile?.dayRateCents ?? 0,
      travelRadiusKm: profile?.travelRadiusKm ?? 0,
      experienceYears: profile?.experienceYears ?? 0,
      sampleUrls: parseJsonArray(profile?.sampleUrls),
      isAvailable: profile?.isAvailable ?? true,
      averageRating: reviews.length
        ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
        : null,
      reviewCount: reviews.length,
      completedBookings: 0,
    },
    gig: app.gig
      ? {
          id: app.gig.id,
          title: app.gig.title,
          eventDate: app.gig.eventDate.toISOString(),
          location: app.gig.location,
          budgetCents: app.gig.budgetCents,
          status: app.gig.status as GigDTO["status"],
        }
      : undefined,
  };
}

type BookingWithRelations = Booking & {
  gig: Gig;
  client: User;
  musician: User;
  reviews?: (Review & { reviewer: User; reviewee: User })[];
  payments?: Payment[];
};

export function toBookingDTO(booking: BookingWithRelations): BookingDTO {
  return {
    id: booking.id,
    gigId: booking.gigId,
    status: booking.status as BookingDTO["status"],
    totalCents: booking.totalCents,
    platformFeeRate: booking.platformFeeRate,
    platformFeeCents: booking.platformFeeCents,
    musicianPayoutCents: booking.musicianPayoutCents,
    fundedAt: booking.fundedAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    disputeReason: booking.disputeReason,
    createdAt: booking.createdAt.toISOString(),
    gig: {
      id: booking.gig.id,
      title: booking.gig.title,
      eventDate: booking.gig.eventDate.toISOString(),
      location: booking.gig.location,
      gigType: booking.gig.gigType as GigType,
      venueName: booking.gig.venueName,
    },
    client: { id: booking.client.id, name: booking.client.name },
    musician: { id: booking.musician.id, name: booking.musician.name },
    reviews: booking.reviews?.map(toReviewDTO),
    payments: booking.payments?.map(toPaymentDTO),
  };
}

export function toReviewDTO(review: Review & { reviewer: User; reviewee: User }): ReviewDTO {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    reviewer: { id: review.reviewer.id, name: review.reviewer.name, role: review.reviewer.role as Role },
    reviewee: { id: review.reviewee.id, name: review.reviewee.name },
  };
}

export function toPaymentDTO(payment: Payment): PaymentDTO {
  return {
    id: payment.id,
    amountCents: payment.amountCents,
    type: payment.type,
    status: payment.status,
    provider: payment.provider,
    providerRef: payment.providerRef,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toNotificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}
