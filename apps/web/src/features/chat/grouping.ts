/** Minimal shape shared by chat room messages and DM messages for grouping purposes. */
export interface GroupableMessage {
  id: string;
  authorId: string;
  createdAt: string;
}

/** Consecutive messages from the same author within this many minutes collapse visually (no repeated avatar/name). */
const GROUP_GAP_MINUTES = 5;

/**
 * True when `current` should render without a repeated author header/avatar because it
 * immediately follows a message from the same author within `GROUP_GAP_MINUTES`.
 * Expects ascending (oldest-first) order, matching how threads are rendered.
 */
export function isGroupedWithPrevious(current: GroupableMessage, previous: GroupableMessage | null): boolean {
  if (!previous) return false;
  if (previous.authorId !== current.authorId) return false;
  const gapMs = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gapMs >= 0 && gapMs <= GROUP_GAP_MINUTES * 60_000;
}

/**
 * Maps an ascending list of messages to `{ message, grouped }` pairs, where `grouped` means
 * "don't repeat the author header for this one" (per `isGroupedWithPrevious`).
 */
export function groupMessages<T extends GroupableMessage>(messages: T[]): { message: T; grouped: boolean }[] {
  return messages.map((message, index) => ({
    message,
    grouped: isGroupedWithPrevious(message, messages[index - 1] ?? null),
  }));
}

/** "HH:MM" (24h, local time), used next to each message. */
export function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Hoy" / "Ayer" / "DD/MM/AAAA" day separator label for a message timestamp. */
export function formatDaySeparator(createdAt: string, now: Date = new Date()): string {
  const date = new Date(createdAt);
  if (isSameLocalDay(date, now)) return "Hoy";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return "Ayer";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * For an ascending list of messages, `true` at each index where a day separator should be
 * rendered above it (the first message, or the first one on a new day). Pure — computed as a
 * lookup array instead of a mutable "last seen day" variable so render stays side-effect free.
 */
export function daySeparatorFlags(messages: { createdAt: string }[]): boolean[] {
  return messages.map((message, index) => {
    if (index === 0) return true;
    return formatDaySeparator(message.createdAt) !== formatDaySeparator(messages[index - 1]!.createdAt);
  });
}

/**
 * Union of the shown messages and a freshly fetched page (the fresh copy wins, e.g. a deletion),
 * oldest first. Merging instead of replacing keeps realtime messages that arrived mid-request.
 */
export function mergeMessages<T extends { id: string; createdAt: string }>(prev: T[], page: T[]): T[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of page) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => (x.createdAt === y.createdAt ? x.id.localeCompare(y.id) : x.createdAt < y.createdAt ? -1 : 1));
}
