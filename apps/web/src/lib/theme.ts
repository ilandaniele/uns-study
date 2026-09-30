export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "uns-theme";

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
  } catch (e) {}
})();
`;
