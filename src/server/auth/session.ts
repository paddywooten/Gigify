// Cookie-based sessions: a random token lives in an HttpOnly cookie, while only
// its SHA-256 hash is stored in the database (a DB leak cannot leak live sessions).
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/constants";
import { forbidden, unauthorized } from "@/server/errors";
import { prisma } from "@/server/db";

export const SESSION_COOKIE = "sb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  bio: string | null;
  location: string | null;
  createdAt: Date;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Creates a session row and returns the raw token to place in a cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Resolves the signed-in user from the request cookie, or null. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    bio: user.bio,
    location: user.location,
    createdAt: user.createdAt,
  };
}

/** Requires a signed-in user, optionally restricted to a set of roles. */
export async function requireUser(req: NextRequest, roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw unauthorized();
  if (roles && !roles.includes(user.role)) {
    throw forbidden(`This action requires one of: ${roles.join(", ")}.`);
  }
  return user;
}

export async function destroySession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session
    .deleteMany({ where: { tokenHash: sha256(token) } })
    .catch(() => undefined);
}
