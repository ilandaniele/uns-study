export type ThemePreference = "light" | "dark" | "system";

import { parsePalette, PALETTE_STORAGE_KEY, type Palette } from "@/features/theme/palette";

const STORAGE_KEY = "sala-theme";

/** Reads the stored theme preference, defaulting to `"system"` when unset or unavailable. */
export function getStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // localStorage may be unavailable (private browsing, disabled storage) — fall back silently.
  }
  return "system";
}

/** Persists the theme preference and applies it to `<html>` immediately. */
export function setStoredTheme(theme: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore write failures; the preference just won't survive a reload.
  }
  applyTheme(theme);
}

function resolveIsDark(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Toggles the `.dark` class on `<html>` and keeps the theme-color meta tag in sync. */
export function applyTheme(theme: ThemePreference) {
  const isDark = resolveIsDark(theme);
  document.documentElement.classList.toggle("dark", isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#0d1110" : "#eceee9");
}

/** Reads the stored accent palette; unknown or missing values are `"default"`. */
export function getStoredPalette(): Palette {
  try {
    return parsePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY));
  } catch {
    return "default";
  }
}

/** Sets (or, for the default, removes) `data-palette` on `<html>` and persists the choice. */
export function applyPalette(palette: Palette) {
  if (palette === "default") document.documentElement.removeAttribute("data-palette");
  else document.documentElement.dataset.palette = palette;
  try {
    if (palette === "default") window.localStorage.removeItem(PALETTE_STORAGE_KEY);
    else window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Ignore write failures; the palette just won't survive a reload.
  }
}

/**
 * Inline script source injected in `<head>` (before hydration) so the correct theme applies
 * before first paint — avoids a light-mode flash for users who prefer dark. Kept as a plain
 * string (not the functions above) because it must run standalone, before any JS module loads.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("${STORAGE_KEY}");
    var isDark = stored === "dark" || ((stored === "system" || !stored) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
    var palette = window.localStorage.getItem("${PALETTE_STORAGE_KEY}");
    if (palette === "violeta" || palette === "bosque" || palette === "atardecer") document.documentElement.dataset.palette = palette;
  } catch (e) {}
})();
`;
