"use client";

import { useTrackNavigation } from "@/lib/nav-history";

/** Mounted once in the root layout; records in-app navigations for BackButton. */
export function NavigationTracker() {
  useTrackNavigation();
  return null;
}
