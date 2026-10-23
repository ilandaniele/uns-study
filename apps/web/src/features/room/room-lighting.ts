const localHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "numeric",
  hourCycle: "h23",
});

/** Display-only schedule in Bahía Blanca, independent of the visitor's clock zone or theme. */
export function isRoomDaytime(now: number): boolean {
  const hour = Number(localHour.format(now));
  return hour >= 7 && hour < 20;
}
