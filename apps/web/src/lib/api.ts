import type { ApiError, ApiErrorCode, PresenceDetails } from "@sala/contracts";

/**
 * Base URL for REST calls to the API. Empty/unset `NEXT_PUBLIC_API_URL` means "same origin" — the
 * web app is expected to proxy `/api/*` to the API (see `next.config.ts` + `API_PROXY_TARGET`),
 * so cookies stay first-party even though the API runs on a different host. Local dev keeps
 * pointing straight at the API by setting `NEXT_PUBLIC_API_URL=http://localhost:4000`.
 */
export const API_URL = assertSecureApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "", process.env.NODE_ENV);

/** In production the API base must be same-origin (empty/relative) or https, never plain http. */
export function assertSecureApiUrl(url: string, nodeEnv: string | undefined): string {
  if (nodeEnv === "production" && url && !url.startsWith("/") && !/^https:\/\//i.test(url)) {
    throw new Error(`NEXT_PUBLIC_API_URL must be https:// (or empty/relative) in production, got "${url}"`);
  }
  return url;
}

/** Thrown by `apiFetch` when the API responds with the `{ error }` shape. */
export class ApiRequestError extends Error {
  code: ApiErrorCode;
  reason?: string;
  /** Distance/accuracy behind a PRESENCE_REJECTED, when the API could compute them. */
  details?: PresenceDetails;

  constructor(body: ApiError, status: number) {
    super(body.error.message);
    this.name = "ApiRequestError";
    this.code = body.error.code;
    this.reason = body.error.reason;
    this.details = body.error.details;
    this.status = status;
  }

  status: number;
}

/**
 * Thin wrapper around `fetch` for the Sala de Estudio API.
 * Always sends cookies (Better Auth session) and parses the shared ApiError shape on failure.
 */
/** Requests give up after this long so buttons never hang forever on a slow/booting server. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Idempotent reads fail faster, since they're retried once anyway. */
const GET_TIMEOUT_MS = 10_000;

/** Thrown when the API didn't answer within {@link REQUEST_TIMEOUT_MS}. */
export class ApiTimeoutError extends Error {
  constructor() {
    super("El servidor tardó demasiado en responder.");
    this.name = "ApiTimeoutError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  let res: Response;
  try {
    res = await fetchWithTimeout(path, init, isGet ? GET_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  } catch (error) {
    // A GET is safe to retry once after a dropped connection (TypeError from fetch), with jitter.
    if (!isGet || !(error instanceof TypeError) || init?.signal?.aborted) throw error;
    await retryDelay();
    return parseResponse<T>(await fetchWithTimeout(path, init, GET_TIMEOUT_MS));
  }
  // A GET that failed at the gateway (server restarting) is safe to retry once.
  if (isGet && (res.status === 502 || res.status === 503 || res.status === 504)) {
    await retryDelay();
    return parseResponse<T>(await fetchWithTimeout(path, init, GET_TIMEOUT_MS));
  }
  return parseResponse<T>(res);
}

/** Jittered 500-1500 ms pause before the single GET retry. */
function retryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
}

async function fetchWithTimeout(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outerSignal = init?.signal;
  outerSignal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      // Only requests with a body declare a content type (keeps GETs "simple" for CORS/proxies).
      headers: {
        ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted && !outerSignal?.aborted) throw new ApiTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponse<T>(res: Response): Promise<T> {

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

/**
 * Structural subset of a zod schema (`safeParse`), so web needs no direct `zod` dependency: the
 * `@sala/contracts` request schemas satisfy it as-is.
 */
export interface BodySchema {
  safeParse(data: unknown): { success: boolean };
}

/** Spanish message for a body that fails its contract schema on the client. */
export const CLIENT_VALIDATION_MESSAGE = "Los datos ingresados no son válidos. Revisalos e intentá de nuevo.";

/**
 * Checks `data` against `schema` before anything is sent. Throws the same `ApiRequestError` the API
 * would (code VALIDATION_ERROR, status 400) so callers handle one shape; the server still validates.
 */
export function assertValidBody(data: unknown, schema?: BodySchema): void {
  if (!schema || schema.safeParse(data).success) return;
  throw new ApiRequestError({ error: { code: "VALIDATION_ERROR", message: CLIENT_VALIDATION_MESSAGE } }, 400);
}

async function sendJson<T>(method: string, path: string, data: unknown, schema?: BodySchema): Promise<T> {
  assertValidBody(data, schema);
  return apiFetch<T>(path, { method, body: data ? JSON.stringify(data) : undefined });
}

export function apiPost<T>(path: string, data?: unknown, schema?: BodySchema): Promise<T> {
  return sendJson<T>("POST", path, data, schema);
}

export function apiPut<T>(path: string, data?: unknown, schema?: BodySchema): Promise<T> {
  return sendJson<T>("PUT", path, data, schema);
}

export function apiPatch<T>(path: string, data?: unknown, schema?: BodySchema): Promise<T> {
  return sendJson<T>("PATCH", path, data, schema);
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
