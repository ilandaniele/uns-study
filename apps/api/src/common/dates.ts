import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** Fallback IANA timezone when a room's own `timezone` isn't available. */
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** 'YYYY-MM-DD' in `tz` for `date`. */
export function localDateOf(date: Date, tz: string): string {
  return format(toZonedTime(date, tz), "yyyy-MM-dd");
}

/** The instant local midnight starts the day after `localDate` ('YYYY-MM-DD') in `tz`. */
export function nextLocalMidnight(localDate: string, tz: string): Date {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return fromZonedTime(`${d.toISOString().slice(0, 10)}T00:00:00`, tz);
}
