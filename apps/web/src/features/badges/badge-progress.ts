import type { AchievementDto } from "@sala/contracts";

const number = new Intl.NumberFormat("es-AR");
const singular = { lugares: "lugar", minutos: "minuto", días: "día", sesiones: "sesión" };
function studyTime(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}

export function badgeProgressText(badge: AchievementDto): { count: string; remaining: string } {
  const goal = badge.goal;
  if (!goal) return { count: `${Math.floor(badge.progress * 100)}%`, remaining: badge.earned ? "En tu colección" : "Seguí avanzando" };
  const current = Math.min(goal.target, Math.max(0, goal.current)), left = Math.max(0, goal.target - current);
  const count = goal.unit === "minutos" ? `${studyTime(current)} / ${studyTime(goal.target)}` : `${number.format(current)} / ${number.format(goal.target)} ${goal.unit}`;
  const remaining = badge.earned ? "En tu colección" : goal.unit === "minutos" ? `Te faltan ${studyTime(left)}` : `Te ${left === 1 ? "falta" : "faltan"} ${number.format(left)} ${left === 1 ? singular[goal.unit] : goal.unit}`;
  return { count, remaining };
}
