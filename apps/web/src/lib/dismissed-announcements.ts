/** Per-device memory of announcements ("novedades") the user closed with the banner's X. Keyed by
 *  announcement id, so a new announcement shows again; the full list stays on /comunidad. */

const STORAGE_KEY = "sala:dismissed-announcements";
/** Ids kept at most; older ones belong to announcements that ended long ago. */
const MAX_IDS = 50;

export function readDismissedAnnouncements(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function dismissAnnouncement(id: string): Set<string> {
  const ids = readDismissedAnnouncements();
  ids.delete(id);
  ids.add(id);
  const next = [...ids].slice(-MAX_IDS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): the X still hides it for this visit.
  }
  return new Set(next);
}
