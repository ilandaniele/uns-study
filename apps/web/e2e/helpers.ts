import type { BrowserContext, Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

export const API_URL = "http://localhost:4000";
export const ROOM_SLUG = "principal";

/** Coordinates of the seeded room (see packages/database/src/seed.ts INITIAL_ROOM). */
export const IN_GEOFENCE_LOCATION = { latitude: -38.70138372483678, longitude: -62.270139753196005, accuracy: 20 };

function randomEmail(): string {
  return `e2e-${randomBytes(6).toString("hex")}@example.test`;
}

function randomPassword(): string {
  return randomBytes(12).toString("hex");
}

/**
 * Creates a fresh user via Better Auth's email/password sign-up endpoint using the *context's*
 * request fixture, so the resulting session cookie lands in that browser context. Returns the
 * credentials in case a test needs to sign in again (e.g. after a page reload loses no cookie,
 * but a second tab/context might need its own account).
 */
export async function signUpNewUser(context: BrowserContext): Promise<{ email: string; password: string }> {
  const email = randomEmail();
  const password = randomPassword();
  const res = await context.request.post(`${API_URL}/api/auth/sign-up/email`, {
    headers: { Origin: "http://localhost:3000" },
    data: { email, password, name: email.split("@")[0] },
  });
  if (!res.ok()) {
    throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  }
  return { email, password };
}

/** Locator selector prefix for a seat's aria-label, e.g. `Mesa 4 asiento 3:`. */
export function seatAriaPrefix(tableLabel: string, seatNumber: number, kind: "Mesa" | "Barra" = "Mesa"): string {
  return `${kind} ${tableLabel} asiento ${seatNumber}:`;
}

export function seatLocator(page: Page, tableLabel: string, seatNumber: number, kind: "Mesa" | "Barra" = "Mesa") {
  return page.locator(`[aria-label^="${seatAriaPrefix(tableLabel, seatNumber, kind)}"]`);
}

/** Best-effort checkout so a test doesn't leak an ACTIVE check-in into the next run. */
export async function checkoutCurrent(context: BrowserContext): Promise<void> {
  await context.request.delete(`${API_URL}/api/v1/checkins/current`, {
    headers: { Origin: "http://localhost:3000" },
  });
}

/** Reads the signed-in user's id via `GET /me` using the context's session cookie. */
export async function getMyUserId(context: BrowserContext): Promise<string> {
  const res = await context.request.get(`${API_URL}/api/v1/me`, {
    headers: { Origin: "http://localhost:3000" },
  });
  if (!res.ok()) {
    throw new Error(`GET /me failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string } | null };
  if (!body.user) throw new Error("GET /me returned an anonymous session");
  return body.user.id;
}
