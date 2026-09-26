"use client";

import { useEffect } from "react";
import { loadAnalytics } from "@/lib/analytics";

/** Loads GA4 on mount. No-op when `NEXT_PUBLIC_GA_ID` is unset. */
export function AnalyticsLoader() {
  useEffect(() => {
    loadAnalytics();
  }, []);

  return null;
}
