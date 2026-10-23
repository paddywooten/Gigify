// Application error taxonomy. Route handlers translate these into JSON responses.

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

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(message, 400, details);
export const unauthorized = (message = "You must be signed in.") =>
  new ApiError(message, 401);
export const forbidden = (message = "You do not have permission to do that.") =>
  new ApiError(message, 403);
export const notFound = (message = "Not found.") => new ApiError(message, 404);
export const conflict = (message: string) => new ApiError(message, 409);
