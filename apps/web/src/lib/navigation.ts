/** Keep phone navigation concise; desktop adds direct access to secondary sections. */
export const PRIMARY_NAV = [
  { label: "Sala", href: "/" },
  { label: "Foco", href: "/foco" },
  { label: "Jardín", href: "/jardin" },
  { label: "Ranking", href: "/ranking" },
  { label: "Más", href: "/mas" },
] as const;

export const DESKTOP_NAV = [
  ...PRIMARY_NAV.slice(0, 4),
  { label: "Personas", href: "/personas" },
  { label: "Guías", href: "/guias" },
  { label: "Perfil", href: "/perfil" },
  { label: "Admin", href: "/admin" },
  PRIMARY_NAV[4],
] as const;

/** A directly visible section takes precedence over its shortcut inside Más. */
export function isDesktopNavActive(href: string, pathname: string): boolean {
  if (href === "/mas" && DESKTOP_NAV.some(item => item.href !== "/mas" && isNavActive(item.href, pathname))) return false;
  return isNavActive(href, pathname);
}

export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/sala/");
  if (href === "/mas")
    return [
      "/mas",
      "/personas",
      "/guias",
      "/perfil",
      "/admin",
      "/suscripcion",
      "/como-usar",
      "/sugerencias",
    ].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return pathname === href || pathname.startsWith(`${href}/`);
}
