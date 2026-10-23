// Helpers for driving the API route handlers directly in tests.

import { NextRequest } from "next/server";
import type { Role } from "@/lib/constants";

export const BASE = "http://localhost:3000/api/v1";

export function makeReq(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers["cookie"] = opts.cookie;
  return new NextRequest(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Builds the `{ params }` context expected by dynamic-segment route handlers. */
export const ctxFor = (id: string) => ({ params: { id } });

export function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  const match = header.match(/sb_session=([^;]+)/);
  if (!match) throw new Error(`No session cookie in response: ${header}`);
  return `sb_session=${match[1]}`;
}

export type TestUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  cookie: string;
};

let userCounter = 0;

/** Registers a user through the real route handler and returns their session cookie. */
export async function registerUser(
  role: "MUSICIAN" | "CLIENT",
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const { POST } = await import("@/app/api/v1/auth/register/route");
  const n = ++userCounter;
  const email = String(overrides.email ?? `user${n}.${Date.now()}@test.dev`);

  const res = await POST(
    makeReq("/auth/register", {
      method: "POST",
      body: {
        email,
        password: "password123",
        name: String(overrides.name ?? `Test ${role} ${n}`),
        role,
        location: "Testville",
        ...(role === "MUSICIAN"
          ? { instruments: ["Vocals"], genres: ["Gospel"], dayRateCents: 50000 }
          : { organizationName: `Org ${n}`, organizationType: "CHURCH" }),
        ...overrides,
      },
    }),
  );

  const payload = (await res.json()) as {
    user: { id: string; email: string; name: string; role: Role };
  };
  return { ...payload.user, email, cookie: cookieFrom(res) };
}

export async function registerAdmin(): Promise<TestUser> {
  const user = await registerUser("CLIENT", { name: "Test Admin" });
  const { prisma } = await import("@/server/db");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  return { ...user, role: "ADMIN" };
}

/** Dumps a route handler response into a comparable object. */
export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
