import type { ApiError, ApiErrorCode } from "@uns/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Thrown by `apiFetch` when the API responds with the `{ error }` shape. */
export class ApiRequestError extends Error {
  code: ApiErrorCode;
  reason?: string;

  constructor(body: ApiError, status: number) {
    super(body.error.message);
    this.name = "ApiRequestError";
    this.code = body.error.code;
    this.reason = body.error.reason;
    this.status = status;
  }

  status: number;
}

/**
 * Thin wrapper around `fetch` for the UNS Study API.
 * Always sends cookies (Better Auth session) and parses the shared ApiError shape on failure.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // ignore: response had no JSON body
    }
    if (body?.error) {
      throw new ApiRequestError(body, res.status);
    }
    throw new Error(`Error de red (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
