import { expect, test } from "@playwright/test";

test("PWA manifest and icons are served", async ({ request }) => {
  const manifestRes = await request.get("/manifest.webmanifest");
  expect(manifestRes.status()).toBe(200);
  const manifest = await manifestRes.json();
  expect(manifest.icons?.length).toBeGreaterThan(0);

  for (const icon of manifest.icons as { src: string }[]) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.status()).toBe(200);
  }
});
