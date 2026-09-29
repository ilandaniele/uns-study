import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "5", seatNumber: 1 };

test("'Liberar lugar' bar: visible with an active check-in, releases the seat for others", async ({ browser }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(contextA);
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);

    // No bar before checking in.
    await expect(pageA.getByRole("button", { name: "Liberar lugar" })).toHaveCount(0);

    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    // The always-visible bar appears once checked in, even with the seat detail closed.
    await pageA.getByRole("button", { name: "Cerrar", exact: true }).click();
    const releaseButton = pageA.getByRole("button", { name: "Liberar lugar" });
    await expect(releaseButton).toBeVisible();
    await expect(pageA.getByText(/Tenés marcado/)).toBeVisible();

    // B sees the seat occupied.
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);
    const seatOnB = seatLocator(pageB, SEAT.table, SEAT.seatNumber);
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });

    // A releases via the bar (no seat selected, no location needed).
    await releaseButton.click();
    await expect(releaseButton).toHaveCount(0);
    await expect(pageA.getByText(/Tenés marcado/)).toHaveCount(0);

    // B sees the seat free up in realtime, and can check in there.
    await expect(seatOnB).not.toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await signUpNewUser(contextB);
    await pageB.reload();
    await seatOnB.click();
    await pageB.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageB.getByRole("button", { name: "Me voy" })).toBeVisible();
  } finally {
    await checkoutCurrent(contextA);
    await checkoutCurrent(contextB);
    await contextA.close();
    await contextB.close();
  }
});
