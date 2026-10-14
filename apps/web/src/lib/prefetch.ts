import { peekMe } from "./me-store";
import { prefetchPath } from "./query-cache";

const ROOM_SLUG = "principal";

/** GET paths each page loads first. Keep in sync with the hooks that read them via `fetchCached`. */
export const DataPaths = {
  rankings: (roomSlug: string, period: string, category: string) =>
    `/api/v1/rooms/${roomSlug}/rankings?period=${period}&category=${category}`,
  people: (roomSlug: string) => `/api/v1/rooms/${roomSlug}/people`,
  roomChat: (roomSlug: string) => `/api/v1/rooms/${roomSlug}/messages`,
  conversations: () => "/api/v1/conversations",
  dmThread: (conversationId: string) => `/api/v1/conversations/${conversationId}/messages`,
  groups: () => "/api/v1/groups",
  groupThread: (groupId: string) => `/api/v1/groups/${groupId}/messages`,
  groupContacts: () => "/api/v1/groups/contacts",
} as const;

/** The ranking view opens on this period/category. */
const DEFAULT_RANKING = { period: "week", category: "study_time" } as const;

/** Data behind a nav destination; signed-in-only endpoints are skipped for visitors (they'd 401). */
function pathsFor(href: string): string[] {
  const signedIn = Boolean(peekMe()?.user);
  if (href.startsWith("/ranking")) return [DataPaths.rankings(ROOM_SLUG, DEFAULT_RANKING.period, DEFAULT_RANKING.category)];
  if (!signedIn) return [];
  if (href.startsWith("/personas")) return [DataPaths.people(ROOM_SLUG)];
  const thread = /^\/chat\/dm\/([^/?#]+)/.exec(href);
  if (thread) return [DataPaths.dmThread(thread[1]!)];
  if (href.startsWith("/chat/dm")) return [DataPaths.conversations()];
  if (href.startsWith("/chat")) return [DataPaths.roomChat(ROOM_SLUG)];
  return [];
}

/** Starts loading a page's data on hover/touch/focus of its link, so it renders with data on arrival. */
function prefetchRouteData(href: string): void {
  for (const path of pathsFor(href)) prefetchPath(path);
}

/** Link props that trigger `prefetchRouteData` on the earliest user intent. */
export function prefetchHandlers(href: string) {
  const run = () => prefetchRouteData(href);
  return { onMouseEnter: run, onTouchStart: run, onFocus: run };
}

function slowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g");
}

function whenIdle(run: () => void): void {
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 3000);
}

/** When idle, warms the data behind the given links (e.g. the top conversations of the DM list). */
export function prefetchWhenIdle(hrefs: string[]): void {
  if (typeof window === "undefined" || hrefs.length === 0 || slowConnection()) return;
  whenIdle(() => {
    for (const href of hrefs) prefetchRouteData(href);
  });
}

let idleScheduled = false;

/**
 * Once per page load, when the browser is idle, warms the tabs people open most after the map
 * (ranking, and chat when signed in). Skipped on data-saver / slow connections.
 */
export function prefetchLikelyNextWhenIdle(): void {
  if (idleScheduled || typeof window === "undefined") return;
  if (slowConnection()) return;
  idleScheduled = true;
  whenIdle(() => {
    prefetchRouteData("/ranking");
    prefetchRouteData("/chat");
  });
}
