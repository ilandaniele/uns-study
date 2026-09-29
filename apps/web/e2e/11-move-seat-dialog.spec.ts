import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seats reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT_OLD = { table: "4", seatNumber: 5 };
const SEAT_NEW = { table: "4", seatNumber: 6 };

test("move-seat dialog: cancel keeps the old seat, confirming frees it and occupies the new one for everyone", async ({ browser }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(contextA);

    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT_OLD.table, SEAT_OLD.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);
    const seatOldOnB = seatLocator(pageB, SEAT_OLD.table, SEAT_OLD.seatNumber);
    const seatNewOnB = seatLocator(pageB, SEAT_NEW.table, SEAT_NEW.seatNumber);
    await expect(seatOldOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });

    // A taps the new seat and cancels the move: nothing changes.
    await seatLocator(pageA, SEAT_NEW.table, SEAT_NEW.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("dialog", { name: "Ya tenés otro lugar marcado" })).toBeVisible();
    await pageA.getByRole("button", { name: "Cancelar" }).click();
    await expect(pageA.getByRole("dialog", { name: "Ya tenés otro lugar marcado" })).toBeHidden();

    // Old seat is still A's, new seat is still free, for both A and B.
    await expect(seatOldOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 5_000 });
    await expect(seatNewOnB).not.toHaveAttribute("aria-label", /ocupado/);

    // The new seat is still selected (cancel only closes the dialog) — confirm the move this time.
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("dialog", { name: "Ya tenés otro lugar marcado" })).toBeVisible();
    await pageA.getByRole("button", { name: "Sí, cambiarme de lugar" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    // B sees the old seat free up and the new seat become occupied, without reloading.
    await expect(seatOldOnB).not.toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await expect(seatNewOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextA);
    await contextA.close();
    await contextB.close();
  }
});
