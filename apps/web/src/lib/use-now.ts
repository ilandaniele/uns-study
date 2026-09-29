"use client";

import { useEffect, useState } from "react";

/** Current time, refreshed every `ms`. Keep it in the small component that needs it so parents don't re-render on each tick. */
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
