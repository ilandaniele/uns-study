import type { MeDto } from "@sala/contracts";

export type ProLock = "unlocked" | "locked" | "unknown";

/** `me.pro` is the server's isPro(): a subscriber, staff, or everyone while there is nothing to sell. */
export function proLockState(me: Pick<MeDto, "pro"> | null, loading: boolean): ProLock {
  // Without `me` we cannot know whether anything is on sale, so never lock (loading or failed fetch).
  if (!me || loading) return "unknown";
  return me.pro ? "unlocked" : "locked";
}

export type ProFeatureId =
  | "focus" | "focus_pip" | "focus_fullscreen" | "focus_sounds" | "focus_stats"
  | "focus_custom" | "seat_watch" | "study_history" | "forecast" | "favorites"
  | "group_study" | "weekly_goal" | "streak_freeze" | "exams" | "auto_extend" | "themes"
  | "profile_flair" | "group_ranking" | "quiet_room" | "checkin_duration";

export const PRO_FEATURES: Record<ProFeatureId, { title: string; description: string }> = {
  focus: { title: "Foco", description: "Temporizador Pomodoro con tareas, sonidos ambiente y avisos para estudiar en bloques." },
  focus_pip: { title: "Ventana flotante", description: "Tené el temporizador siempre a la vista mientras estudiás en otra pestaña." },
  focus_fullscreen: { title: "Pantalla completa", description: "Un temporizador grande y sin distracciones para concentrarte de verdad." },
  focus_sounds: { title: "Sonidos ambiente", description: "Lluvia, océano o fuego de fondo mientras corre cada bloque de foco." },
  focus_stats: { title: "Historial y racha", description: "Mirá tus últimos 7 días y tu racha para mantener el ritmo de estudio." },
  focus_custom: { title: "Temporizador a medida", description: "Armá tus propios bloques de foco y descanso, y mezclá sonidos como biblioteca, lluvia con truenos o lofi." },
  seat_watch: { title: "Aviso de lugar libre", description: "Te avisamos cuando se libere el lugar que querés. Solo avisa: no te lo guarda." },
  study_history: { title: "Historial de estudio", description: "Mirá cuánto estudiaste en los últimos 30 o 90 días, a qué hora rendís más y exportalo." },
  forecast: { title: "Pronóstico de la sala", description: "Mirá a qué hora suele estar más llena o más vacía la sala según los últimos días." },
  favorites: { title: "Lugares favoritos", description: "Guardá hasta 3 lugares favoritos por sala y encontralos al toque en el mapa." },
  group_study: { title: "Estudio en grupo", description: "Mirá dónde se sentó cada integrante de tu grupo y compartan un temporizador de foco." },
  weekly_goal: { title: "Meta semanal", description: "Fijate una meta de horas por semana y seguí tu avance, con un recordatorio opcional." },
  streak_freeze: { title: "Congelar la racha", description: "Una vez por mes podés congelar un día sin estudio para no perder tu racha." },
  exams: { title: "Plan de exámenes", description: "Cargá tus fechas de examen y mirá cuántas horas por día te faltan para llegar." },
  auto_extend: { title: "Sigo acá automático", description: "Renovamos tu check-in solo cuando estás en la sala, así no te quedás sin lugar." },
  themes: { title: "Paletas de color", description: "Cambiá los colores de la app y elegí la paleta que más te guste." },
  profile_flair: { title: "Perfil destacado", description: "Elegí un marco para tu foto y un color para tu nombre. Se ven en el ranking, en tu perfil y en la sala." },
  group_ranking: { title: "Ranking entre amigos", description: "Compará horas, racha y aportes solo con la gente de tu grupo." },
  quiet_room: { title: "Aviso sala tranquila", description: "Te avisamos cuando la sala se vacía hasta el nivel que elijas, así sabés cuándo ir." },
  checkin_duration: { title: "Elegí hasta qué hora", description: "Quedate el tiempo que quieras sin renovar cada 2 horas: elegí la hora de salida, hasta 12 h." },
};

export const PRO_BENEFITS: string[] = [
  "Sin anuncios en toda la app",
  "Avisos de lugar: te avisamos cuando se libera el que esperás",
  "Historial de estudio de 30 y 90 días, con exportación",
  "Pronóstico de ocupación de la sala por hora",
  "Hasta 3 lugares favoritos por sala",
  "Estudio en grupo: ubicación del grupo y foco compartido",
  "Meta semanal de horas con recordatorio",
  "Congelar la racha una vez por mes",
  "Foco: Pomodoro con tareas, temporizador a medida, ventana flotante y sonidos ambiente",
  "Plan de exámenes con horas por día",
  "Sigo acá automático",
  "Paletas de color",
  "Perfil destacado: marco para tu foto y color para tu nombre",
  "Ranking entre amigos de tu grupo",
  "Aviso cuando la sala está tranquila",
  "Elegir hasta qué hora te quedás (hasta 12 h) sin renovar cada 2 horas",
];
