import { expect, test } from "@playwright/test";
import { IN_GEOFENCE_LOCATION, ROOM_SLUG, checkoutCurrent, seatLocator, signUpNewUser } from "./helpers";

// Seat reserved for this spec (distinct from other spec files to avoid cross-test collisions).
const SEAT = { table: "12", seatNumber: 5 };

test.use({ viewport: { width: 390, height: 844 } });

test("mobile viewport smoke: room map, bottom sheet, check-in, and bottom nav across pages", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["geolocation"], geolocation: IN_GEOFENCE_LOCATION });
  const page = await context.newPage();
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  try {
    await signUpNewUser(context);
    // The donation prompt waits until the visitor has checked in once; mark that so it shows on this visit.
    await context.addInitScript(() => window.localStorage.setItem("sala.firstCheckInAt", String(Date.now())));

    await page.goto(`/sala/${ROOM_SLUG}`);
    // "Total: N lugares" is desktop-only (RoomInfoPanel); the compact mobile header still has the counters.
    await expect(page.getByText("Libres", { exact: true })).toBeVisible();

    // The weekly donation prompt opens shortly after load on mobile; dismiss it and check it stays away.
    const donate = page.getByRole("dialog", { name: "¿Querés donar?" });
    await expect(donate).toBeVisible({ timeout: 10_000 });
    await expect(donate.getByText("golf.cabina.mulita")).toBeVisible();
    await donate.getByRole("button", { name: "Ahora no" }).click();
    await expect(donate).toBeHidden();
    await expect(page.getByText("Ocupados")).toBeVisible();

    // Tapping a seat opens the bottom sheet.
    await seatLocator(page, SEAT.table, SEAT.seatNumber).click();
    await expect(page.getByRole("button", { name: "Estoy acá" })).toBeVisible();

    await page.getByRole("button", { name: "Estoy acá" }).click();
    await expect(page.getByRole("button", { name: "Me voy" })).toBeVisible();

    // The bottom sheet covers the bottom nav until closed.
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();

    // Bottom nav links load each page without console/page errors.
    for (const [label, heading] of [
      ["Comunidad", null],
      ["Personas", null],
      ["Ranking", "Ranking"],
      ["Perfil", null],
      ["Sala", null],
    ] as const) {
      // `force: true`: Next.js dev mode's own floating dev-tools indicator (a `<nextjs-portal>`,
      // not part of the app) can sit over the bottom nav at this viewport size in local dev.
      await page.getByRole("link", { name: label, exact: true }).click({ force: true });
      if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      else await page.waitForLoadState("networkidle");
    }

    expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
  } finally {
    await checkoutCurrent(context);
    await context.close();
  }
});
