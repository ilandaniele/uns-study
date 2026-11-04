import { expect, test } from "@playwright/test";
import { getMyUserId, signUpNewUser } from "./helpers";

test("DM: A opens B's profile, sends a message, B sees it unread in /chat/dm", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await signUpNewUser(contextA);
    await signUpNewUser(contextB);
    const userIdB = await getMyUserId(contextB);

    const pageA = await contextA.newPage();
    await pageA.goto(`/u/${userIdB}`);
    await pageA.getByRole("button", { name: "Enviar mensaje" }).click();
    // The chat widget opens as an inline dialog with the DM composer.
    const dialog = pageA.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Header actions must be usable inside the clipped, rounded widget on both layouts.
    for (const width of [1440, 440]) {
      await pageA.setViewportSize({ width, height: 960 });
      const options = dialog.getByRole("button", { name: "Opciones de la conversación" });
      await options.click();
      const menu = dialog.getByRole("menu", { name: "Opciones de la conversación" });
      await expect(menu).toBeVisible();
      const anchor = (await options.boundingBox())!;
      const bounds = (await menu.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      for (const label of ["Reportar", "Bloquear"]) {
        const item = menu.getByRole("menuitem", { name: label });
        // Visibility alone misses overflow clipping; check the actual touch target.
        expect(await item.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })).toBe(true);
      }
      await expect(menu.getByRole("menuitem", { name: "Reportar" })).toBeFocused();
      await pageA.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Bloquear" })).toBeFocused();
      await pageA.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(options).toBeFocused();
      await expect(dialog).toBeVisible();
      await options.click();
      await expect(menu).toBeVisible();
      await options.click();
      await expect(menu).toBeHidden();
      await options.click();
      await dialog.locator('textarea[maxlength="1000"]').click();
      await expect(menu).toBeHidden();
    }

    // The room-chat panel stays mounted in the dialog; the DM composer is the one with the 1000-char limit.
    const composer = dialog.locator('textarea[maxlength="1000"]');
    const content = `dm-${Date.now()}`;
    await composer.fill(content);
    await composer.press("Enter");
    await expect(dialog.getByText(content)).toBeVisible();

    const pageB = await contextB.newPage();
    await pageB.goto("/chat/dm");
    // Unread badge visible on the conversation row before opening it.
    await expect(pageB.getByText(content)).toBeVisible({ timeout: 10_000 });
    const unreadBadge = pageB.locator("li", { hasText: content }).getByText(/^\d+$/);
    await expect(unreadBadge).toBeVisible();

    await pageB.getByText(content).click();
    await expect(pageB.getByText(content)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
