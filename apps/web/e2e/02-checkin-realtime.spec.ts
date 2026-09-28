import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seats reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT_X = { table: "1", seatNumber: 1 };
const SEAT_Y = { table: "1", seatNumber: 2 };

test("check-in, moving seats, and seat-taken propagate in realtime to another visitor", async ({ browser }) => {
  const contextA = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: IN_GEOFENCE_LOCATION,
  });
  const contextB = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: IN_GEOFENCE_LOCATION,
  });

  try {
    await signUpNewUser(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);

    // B starts out anonymous, watching the same room.
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);

    // A checks in on seat X.
    const seatXOnA = seatLocator(pageA, SEAT_X.table, SEAT_X.seatNumber);
    await seatXOnA.click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    // B sees X become occupied without reloading.
    const seatXOnB = seatLocator(pageB, SEAT_X.table, SEAT_X.seatNumber);
    await expect(seatXOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });

    // A moves to seat Y.
    const seatYOnA = seatLocator(pageA, SEAT_Y.table, SEAT_Y.seatNumber);
    await seatYOnA.click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    // Already seated on X: the app asks before moving, then frees X and occupies Y.
    await expect(pageA.getByRole("dialog", { name: "Ya tenés otro lugar marcado" })).toBeVisible();
    await pageA.getByRole("button", { name: "Sí, cambiarme de lugar" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    // B sees X free up and Y become occupied.
    await expect(seatXOnB).not.toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    const seatYOnB = seatLocator(pageB, SEAT_Y.table, SEAT_Y.seatNumber);
    await expect(seatYOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });

    // B logs in and tries to check in on Y, which A currently occupies.
    await signUpNewUser(contextB);
    await pageB.reload();
    const seatYOnBAgain = seatLocator(pageB, SEAT_Y.table, SEAT_Y.seatNumber);
    await seatYOnBAgain.click();
    await pageB.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageB.getByText("Ese lugar ya está ocupado por otra persona.")).toBeVisible();
  } finally {
    await checkoutCurrent(contextA);
    await checkoutCurrent(contextB);
    await contextA.close();
    await contextB.close();
  }
});
