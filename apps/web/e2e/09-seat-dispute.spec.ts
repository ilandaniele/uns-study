import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "3", seatNumber: 4 };

test("opening an 'Esa persona no está' vote challenges the occupant, who answers 'Sigo acá'", async ({ browser }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);

    // A sits down.
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT.table, SEAT.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();
    // Close the seat detail so its own "Sigo acá" (extend) doesn't compete with the challenge banner's.
    await pageA.getByRole("button", { name: "Cerrar", exact: true }).click();

    // B sees the seat occupied and opens an ABSENT vote.
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);
    const seatOnB = seatLocator(pageB, SEAT.table, SEAT.seatNumber);
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await seatOnB.click();
    await pageB.getByRole("button", { name: /Esa persona no está/ }).click();
    await expect(pageB.getByText(/Se decide en \d+:\d\d/)).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByText("Abriste esta votación.")).toBeVisible();

    // The seat shows it is under vote for everyone.
    await expect(seatOnB).toHaveAttribute("aria-label", /en votación/, { timeout: 10_000 });

    // A is challenged in realtime and answers "Sigo acá".
    await expect(pageA.getByText(/¿Seguís ahí\?/)).toBeVisible({ timeout: 10_000 });
    await pageA.getByRole("button", { name: "Sigo acá" }).click();
    await expect(pageA.getByText(/¿Seguís ahí\?/)).toBeHidden({ timeout: 10_000 });

    // A still holds the seat.
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();
  } finally {
    await checkoutCurrent(contextA);
    await checkoutCurrent(contextB);
    await contextA.close();
    await contextB.close();
  }
});
