import type { AppSection } from "@sala/contracts";

/** Classify locally: private profile ids, tokens, query strings and message content never leave this function. */
export function sectionOfPath(pathname: string): AppSection | null {
  if (pathname === "/" || /^\/sala\/[^/]+\/?$/.test(pathname)) return "sala";
  if (/^\/u\/[^/]+\/jardin\/?$/.test(pathname)) return "jardin";
  if (/^\/u\/[^/]+\/?$/.test(pathname)) return "perfil";
  const segment = pathname.split("/")[1];
  const paths: Record<string, AppSection> = { foco: "foco", jardin: "jardin", ranking: "ranking", guias: "guias", personas: "personas", perfil: "perfil", mas: "mas", chat: "chat", comunidad: "chat" };
  return paths[segment] ?? null;
}

const recent = new Map<AppSection, number>();
/** Best-effort aggregate measurement, at most once per minute per tab and section. */
export function recordSectionVisit(section: AppSection | null): void {
  if (!section || typeof window === "undefined" || typeof document === "undefined") return;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const now = Date.now(), storageKey = `sala:section-open:v1:${section}`;
  let last = recent.get(section) ?? 0;
  try { last = Math.max(last, Number(sessionStorage.getItem(storageKey)) || 0); } catch { /* Storage may be unavailable. */ }
  if (now - last < 60_000) return;
  recent.set(section, now);
  try { sessionStorage.setItem(storageKey, String(now)); } catch { /* The in-memory debounce is enough. */ }
  void fetch("/api/v1/usage/section", { method: "POST", credentials: "omit", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ section }) }).catch(() => undefined);
}
