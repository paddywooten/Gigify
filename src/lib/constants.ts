// Shared domain constants + label maps used by both the API and the UI.

export const ROLES = ["MUSICIAN", "CLIENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const GIG_TYPES = [
  "CHURCH_SERVICE",
  "WEDDING",
  "CONCERT",
  "CORPORATE",
  "FESTIVAL",
  "OTHER",
] as const;
export type GigType = (typeof GIG_TYPES)[number];

export const ORG_TYPES = ["CHURCH", "EVENT", "VENUE", "OTHER"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const GIG_STATUSES = ["OPEN", "BOOKED", "COMPLETED", "CANCELLED"] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const BOOKING_STATUSES = [
  "PENDING_FUNDING",
  "FUNDED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_TYPES = [
  "CLIENT_FUNDING",
  "MUSICIAN_PAYOUT",
  "PLATFORM_FEE",
  "REFUND",
] as const;

export const GENRES = [
  "Gospel",
  "Worship",
  "Contemporary Christian",
  "Jazz",
  "Classical",
  "Blues",
  "Rock",
  "Pop",
  "R&B / Soul",
  "Folk / Acoustic",
  "Hip-Hop",
  "Latin",
  "Country",
  "World",
  "Other",
] as const;

export const INSTRUMENTS = [
  "Vocals",
  "Piano / Keys",
  "Acoustic Guitar",
  "Electric Guitar",
  "Bass",
  "Drums",
  "Strings",
  "Horn / Brass",
  "Woodwind",
  "Percussion",
  "DJ / Electronic",
  "Full Band",
  "Other",
] as const;

export const GIG_TYPE_LABELS: Record<GigType, string> = {
  CHURCH_SERVICE: "Church service",
  WEDDING: "Wedding",
  CONCERT: "Concert",
  CORPORATE: "Corporate event",
  FESTIVAL: "Festival",
  OTHER: "Other",
};

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  CHURCH: "Church",
  EVENT: "Event organizer",
  VENUE: "Venue",
  OTHER: "Organization",
};

export const GIG_STATUS_LABELS: Record<GigStatus, string> = {
  OPEN: "Open",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_FUNDING: "Awaiting payment",
  FUNDED: "Funds in escrow",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "In dispute",
  REFUNDED: "Refunded",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

export const ROLE_LABELS: Record<Role, string> = {
  MUSICIAN: "Musician",
  CLIENT: "Client",
  ADMIN: "Admin",
};

/** Default platform commission, used until an admin overrides it in settings. */
export const DEFAULT_COMMISSION_RATE = 0.15;
export const COMMISSION_RATE_KEY = "commissionRate";
