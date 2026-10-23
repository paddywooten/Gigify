// Tiny typed fetch wrapper for the /api/v1 contract.
// Auth uses an HttpOnly session cookie, so credentials: "include" (same-origin) is enough.

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  // FormData bodies must be passed through untouched so the browser sets the
  // multipart boundary; everything else is JSON-encoded.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: options.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? (isForm ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}

/** Extracts a human-readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
