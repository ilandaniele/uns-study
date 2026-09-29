import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seats reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT_CLAIM = { table: "6", seatNumber: 1 }; // A's seat, challenged by B (CLAIM)
const SEAT_VOTER = { table: "6", seatNumber: 4 }; // C's own seat, needed to be eligible to vote
const SEAT_SAVED = { table: "6", seatNumber: 2 }; // D's seat, challenged by B (SAVED)

test("CLAIM dispute: incumbent 'Me fui' frees the seat, opener wins and can check in; voting requires a check-in", async ({ browser }) => {
  const contextA = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextB = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextC = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);
    await signUpNewUser(contextC);

    // A sits down.
    const pageA = await contextA.newPage();
    await pageA.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageA, SEAT_CLAIM.table, SEAT_CLAIM.seatNumber).click();
    await pageA.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageA.getByRole("button", { name: "Me voy" })).toBeVisible();

    // B opens a CLAIM ("Me senté acá") on A's seat.
    const pageB = await contextB.newPage();
    await pageB.goto(`/sala/${ROOM_SLUG}`);
    const seatOnB = seatLocator(pageB, SEAT_CLAIM.table, SEAT_CLAIM.seatNumber);
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await seatOnB.click();
    await pageB.getByRole("button", { name: "Me senté acá" }).click();
    await expect(pageB.getByText(/Se decide en \d+:\d\d/)).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByText("Abriste esta votación.")).toBeVisible();
    await expect(seatOnB).toHaveAttribute("aria-label", /en votación/, { timeout: 10_000 });

    // C, without any check-in of their own, can see the dispute but can't vote yet.
    const pageC = await contextC.newPage();
    await pageC.goto(`/sala/${ROOM_SLUG}`);
    const seatOnC = seatLocator(pageC, SEAT_CLAIM.table, SEAT_CLAIM.seatNumber);
    await expect(seatOnC).toHaveAttribute("aria-label", /en votación/, { timeout: 10_000 });
    await seatOnC.click();
    await expect(pageC.getByText("Marcá tu lugar para votar.")).toBeVisible();
    await expect(pageC.getByRole("button", { name: "Está ahí" })).toHaveCount(0);
    await expect(pageC.getByRole("button", { name: "No está" })).toHaveCount(0);

    // C marks their own seat, then can vote.
    await seatLocator(pageC, SEAT_VOTER.table, SEAT_VOTER.seatNumber).click();
    await pageC.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageC.getByRole("button", { name: "Me voy" })).toBeVisible();
    await seatOnC.click();
    await expect(pageC.getByRole("button", { name: "No está" })).toBeVisible();
    await pageC.getByRole("button", { name: "No está" }).click();
    await expect(pageC.getByText("Votaste: No está")).toBeVisible({ timeout: 10_000 });

    // A is challenged in realtime and answers "Me fui".
    await expect(pageA.getByText(/¿Seguís ahí\?/)).toBeVisible({ timeout: 10_000 });
    await pageA.getByRole("button", { name: "Me fui" }).click();
    await expect(pageA.getByText(/¿Seguís ahí\?/)).toBeHidden({ timeout: 10_000 });
    // A's check-in was cancelled: no "Me voy" button left for A on that seat.
    await expect(pageA.getByRole("button", { name: "Me voy" })).toHaveCount(0);

    // B won the vote and can now self-check-in on the now-free seat via the "you won" banner
    // (the seat detail panel also offers its own "Estoy acá", hence scoping to the banner).
    const wonBanner = pageB.getByRole("status").filter({ hasText: "Ganaste la votación" });
    await expect(wonBanner).toBeVisible({ timeout: 10_000 });
    await wonBanner.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageB.getByText(/Ganaste la votación/)).toBeHidden({ timeout: 10_000 });
    await expect(seatOnB).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextA);
    await checkoutCurrent(contextB);
    await checkoutCurrent(contextC);
    await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});

test("SAVED dispute: 'Pedir que se libere' opens a vote on an occupied seat", async ({ browser }) => {
  const contextD = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const contextE = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });

  try {
    await signUpNewUser(contextD);
    await signUpNewUser(contextE);

    const pageD = await contextD.newPage();
    await pageD.goto(`/sala/${ROOM_SLUG}`);
    await seatLocator(pageD, SEAT_SAVED.table, SEAT_SAVED.seatNumber).click();
    await pageD.getByRole("button", { name: "Estoy acá" }).click();
    await expect(pageD.getByRole("button", { name: "Me voy" })).toBeVisible();

    const pageE = await contextE.newPage();
    await pageE.goto(`/sala/${ROOM_SLUG}`);
    const seatOnE = seatLocator(pageE, SEAT_SAVED.table, SEAT_SAVED.seatNumber);
    await expect(seatOnE).toHaveAttribute("aria-label", /ocupado/, { timeout: 10_000 });
    await seatOnE.click();
    await pageE.getByRole("button", { name: "Pedir que se libere" }).click();
    await expect(pageE.getByText("Pedir que se libere", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(pageE.getByText(/Se decide en \d+:\d\d/)).toBeVisible();
    await expect(seatOnE).toHaveAttribute("aria-label", /en votación/, { timeout: 10_000 });
  } finally {
    await checkoutCurrent(contextD);
    await contextD.close();
    await contextE.close();
  }
});
