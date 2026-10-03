"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { loadAnalytics, trackPageView } from "@/lib/analytics";

/** Loads GA4 on mount and reports a query-less page_view per route. No-op when `NEXT_PUBLIC_GA_ID` is unset. */
export function AnalyticsLoader() {
  const pathname = usePathname();

  useEffect(() => {
    loadAnalytics();
  }, []);

  useEffect(() => {
    trackPageView();
  }, [pathname]);

  return null;
}
