/** Only same-origin relative paths are honoured, so `next` can't become an open redirect. */
export function safeNextPath(next: string | null, origin: string): string | null {
  // Control characters and backslashes are rejected because the URL parser strips or rewrites them
  // ("/%09/evil.com" would resolve to https://evil.com/); the parsed origin is checked as a second guard.
  if (!next || !next.startsWith("/") || /[\u0000-\u001F\\]/.test(next)) return null;
  const url = new URL(next, origin);
  // Dot segments normalize away ("/.//evil.com" -> "//evil.com"), and a pathname starting with "//" is a
  // protocol-relative URL once handed to the router.
  if (url.origin !== origin || url.pathname.startsWith("//")) return null;
  return url.pathname + url.search + url.hash;
}
