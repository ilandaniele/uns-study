"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export interface NavigationEntry { path: string; depth: number; previousPath: string | null }
const HISTORY_KEY = "salaNavigation";
let currentEntry: NavigationEntry | null = null;
let replacementPath: string | null = null;

/** Restored entries retain their original depth; a fallback replaces the landing page. */
export function nextNavigationEntry(path: string, previous: NavigationEntry | null, restored: NavigationEntry | null, replacement: string | null): NavigationEntry {
  if (replacement === path) return { path, depth: 0, previousPath: null };
  if (restored?.path === path) return restored;
  if (previous?.path === path) return previous;
  return { path, depth: previous ? previous.depth + 1 : 0, previousPath: previous?.path ?? null };
}

function storedEntry(): NavigationEntry | null {
  const entry: unknown = window.history.state?.[HISTORY_KEY];
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Partial<NavigationEntry>;
  return typeof value.path === "string" && Number.isInteger(value.depth) && value.depth! >= 0 && (value.previousPath === null || typeof value.previousPath === "string") ? value as NavigationEntry : null;
}

/** Optionally require that Back leads to this particular parent, not another visited page. */
export function hasInAppHistory(parentHref?: string): boolean {
  const entry = storedEntry();
  return Boolean(entry && entry.path === window.location.pathname && entry.depth > 0 && (!parentHref || entry.previousPath === new URL(parentHref, window.location.href).pathname));
}

/** The next fallback must not manufacture another entry or an apparent Back destination. */
export function markBackFallback(href: string): void {
  replacementPath = new URL(href, window.location.href).pathname;
}

export function useTrackNavigation(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    currentEntry = nextNavigationEntry(pathname, currentEntry, storedEntry(), replacementPath);
    replacementPath = null;
    // Keep Next's own history fields intact. This metadata contains paths, not account data.
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: currentEntry }, "");
  }, [pathname]);
}
