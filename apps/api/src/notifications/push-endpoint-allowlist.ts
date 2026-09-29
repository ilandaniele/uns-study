/**
 * Push endpoints must be https and belong to a known push service — rejects anything else before
 * it's ever stored or, later, POSTed to by `PushService`. Exact hosts for services with a single
 * fixed origin; suffix matches for services that shard across many subdomains.
 */
const ALLOWED_EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const ALLOWED_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
