import type { EmailAudience } from "@sala/contracts";

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  bodyText: string;
  /** Audience preselected when the template is picked. */
  audience: EmailAudience;
}

/** Built-in starting points for the composer; `price` is the live subscription price in ARS (null while unknown). */
export function emailTemplates(price: number | null): EmailTemplate[] {
  const perMonth = price === null ? "" : ` por $${price}/mes`;
  return [
    {
      id: "nuevo-nombre",
      audience: "all",
      label: "Nuevo nombre y nueva dirección",
      subject: "Sala de Estudio tiene nuevo nombre y nueva dirección",
      bodyText: [
        "¡Hola!",
        "",
        "Sala de Estudio tiene nuevo nombre y nueva dirección: https://saladeestudio.com.ar",
        "",
        "Seguí entrando desde ahí para ver en tiempo real qué lugares están libres. Tu cuenta y tu perfil siguen igual.",
        "",
        "¡Gracias por usar la sala!",
      ].join("\n"),
    },
    {
      id: "sin-anuncios",
      label: "Sala de Estudio sin anuncios",
      audience: "free",
      subject: `Nuevo: Sala de Estudio sin anuncios${perMonth}`,
      bodyText: [
        "¡Hola!",
        "",
        `Ya podés usar Sala de Estudio sin anuncios${perMonth}, en todos tus dispositivos. Además, apoyás que la sala siga funcionando.`,
        "",
        "Suscribite acá: https://saladeestudio.com.ar/suscripcion",
        "",
        "¡Gracias por usar la sala!",
      ].join("\n"),
    },
    {
      id: "pro",
      label: "Probá Sala de Estudio Pro",
      audience: "free",
      subject: "Probá Sala de Estudio Pro",
      bodyText: [
        "¡Hola!",
        "",
        `Con Sala de Estudio Pro${perMonth} estudiás sin anuncios y tenés más herramientas en el modo Foco:`,
        "",
        "- Ventana flotante para ver el temporizador mientras trabajás en otra pestaña",
        "- Sonidos ambiente",
        "- Pantalla completa",
        "- Historial y racha de estudio",
        "",
        "Suscribite acá: https://saladeestudio.com.ar/suscripcion",
        "",
        "¡Gracias por usar la sala!",
      ].join("\n"),
    },
  ];
}
