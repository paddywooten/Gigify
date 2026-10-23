// API DTO (data-transfer object) types returned by /api/v1 endpoints.

import type {
  ApplicationStatus,
  BookingStatus,
  GigStatus,
  GigType,
  OrgType,
  Role,
} from "./constants";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  bio: string | null;
  location: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface GigDTO {
  id: string;
  title: string;
  description: string;
  gigType: GigType;
  genres: string[];
  eventDate: string;
  durationHours: number;
  location: string;
  venueName: string | null;
  budgetCents: number;
  requirements: string | null;
  status: GigStatus;
  createdAt: string;
  organizer: {
    id: string;
    name: string;
    organizationName?: string | null;
    organizationType?: OrgType;
    location?: string | null;
  };
  applicationCount?: number;
  isMine?: boolean;
  myApplication?: ApplicationDTO | null;
}

export interface ApplicationDTO {
  id: string;
  gigId: string;
  message: string;
  proposedRateCents: number;
  status: ApplicationStatus;
  createdAt: string;
  musician: PublicMusicianDTO;
  gig?: Pick<GigDTO, "id" | "title" | "eventDate" | "location" | "budgetCents" | "status">;
}

export interface BookingDTO {
  id: string;
  gigId: string;
  status: BookingStatus;
  totalCents: number;
  platformFeeRate: number;
  platformFeeCents: number;
  musicianPayoutCents: number;
  fundedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  disputeReason: string | null;
  createdAt: string;
  gig: Pick<GigDTO, "id" | "title" | "eventDate" | "location" | "gigType" | "venueName">;
  client: { id: string; name: string };
  musician: { id: string; name: string };
  reviews?: ReviewDTO[];
  payments?: PaymentDTO[];
}

export interface PaymentDTO {
  id: string;
  amountCents: number;
  type: string;
  status: string;
  provider: string;
  providerRef: string;
  createdAt: string;
}

/** Client-side payment action returned by POST /bookings/:id/fund for real providers. */
export type ClientAction =
  | { kind: "stripe_payment_element"; clientSecret: string }
  | {
      kind: "paystack_inline";
      reference: string;
      email: string;
      amountCents: number;
      currency: string;
      publicKey?: string;
    };

export type FundResponseDTO = BookingDTO & { clientAction?: ClientAction };

export interface ContractSignatureDTO {
  role: string; // CLIENT | MUSICIAN
  signatureName: string;
  signedAt: string;
}

export interface MediaAssetDTO {
  id: string;
  kind: "AUDIO" | "IMAGE";
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface ContractDTO {
  id: string;
  bookingId: string;
  status: string; // AWAITING_SIGNATURES | SIGNED
  title: string;
  eventDate: string;
  location: string;
  venueName: string | null;
  clientName: string;
  musicianName: string;
  totalCents: number;
  feeCents: number;
  feeRate: number;
  payoutCents: number;
  terms: string;
  contentHash: string;
  createdAt: string;
  signatures: ContractSignatureDTO[];
  canSign: boolean;
  signedByMe: boolean;
}

export interface ReviewDTO {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  reviewer: { id: string; name: string; role: Role };
  reviewee: { id: string; name: string };
}

export interface PublicMusicianDTO {
  id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  instruments: string[];
  genres: string[];
  dayRateCents: number;
  travelRadiusKm: number;
  experienceYears: number;
  sampleUrls: string[];
  isAvailable: boolean;
  averageRating: number | null;
  reviewCount: number;
  completedBookings: number;
}

export interface ClientOrgDTO {
  id: string;
  name: string;
  organizationName: string;
  organizationType: OrgType;
  website: string | null;
  location: string | null;
  gigCount: number;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface AdminStatsDTO {
  users: { total: number; musicians: number; clients: number; admins: number };
  gigs: { open: number; booked: number; completed: number; total: number };
  bookings: { total: number; byStatus: Record<string, number> };
  revenue: { grossVolumeCents: number; platformRevenueCents: number; musicianEarningsCents: number };
  pendingDisputes: number;
  pendingApplications: number;
}

export interface PlatformSettingsDTO {
  commissionRate: number;
}

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  location: string | null;
  createdAt: string;
}
