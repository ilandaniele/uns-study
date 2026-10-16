import { ApiRequestError, apiDelete, apiFetch, apiPatch, apiPost, apiPut } from "@/lib/api";

export { apiDelete, apiFetch, apiPatch, apiPost, apiPut };

/** `encodeURIComponent`, for slugs and ids interpolated into a Pro API path. */
export const enc = encodeURIComponent;

/** True when the API turned the call down because the feature is Pro-only. */
export function isProRequired(err: unknown): boolean {
  return err instanceof ApiRequestError && err.code === "PRO_REQUIRED";
}
