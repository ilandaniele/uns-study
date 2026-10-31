const roomDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", month: "numeric", day: "numeric" });

/** A short annual decoration window, ending after November 1 in the room's timezone. */
export function isHalloweenSeason(time: number): boolean {
  if (!Number.isFinite(time)) return false;
  const parts = roomDate.formatToParts(time);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const day = Number(parts.find(part => part.type === "day")?.value);
  return (month === 10 && day >= 25) || (month === 11 && day === 1);
}
