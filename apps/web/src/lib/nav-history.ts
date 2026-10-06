"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

let navigationCount = 0;

/** Pure counter step: the first observed pathname is the landing page and does not count. */
export function nextNavigationCount(count: number, previous: string | null, current: string | null): number {
  if (previous === null || previous === current) return count;
  return count + 1;
}

/** True once the user has moved between pages inside the app (so `router.back()` stays in-app). */
export function hasInAppHistory(): boolean {
  return navigationCount > 0;
}

export function useTrackNavigation(): void {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    navigationCount = nextNavigationCount(navigationCount, previous.current, pathname);
    previous.current = pathname;
  }, [pathname]);
}
