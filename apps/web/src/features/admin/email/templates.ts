export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  bodyText: string;
}

/** Built-in starting points for the composer. Static copy: the price is intentionally literal. */
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "nuevo-nombre",
    label: "Nuevo nombre y nueva dirección",
    subject: "Sala de Estudio tiene nuevo nombre y nueva dirección",
    bodyText: [
      "¡Hola!",
      "",
      "Sala de Estudio tiene nuevo nombre y nueva dirección: https://sala-de-estudio.fly.dev",
      "",
      "Seguí entrando desde ahí para ver en tiempo real qué lugares están libres. Tu cuenta y tu perfil siguen igual.",
      "",
      "¡Gracias por usar la sala!",
    ].join("\n"),
  },
  {
    id: "sin-anuncios",
    label: "Sala de Estudio sin anuncios",
    subject: "Nuevo: Sala de Estudio sin anuncios por $1500/mes",
    bodyText: [
      "¡Hola!",
      "",
      "Ya podés usar Sala de Estudio sin anuncios por $1500/mes, en todos tus dispositivos. Además, apoyás que la sala siga funcionando.",
      "",
      "Suscribite acá: https://sala-de-estudio.fly.dev/suscripcion",
      "",
      "¡Gracias por usar la sala!",
    ].join("\n"),
  },
];
