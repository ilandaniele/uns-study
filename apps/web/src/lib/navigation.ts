/** Primary navigation is shared by desktop and phones; secondary pages live in Más. */
export const PRIMARY_NAV = [
  { label: "Sala", href: "/" },
  { label: "Foco", href: "/foco" },
  { label: "Jardín", href: "/jardin" },
  { label: "Ranking", href: "/ranking" },
  { label: "Más", href: "/mas" },
] as const;

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
