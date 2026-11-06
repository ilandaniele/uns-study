import { expect, test } from "@playwright/test";

// Public information must remain usable even when the interactive map cannot hydrate.
test.use({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });

test("a visitor can read the room information and navigate the guide without JavaScript", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sala de Estudio · Bahía Blanca", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "información de la sala y las guías", exact: true }).click();

  const info = page.getByRole("region", { name: "Estudiar en la sala de Alem, Bahía Blanca" });
  await expect(info).toBeVisible();
  await expect(info.getByRole("heading", { name: "Antes de salir", exact: true })).toBeVisible();
  await info.getByRole("link", { name: /Prepará tu visita/ }).click();

  await expect(page.getByRole("heading", { name: "Ir a la sala de Alem: cómo leer el mapa y colaborar", exact: true })).toBeVisible();
  const contents = page.getByRole("navigation", { name: "Contenido de la guía" });
  await contents.getByRole("link", { name: "Por qué un lugar vuelve a Sin datos", exact: true }).click();
  await expect(page).toHaveURL(/#seccion-5$/);
  await expect(page.locator("#seccion-5")).toBeVisible();
  await expect(page.getByRole("link", { name: /Biblioteca Central UNS · Salas de lectura/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "ilan.daniele@gmail.com", exact: true })).toHaveAttribute("href", "mailto:ilan.daniele@gmail.com");

  await page.getByRole("link", { name: "Guías de estudio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ideas para estudiar mejor", exact: true })).toBeVisible();
});
