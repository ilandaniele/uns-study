import { ROOM_GUIDE } from "./room-guide";

export type GuideSection = { heading: string; paragraphs: string[]; list?: string[] };
export type Guide = {
  slug: string;
  title: string;
  description: string;
  readingMinutes: number;
  updated: string;
  sections: GuideSection[];
};

export const GUIDES: readonly Guide[] = [
  ROOM_GUIDE,
  {
    slug: "tecnica-pomodoro",
    title: "Pomodoro para estudiar: bloques, pausas y una tarea concreta",
    description:
      "Aprendé a aplicar la técnica Pomodoro paso a paso, adaptar la duración de los bloques a tu materia y evitar los errores más comunes al estudiar en la facultad.",
    readingMinutes: 5,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Qué es y de dónde viene",
        paragraphs: [
          "La técnica Pomodoro la ideó Francesco Cirillo a fines de los años ochenta, cuando era estudiante universitario y le costaba sostener la atención. Usó un temporizador de cocina con forma de tomate (pomodoro en italiano) y se propuso algo mínimo: concentrarse en una sola tarea durante un rato corto y definido, sin interrupciones.",
          "La versión clásica es simple. Trabajás 25 minutos, descansás 5, y repetís. Después de cuatro bloques, tomás un descanso más largo, de entre 15 y 30 minutos. No tiene nada de mágico: lo que funciona es el contrato que hacés con vos mismo. Durante el bloque hay una sola cosa para hacer, y cuando suena la alarma, parás aunque estés a mitad de una idea.",
          "Un temporizador puede servir para acotar una tarea y reservar pausas. No comprueba cuánto aprendiste ni garantiza que evites las distracciones. Al terminar cada bloque, anotá qué resolviste y qué duda quedó: esa evidencia es más útil que sumar bloques sin revisar el trabajo.",
        ],
      },
      {
        heading: "Cómo se hace, paso a paso",
        paragraphs: [
          "Antes de arrancar el primer bloque, decidí qué vas a hacer en él. “Estudiar Análisis” es demasiado vago; “resolver los ejercicios 5 al 9 de la guía de límites” es una tarea que se puede terminar o no. Cuanto más concreta, menos tiempo perdés decidiendo en el momento.",
          "Una vez que tenés la tarea, seguí esta secuencia:",
        ],
        list: [
          "Elegí una tarea concreta y anotala en un papel.",
          "Poné el temporizador en 25 minutos y empezá sin chequear nada más.",
          "Si aparece una distracción o una idea ajena, anotala en una hoja aparte y volvé a la tarea.",
          "Cuando suene la alarma, marcá el bloque como hecho y descansá 5 minutos.",
          "Tras cuatro bloques, hacé una pausa larga y recién ahí revisá mensajes.",
        ],
      },
      {
        heading: "Qué hacer en los descansos",
        paragraphs: [
          "El descanso no es un premio opcional, es parte de la técnica. Lo ideal es que sea realmente un corte: pararte, caminar un poco, tomar agua, estirar el cuello y la espalda, mirar algo lejano para que descansen los ojos. Si en los cinco minutos abrís redes sociales, volvés al bloque siguiente con la cabeza ocupada en otra cosa y encima te cuesta más arrancar.",
          "Evitá también usar el descanso para tareas que exigen decisiones, como contestar mails largos o planificar el fin de semana. Dejá que la mente divague. Muchas veces la solución a un problema que te trabó aparece justo cuando dejaste de mirarlo.",
          "En el descanso largo sí podés comer algo, charlar con alguien o salir un rato al aire libre. Si estás en una sala de estudio compartida, acordate de que, si te vas por más que un rato breve, conviene liberar tu lugar para que otra persona lo use en lugar de dejarlo ocupado sin nadie.",
        ],
      },
      {
        heading: "Cómo adaptar la duración de los bloques",
        paragraphs: [
          "Los 25 minutos corresponden al esquema clásico. Los bloques de 40 o 50 minutos que proponemos acá son adaptaciones prácticas, no una regla del método original ni una duración óptima demostrada para toda persona. Si un corte interrumpe un problema largo, anotá el siguiente paso antes de descansar.",
          "En cambio, si estás cansado, si el tema te aburre muchísimo o si venís de una semana pesada, bajá a 15 minutos. Un bloque corto que sí cumplís vale más que uno largo que abandonás a los diez minutos. Con el tiempo, podés ir subiendo de a poco.",
          "Una forma práctica de ajustar el ritmo: probá durante varios días con una duración y registrá la tarea terminada, las interrupciones y si pudiste retomar después de la pausa. Cambiá una cosa por vez. El modo Foco de esta app permite organizar bloques y descansos desde la computadora o el celular; el temporizador básico es gratuito.",
        ],
      },
      {
        heading: "Errores comunes",
        paragraphs: [
          "El error más frecuente es usar la técnica sin una tarea definida. El temporizador mide tiempo, pero no te dice qué hacer; sin un objetivo claro, los 25 minutos se llenan de dudas sobre por dónde empezar.",
          "Otro problema es romper el bloque ante cualquier interrupción. Si algo es realmente urgente, pausá y reiniciá ese bloque; si no lo es, esperá. Con el tiempo vas a notar cuántas “urgencias” eran solo costumbre.",
          "También es común saltarse los descansos porque “estoy en racha”. Un par de veces puede estar bien, pero si lo hacés siempre, vas a acumular cansancio y la segunda mitad de la tarde se vuelve improductiva. Por último, no confundas contar pomodoros con aprender: terminar seis bloques mirando el resumen sin ponerte a prueba no equivale a haber estudiado bien. Combiná la técnica con métodos activos, como explicar el tema en voz alta o resolver ejercicios sin mirar la solución.",
        ],
      },
      {
        heading: "Un ejemplo de tarde con Pomodoro",
        paragraphs: [
          "Imaginá que tenés cuatro horas libres para preparar un parcial. Podrías armar así la tarde: primer bloque, releer los apuntes de la unidad 3 marcando lo que no entendés; segundo bloque, resolver tres ejercicios sin mirar la resolución; tercer bloque, corregirlos y anotar los errores; cuarto bloque, hacer un resumen de una página con lo que fallaste. Después, pausa larga.",
          "En la segunda vuelta repetís la lógica con la unidad 4. Fijate que cada bloque tiene un verbo concreto: releer, resolver, corregir, resumir. Esa es la clave. Al final del día, anotá cuántos bloques hiciste y qué quedó pendiente, así mañana arrancás sin tener que pensar por dónde seguir.",
          "Si te cuesta empezar, prometete un solo pomodoro. La mayoría de las veces, cuando suena la alarma, ya estás metido en el tema y seguir cuesta poco. Y si ese día no da para más, al menos cumpliste con algo y sabés exactamente hasta dónde llegaste.",
        ],
      },
    ],
  },
  {
    slug: "practica-de-recuperacion-y-repaso-espaciado",
    title: "Práctica de recuperación y repaso espaciado: estudiar para recordar",
    description:
      "Descubrí cómo usar la práctica de recuperación, las flashcards y el repaso espaciado para retener mejor lo que estudiás, con un cronograma de ejemplo.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Por qué releer no alcanza",
        paragraphs: [
          "La estrategia más común entre estudiantes es leer los apuntes una y otra vez, subrayar y armar resúmenes prolijos. Se siente productivo porque el material empieza a resultar familiar. El problema es justamente ese: la familiaridad se confunde con saber. Reconocer algo cuando lo ves es mucho más fácil que reproducirlo desde cero en un examen, donde nadie te muestra la respuesta.",
          "Cornell distingue tres estrategias de estudio: recuperar sin mirar, distribuir las sesiones e intercalar problemas relacionados. Son propuestas para practicar y comprobar lo que recordás. Releer puede seguir siendo necesario para comprender algo nuevo o corregir un error; sentir dificultad, por sí solo, no demuestra que estés aprendiendo.",
          "En esta guía vas a ver cómo aplicarlas sin necesidad de herramientas especiales. Alcanza con papel, una lapicera y un poco de organización.",
        ],
      },
      {
        heading: "Práctica de recuperación: ponerte a prueba",
        paragraphs: [
          "Practicar la recuperación significa intentar responder sin mirar el material y después contrastar con una respuesta fiable. Si te equivocás, corregí la respuesta antes de repetirla. Por ejemplo, escribí una definición, comparala con la bibliografía y señalá exactamente qué condición omitiste. Adivinar varias veces sin corregirte puede dejar el mismo error intacto.",
          "Hay muchas formas de hacerlo, y todas son simples:",
        ],
        list: [
          "Cerrá el apunte y escribí todo lo que recuerdes del tema en una hoja en blanco.",
          "Explicá el concepto en voz alta como si se lo enseñaras a un compañero.",
          "Convertí los títulos del capítulo en preguntas y respondelas de memoria.",
          "Resolvé ejercicios sin mirar la resolución, y recién después compará.",
          "Usá exámenes anteriores o armá tus propias preguntas.",
        ],
      },
      {
        heading: "Flashcards bien hechas",
        paragraphs: [
          "Las tarjetas son una herramienta cómoda para practicar la recuperación, ya sea en papel o en una aplicación. Con un frente que plantea una pregunta y un dorso con la respuesta, te obligás a intentar recordar antes de mirar. Pero se pueden hacer bien o mal.",
          "Una buena tarjeta tiene una sola idea. En lugar de “Explicar la fotosíntesis”, que es enorme, separá en varias: dónde ocurre la fase luminosa, qué se produce en ella, qué entra al ciclo de Calvin. Cuanto más pequeña la pregunta, más claro es si la sabés o no.",
          "Escribí las tarjetas con tus palabras y no copies párrafos del libro. Armarlas ya es una forma de estudio. Incluí ejemplos propios, y en materias de cálculo o programación, usá problemas en lugar de definiciones: el frente puede ser un ejercicio y el dorso, el paso clave. Y sobre todo, sé honesto al corregirte: si dudaste, no cuenta como acierto.",
        ],
      },
      {
        heading: "Repaso espaciado: separar las sesiones",
        paragraphs: [
          "El repaso espaciado distribuye los encuentros con un tema en distintos momentos, en vez de concentrarlos en una sola sesión. Es una de las estrategias recomendadas por Cornell para la retención. No hay un intervalo que sirva igual para todos los temas: importan la dificultad, lo que ya sabés y cuándo necesitás usarlo.",
          "En la práctica, significa que conviene volver sobre cada tema varias veces con huecos crecientes: al día siguiente, a los pocos días, a la semana, y así. Cuando una tarjeta te sale fácil, la podés espaciar más; cuando te cuesta, volvé antes. Muchas aplicaciones de flashcards automatizan este cálculo, pero también podés hacerlo con cajas de cartón o un cuaderno.",
          "Combiná recuperación con corrección: intentá responder, identificá qué falta y volvé al material cuando sea necesario. Si todavía no entendés una relación, releerla con un ejemplo resuelto puede ser parte del trabajo. No reemplaces una duda de comprensión por repetir una tarjeta.",
        ],
      },
      {
        heading: "Un cronograma de ejemplo",
        paragraphs: [
          "Supongamos que hoy estudiás la unidad 2 de una materia y el parcial es en tres semanas. Un esquema posible sería el siguiente. El día cero hacés la lectura y armás las tarjetas. Al día siguiente, 15 o 20 minutos de recuperación sobre esas tarjetas. A los tres o cuatro días, otra sesión corta. A la semana, otra. Y a las dos semanas, un repaso general mezclado con las otras unidades.",
          "Mientras tanto, vas sumando unidades nuevas, así que cada día incluye un poco de material nuevo y un poco de repasos viejos. Se ve como más trabajo, pero cada sesión es corta y el conjunto te llega al parcial con la mayor parte ya asentada, no con la sensación de estar aprendiendo todo a la vez.",
          "Si te quedan pocos días, dividí el material y dejá oportunidades para volver a los errores entre sesiones. El cronograma anterior es un ejemplo para adaptar, no una predicción de la nota ni una receta que asegure retener todo.",
        ],
      },
      {
        heading: "Errores frecuentes y cómo evitarlos",
        paragraphs: [
          "El primer error es mirar la respuesta demasiado pronto. Si te trabás, esperá unos segundos y forzá el intento; aunque falles, el esfuerzo ayuda. El segundo es armar tarjetas sin entender el tema: antes de memorizar, asegurate de comprender, porque memorizar algo que no entendés es frágil.",
          "Otro error es mezclar todo desde el primer día sin criterio, o por el contrario, repasar solo lo que ya sabés porque da gusto. Priorizá lo que fallás. Y recordá que sentirte incómodo no significa que no estés aprendiendo: las técnicas que funcionan suelen sentirse más difíciles que releer.",
          "Por último, no hace falta aplicar esto a todo. Para materias con mucha memoria, como anatomía o derecho, es ideal. Para materias de resolución de problemas, el equivalente es practicar ejercicios variados, volviendo sobre los de semanas anteriores. Probalo con una sola materia durante dos semanas y fijate la diferencia.",
        ],
      },
    ],
  },
  {
    slug: "como-preparar-un-final",
    title: "Cómo preparar un final: temas, práctica y un plan realista",
    description:
      "Guía para preparar un final universitario: hacé el inventario de temas, un calendario inverso, practicá con exámenes viejos y planificá las últimas 48 horas.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Empezá por un inventario de temas",
        paragraphs: [
          "Antes de abrir un solo apunte, conseguí el programa de la materia y armá una lista de todos los temas que pueden entrar. Podés usar una planilla o una hoja con tres columnas: el tema, cuánto sentís que lo dominás (por ejemplo del 1 al 3) y cuántas veces lo repasaste.",
          "Este paso parece burocrático, pero resuelve dos problemas. Primero, te da una dimensión real del trabajo: muchas veces el final asusta más en la cabeza que en la lista. Segundo, evita que dediques tiempo a lo que ya te gusta y esquives lo que te cuesta. Sé honesto con las notas de dominio; nadie las va a ver más que vos.",
          "Si la cátedra publica una bibliografía o una guía de preguntas frecuentes, usala para marcar cuáles temas son centrales y cuáles complementarios. Si tenés dudas sobre qué se toma o cómo, preguntá a la cátedra o a compañeros que ya rindieron, y desconfiá de los rumores sin fuente.",
        ],
      },
      {
        heading: "Un calendario hacia atrás",
        paragraphs: [
          "Además del estudio, comprobá en los canales oficiales la inscripción, los requisitos, la modalidad, el aula y la fecha del final. Con esa información, planificá hacia atrás: reservá momentos de práctica y repaso, y distribuí los temas según tus dificultades. Esta guía propone una organización; no informa trámites o requisitos de una cátedra específica.",
          "Una estructura razonable para varias semanas es la siguiente:",
        ],
        list: [
          "Primera etapa: estudiar los temas por primera vez, con resúmenes y ejercicios.",
          "Segunda etapa: repasar con práctica de recuperación, priorizando los temas débiles.",
          "Tercera etapa: simulacros de examen en condiciones parecidas a las reales.",
          "Última etapa: repaso liviano, descanso y logística del día del examen.",
        ],
      },
      {
        heading: "Dejá margen para lo inesperado",
        paragraphs: [
          "Los planes se rompen: te enfermás, aparece un trabajo, un tema resulta más difícil de lo previsto. Por eso conviene dejar uno de cada siete días casi libre, como colchón. Si no lo usás, lo aprovechás para repasar.",
          "Tampoco repartas las horas de forma pareja entre todos los temas. Dedicale más a los que tienen mayor peso o a los que dominás menos. Y escribí el plan donde lo veas, no solo en tu cabeza: pegado arriba del escritorio o como primera pantalla del calendario, de modo que cada mañana sepas en segundos qué toca hoy.",
        ],
      },
      {
        heading: "Exámenes anteriores y simulacros",
        paragraphs: [
          "Los exámenes de años anteriores, si la cátedra o tus compañeros los comparten, son una de las mejores herramientas. No los uses para adivinar qué va a entrar, porque eso cambia de turno en turno, sino para entender el formato: cuántas preguntas hay, si son teóricas o de resolución, cuánto tiempo hay por consigna, qué nivel de detalle se espera.",
          "Un simulacro es resolver uno de esos exámenes en las condiciones más parecidas posibles: con reloj, sin apuntes, sin celular y en una sola sentada. Corregilo después con criterio y anotá los errores por tipo: ¿no sabías el tema, te confundiste en una cuenta, te quedaste sin tiempo? Cada tipo se corrige distinto.",
          "Si es un final oral, el equivalente es explicar los temas en voz alta, de pie si podés, a un compañero o frente a un espejo. Hablar revela huecos que leer en silencio esconde. Pedile a alguien que te interrumpa con preguntas, porque en la mesa real no vas a poder desarrollar todo de corrido.",
        ],
      },
      {
        heading: "Las últimas 48 horas",
        paragraphs: [
          "En las últimas 48 horas, revisá qué falta y qué es viable. Si todavía hay temas nuevos, priorizalos según el programa y tus dudas; no existe una regla que prohíba aprender algo a esa altura. Reservá también tiempo para comprobar lo ya estudiado y preparar la logística, en vez de abrir material sin un objetivo.",
          "El día anterior, estudiá menos de lo que te tienta. Repasá livianamente por la mañana o la tarde, resolvé un par de ejercicios de calentamiento y dejá la noche tranquila. Dejá preparado lo práctico: documento, birome, calculadora si está permitida, el recorrido y el horario. Chequeá de nuevo la fecha, la hora y el aula en los canales oficiales.",
          "Dormí lo que puedas. Un descanso razonable rinde más que sumar tres horas de estudio con sueño. Y el día del examen, comé algo, llegá con tiempo y, ya en la hoja, leé todas las consignas antes de empezar para decidir el orden.",
        ],
      },
      {
        heading: "Errores típicos al preparar un final",
        paragraphs: [
          "Los más comunes son empezar tarde y sin inventario, pasarse semanas armando resúmenes preciosos sin ponerse a prueba, estudiar solo lo que ya sabés, y dejar los simulacros para el último día, cuando ya no queda margen para corregir nada.",
          "Otro error es compararte con lo que dicen los demás. Quien afirma que estudió todo en una noche suele omitir lo que ya venía haciendo durante la cursada. Armá tu propio plan y revisalo cada pocos días: si vas atrasado, recortá alcance de forma consciente en lugar de apurar todo.",
          "Y si no te va bien, tratalo como información. Pedí ver el examen si la cátedra lo permite, identificá qué falló y ajustá el plan para la próxima fecha. Un final desaprobado cuenta como un intento, no como un veredicto sobre lo que podés lograr.",
        ],
      },
    ],
  },
  {
    slug: "organizar-la-semana-de-estudio",
    title: "Organizar la semana de estudio con tiempos reales",
    description:
      "Aprendé a planificar la semana universitaria con bloques de tiempo, equilibrar clases, trabajos y parciales, y revisar tu plan para que sea sostenible.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Por qué planificar la semana y no solo el día",
        paragraphs: [
          "Muchos estudiantes viven decidiendo sobre la marcha qué estudiar hoy. El problema es que ese método favorece lo urgente sobre lo importante: se estudia lo que vence mañana y se posterga lo que parece lejano, hasta que deja de estar lejos. Planificar por semana te da una vista más amplia, suficiente para repartir el esfuerzo sin tener que prever todo el cuatrimestre.",
          "Una semana tiene además un ritmo natural: clases fijas, días con más tiempo libre, un fin de semana que puede usarse o no. Si ves todo eso junto, podés distribuir mejor la carga y detectar de antemano los días imposibles.",
          "No necesitás una aplicación sofisticada. Un calendario en papel o en el celular, y media hora un domingo o un lunes temprano, son suficientes para empezar.",
        ],
      },
      {
        heading: "Armá el esqueleto: lo que ya está fijo",
        paragraphs: [
          "Primero, volcá en el calendario todo lo que no se mueve: horarios de cursada, traslados, trabajo, compromisos familiares, entrenamientos, turnos médicos. Incluí los tiempos de viaje y de comida, que suelen olvidarse y después hacen que la cuenta no cierre.",
          "Lo que queda después de anotar clases, trabajo, viajes, comidas y descanso es tu disponibilidad para distribuir. No restes dos veces las actividades que ya pusiste en el calendario. Por ejemplo, una franja de 14:00 a 17:00 con media hora de viaje permite planear dos bloques y una pausa, no tres horas completas de ejercicios. Dejá además margen para imprevistos.",
          "Después anotá las fechas de entrega, parciales y trabajos prácticos de todas las materias, con al menos dos o tres semanas de visibilidad. Ese panorama te ayuda a ver cuándo se juntan varias cargas a la vez.",
        ],
      },
      {
        heading: "Bloques de tiempo con un propósito",
        paragraphs: [
          "En lugar de anotar “estudiar” en una franja, asignale a cada bloque una materia y una tarea. La técnica de bloques de tiempo consiste justamente en eso: decidir de antemano qué vas a hacer y en qué momento, para no gastar energía en decidir cuando ya estás cansado.",
          "Algunas ideas prácticas para armar los bloques:",
        ],
        list: [
          "Poné las tareas más exigentes en tu mejor momento del día.",
          "Usá bloques de entre 60 y 120 minutos, con pausas dentro.",
          "Alterná materias distintas en el mismo día para variar el esfuerzo.",
          "Reservá un bloque semanal para repasar lo visto, no solo para avanzar.",
          "Dejá un bloque comodín libre para lo que se atrase.",
        ],
      },
      {
        heading: "Equilibrar la cursada diaria con los parciales",
        paragraphs: [
          "Cuando la cursada y los trabajos prácticos ocupan casi toda la semana, probá reservar un bloque breve para cada materia que después puedas ajustar. Es una opción de organización, no una cantidad de minutos que garantice rendimiento. Si un plan no entra en tus horarios, reducí el objetivo o buscá ayuda con la prioridad de los temas.",
          "Cuando se acerca un parcial, aumentá progresivamente su peso en el calendario y reducí el de otras materias sin abandonarlas. Evitá el todo o nada: si dejás una materia por completo dos semanas, retomarla cuesta mucho.",
          "Si tenés varias entregas juntas, priorizá según tres criterios: fecha límite, peso en la nota y esfuerzo requerido. A veces conviene sacarse de encima una tarea corta para liberar la cabeza. Y si hay un conflicto imposible, hablá con docentes a tiempo; suelen ser más flexibles cuando les avisás antes y no el día del vencimiento.",
        ],
      },
      {
        heading: "Revisá el plan cada semana",
        paragraphs: [
          "Un plan solo sirve si lo ajustás con lo que vas aprendiendo. Al final de la semana, dedicá diez minutos a mirar qué hiciste y qué no. Preguntate: ¿qué bloques cumplí?, ¿cuáles se corrieron una y otra vez?, ¿subestimé alguna tarea?",
          "Casi siempre, el tiempo que calculamos para una tarea es menor al que realmente toma. Si notás que siempre te falta, multiplicá tu estimación por un factor mayor la próxima vez. Si un bloque siempre se saltea, probablemente esté en un horario o lugar poco realista; cambialo en lugar de culparte.",
          "Con la revisión, armá el plan de la semana siguiente. Trasladá lo pendiente solo si sigue siendo importante, y descartá sin culpa lo que ya no lo es.",
        ],
      },
      {
        heading: "Errores comunes y ajustes",
        paragraphs: [
          "Un error muy habitual es planificar como si fueras otra persona: seis horas diarias de estudio, levantarte a las cinco, cero descanso. Esos planes duran tres días. Diseñá uno que puedas sostener en una semana mala, y si una semana es buena, mejor.",
          "Otro error es no incluir el descanso ni el movimiento. Dormir, comer y hacer algo de actividad física no son extras, son lo que sostiene el rendimiento. También es frecuente cambiar de sistema cada semana buscando el método perfecto. Elegí uno simple y mantenelo al menos un mes antes de evaluar.",
          "Elegí un lugar al que puedas llegar dentro del tiempo previsto. En esta app, revisar el mapa permite conocer reportes antes de salir, pero no garantiza encontrar una silla libre. Si hay muchos lugares sin datos, contemplá una alternativa de estudio en vez de tratar esos asientos como disponibles.",
        ],
      },
    ],
  },
  {
    slug: "concentrarse-en-una-sala-de-estudio",
    title: "Cómo concentrarte en una sala de estudio compartida",
    description:
      "Consejos prácticos para concentrarte en una sala de estudio compartida: elegir el lugar, manejar el celular y el ruido, y convivir respetando a los demás.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Qué tiene de bueno y de difícil estudiar acompañado",
        paragraphs: [
          "Una sala de estudio tiene ventajas claras. Ver a otras personas trabajando genera un efecto de contagio: es más fácil quedarte en la tarea cuando todos alrededor hacen lo mismo. Además, el lugar está pensado para estudiar, lo que separa mentalmente el trabajo del descanso, algo que en casa cuesta más con la cama, la tele y la heladera a pocos pasos.",
          "Pero compartir espacio trae sus desafíos. Hay ruidos, movimientos, conversaciones lejanas y gente que entra y sale. Tu atención se ve tentada por estímulos que no controlás. La buena noticia es que gran parte de la concentración depende de decisiones que tomás antes de sentarte.",
          "En esta guía vas a encontrar pautas para elegir tu lugar, manejar distracciones y convivir de una manera que haga la sala mejor para todos.",
        ],
      },
      {
        heading: "Elegí bien dónde sentarte",
        paragraphs: [
          "El lugar influye más de lo que parece. Si te distraés con facilidad, evitá las mesas cerca de la puerta, donde pasa más gente, o junto a zonas de conversación. Una ubicación con la pared a un costado o con poca circulación reduce los estímulos visuales.",
          "También conviene pensar en la luz y la comodidad. Si podés, elegí un sitio con buena iluminación, cerca de un enchufe si vas a usar la computadora, y con una silla en la que puedas sostener la postura un par de horas. Estudiar encorvado incomoda y te hace perder foco.",
          "Si dependés de tomar apuntes con mucho material, un espacio con mesa amplia te ahorra malabares. Y si tenés la posibilidad de ver antes qué lugares están libres, evitás dar vueltas con la mochila buscando y empezás antes. Probá distintos sitios durante unos días y quedate con el que mejor te rinde.",
        ],
      },
      {
        heading: "El celular: tu mayor distractor",
        paragraphs: [
          "Si el teléfono interrumpe tu trabajo, probá silenciar las aplicaciones que no necesitás y dejarlo fuera de la vista. No hay un tiempo de recuperación de la atención que sea igual para todas las interrupciones. Registrá qué te distrae en una sesión para decidir qué cambiar en la siguiente, sin asumir que todas las personas trabajan del mismo modo.",
          "Estas medidas ayudan bastante:",
        ],
        list: [
          "Ponelo en modo avión o no molestar mientras dure el bloque.",
          "Guardalo dentro de la mochila, no sobre la mesa.",
          "Desactivá notificaciones de redes y grupos durante el estudio.",
          "Reservá momentos específicos para revisar mensajes, como los descansos.",
          "Si necesitás el teléfono para estudiar, cerrá todo lo que no sea la aplicación necesaria.",
        ],
      },
      {
        heading: "Ruido y distracciones sonoras",
        paragraphs: [
          "Cada persona tolera el sonido de forma distinta. Algunas rinden con silencio total y otras con un fondo constante. Los auriculares con cancelación de ruido o los tapones pueden ayudar, y una música sin letra o ruido blanco suele molestar menos que canciones que podés cantar, porque el lenguaje compite con lo que estás leyendo.",
          "Si usás auriculares, cuidá que el volumen no se escuche afuera. Y si la tarea es muy exigente, como un problema nuevo o un texto difícil, probá hacerla en silencio y dejá la música para tareas más mecánicas.",
          "Cuando alguien conversa cerca, antes de enojarte, considerá si podés cambiarte de lugar. Es lo más rápido y evita roces. Si el ruido es persistente e importante, pedilo con amabilidad y en voz baja; casi siempre la gente colabora cuando se lo pedís bien.",
        ],
      },
      {
        heading: "Convivencia y buenas costumbres",
        paragraphs: [
          "La sala Manuel Gil está identificada por la Biblioteca Central como una sala de lectura silenciosa. Salí del espacio de lectura para conversar, hacer llamadas o practicar explicaciones en voz alta. Seguí las indicaciones del lugar sobre alimentos y bebidas, cuidá el mobiliario y retirate con tus pertenencias y residuos.",
          "Un punto especialmente importante es el uso de los lugares. En una sala sin reservas, un asiento ocupado con una mochila y nadie sentado le quita un lugar a alguien que lo necesita. Si vas a ausentarte un buen rato, llevate tus cosas y dejá la silla libre. Una pausa breve para ir al baño o tomar agua es razonable, pero un almuerzo largo no lo es.",
          "Cuando termines, llevate tus pertenencias y marcá «Me voy» para cerrar tu presencia. Que desaparezca tu avatar no sustituye una observación actual: el asiento puede tener otro reporte vigente o quedar sin datos. Si querés informar que está libre, comprobá que quedó vacío y sin pertenencias.",
        ],
      },
      {
        heading: "Armá una rutina que te ayude a entrar en foco",
        paragraphs: [
          "Un pequeño ritual de inicio te ayuda a pasar a modo estudio: sentarte, sacar solo lo que vas a usar, silenciar el teléfono, anotar qué vas a hacer en este bloque y poner un temporizador. Hacerlo siempre igual vuelve más automático el arranque.",
          "Combiná ese ritual con bloques cortos de trabajo y descansos regulares. Entre bloques, levantate, estirá, tomá agua y mirá algo distinto de la pantalla. Eso reduce la fatiga y te da un buen momento para revisar el celular sin culpa. El modo Foco de la app puede servirte para marcar esos tiempos.",
          "Y si un día no hay caso, no te castigues. A veces lo mejor es cambiar de lugar, de materia o de tarea, o dar una vuelta y volver. La concentración se entrena con constancia y se cuida con descanso, no con fuerza de voluntad pura.",
        ],
      },
    ],
  },
  {
    slug: "descanso-sueno-y-rendimiento",
    title: "Descanso, sueño y rendimiento: lo que sostiene tu estudio",
    description:
      "Cómo reservar tiempo de descanso al planificar el estudio, qué recomienda el NHLBI sobre hábitos de sueño y cuándo conviene buscar orientación profesional.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Estudiar más horas no siempre es estudiar mejor",
        paragraphs: [
          "El tiempo sentado no basta para evaluar una sesión de estudio. Revisá si podés explicar un concepto, resolver un ejercicio o identificar una duda. Si el cansancio impide esas tareas, ajustar la carga y reservar descanso puede ser más útil que perseguir un total de horas. Esta página trata de organizar el estudio, no de evaluar tu salud.",
          "Cuidar el descanso no es una pérdida de tiempo ni un lujo, sino parte del método. Es lo que te permite sostener el estudio durante semanas, y no apenas durante una noche heroica.",
          "Esta guía reúne hábitos generales y bien conocidos sobre pausas, sueño, movimiento e hidratación. No reemplaza la consulta con profesionales de la salud: si tenés problemas persistentes de sueño, ansiedad o cansancio, hablalo con un médico o con los servicios de salud a tu alcance.",
        ],
      },
      {
        heading: "Las pausas dentro de la sesión de estudio",
        paragraphs: [
          "Hacer pausas breves y regulares ayuda a mantener la atención. Un descanso de cinco a diez minutos cada 25 a 50 minutos de trabajo es un punto de partida razonable, que podés ajustar según la tarea. Durante la pausa, lo mejor es desconectarte de verdad: pararte, caminar, estirar, mirar por la ventana o tomar agua.",
          "Evitá llenar la pausa con otra pantalla. Pasar de los apuntes al celular mantiene a tu cerebro procesando información y no descansa del mismo modo. Además, es muy fácil que cinco minutos se conviertan en media hora.",
          "También conviene variar la tarea a lo largo del día. Alternar lectura con ejercicios o escritura reduce la monotonía. Y cuando sentís que releés la misma línea tres veces sin entender, no insistas por orgullo: una pausa corta suele ser más productiva que seguir peleando contra el cansancio.",
        ],
      },
      {
        heading: "Reservar tiempo de sueño en tu plan",
        paragraphs: [
          "El NHLBI recomienda reservar tiempo suficiente para dormir y mantener horarios regulares. Para organizar una semana de estudio, eso significa incluir el sueño en el calendario antes de repartir las tareas. No podemos deducir cuánto aprendiste ni diagnosticar un problema de memoria a partir de las horas que registra la app.",
          "Por ejemplo, si necesitás terminar temprano para sostener tu rutina de sueño, elegí qué ejercicio o lectura vas a completar antes de ese límite. Lo que no entra queda anotado para otra sesión. El ejemplo sirve para planificar una carga posible; no fija una hora de acostarse ni una necesidad de sueño para todas las personas.",
          "Algunos hábitos generales que suelen ayudar:",
        ],
        list: [
          "Acostarte y levantarte en horarios parecidos todos los días.",
          "Reducir el uso de pantallas en la hora previa a dormir.",
          "Evitar la cafeína en las horas finales de la tarde y la noche.",
          "Mantener el cuarto oscuro, fresco y tranquilo.",
          "No dejar para la noche el estudio más pesado si podés hacerlo antes.",
        ],
      },
      {
        heading: "El costo de las trasnochadas",
        paragraphs: [
          "El NHLBI describe efectos de dormir insuficientemente sobre la atención y el funcionamiento diurno. Eso no permite predecir la nota de un examen ni comparar exactamente una hora de sueño con una hora de repaso. Si falta tiempo, elegí una tarea prioritaria y preservá tiempo para descansar.",
          "Esto no significa que nunca vayas a estar apurado. Si por algún motivo te quedaste corto de tiempo, es mejor priorizar: repasar lo más importante, dormir lo que puedas y llegar descansado. Una noche de sueño razonable suele rendir más que dos o tres horas extra de estudio con la cabeza fundida.",
          "El café y otras bebidas con cafeína pueden ayudar a corto plazo, pero no reemplazan el descanso, y en exceso pueden aumentar el nerviosismo y arruinar el sueño siguiente. Si dependés de ellos cada día, probablemente conviene revisar tu rutina de fondo.",
        ],
      },
      {
        heading: "Movimiento, comida y agua",
        paragraphs: [
          "La actividad física regular está asociada con mejor estado de ánimo, menos estrés y mejor descanso. No hace falta entrenar duro: una caminata de veinte minutos, andar en bicicleta o estirar entre bloques ya suma. Si pasás horas sentado, levantate cada tanto para mover el cuerpo.",
          "Prever agua y un momento para comer evita que el plan de estudio dependa de saltear necesidades básicas. Respetá las reglas de alimentos y bebidas de la sala. Esta guía no recomienda una dieta ni explica el cansancio por un supuesto pico de azúcar: si tenés necesidades alimentarias o síntomas persistentes, consultá a un profesional.",
          "Tomar luz natural durante el día también suele ayudar a regular el reloj interno. Si estudiás todo el día en un lugar cerrado, salir un rato afuera en un descanso puede hacer una diferencia notable en cómo te sentís.",
        ],
      },
      {
        heading: "Cuidar la cabeza y armar una rutina sostenible",
        paragraphs: [
          "El estrés antes de los exámenes es normal, pero no tiene que ocupar toda tu vida. Reservá tiempo para actividades que disfrutes, charlá con amigos y no te aísles. Hablar de cómo te sentís con compañeros, familia o un profesional puede aliviar mucho más de lo que imaginás.",
          "Una organización posible incluye horarios de sueño, pausas y momentos para comer y moverse. Adaptala a tu cursada, trabajo y necesidades personales. No hay un cambio de rutina que asegure una mejora de memoria o de notas; para un problema persistente de salud hace falta una evaluación fuera de esta app.",
          "Probá cambiar una sola cosa por vez. Por ejemplo, durante una semana, acostate treinta minutos antes. A la semana siguiente, sumá una caminata. Los pequeños cambios sostenidos funcionan mejor que una reforma total que abandonás al tercer día. Y recordá: descansar bien es también una forma de estudiar.",
        ],
      },
    ],
  },
  {
    slug: "tomar-apuntes-en-clase",
    title: "Cómo tomar apuntes en clase: Cornell, papel y computadora",
    description:
      "Organizá apuntes con el método Cornell, transformá notas en preguntas y compará papel y computadora según tus tareas y necesidades de acceso.",
    readingMinutes: 5,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Para qué sirven los apuntes",
        paragraphs: [
          "Tomar apuntes cumple dos funciones distintas. La primera es dejar un registro: lo que el profesor explicó, el ejemplo que resolvió en el pizarrón, la fecha del parcial que mencionó al pasar. La segunda es obligarte a procesar lo que escuchás mientras lo escuchás, porque para escribir algo con tus palabras primero tenés que entenderlo, al menos en parte.",
          "Hay un error muy común: querer copiarlo todo. Si escribís cada palabra, tu cabeza queda ocupada en transcribir y casi no queda lugar para pensar. Además, un apunte larguísimo y desordenado es difícil de estudiar después. Te sirve más un registro que seleccione, organice y simplifique, aunque te pierdas alguna frase.",
          "Para evaluar tus apuntes, probá usarlos al día siguiente sin tener la clase delante: ¿podés reconstruir el concepto y resolver el ejemplo? Si sólo reconocés las frases, agregá preguntas y corregí los huecos con la bibliografía. Esa comprobación permite ajustar tu sistema sin dar por hecho que un formato funciona igual para todas las personas.",
        ],
      },
      {
        heading: "El método Cornell",
        paragraphs: [
          "La Universidad de Cornell atribuye este sistema a su profesor Walter Pauk. La hoja tiene tres zonas: preguntas o pistas a la izquierda, notas de clase a la derecha y un resumen abajo. Después de la clase, usás la columna de preguntas para recordar y comprobar lo explicado. Podés adaptar el formato a fórmulas, dibujos o texto según lo que necesites registrar.",
          "Una forma de usarlo, paso a paso:",
        ],
        list: [
          "Durante la clase, escribí en la zona derecha ideas, definiciones y ejemplos, con frases cortas y abreviaturas propias.",
          "Ese mismo día o al siguiente, completá la columna izquierda con una pregunta por cada bloque de notas.",
          "Tapá la zona derecha, respondé cada pregunta de memoria y recién después verificá.",
          "Escribí en la franja inferior un resumen de dos o tres líneas con tus palabras.",
          "Al final de la semana, repasá solo preguntas y resúmenes, y volvé a las notas completas cuando algo no te salga.",
        ],
      },
      {
        heading: "Reescribir o repasar",
        paragraphs: [
          "Pasar los apuntes en limpio es una costumbre muy extendida. Queda prolijo y da la sensación de avanzar, pero si copiás de un papel a otro tu cabeza trabaja poco: se puede hacer casi sin pensar.",
          "Reescribir sí tiene sentido cuando transformás el material. Por ejemplo, cuando reordenás ideas, unís lo que se dijo en dos clases distintas, armás un esquema o completás un hueco con el libro. En ese caso es una forma de estudiar y no de decorar.",
          "Para repasar, lo que se sabe sobre técnicas de estudio apunta a que ponerte a prueba rinde más que releer. Una alternativa a pasar en limpio es cerrar el cuaderno, escribir lo que recordás de la clase y recién después comparar. Lo que falte o esté mal es justo lo que tenés que reforzar.",
        ],
      },
      {
        heading: "Notebook o papel",
        paragraphs: [
          "Elegí el soporte según la tarea y tus necesidades de acceso. El papel facilita dibujar un esquema o una fórmula; la computadora permite buscar, ampliar texto y reorganizar material. También podés combinarlos. No usamos esta guía para declarar un ganador universal ni para atribuirte mejores resultados por escribir a mano.",
          "Compará el resultado con tres preguntas: ¿cómo se define el concepto?, ¿en qué caso se aplica?, ¿qué error muestra el ejemplo de clase? Respondé antes de abrir las notas y usalas para corregirte. Si no encontrás una respuesta, agregá una referencia a la página del material o una duda para consulta.",
          "Lo que sí es bastante claro es el costo de la distracción: con la computadora abierta, las redes y el correo quedan a un clic y es fácil perder el hilo de la clase. Si usás notebook, silenciá las notificaciones y cerrá todo lo que no sea el documento.",
          "Una regla práctica: elegí lo que te permita escribir ideas con tus palabras en lugar de transcribir. Para materias con fórmulas o diagramas, el papel suele ser más cómodo. Para materias con mucho texto, el teclado alcanza si lo usás con disciplina.",
        ],
      },
      {
        heading: "Qué anotar y qué hacer después",
        paragraphs: [
          "Prestá atención a las señales del profesor: cuando repite algo, cuando dice que es importante o cuando dedica varios minutos a un ejemplo, probablemente tenga peso en el examen. Algunas pautas para el momento de la clase:",
        ],
        list: [
          "Anotá ideas y relaciones en vez de frases completas, y usá flechas y abreviaturas que entiendas vos.",
          "Dejá espacio en blanco para completar lo que no alcanzaste a escribir.",
          "Marcá con un signo de pregunta lo que no entendiste, sin frenar la clase para resolverlo.",
          "Anotá siempre ejemplos y contraejemplos, que suelen ser lo más difícil de reconstruir más tarde.",
          "Poné fecha, materia y tema en cada clase para ordenar después.",
        ],
      },
      {
        heading: "Después de la clase",
        paragraphs: [
          "Dedicá diez o quince minutos, el mismo día si podés, a releer los apuntes con la lapicera en la mano. Completá abreviaturas que mañana no vas a entender, subrayá lo central y anotá las dudas para llevar a consulta o buscar en el libro.",
          "Después programá repasos cortos y espaciados. Tapar y recordar o explicarle el tema a un compañero funciona mejor que releer una y otra vez. Si faltaste, pedí apuntes, pero tratalos como un borrador: leelos, hacé tus propias preguntas y rearmalos con tus palabras.",
          "Y no esperes tener el sistema perfecto. Probá un método dos o tres semanas, fijate si los apuntes te sirven a la hora de estudiar y ajustá. Un apunte sencillo que repasás vale más que uno hermoso que nunca volvés a abrir.",
        ],
      },
    ],
  },
  {
    slug: "resolver-ejercicios-de-matematica",
    title: "Estudiar materias de ejercicios: matemática, física y programación",
    description:
      "Cómo estudiar materias de práctica: resolver sin mirar la solución, llevar un cuaderno de errores e intercalar tipos de problemas para rendir mejor.",
    readingMinutes: 5,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Por qué mirar la resolución engaña",
        paragraphs: [
          "En las materias de ejercicios hay una trampa muy común: leés la resolución de un problema, seguís cada paso, todo te parece lógico y concluís que lo entendiste. Pero seguir un razonamiento ajeno es mucho más fácil que producirlo vos desde una hoja en blanco, que es lo que te piden en el parcial.",
          "Esto vale para análisis, álgebra, física, estadística y también para programación. Saber leer código no es lo mismo que saber escribirlo, igual que entender una demostración no es lo mismo que poder armarla. La habilidad que se evalúa es la de resolver, y esa solo se entrena resolviendo.",
          "La buena noticia es que cambiar la forma de estudiar no exige más horas, sino usar las que tenés de otro modo.",
        ],
      },
      {
        heading: "Práctica activa: qué significa",
        paragraphs: [
          "En materias de ejercicios necesitás combinar comprensión teórica y práctica. Antes de elegir una fórmula o un algoritmo, identificá sus condiciones de uso. Volvé a un ejemplo resuelto o a la bibliografía si no podés justificar un paso; resolver a ciegas tampoco permite comprobar que entendiste.",
          "En física, antes de hacer cuentas, escribí qué datos tenés, qué te piden y qué principio aplica. Resolver primero de forma simbólica y reemplazar los números al final te ayuda a detectar errores y a ver la estructura del problema.",
          "En programación, tomá un problema, escribí la solución sin copiar de ningún lado y recién después compará con otras versiones. Volver unos días más tarde a mejorar tu propio código funciona como un repaso espaciado.",
          "Algunas ideas para organizar la práctica:",
        ],
        list: [
          "Antes de hacer los ejercicios, leé la teoría una vez y después cerrala.",
          "Empezá por problemas simples para tomar ritmo y subí la dificultad de a poco.",
          "Escribí cada paso con su justificación, no solo la cuenta final.",
          "Al terminar, revisá si el resultado tiene sentido: unidades, signo, orden de magnitud, casos extremos.",
          "En programación, escribí el código a mano o en un editor sin autocompletado agresivo antes de ejecutarlo.",
        ],
      },
      {
        heading: "Trabajar sin mirar la solución",
        paragraphs: [
          "Cuando te trabás, la tentación de espiar la resolución aparece enseguida. Intentá postergarla. Pasar un rato incómodo frente al problema, probando caminos que no salen, es parte del aprendizaje y no una pérdida de tiempo. Eso sí, tampoco hace falta quedarse una hora sin avanzar.",
          "Un protocolo razonable es poner un límite. Si pasaron entre diez y quince minutos, releé el enunciado, dibujá un esquema, probá con un caso particular o resolvé una versión más simple. Si seguís trabado, mirá solo una pista, por ejemplo el primer paso, y volvé a intentar solo.",
          "Cuando consultes una solución, anotá por qué te faltaba ese paso y volvé a resolver sin copiar. Haber repetido un ejercicio una vez es una primera comprobación, no una prueba definitiva de dominio. Días después, intentá uno parecido que cambie una condición o un dato.",
        ],
      },
      {
        heading: "El cuaderno de errores",
        paragraphs: [
          "Los errores son la información más útil que tenés para estudiar, pero se pierden si los tachás y seguís de largo. Un cuaderno de errores es simplemente un lugar donde anotás lo que falló, para no repetirlo.",
          "Por cada error importante, escribí estas cuatro cosas:",
        ],
        list: [
          "El enunciado del ejercicio, resumido en una o dos líneas.",
          "Qué hiciste mal, con precisión: un signo, un teorema mal aplicado, un caso olvidado.",
          "Por qué te pareció razonable en ese momento.",
          "La corrección y una regla breve para la próxima, por ejemplo “verificar siempre el dominio antes de simplificar”.",
        ],
      },
      {
        heading: "Qué hacer con ese cuaderno",
        paragraphs: [
          "Revisalo antes de cada sesión de práctica y antes del parcial. Con el tiempo vas a notar patrones: tal vez fallás casi siempre en el álgebra y no en el concepto, o te olvidás de revisar los casos borde. Detectarlo te permite practicar justo lo que más necesitás.",
          "También sirve como fuente de ejercicios. Volvé a resolver, unos días después, los problemas que te salieron mal. Es un repaso espaciado hecho a medida de tus debilidades.",
        ],
      },
      {
        heading: "Intercalar tipos de problemas",
        paragraphs: [
          "Es natural practicar de a un tema por vez: diez ejercicios de integrales por partes, después diez de sustitución. Eso da una sensación de dominio, porque ya sabés qué método usar antes de leer el enunciado. En el examen, en cambio, nadie te avisa qué técnica corresponde.",
          "La práctica intercalada consiste en mezclar tipos de problemas en una misma sesión. Es más difícil y más lenta al principio, pero te obliga a practicar lo que más falta en un examen: reconocer qué herramienta aplicar. Distintos trabajos de psicología cognitiva la muestran como una buena aliada en matemática y ciencias, aunque el beneficio depende de la tarea.",
          "Para probarla sin complicarte, armá una tanda con un ejercicio de cada tema visto hasta ahora, o juntá problemas de varias guías y sorteá el orden. Podés combinarla con bloques de práctica por tema cuando recién estás aprendiendo algo nuevo.",
        ],
      },
      {
        heading: "Una semana de ejemplo",
        paragraphs: [
          "Para un parcial dentro de dos semanas, podrías dedicar los primeros días a practicar cada tema por separado, anotando los errores. A mitad de camino, pasar a tandas mezcladas y repetir los problemas del cuaderno. En los últimos días, resolver un examen anterior completo, con tiempo limitado y sin apuntes.",
          "Después corregilo con calma y anotá lo que falló. Ese examen simulado vale más que releer la teoría por quinta vez, porque te muestra cómo rendís bajo las condiciones reales.",
        ],
      },
    ],
  },
  {
    slug: "ansiedad-ante-los-examenes",
    title: "Nervios ante un examen: preparación y cuándo buscar apoyo",
    description:
      "Técnicas simples para llegar con más calma a un examen: preparación, respiración, reencuadre de pensamientos y una rutina para el día, más cuándo pedir ayuda.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Sentir nervios es normal",
        paragraphs: [
          "Casi todos los estudiantes sienten nervios antes de un examen. El corazón late más rápido, aparece un nudo en el estómago, cuesta concentrarse. Un poco de activación es habitual y hasta puede ayudarte a estar atento. El problema aparece cuando los nervios son tan intensos que te bloquean, te hacen olvidar lo que sabés o te llevan a evitar rendir.",
          "Esta guía reúne herramientas prácticas y cotidianas. No es un tratamiento ni reemplaza la atención de un profesional: su objetivo es ayudarte a organizar tu preparación y tu día de examen para que los nervios pesen menos.",
        ],
      },
      {
        heading: "Preparación: la base de la calma",
        paragraphs: [
          "La guía de Cornell sobre preocupación ante exámenes propone preparar el formato, practicar y organizar el tiempo durante la prueba. Estas acciones pueden reducir algunas incertidumbres académicas. La ansiedad tiene causas diversas: no implica que te hayas preparado mal ni se resuelve necesariamente con un calendario.",
          "Otra fuente de tranquilidad es tener un plan B: saber cuántas oportunidades de rendir tenés, cuándo es la próxima fecha y qué pasaría si te va mal. Conocer el peor escenario realista le quita fuerza a la imaginación catastrófica.",
          "Algunas estrategias que ayudan:",
        ],
        list: [
          "Armá un plan de estudio con fechas, dividido por temas, y tachá lo que vas completando.",
          "Practicá con exámenes anteriores y con el tiempo limitado, para que el formato te resulte familiar.",
          "Ponete a prueba en lugar de solo releer, así sabés qué dominás de verdad y no solo qué te suena conocido.",
          "Practicá en condiciones parecidas a las reales: sentado, sin apuntes, con reloj.",
          "Dejá el día anterior para un repaso liviano y no para aprender temas nuevos.",
        ],
      },
      {
        heading: "Respiración y calma en el momento",
        paragraphs: [
          "Cuando sentís que los nervios suben, la respiración es una de las herramientas más accesibles. Respirar lento y profundo no elimina la ansiedad, pero suele ayudar a bajar un poco la agitación y a recuperar la atención.",
          "Si te resulta cómodo, hacé una pausa breve y dejá que la respiración siga un ritmo tranquilo, sin forzar inhalaciones ni retener el aire. No es un tratamiento ni hace falta cumplir una cuenta de segundos. Si te incomoda o te marea, dejá el ejercicio y volvé a respirar normalmente.",
          "Otra ayuda es anclarte en lo que tenés alrededor: sentí los pies en el piso, el peso del cuerpo en la silla, y nombrá mentalmente tres cosas que ves. Es una forma de volver al presente cuando la cabeza se va a escenarios catastróficos.",
        ],
      },
      {
        heading: "Reencuadrar los pensamientos",
        paragraphs: [
          "Los pensamientos del tipo “voy a desaprobar”, “todos saben más que yo” o “si me va mal, arruiné todo” suelen sonar como hechos, pero son predicciones. Un primer paso es notarlos y ponerles nombre: “estoy anticipando lo peor”.",
          "Después podés cuestionarlos con preguntas concretas: ¿qué evidencia tengo? ¿Qué le diría a un amigo en mi lugar? ¿Qué es lo peor que puede pasar de forma realista y cómo lo manejaría? Muchas veces el resultado es una frase más equilibrada, como “estoy nervioso porque me importa; me preparé y voy a responder lo que pueda”.",
          "Un examen no determina tu valor personal. Si los síntomas te preocupan o se repiten, no los atribuyas automáticamente a nervios normales: consultá con un profesional. Esta app no evalúa síntomas ni reemplaza ese acompañamiento.",
        ],
      },
      {
        heading: "La rutina del día del examen",
        paragraphs: [
          "Durante el examen, administrá el tiempo: repartí los minutos según el puntaje de cada ejercicio y mirá el reloj de vez en cuando, sin obsesionarte. Si notás que la ansiedad sube, hacé una pausa de treinta segundos, respirá y volvé a la consigna.",
          "Tener una rutina fija le saca decisiones a la mañana y reduce los imprevistos. Algunos puntos para armarla:",
        ],
        list: [
          "Dejá preparado la noche anterior lo que necesitás: documento, lapicera, calculadora, agua.",
          "Reservá tiempo para descansar. Si dormir se vuelve un problema persistente, buscá orientación profesional.",
          "Desayunar algo liviano y llegar con tiempo de sobra evita correr y llegar agitado.",
          "No repases con compañeros ansiosos en la puerta, porque se contagian dudas; si te hace mal, alejate.",
          "Ya en el examen, leé todo primero, empezá por lo que mejor sabés y, si te bloqueás en una pregunta, pasá a otra y volvé después.",
        ],
      },
      {
        heading: "Cuándo pedir ayuda profesional",
        paragraphs: [
          "Si la ansiedad es muy intensa, si aparece en cada examen y te impide rendir, si afecta tu sueño, tu alimentación o tu vida diaria, o si te hace evitar la facultad, conviene que lo hables con un profesional de la salud. No tiene nada de vergonzoso: pedir ayuda a tiempo es una decisión sensata.",
          "Podés acercarte a los servicios de orientación de tu facultad, que suelen ofrecer apoyo a estudiantes, o consultar con tu médico o con un psicólogo. Si alguna vez sentís que no podés más o pensás en hacerte daño, buscá ayuda inmediata de una persona de confianza o de un servicio de emergencias.",
        ],
      },
    ],
  },
  {
    slug: "estudiar-en-grupo",
    title: "Estudiar en grupo: cuándo conviene, cuándo no y cómo organizarlo",
    description:
      "Guía para estudiar en grupo sin perder tiempo: cuándo ayuda y cuándo perjudica, qué roles repartir, cómo explicar a otros y cómo evitar que se disperse la charla.",
    readingMinutes: 5,
    updated: "2026-11-15",
    sections: [
      {
        heading: "El grupo no es bueno ni malo en sí",
        paragraphs: [
          "Estudiar en grupo puede ser muy valioso o una excelente excusa para charlar durante tres horas. La diferencia casi nunca está en las personas sino en cómo se organiza la sesión. Un grupo con un objetivo claro, un tiempo acotado y tareas definidas rinde mucho; uno que se junta a ver qué sale suele terminar en café y quejas sobre la materia.",
          "Antes de reunirse, acuerden qué quieren resolver y qué trabajo individual necesita cada persona. Revisen también las reglas de colaboración de la cátedra: estudiar juntos no habilita a compartir respuestas en un examen ni a entregar trabajo ajeno como propio.",
          "También conviene revisar los resultados con honestidad. Después de dos o tres encuentros, preguntense si están aprendiendo más que estudiando por separado. Si la respuesta es no, achiquen el grupo, cambien el formato o dejen de juntarse para ese tema.",
        ],
      },
      {
        heading: "Cuándo ayuda",
        paragraphs: [
          "El grupo suma cuando hay dudas concretas que otro puede aclarar, cuando necesitás ver otras formas de resolver un problema o cuando querés ponerte a prueba con preguntas que vos mismo no se te habrían ocurrido. También ayuda a sostener la constancia: comprometerte con otros a una hora y un lugar hace más difícil faltar.",
          "Es especialmente útil para repasar antes de un parcial, comparar resoluciones, armar un resumen entre varios, completar apuntes de clases que alguien perdió o simular un examen oral donde unos preguntan y otros responden.",
        ],
      },
      {
        heading: "Cuándo perjudica",
        paragraphs: [
          "El grupo juega en contra cuando se usa para evitar el estudio individual. Si llegás sin haber visto el tema, vas a seguir lo que otros dicen sin procesarlo, y esa sensación de entender es engañosa. Tampoco rinde si el nivel es muy dispar y siempre explica la misma persona, o si hay demasiada gente y alguien queda al margen.",
          "Otras señales de alarma: que cada sesión empiece tarde, que no haya un tema previsto, que el celular esté siempre sobre la mesa o que se pase más tiempo en conversaciones laterales que en la materia. Si notás esto en tu grupo, no hace falta romperlo; alcanza con cambiar las reglas.",
          "Como punto de partida, armen un grupo pequeño en el que todas las personas puedan intervenir. Revisen si el tamaño y el formato permiten trabajar; no hay una cantidad de integrantes que garantice mejores resultados.",
        ],
      },
      {
        heading: "Roles que ordenan la sesión",
        paragraphs: [
          "Asignar roles evita que todo recaiga en una persona y mantiene a todos activos. No hace falta que sea formal; alcanza con repartirlos al empezar y rotarlos en cada encuentro.",
        ],
        list: [
          "Moderador: cuida el orden del día y el tiempo, y retoma el tema cuando la charla se va por las ramas.",
          "Explicador: presenta un tema o resuelve un ejercicio en voz alta, y cambia en cada ronda.",
          "Preguntón: tiene la tarea de cuestionar, pedir ejemplos y detectar lo que quedó poco claro.",
          "Anotador: registra las dudas sin resolver y los acuerdos, para llevarlos a consulta.",
        ],
      },
      {
        heading: "Explicar a otros para aprender",
        paragraphs: [
          "Explicar un tema es una de las mejores pruebas de si lo entendés. Cuando intentás decirlo con tus palabras, aparecen huecos que leyendo pasaban desapercibidos. Esa es la lógica detrás de la técnica de Feynman: elegir un concepto, explicarlo de forma simple como si el otro no supiera nada, detectar dónde te trabás y volver al material.",
          "En el grupo, esto se vuelve práctico. Cada uno prepara un tema por su cuenta y lo explica sin mirar apuntes, y el resto pregunta. Si la explicación se apoya en jerga que nadie define, probablemente falta comprensión. Y si sos quien más sabe, explicar te obliga a ordenar el conocimiento, así que tampoco perdés tiempo.",
          "Eso sí, escuchar una explicación no reemplaza hacerlo vos. Después de que alguien explique algo, intentá repetirlo con tus palabras o resolvé un ejercicio parecido sin ayuda.",
        ],
      },
      {
        heading: "Evitar que el grupo se disperse",
        paragraphs: [
          "Las charlas laterales son lo que más tiempo se come. Unos acuerdos simples ayudan bastante:",
        ],
        list: [
          "Definí antes de empezar qué temas o ejercicios se van a cubrir y cuánto tiempo lleva cada uno.",
          "Trabajen en bloques cortos, por ejemplo de 40 minutos, con un descanso donde sí se puede charlar.",
          "Dejen los celulares boca abajo o guardados durante el bloque.",
          "Si el grupo de mensajes se llena de memes, armen otro solo para coordinar horarios y compartir material.",
          "Cierren cada sesión con diez minutos para anotar qué quedó pendiente y quién lo trae la próxima vez.",
        ],
      },
      {
        heading: "Un formato de sesión de ejemplo",
        paragraphs: [
          "Para dos horas con tres personas: los primeros diez minutos, definir objetivos; después, una hora de explicaciones y ejercicios con roles rotativos; un descanso de diez minutos; y por último una tanda de preguntas cruzadas sin apuntes. Cerrá anotando lo que cada uno debe reforzar por su cuenta.",
          "La sala Manuel Gil de Alem es silenciosa. Para preguntas cruzadas o simulacros orales, elijan un espacio donde se permita conversar o una reunión a distancia. En esta sala pueden coordinar trabajo individual en silencio, sin trasladar el debate a las mesas de lectura.",
          "Al armar el grupo, elegí compañeros con un compromiso parecido al tuyo, no necesariamente amigos. Conviene acordar desde el principio la frecuencia, la duración y qué pasa si alguien falta o llega sin preparar. Hablarlo temprano evita resentimientos más tarde.",
        ],
      },
    ],
  },
  {
    slug: "procrastinacion",
    title: "Procrastinación: por qué pasa y cómo empezar a estudiar",
    description:
      "Entendé por qué postergás lo que tenés que estudiar y probá herramientas concretas: primeros pasos mínimos, intenciones de implementación y cambios en tu entorno.",
    readingMinutes: 5,
    updated: "2026-11-15",
    sections: [
      {
        heading: "No es falta de voluntad",
        paragraphs: [
          "Postergar puede estar relacionado con una tarea poco clara, sobrecarga, frustración, cansancio o perfeccionismo. La guía de Cornell propone identificar el obstáculo y ajustar el trabajo. No alcanza con etiquetarte como una persona sin voluntad, ni podemos identificar una causa única desde esta página.",
          "Probá distinguir dos situaciones: no saber cuál es el primer paso y no disponer del tiempo o los recursos necesarios. En el primer caso puede ayudar dividir la tarea. En el segundo, necesitás cambiar el plan o pedir apoyo; una técnica de productividad no crea horas disponibles ni resuelve una dificultad de salud.",
          "Entender este mecanismo ayuda a cambiar el enfoque. En lugar de pelearte con vos mismo, el objetivo pasa a ser reducir el malestar de empezar y facilitar el comienzo.",
        ],
      },
      {
        heading: "Por qué evitamos justo lo importante",
        paragraphs: [
          "Solemos postergar lo que más importa: el trabajo práctico largo, la materia que sentimos difícil, la lectura que nos parece interminable. Son tareas ambiguas o grandes, y no saber por dónde empezar duele. Entonces limpiamos el escritorio, contestamos mensajes o miramos videos, y todo eso se siente como hacer algo.",
          "Fijate qué emoción aparece justo antes de postergar. Puede ser fastidio, miedo a equivocarte o cansancio. Ponerle nombre no lo elimina, pero te da un margen para decidir qué hacer en lugar de seguir el impulso de huir.",
          "Otro factor es la distancia con la recompensa: estudiar hoy rinde dentro de semanas, mientras que el celular rinde ahora. Por eso ayuda acercar pequeñas recompensas, como un mate rico o un capítulo de una serie después del bloque, sin que la recompensa sea parte de la tarea.",
        ],
      },
      {
        heading: "El primer paso diminuto",
        paragraphs: [
          "La parte más difícil casi siempre es empezar; una vez en movimiento, seguir cuesta menos. Por eso conviene achicar el primer paso hasta que resulte casi ridículo, de modo que el cerebro no encuentre excusas.",
          "Pensalo como bajar la vara de entrada y no la de salida: no te comprometés a terminar, solo a empezar. Lo habitual es que, una vez iniciada la tarea, la incomodidad inicial baje y puedas seguir un rato más.",
          "Algunos ejemplos de pasos mínimos:",
        ],
        list: [
          "En lugar de “estudiar Física”, abrir la guía y leer el enunciado del primer problema.",
          "En lugar de “escribir el informe”, escribir solo el título y tres títulos de secciones.",
          "Poner un temporizador de cinco o diez minutos y trabajar sin la obligación de seguir después.",
          "Dejar listos los materiales sobre la mesa la noche anterior.",
        ],
      },
      {
        heading: "Intenciones de implementación",
        paragraphs: [
          "Podés convertir una intención vaga en un plan de acción: cuándo vas a empezar, en qué lugar y con qué primera tarea. En esta guía lo usamos como una herramienta de organización, sin atribuirle un efecto garantizado sobre la motivación.",
          "Por ejemplo, en vez de «voy a estudiar más», escribí «después de cursar, a las 15:00, voy a intentar los problemas 1 y 2 de la guía». Añadí una alternativa si no podés usar la sala o si el material no está disponible. La utilidad del plan se comprueba viendo si pudiste cumplirlo y qué obstáculo apareció.",
          "También podés planificar los obstáculos: “si me llega una notificación mientras estudio, entonces la dejo sin abrir hasta el descanso”. Escribí tus planes en un papel o en el celular, con un momento y un lugar específicos.",
        ],
      },
      {
        heading: "Diseñar el entorno",
        paragraphs: [
          "Es más fácil cambiar el entorno que cambiar la voluntad. Si la distracción está a un toque de distancia y estudiar exige varios pasos, el resultado es previsible. Dar vuelta esa ecuación ayuda más de lo que parece.",
        ],
        list: [
          "Estudiá en un lugar asociado al trabajo, como una sala de estudio, en lugar de la cama o el sillón.",
          "Dejá el celular en la mochila o en modo avión durante el bloque.",
          "Bloqueá las redes con una extensión o una aplicación durante tus horas de estudio.",
          "Tené agua, útiles y material a mano para no levantarte a cada rato.",
          "Estudiá junto a otras personas concentradas: ver a otros trabajando hace más fácil imitarlos.",
        ],
      },
      {
        heading: "Cuando igual postergás",
        paragraphs: [
          "Va a haber días en que no funcione. Lo que más ayuda en esos casos es tratarte con la misma comprensión que tendrías con un amigo. La autocrítica dura suele aumentar el malestar, y con él las ganas de evitar. Una actitud más amable se asocia con volver antes a la tarea.",
          "Preguntate qué pasó, sin juzgarte: ¿la tarea era muy grande, estaba cansado, no sabía por dónde empezar? Ajustá el plan y reintentá con un paso más chico. Si la postergación es crónica, te genera mucho sufrimiento o se mezcla con tristeza o ansiedad intensas, consultá con un profesional o con los servicios de orientación de tu facultad.",
        ],
      },
      {
        heading: "Un plan para hoy",
        paragraphs: [
          "Elegí una tarea que estás evitando. Definí un primer paso de cinco minutos, escribí día, hora y lugar, y prepará el entorno: materiales a mano y las distracciones que puedas reducir. Cuando llegue el momento, probá ese primer paso y ajustá si encontrás un obstáculo concreto.",
          "Cuando termines el bloque, anotá qué hiciste, aunque haya sido poco. Registrar los avances, por chicos que sean, te da evidencia de que podés empezar, y eso vale más que cualquier promesa de que mañana sí.",
        ],
      },
    ],
  },
  {
    slug: "leer-textos-academicos",
    title: "Leer textos académicos: estrategias para la bibliografía de la facultad",
    description:
      "Cómo leer bibliografía universitaria con más provecho: pre-lectura, preguntas, resúmenes, mapas de síntesis y trucos para encarar fotocopias larguísimas.",
    readingMinutes: 4,
    updated: "2026-11-15",
    sections: [
      {
        heading: "Leer en la facultad es otra cosa",
        paragraphs: [
          "En la facultad te piden leer textos densos, con vocabulario técnico, en cantidades que no se parecen a nada de la secundaria. Si los leés como una novela, de la primera a la última línea y esperando que algo se quede, es muy probable que llegues al final sin saber qué dijo el autor.",
          "Leer bibliografía académica es una tarea con propósito: entender un argumento, extraer datos, comparar posturas, preparar un examen. Cuando sabés para qué leés, podés decidir qué leer con detalle, qué recorrer rápido y qué dejar para después.",
          "No todos los textos piden la misma lectura. Un artículo de investigación, un capítulo de manual y un texto teórico clásico se organizan distinto, y conviene adaptarte: en un artículo suele valer la pena empezar por el resumen y las conclusiones; en un manual, por los objetivos y las preguntas finales.",
        ],
      },
      {
        heading: "Antes de leer: la pre-lectura",
        paragraphs: [
          "Dedicar cinco o diez minutos a mirar el texto antes de leerlo en serio le da a tu cabeza un mapa. Con ese mapa, cada párrafo encaja en algo en lugar de flotar suelto. Podés hacerlo así:",
        ],
        list: [
          "Fijate en el título, el autor, el año y la fuente, para ubicar el texto en la materia.",
          "Leé el resumen o la introducción y las conclusiones, si las hay.",
          "Recorré los títulos y subtítulos para ver cómo está organizado.",
          "Mirá gráficos, tablas y recuadros, que suelen condensar lo central.",
          "Preguntate qué sabés ya del tema y para qué te lo piden en la cursada.",
        ],
      },
      {
        heading: "Leer con preguntas",
        paragraphs: [
          "Un texto se lee mejor cuando buscás respuestas. Antes de empezar cada sección, convertí el subtítulo en una pregunta: si dice “Causas de la crisis”, preguntate cuáles fueron. Leé para contestarla y después intentá responderla sin mirar.",
          "Otras preguntas útiles son: ¿cuál es la idea principal de este párrafo?, ¿qué ejemplo da el autor?, ¿con quién discute?, ¿qué no entendí? Anotá las dudas en el margen y volvé a ellas más tarde; muchas se aclaran más adelante en el mismo texto.",
          "Subrayar está bien si se usa poco. Cuando todo está marcado, nada se destaca. Una regla útil es subrayar solo después de terminar un párrafo, no durante la primera lectura, y limitarte a las palabras clave.",
          "Al terminar, escribí tres preguntas que podría hacerte un profesor sobre el texto y respondelas sin mirarlo.",
        ],
      },
      {
        heading: "Resumir con tus palabras",
        paragraphs: [
          "Resumir obliga a decidir qué es importante y a reformularlo, y eso es una forma de estudio. Después de cada sección, cerrá el texto y escribí en una o dos frases qué dijo. Si no podés, volvé a leerlo: acabás de descubrir dónde se te escapó la comprensión.",
          "Un resumen no es una versión recortada con las mismas frases del autor. Intentá usar tu vocabulario, mantené las definiciones técnicas imprescindibles y anotá siempre la referencia para poder volver al original. Al terminar el texto, juntá tus resúmenes parciales en uno de cinco o seis líneas.",
          "Una comprobación al día siguiente: intentá reconstruir la tesis, una razón que la sostiene y una limitación usando tu resumen. Si la comparación con el original muestra un error, corregilo y anotá la página. Podés hacer esta práctica por escrito y en silencio dentro de la sala; reservá la explicación en voz alta para un espacio apropiado.",
        ],
      },
      {
        heading: "Sintetizar con mapas y cuadros",
        paragraphs: [
          "Cuando tenés que estudiar varios textos de una misma unidad, el resumen por separado no alcanza: necesitás ver cómo se relacionan. Ahí ayudan los mapas conceptuales, los cuadros comparativos y las líneas de tiempo.",
        ],
        list: [
          "Mapa conceptual: ideas en recuadros unidas por flechas rotuladas, como “causa”, “se opone a” o “es un tipo de”.",
          "Cuadro comparativo: autores o teorías en las filas y criterios como definición, método y críticas en las columnas.",
          "Línea de tiempo: útil para procesos históricos, evolución de teorías o etapas de un fenómeno.",
          "Esquema de argumento: tesis del autor, razones que la sostienen y objeciones posibles.",
        ],
      },
      {
        heading: "Fotocopias largas y bibliografía interminable",
        paragraphs: [
          "Frente a un fajo de doscientas páginas de fotocopias, lo peor es empezar por la página uno sin plan. Primero hojealo: fijate el índice, calculá cuántas páginas te quedan por día hasta la fecha del examen y repartilas, dejando margen para repasar.",
          "Consultá el programa para distinguir material obligatorio y complementario, y preguntá a la cátedra si no está claro. Explorar títulos, introducción y conclusiones ayuda a orientarte, pero no sustituye la lectura completa de una fuente requerida. No uses un resumen o esta guía como confirmación de que un capítulo no entra en el examen.",
          "Para sostener el ritmo, leé en bloques de 30 a 45 minutos con descansos, en un lugar con poca distracción. Anotá en la primera hoja de cada fotocopia una síntesis de tres líneas y las páginas importantes, y usá papelitos para marcar. Así, cuando vuelvas antes del examen, no tendrás que releer todo.",
          "Si un texto te resulta muy difícil, no te quedes trabado en cada palabra. Seguí leyendo para tener una idea general, buscá los términos clave en un diccionario especializado y volvé a leerlo una segunda vez. Muchas veces la segunda lectura es la que realmente funciona.",
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
