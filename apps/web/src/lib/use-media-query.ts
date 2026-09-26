"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook: returns `false` on the server and on first client
 * render (matching SSR output to avoid hydration mismatches), then syncs to the
 * real value on mount and on viewport changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
