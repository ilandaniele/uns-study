import type { ExamDto } from "@sala/contracts";

/** "2 h 30 min", "45 min", "3 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Faltan 5 días", "Mañana", "Es hoy", "Rendido". */
export function countdownLabel(daysLeft: number): string {
  if (daysLeft < 0) return "Rendido";
  if (daysLeft === 0) return "Es hoy";
  if (daysLeft === 1) return "Mañana";
  return `Faltan ${daysLeft} días`;
}

/** "Estudiá ~1 h 30 min por día", or null for a past exam or a met target. */
export function planLabel(exam: Pick<ExamDto, "dailyPlanMinutes">): string | null {
  return exam.dailyPlanMinutes === null ? null : `Estudiá ~${formatDuration(exam.dailyPlanMinutes)} por día`;
}

/** 0..1 progress toward the target hours. */
export function examProgress(exam: Pick<ExamDto, "studiedMinutes" | "targetHours">): number {
  const target = exam.targetHours * 60;
  return target <= 0 ? 0 : Math.min(1, Math.max(0, exam.studiedMinutes / target));
}

/** "2 h 30 min de 10 h". */
export function progressLabel(exam: Pick<ExamDto, "studiedMinutes" | "targetHours">): string {
  return `${formatDuration(exam.studiedMinutes)} de ${exam.targetHours} h`;
}

/** "26/10/2026" from a YYYY-MM-DD local date. */
export function formatExamDate(localDate: string): string {
  const [y, m, d] = localDate.split("-");
  return `${d}/${m}/${y}`;
}
