export type LocationHelpPlatform = "android" | "ios" | "desktop";

/** Which set of Chrome steps fits the visitor's device. */
export function locationHelpPlatform(userAgent: string): LocationHelpPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Step-by-step instructions to turn location back on for this site in Chrome. */
export function locationHelpSteps(platform: LocationHelpPlatform): string[] {
  if (platform === "android") {
    return [
      "Revisá que la ubicación del teléfono esté prendida: deslizá la barra de arriba hacia abajo y tocá «Ubicación».",
      "En Chrome, tocá el ícono que está a la izquierda de la dirección de la página (arriba).",
      "Tocá «Permisos» › «Ubicación» y elegí «Permitir».",
      "Si no lo ves: menú ⋮ › Configuración › Configuración de sitios › Ubicación, buscá este sitio y permitilo.",
      "Recargá la página y tocá «Estoy acá» de nuevo.",
    ];
  }
  if (platform === "ios") {
    return [
      "Abrí Ajustes del iPhone › Privacidad y seguridad › Localización y activala.",
      "En esa misma lista, entrá a «Chrome», elegí «Mientras se usa la app» y prendé «Ubicación exacta».",
      "Volvé a Chrome y recargá la página.",
      "Tocá «Estoy acá» y, cuando Chrome pregunte, tocá «Permitir».",
    ];
  }
  return [
    "Hacé clic en el ícono que está a la izquierda de la dirección de la página.",
    "Activá «Ubicación» (o entrá a «Configuración del sitio» › Ubicación › Permitir).",
    "Revisá que la ubicación de tu computadora esté activada en la configuración del sistema.",
    "Recargá la página y hacé clic en «Estoy acá» de nuevo.",
  ];
}
