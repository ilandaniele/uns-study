import type { Guide } from "./guides";

/** Local, product-specific guidance. Institutional facts link to their primary sources below. */
export const ROOM_GUIDE: Guide = {
  slug: "visitar-la-sala-de-estudio-uns",
  title: "Ir a la sala de Alem: cómo leer el mapa y colaborar",
  description: "Ubicación de la sala Manuel Gil en Bahía Blanca, horarios de referencia y ejemplos para interpretar el mapa, informar asientos y liberar tu lugar al salir.",
  readingMinutes: 5,
  updated: "2026-11-06",
  sections: [
    {
      heading: "Qué sala muestra esta aplicación",
      paragraphs: [
        "El mapa de Sala de Estudio representa la sala de lectura Manuel Gil, en el complejo de avenida Alem 1253 de Bahía Blanca. La Biblioteca Central de la Universidad Nacional del Sur la identifica como una sala de lectura silenciosa con wifi gratuito. No es la sala Islas Malvinas del Campus Palihue: si vas a estudiar en Palihue, este mapa no te dice cuántos asientos quedan allí.",
        "La app es un proyecto independiente de Ilan Daniele. Organiza los reportes de quienes están en la sala; no administra el edificio, no asigna reservas y no recibe una medición automática de cada silla. La Biblioteca Central publica las condiciones institucionales del espacio. Al final de esta guía están los enlaces oficiales para contrastar la información antes de viajar.",
      ],
    },
    {
      heading: "Horarios: distinguir la referencia de la app de los avisos oficiales",
      paragraphs: [
        "La app está configurada para abrir a las 08:00 todos los días, cerrar a las 00:00 de lunes a viernes y a las 22:00 los sábados, domingos y feriados. Son los horarios de referencia que usa para indicar si la sala está abierta y terminar las presencias al cierre.",
        "Las fuentes institucionales consultadas no coinciden en la apertura entre semana: la página de salas de lectura de la Biblioteca Central indica 07:00, mientras que la bienvenida a ingresantes de Enfoque U de 2025 menciona 08:00. No interpretamos esa diferencia como una confirmación de un cambio de horario. Si pensás ir temprano, en vacaciones o durante un feriado, comprobá los avisos de la Biblioteca Central. El horario del mostrador de préstamos tampoco es necesariamente el de la sala de lectura.",
        "La etiqueta de apertura de la app es orientativa. Un cierre excepcional puede no estar cargado todavía. Consultar el mapa ayuda con la disponibilidad reportada; no sustituye un aviso de la institución sobre acceso al edificio.",
      ],
    },
    {
      heading: "Antes de salir: qué significa que no haya libres confirmados",
      paragraphs: [
        "Podés consultar el mapa sin crear una cuenta ni compartir tu ubicación. Mirá los estados y cuándo se actualizaron. El mapa tiene dos clases de información: personas que registraron «Estoy acá» y observaciones sobre otros lugares. Ninguna de las dos es una garantía de encontrar el mismo asiento al llegar.",
        "Ejemplo ilustrativo, no una medición actual: aparecen 4 libres, 21 ocupados y 83 sin datos. Sabemos que hay cuatro reportes vigentes de disponibilidad; no sabemos qué ocurre en los otros 83 lugares. No corresponde sumar esos 83 a los libres ni concluir que toda la sala está llena. Si después los cuatro libres se ocupan, el mapa puede quedarse sin disponibilidad confirmada aunque todavía haya sillas vacías sin reportar.",
        "Tocá un asiento para abrir su detalle. Ahí podés distinguir una observación de una presencia personal, ver su antigüedad y consultar la identidad que la persona haya decidido mostrar. Un alias protege el nombre público de la cuenta; no significa que el reporte sea automático. Si dos reportes se contradicen, la app puede mostrar una duda o abrir una votación en vez de ocultar el conflicto.",
      ],
    },
    {
      heading: "Al llegar: informar lo que realmente ves",
      paragraphs: [
        "Para colaborar, iniciá sesión y permití comprobar que estás cerca de la sala cuando la app lo solicite. El GPS del navegador tiene un margen de error: puede ayudar a validar cercanía al edificio, pero no identifica por sí solo una silla. En el modo común, elegí el asiento en el mapa y compará su mesa y posición con el lugar físico antes de confirmar.",
        "Si una silla está vacía y no tiene pertenencias, «Está libre» describe esa observación. Si ves una persona sentada, «Está ocupado» informa lo que ves sin afirmar que seas vos quien ocupa ese asiento. Si hay una mochila o apuntes y no hay nadie sentado, «Está guardado» describe la situación: no crea una reserva ni decide si las pertenencias pueden retirarse.",
        "Usá «Estoy acá» únicamente en el asiento donde te sentaste. Si te equivocaste de lugar, corregí tu registro; no lo compenses marcando todas las sillas de la mesa como ocupadas. Si no podés ver bien un asiento, no hace falta adivinar su estado. Una actualización de pocos lugares comprobados es más útil que completar toda una zona con suposiciones.",
      ],
    },
    {
      heading: "Por qué un lugar vuelve a Sin datos",
      paragraphs: [
        "Los reportes comunes «Está libre» y «Está ocupado» duran dos horas. Pensemos en una observación de asiento libre enviada a las 14:30: si nadie aporta información nueva y no hay otra evidencia vigente, a las 16:30 deja de confirmar disponibilidad. Volver a «Sin datos» no prueba que alguien se haya sentado ni borra la utilidad que tuvo el reporte durante esas dos horas.",
        "El registro personal «Estoy acá» tiene otra duración: normalmente tres horas, con renovación y otras duraciones cuando la app las habilita. La app también puede terminarlo al cierre o por una salida detectada. Son mecanismos distintos: informar un asiento ocupado por otra persona no le inicia una sesión de estudio a esa persona ni suma horas a quien envió la observación.",
        "Si alguien sigue figurando sentado pero ves el lugar vacío o con pertenencias, informá la situación actual. El reporte puede abrir una votación para resolver la contradicción. El avatar no vuelve inútil la observación de otra persona. Participá si podés comprobar el asiento; una notificación de votación no es una invitación a responder sin mirar.",
      ],
    },
    {
      heading: "Al terminar: liberar el lugar y avisar errores",
      paragraphs: [
        "Cuando te vayas, usá «Me voy». Si cambiás de mesa para seguir estudiando, registrá el nuevo lugar en vez de dejar la presencia en el anterior. Antes de cerrar la app, comprobá que confirmó el cambio: tocar un botón sin conexión no asegura que el servidor haya recibido la acción.",
        "Si el mapa no coincide con lo que ves, primero revisá la antigüedad del dato y que hayas elegido la silla correcta. Para un problema que persiste, enviá una sugerencia con el número de mesa, el asiento, la hora aproximada y los pasos que lo provocan. No necesitás publicar nombres, coordenadas, fotos de otras personas ni conversaciones privadas para explicar un error de disponibilidad.",
        "El mapa funciona mejor con observaciones recientes y específicas. Una corrección honesta, liberar el asiento al salir y respetar el silencio permiten que otras personas aprovechen la información sin confundirla con una reserva. Para dudas sobre reglas del edificio o un cambio de horario, recurrí a los canales oficiales de la Biblioteca Central.",
      ],
    },
  ],
};
