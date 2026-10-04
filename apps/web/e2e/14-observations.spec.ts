import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seats reserved for this spec (distinct from other spec files to avoid cross-test collisions).
// The FREE and OCCUPIED marks below use *different* seats (rather than toggling one seat back and
// forth) so that a conflicting, not-yet-expired observation from a *previous* run of this same
// spec (a different, freshly signed-up "B" each time) can never make one of these two independent,
// single-observer assertions flaky.
const SEAT_MARK_OCCUPIED = { table: "8", seatNumber: 5 }; // nobody's seat, marked occupied by B
const SEAT_MARK_FREE = { table: "8", seatNumber: 6 }; // nobody's seat, marked free by B
const SEAT_OWN = { table: "8", seatNumber: 2 }; // B's own seat

test("observations change seat state for other viewers, aren't offered on your own seat, and don't spuriously rate-limit", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    // A watches the room anonymously.
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    const seatOccupiedOnA = seatLocator(pageA, SEAT_MARK_OCCUPIED.table, SEAT_MARK_OCCUPIED.seatNumber);
    const seatFreeOnA = seatLocator(pageA, SEAT_MARK_FREE.table, SEAT_MARK_FREE.seatNumber);

    // B logs in and marks one (nobody's) seat occupied and a different one free — two normal actions.
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);

    await seatLocator(pageB, SEAT_MARK_OCCUPIED.table, SEAT_MARK_OCCUPIED.seatNumber).click();
    await pageB.getByRole("button", { name: "Está ocupado" }).click();
    await expect(seatOccupiedOnA).toHaveAttribute("aria-label", /: ocupado/, { timeout: 10_000 });
    await expect(pageB.getByText("Hiciste muchas acciones seguidas.")).toHaveCount(0);

    await seatLocator(pageB, SEAT_MARK_FREE.table, SEAT_MARK_FREE.seatNumber).click();
    await pageB.getByRole("button", { name: "Está libre" }).click();
    await expect(seatFreeOnA).toHaveAttribute("aria-label", /: libre/, { timeout: 10_000 });
    await expect(pageB.getByText("Hiciste muchas acciones seguidas.")).toHaveCount(0);

    // B checks in on their own seat: marking it free/occupied isn't offered for your own seat.
    await seatLocator(pageB, SEAT_OWN.table, SEAT_OWN.seatNumber).click();
    await pageB.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageB.getByRole("button", { name: "Me voy" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Está libre" })).toHaveCount(0);
    await expect(pageB.getByRole("button", { name: "Está ocupado" })).toHaveCount(0);
  } finally {
    await checkoutCurrent(contextB);
    await contextA.close();
    await contextB.close();
  }
});
