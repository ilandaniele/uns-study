import { expect, test } from "@playwright/test";

const PAGES: { path: string; loginPrompt: string | RegExp }[] = [
  // "/" redirects to "/sala/principal", which is public (no login prompt of its own).
  { path: "/", loginPrompt: /./ },
  { path: "/sala/principal", loginPrompt: /./ },
  { path: "/personas", loginPrompt: "Iniciá sesión para ver quién está en la sala." },
  { path: "/chat", loginPrompt: "Iniciá sesión para usar el chat." },
  { path: "/ranking", loginPrompt: /./ }, // ranking has no gate; just checked for errors below
  { path: "/comunidad", loginPrompt: /./ }, // public feed; just checked for errors below
  { path: "/perfil", loginPrompt: "Iniciá sesión para editar tu perfil." },
];

for (const { path, loginPrompt } of PAGES) {
  test(`anonymous visitor: ${path} renders without uncaught errors`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    if (path === "/" || path === "/sala/principal") {
      // The room map itself is public; the login prompt only shows once a seat is tapped.
      await expect(page.locator('g[role="button"][aria-label*="asiento"]').first()).toBeVisible();
    } else if (path === "/ranking") {
      await expect(page.getByRole("heading", { name: "Ranking" })).toBeVisible();
    } else if (path === "/comunidad") {
      await expect(page.getByRole("heading", { name: "Comunidad" })).toBeVisible();
    } else {
      await expect(page.getByText(loginPrompt)).toBeVisible();
    }

    expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
  });
}
