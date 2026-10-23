// Minimal HTTP helpers for talking to payment provider REST APIs.
// `fetchFn` is injectable so unit tests never hit the network.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export type FormFields = Record<string, string | number | boolean | undefined>;

/** Strips undefined values; nested Stripe-style keys like `metadata[bookingId]` pass through as-is. */
export function encodeForm(fields: FormFields): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  return params;
}

export class ProviderHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

/** Best-effort extraction of a human-readable error message from a provider response. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const stripeErr = body.error as { message?: string } | undefined;
    if (stripeErr?.message) return stripeErr.message;
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* non-JSON body */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export async function postForm(
  url: string,
  opts: {
    bearer: string;
    fields: FormFields;
    fetchFn?: FetchLike;
    idempotencyKey?: string;
  },
): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.bearer}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  const res = await (opts.fetchFn ?? defaultFetch)(url, {
    method: "POST",
    headers,
    body: encodeForm(opts.fields),
  });
  if (!res.ok) throw new ProviderHttpError(await readErrorMessage(res, "Provider request failed"), res.status);
  return res.json();
}

export async function getJson(
  url: string,
  opts: { bearer: string; fetchFn?: FetchLike },
): Promise<unknown> {
  const res = await (opts.fetchFn ?? defaultFetch)(url, {
    headers: { authorization: `Bearer ${opts.bearer}` },
  });
  if (!res.ok) throw new ProviderHttpError(await readErrorMessage(res, "Provider request failed"), res.status);
  return res.json();
}
