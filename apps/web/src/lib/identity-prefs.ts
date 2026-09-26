// Identity visibility choice, stored locally only (TODO: persist server-side once profiles ship).
const STORAGE_KEY = "uns-study:show-identity";

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
