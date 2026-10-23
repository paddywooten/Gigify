// Zod schemas: the single source of truth for request validation.
import { z } from "zod";
import {
  APPLICATION_STATUSES,
  BOOKING_STATUSES,
  GIG_TYPES,
  ORG_TYPES,
  ROLES,
} from "@/lib/constants";

const csvLike = z.array(z.string().min(1).max(60)).max(30);

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(8, "Password must be at least 8 characters.").max(200),
    name: z.string().min(2, "Please enter your name.").max(120),
    role: z.enum(["MUSICIAN", "CLIENT"] as const),
    location: z.string().max(160).optional(),
    // Musician-only fields
    headline: z.string().max(160).optional(),
    instruments: csvLike.optional(),
    genres: csvLike.optional(),
    dayRateCents: z.number().int().min(0).max(10_000_000).optional(),
    travelRadiusKm: z.number().int().min(0).max(10_000).optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    // Client-only fields
    organizationName: z.string().min(2).max(160).optional(),
    organizationType: z.enum(ORG_TYPES).optional(),
    website: z.string().url().max(300).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.role === "CLIENT" && !data.organizationName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationName"],
        message: "Organization name is required for client accounts.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const gigInputSchema = z.object({
  title: z.string().min(6, "Give the gig a descriptive title.").max(160),
  description: z.string().min(20, "Tell musicians more (at least 20 characters).").max(5000),
  gigType: z.enum(GIG_TYPES),
  genres: csvLike.default([]),
  eventDate: z.coerce.date(),
  durationHours: z.coerce.number().min(0.5).max(24).default(2),
  location: z.string().min(2).max(160),
  venueName: z.string().max(160).optional().or(z.literal("")),
  budgetCents: z
    .number()
    .int("Budget must be whole dollars/cents.")
    .min(500, "Minimum gig budget is $5.00.")
    .max(1_000_000_00, "Contact the platform for very large budgets."),
  requirements: z.string().max(2000).optional().or(z.literal("")),
});

export const gigUpdateSchema = gigInputSchema.partial().extend({
  status: z.enum(["OPEN", "CANCELLED"] as const).optional(),
});

export const applicationCreateSchema = z.object({
  message: z
    .string()
    .min(20, "Introduce yourself to the organizer (at least 20 characters).")
    .max(2000),
  proposedRateCents: z
    .number()
    .int()
    .min(500, "Minimum rate is $5.00.")
    .max(1_000_000_00),
});

export const applicationDecisionSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "WITHDRAW"] as const),
});

export const bookingActionSchema = z.object({
  action: z.enum(["START", "COMPLETE", "CANCEL", "DISPUTE"] as const),
  reason: z.string().max(1000).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(2000),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().max(160).optional().or(z.literal("")),
  // musician
  headline: z.string().max(160).optional().or(z.literal("")),
  instruments: csvLike.optional(),
  genres: csvLike.optional(),
  dayRateCents: z.number().int().min(0).max(10_000_000).optional(),
  travelRadiusKm: z.number().int().min(0).max(10_000).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  sampleUrls: z.array(z.string().url().max(300)).max(10).optional(),
  isAvailable: z.boolean().optional(),
  // client
  organizationName: z.string().min(2).max(160).optional(),
  organizationType: z.enum(ORG_TYPES).optional(),
  website: z.string().url().max(300).optional().or(z.literal("")),
});

export const settingsUpdateSchema = z.object({
  commissionRate: z.number().min(0).max(0.5, "Commission cannot exceed 50%."),
});

export const adminUserUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => v.isActive !== undefined || v.role !== undefined, {
    message: "Nothing to update.",
  });

export const disputeResolveSchema = z.object({
  outcome: z.enum(["MUSICIAN_PAYOUT", "CLIENT_REFUND"] as const),
});

// Query schemas ---------------------------------------------------------------

const intQuery = z.coerce.number().int().min(1).optional();

export const gigListQuerySchema = z.object({
  search: z.string().max(120).optional(),
  gigType: z.enum(GIG_TYPES).optional(),
  genre: z.string().max(60).optional(),
  status: z.enum(BOOKING_STATUSES).or(z.enum(GIG_TYPES)).optional(), // loosely typed; validated in service
  minBudgetCents: z.coerce.number().int().min(0).optional(),
  maxBudgetCents: z.coerce.number().int().min(0).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  mine: z.coerce.boolean().optional(),
  page: intQuery,
  limit: intQuery,
});

export const musicianListQuerySchema = z.object({
  search: z.string().max(120).optional(),
  genre: z.string().max(60).optional(),
  instrument: z.string().max(60).optional(),
  maxRateCents: z.coerce.number().int().min(0).optional(),
  availableOnly: z.coerce.boolean().optional(),
  page: intQuery,
  limit: intQuery,
});

export const listQuerySchema = z.object({
  page: intQuery,
  limit: intQuery,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type GigInput = z.infer<typeof gigInputSchema>;
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
