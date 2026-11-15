/** Links and their stated scope were checked during the editorial audit on this date. */
export const GUIDE_RESOURCES_CHECKED = "2026-11-15";
export const ROOM_GUIDE_RESOURCES_CHECKED = GUIDE_RESOURCES_CHECKED;

type Resource = { title: string; url: string; note: string };

/** Scope of the article, without a claim of specialist or institutional review. */
export const GUIDE_SCOPE: Readonly<Record<string, string>> = {
  "visitar-la-sala-de-estudio-uns": "Información de la sala y ejemplos de uso de esta app. Los reportes no garantizan disponibilidad y los horarios institucionales se consultan en la UNS.",
  "tecnica-pomodoro": "Una forma de organizar tareas y pausas. Los bloques adaptados son propuestas para probar, no una medida del aprendizaje ni una certificación del método.",
  "practica-de-recuperacion-y-repaso-espaciado": "Ideas para comprobar lo que recordás y corregir errores. Las fechas del ejemplo se ajustan a la materia y no predicen una nota.",
  "como-preparar-un-final": "Un plan de estudio adaptable. La inscripción, los requisitos y el alcance del examen los confirma tu cátedra por sus canales oficiales.",
  "organizar-la-semana-de-estudio": "Un calendario de ejemplo para distribuir tu tiempo real. No exige una cantidad fija de horas ni sustituye tus obligaciones y necesidades.",
  "concentrarse-en-una-sala-de-estudio": "Propuestas para estudiar respetando este espacio silencioso. La app no mide tu concentración ni garantiza encontrar el mismo lugar al llegar.",
  "descanso-sueno-y-rendimiento": "Organización del descanso con referencias de salud pública. No es una evaluación médica ni prescribe dietas, tratamientos o necesidades individuales de sueño.",
  "tomar-apuntes-en-clase": "Un formato para transformar notas en preguntas y comprobarlas. Elegí el soporte según la tarea y tus necesidades de acceso.",
  "resolver-ejercicios-de-matematica": "Una rutina para practicar y revisar errores junto con la teoría. Seguí las consignas, notación y criterios de corrección de tu materia.",
  "ansiedad-ante-los-examenes": "Preparación académica y pautas generales de apoyo. No diagnostica ni trata ansiedad; un malestar intenso o persistente requiere atención profesional.",
  "estudiar-en-grupo": "Una sesión de ejemplo sujeta a las reglas de colaboración de tu materia. Las actividades en voz alta necesitan un espacio que las permita; Manuel Gil es silenciosa.",
  "procrastinacion": "Pasos para identificar un obstáculo y ajustar una tarea. No atribuye toda postergación a una causa ni reemplaza apoyo profesional cuando hace falta.",
  "leer-textos-academicos": "Preguntas y esquemas para trabajar con la bibliografía. Explorar o resumir no reemplaza leer el material obligatorio ni verificar las citas en el original."
};

