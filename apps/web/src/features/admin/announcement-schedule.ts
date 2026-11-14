/** datetime-local has no timezone: administrators explicitly enter Bahía Blanca time (UTC−3). */
export function announcementInstant(value: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Revisá la fecha y la hora.");
  const instant = new Date(`${value}:00-03:00`);
  if (!Number.isFinite(+instant) || new Date(+instant - 3 * 60 * 60_000).toISOString().slice(0, 16) !== value) {
    throw new Error("Revisá la fecha y la hora.");
  }
  return instant.toISOString();
}
