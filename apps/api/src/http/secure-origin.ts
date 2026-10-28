const CANONICAL_HOST = "saladeestudio.com.ar";
const SECURE_HOSTS: readonly string[] = [CANONICAL_HOST, "dev.saladeestudio.com.ar"];

/** Runs at the Worker edge, before the DO/auth handler. Never infer protocol from client headers. */
export function secureOriginRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const legacy = url.hostname === "www.saladeestudio.com.ar";
  if (!legacy && !(url.protocol === "http:" && SECURE_HOSTS.includes(url.hostname))) return null;
  url.protocol = "https:";
  if (legacy) url.hostname = CANONICAL_HOST;
  url.port = "";
  return Response.redirect(url.href, 308);
}
