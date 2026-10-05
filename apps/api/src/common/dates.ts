import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/** Fallback IANA timezone when a room's own `timezone` isn't available. */
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** 'YYYY-MM-DD' in `tz` for `date`. */
export function localDateOf(date: Date, tz: string): string {
  return format(toZonedTime(date, tz), "yyyy-MM-dd");
}
