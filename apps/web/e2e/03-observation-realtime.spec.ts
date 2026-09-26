import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT_Z = { table: "M02", seatNumber: 1 };

test("an observation from one visitor propagates to another visitor in realtime", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: IN_GEOFENCE_LOCATION,
  });

  try {
    // A watches the room anonymously.
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);

    // B logs in and marks seat Z as free.
    await signUpNewUser(contextB);
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);

    const seatZOnB = seatLocator(pageB, SEAT_Z.table, SEAT_Z.seatNumber);
    await seatZOnB.click();
    await pageB.getByRole("button", { name: "Está libre" }).click();

    // A sees Z become free without reloading.
    const seatZOnA = seatLocator(pageA, SEAT_Z.table, SEAT_Z.seatNumber);
    await expect(seatZOnA).toHaveAttribute("aria-label", /: libre/, { timeout: 10_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
