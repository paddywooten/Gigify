// Authentication: registration, login, profile updates.

import type { RegisterInput } from "@/server/validation/schemas";
import { prisma } from "@/server/db";
import { badRequest, conflict, unauthorized } from "@/server/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { toSessionUser, toJsonArray } from "./serializers";
import { notify } from "./notification-service";
import type { SessionUser } from "@/lib/types";

export type AuthResult = { user: SessionUser; token: string };

export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: input.name.trim(),
      role: input.role,
      location: input.location?.trim() || null,
      ...(input.role === "MUSICIAN"
        ? {
            musicianProfile: {
              create: {
                headline: input.headline?.trim() || null,
                instruments: toJsonArray(input.instruments),
                genres: toJsonArray(input.genres),
                dayRateCents: input.dayRateCents ?? 0,
                travelRadiusKm: input.travelRadiusKm ?? 25,
                experienceYears: input.experienceYears ?? 0,
              },
            },
          }
        : {
            clientProfile: {
              create: {
                organizationName: (input.organizationName ?? "").trim(),
                organizationType: input.organizationType ?? "OTHER",
                website: input.website?.trim() || null,
              },
            },
          }),
    },
  });

  await notify({
    userId: user.id,
    type: "WELCOME",
    title: "Welcome to Gigify 🎵",
    body:
      user.role === "MUSICIAN"
        ? "Your musician profile is live. Browse open gigs and send your first application."
        : "Post your first gig and start receiving applications from local musicians.",
    link: user.role === "MUSICIAN" ? "/gigs" : "/gigs/new",
  });

  const token = await createSession(user.id);
  return { user: toSessionUser(user), token };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish response to avoid account enumeration.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized("Invalid email or password.");
  }
  if (!user.isActive) throw badRequest("This account has been suspended. Contact support.");

  const token = await createSession(user.id);
  return { user: toSessionUser(user), token };
}

/** Full profile view for the settings page (shared + role-specific fields). */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { musicianProfile: true, clientProfile: true },
  });
  if (!user) throw unauthorized();

  return {
    ...toSessionUser(user),
    musician: user.musicianProfile
      ? {
          headline: user.musicianProfile.headline,
          instruments: JSON.parse(user.musicianProfile.instruments || "[]") as string[],
          genres: JSON.parse(user.musicianProfile.genres || "[]") as string[],
          dayRateCents: user.musicianProfile.dayRateCents,
          travelRadiusKm: user.musicianProfile.travelRadiusKm,
          experienceYears: user.musicianProfile.experienceYears,
          sampleUrls: JSON.parse(user.musicianProfile.sampleUrls || "[]") as string[],
          isAvailable: user.musicianProfile.isAvailable,
        }
      : null,
    client: user.clientProfile
      ? {
          organizationName: user.clientProfile.organizationName,
          organizationType: user.clientProfile.organizationType,
          website: user.clientProfile.website,
        }
      : null,
  };
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    bio?: string | null;
    location?: string | null;
    headline?: string | null;
    instruments?: string[];
    genres?: string[];
    dayRateCents?: number;
    travelRadiusKm?: number;
    experienceYears?: number;
    sampleUrls?: string[];
    isAvailable?: boolean;
    organizationName?: string;
    organizationType?: string;
    website?: string | null;
  },
): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { musicianProfile: true, clientProfile: true },
  });
  if (!user) throw unauthorized();

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name?.trim(),
      bio: input.bio !== undefined ? (input.bio?.trim() || null) : undefined,
      location: input.location !== undefined ? (input.location?.trim() || null) : undefined,
      ...(user.musicianProfile
        ? {
            musicianProfile: {
              update: {
                headline: input.headline !== undefined ? (input.headline?.trim() || null) : undefined,
                instruments: input.instruments ? toJsonArray(input.instruments) : undefined,
                genres: input.genres ? toJsonArray(input.genres) : undefined,
                dayRateCents: input.dayRateCents,
                travelRadiusKm: input.travelRadiusKm,
                experienceYears: input.experienceYears,
                sampleUrls: input.sampleUrls ? toJsonArray(input.sampleUrls) : undefined,
                isAvailable: input.isAvailable,
              },
            },
          }
        : {}),
      ...(user.clientProfile
        ? {
            clientProfile: {
              update: {
                organizationName: input.organizationName?.trim(),
                organizationType: input.organizationType,
                website: input.website !== undefined ? (input.website?.trim() || null) : undefined,
              },
            },
          }
        : {}),
    },
  });

  return toSessionUser(updated);
}
