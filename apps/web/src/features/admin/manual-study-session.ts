/** Argentina has no DST: America/Argentina/Buenos_Aires is a fixed UTC-3. */
const BUENOS_AIRES_OFFSET_HOURS = 3;

/** Converts a `datetime-local` value (wall time in Buenos Aires) to a UTC ISO string, or null if invalid. */
export function buenosAiresLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, hour + BUENOS_AIRES_OFFSET_HOURS, minute));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
