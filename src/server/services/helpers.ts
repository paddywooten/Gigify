// Small service utilities: pagination parsing + JSON list responses.

import type { NextRequest } from "next/server";
import { badRequest } from "@/server/errors";
import type { Paginated } from "@/lib/types";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function paginationFrom(req: NextRequest): { page: number; limit: number } {
  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? "1");
  const limit = Number(sp.get("limit") ?? String(DEFAULT_LIMIT));
  if (!Number.isInteger(page) || page < 1) throw badRequest("Invalid page.");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw badRequest(`Limit must be between 1 and ${MAX_LIMIT}.`);
  }
  return { page, limit };
}

export function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, total, page, limit };
}
