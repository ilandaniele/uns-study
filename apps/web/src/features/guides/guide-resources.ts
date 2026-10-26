export const GUIDE_RESOURCES_CHECKED = "2026-10-26";
type Resource = { title: string; url: string };
const strategies: Resource = { title: "Cornell University · Effective Study Strategies", url: "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/effective-study-strategies/" };
const schedule: Resource = { title: "Cornell University · Cómo organizar un cronograma de estudio", url: "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/guidelines-for-creating-a-study-schedule/" };
const study: Resource = { title: "Cornell University · How to Study", url: "https://lsc.cornell.edu/how-to-study/" };

/** Complementary reading, not an attribution of authorship or endorsement by these institutions. */
export const GUIDE_RESOURCES: Readonly<Record<string, readonly Resource[]>> = {
  "tecnica-pomodoro": [{ title: "Francesco Cirillo · Pomodoro Technique resources", url: "https://www.pomodorotechnique.com/pomodoro-resources/" }, schedule],
  "practica-de-recuperacion-y-repaso-espaciado": [strategies],
  "como-preparar-un-final": [{ title: "Cornell University · Five-Day Study Plan", url: "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/the-five-day-study-plan/" }, strategies],
  "organizar-la-semana-de-estudio": [schedule],
  "concentrarse-en-una-sala-de-estudio": [schedule, study],
  "descanso-sueno-y-rendimiento": [{ title: "NHLBI · Your Guide to Healthy Sleep", url: "https://www.nhlbi.nih.gov/files/docs/public/sleep/healthy_sleep.pdf" }],
  "tomar-apuntes-en-clase": [{ title: "Cornell University · The Cornell Note-taking System", url: "https://lsc.cornell.edu/notes.html" }],
  "resolver-ejercicios-de-matematica": [strategies, study],
  "ansiedad-ante-los-examenes": [{ title: "Cornell University · Worrying about tests?", url: "https://lsc.cornell.edu/test-anxiety/" }],
  "estudiar-en-grupo": [{ title: "Cornell University · Student Guide for Studying Together", url: "https://lsc.cornell.edu/studying-together/student_guide_for_studying_together/" }],
  "procrastinacion": [schedule, { title: "Cornell University · Managing Time", url: "https://lsc.cornell.edu/managing-time/" }],
  "leer-textos-academicos": [{ title: "University of North Carolina · Reading Textbooks Effectively", url: "https://learningcenter.unc.edu/tips-and-tools/reading-textbooks-effectively/" }],
};
