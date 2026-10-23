// Shared helpers for API route handlers: JSON responses, zod parsing and
// uniform error handling (ApiError -> { error, details? }).

import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { ApiError } from "@/server/errors";

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: 201 });
}

/** Parses `value` with a zod schema, converting failures to a 400 ApiError. */
export function parseBody<S extends ZodSchema>(schema: S, value: unknown): S["_output"] {
  try {
    return schema.parse(value) as S["_output"];
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      throw new ApiError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request.",
        400,
        err.issues,
      );
    }
    throw err;
  }
}

/** Wraps a route handler with uniform error handling. */
export function handle<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>,
): (...args: Args) => Promise<NextResponse | Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      // Let Next.js internal control-flow errors (dynamic rendering, redirects)
      // propagate so the framework can handle them.
      if (err instanceof Error && typeof (err as { digest?: string }).digest === "string" &&
          (err as { digest?: string }).digest!.startsWith("NEXT_")) {
        throw err;
      }
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, details: err.details },
          { status: err.status },
        );
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
  };
}
