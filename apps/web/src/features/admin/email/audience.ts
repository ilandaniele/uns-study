import type { EmailAudience } from "@sala/contracts";

export const AUDIENCE_LABEL: Record<EmailAudience, string> = {
  all: "Todos",
  free: "Sin suscripción",
  subscribers: "Suscriptores",
};

export const AUDIENCES = Object.keys(AUDIENCE_LABEL) as EmailAudience[];