/** Sources support their stated topics, not every example or an institutional endorsement. */
export const GUIDE_RESOURCES: Readonly<Record<string, readonly Resource[]>> = {
  "visitar-la-sala-de-estudio-uns": [
    {
      "title": "Biblioteca Central UNS · Salas de lectura, dirección y condiciones de uso",
      "url": "https://bc.uns.edu.ar/salasdelectura/",
      "note": "Identifica Manuel Gil, su carácter silencioso, acceso por orden de llegada y horario publicado. Es la referencia institucional, distinta de la configuración de la app."
    },
    {
      "title": "UNS · Bienvenida a ingresantes 2025 (nota archivada)",
      "url": "https://www.enfoqueu.uns.edu.ar/bienvenida-a-los-ingresantes-2025/",
      "note": "Mencionaba apertura a las 08:00. La UNS la marca como archivada; no confirma el horario actual."
    },
    {
      "title": "Biblioteca Central UNS · Servicios y contacto institucional",
      "url": "https://bc.uns.edu.ar/servicios/",
      "note": "Permite distinguir servicios de biblioteca y encontrar el contacto institucional. El horario del mostrador no es el de la sala."
    }
  ],
  "tecnica-pomodoro": [
    {
      "title": "Francesco Cirillo · Libro y recursos del método Pomodoro",
      "url": "https://www.pomodorotechnique.com/pomodoro-book/",
      "note": "Sitio del creador del método; ofrece el libro y material comercial. Esta app no está afiliada ni exige comprarlos para usar el temporizador."
    },
    {
      "title": "Cornell University · Cómo organizar un cronograma de estudio",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/guidelines-for-creating-a-study-schedule/",
      "note": "Propone distribuir tareas y reservar pausas y descanso. Los horarios de ejemplo de esta app son adaptaciones."
    }
  ],
  "practica-de-recuperacion-y-repaso-espaciado": [
    {
      "title": "Cornell University · Effective Study Strategies",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/effective-study-strategies/",
      "note": "Describe recuperación, práctica espaciada e intercalada. No establece un calendario óptimo para toda materia."
    }
  ],
  "como-preparar-un-final": [
    {
      "title": "Cornell University · Five-Day Study Plan",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/the-five-day-study-plan/",
      "note": "Combina preparación y revisión activa. No indica que cinco días alcancen para cualquier final ni informa trámites de la UNS."
    },
    {
      "title": "Cornell University · Effective Study Strategies",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/effective-study-strategies/",
      "note": "Describe recuperación, práctica espaciada e intercalada. No establece un calendario óptimo para toda materia."
    }
  ],
  "organizar-la-semana-de-estudio": [
    {
      "title": "Cornell University · Cómo organizar un cronograma de estudio",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/guidelines-for-creating-a-study-schedule/",
      "note": "Propone distribuir tareas y reservar pausas y descanso. Los horarios de ejemplo de esta app son adaptaciones."
    }
  ],
  "concentrarse-en-una-sala-de-estudio": [
    {
      "title": "Biblioteca Central UNS · Salas de lectura, dirección y condiciones de uso",
      "url": "https://bc.uns.edu.ar/salasdelectura/",
      "note": "Identifica Manuel Gil, su carácter silencioso, acceso por orden de llegada y horario publicado. Es la referencia institucional, distinta de la configuración de la app."
    },
    {
      "title": "Cornell University · The Perils of Multitasking",
      "url": "https://lsc.cornell.edu/managing-time-and-stress/the-perils-of-multitasking/",
      "note": "Explica cambios de tarea y distracciones. La guía propone ajustes para probar, no un tiempo fijo de recuperación de la atención."
    }
  ],
  "descanso-sueno-y-rendimiento": [
    {
      "title": "NHLBI · Healthy Sleep Habits",
      "url": "https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits",
      "note": "Recomendaciones generales sobre horarios de sueño y descanso. No constituyen una evaluación de tu situación de salud."
    }
  ],
  "tomar-apuntes-en-clase": [
    {
      "title": "Cornell University · The Cornell Note Taking System",
      "url": "https://lsc.cornell.edu/how-to-study/taking-notes/cornell-note-taking-system/",
      "note": "Presenta el sistema de notas y acceso a su módulo público. El formato de preguntas y resumen puede adaptarse a tu materia."
    },
    {
      "title": "Cornell University · Effective Study Strategies",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/effective-study-strategies/",
      "note": "Describe recuperación, práctica espaciada e intercalada. No establece un calendario óptimo para toda materia."
    }
  ],
  "resolver-ejercicios-de-matematica": [
    {
      "title": "Cornell University · Effective Study Strategies",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/effective-study-strategies/",
      "note": "Describe recuperación, práctica espaciada e intercalada. No establece un calendario óptimo para toda materia."
    }
  ],
  "ansiedad-ante-los-examenes": [
    {
      "title": "Cornell University · Worrying about tests?",
      "url": "https://lsc.cornell.edu/test-anxiety/",
      "note": "Pautas académicas de preparación, simulacros y distribución del tiempo; no sustituye un tratamiento de salud mental."
    },
    {
      "title": "NHS · Breathing exercises for stress",
      "url": "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/",
      "note": "Propone respirar con suavidad y sin forzar. No hace falta retener el aire ni cumplir una cuenta rígida para seguir esta guía."
    }
  ],
  "estudiar-en-grupo": [
    {
      "title": "Cornell University · Student Guide for Studying Together",
      "url": "https://lsc.cornell.edu/studying-together/student_guide_for_studying_together/",
      "note": "Plantea acuerdos de trabajo e integridad académica. Sus reglas universitarias no reemplazan las de tu cátedra o las del espacio de reunión."
    },
    {
      "title": "Biblioteca Central UNS · Salas de lectura, dirección y condiciones de uso",
      "url": "https://bc.uns.edu.ar/salasdelectura/",
      "note": "Identifica Manuel Gil, su carácter silencioso, acceso por orden de llegada y horario publicado. Es la referencia institucional, distinta de la configuración de la app."
    }
  ],
  "procrastinacion": [
    {
      "title": "Cornell University · Break the Cycle of Procrastination!",
      "url": "https://lsc.cornell.edu/break-the-cycle-of-procrastination/",
      "note": "Distingue obstáculos como sobrecarga, frustración y perfeccionismo, y propone ajustar las tareas según el problema."
    },
    {
      "title": "Cornell University · Cómo organizar un cronograma de estudio",
      "url": "https://lsc.cornell.edu/how-to-study/studying-for-and-taking-exams/guidelines-for-creating-a-study-schedule/",
      "note": "Propone distribuir tareas y reservar pausas y descanso. Los horarios de ejemplo de esta app son adaptaciones."
    }
  ],
  "leer-textos-academicos": [
    {
      "title": "Cornell University · 3 P’s for Effective Reading",
      "url": "https://lsc.cornell.edu/how-to-study/reading-strategies/3-ps-for-effective-reading/",
      "note": "Organiza propósito, exploración y plan de lectura. Las consignas concretas se verifican con el programa y la cátedra."
    }
  ]
};
