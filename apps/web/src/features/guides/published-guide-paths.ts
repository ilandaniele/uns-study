// Keep this small: advertising policy runs in client components, whereas guide prose stays on
// the server. The policy tests check this registry against the actual published articles.
export const PUBLISHED_GUIDE_PATHS = [
  "/guias/tecnica-pomodoro",
  "/guias/practica-de-recuperacion-y-repaso-espaciado",
  "/guias/como-preparar-un-final",
  "/guias/organizar-la-semana-de-estudio",
  "/guias/concentrarse-en-una-sala-de-estudio",
  "/guias/descanso-sueno-y-rendimiento",
  "/guias/tomar-apuntes-en-clase",
  "/guias/resolver-ejercicios-de-matematica",
  "/guias/ansiedad-ante-los-examenes",
  "/guias/estudiar-en-grupo",
  "/guias/procrastinacion",
  "/guias/leer-textos-academicos",
] as const;
