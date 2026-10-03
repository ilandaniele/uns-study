// Remembered "show identity" preference, used only to pre-fill the *next* check-in's `showIdentity`
// field before the identity prompt is shown. The actual current check-in's visibility is now
// canonical server-side (`PATCH /checkins/current/identity`, see `useSeatActions.updateIdentity`) —
// this local value is just a convenience default, not a source of truth.
const STORAGE_KEY = "sala:show-identity";

export function hasChosenIdentityVisibility(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}

export function getShowIdentityPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setShowIdentityPreference(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
}
