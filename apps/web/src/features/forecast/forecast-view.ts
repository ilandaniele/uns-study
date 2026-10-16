import type { RoomForecastDto } from "@sala/contracts";

export interface ArtNow {
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

const ART_TZ = "America/Argentina/Buenos_Aires";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday (Mon = 0), hour and minute of `date` in Argentina time. */
export function artNow(date: Date): ArtNow {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ART_TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: Math.max(0, WEEKDAYS.indexOf(get("weekday"))), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** Today's hourly ratios (one per slot from `startHour` to `endHour`). */
export function todaySlots(dto: RoomForecastDto, now: ArtNow): { hour: number; ratio: number | null }[] {
  const row = dto.grid[now.weekday] ?? [];
  const slots: { hour: number; ratio: number | null }[] = [];
  for (let hour = dto.startHour; hour <= dto.endHour; hour++) slots.push({ hour, ratio: row[hour - dto.startHour] ?? null });
  return slots;
}

/** "Hoy a las 15 h suele estar al 80 %" for the next full hour inside the forecast window, or null. */
export function headline(dto: RoomForecastDto, now: ArtNow): string | null {
  if (dto.computedAt === null) return null;
  const target = Math.max(dto.startHour, now.minute > 0 ? now.hour + 1 : now.hour);
  if (target > dto.endHour) return null;
  const ratio = todaySlots(dto, now).find((s) => s.hour === target)?.ratio;
  if (ratio === null || ratio === undefined) return null;
  return `Hoy a las ${target} h suele estar al ${Math.round(ratio * 100)} %`;
}
