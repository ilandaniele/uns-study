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
  {
    slug: "tecnica-pomodoro",
    title: "La técnica Pomodoro: cómo usarla de verdad para estudiar",
    description:
      "Aprendé a aplicar la técnica Pomodoro paso a paso, adaptar la duración de los bloques a tu materia y evitar los errores más comunes al estudiar en la facultad.",
    readingMinutes: 5,
    updated: "2026-10-16",
    sections: [
      {
        heading: "Qué es y de dónde viene",
        paragraphs: [
          "La técnica Pomodoro la ideó Francesco Cirillo a fines de los años ochenta, cuando era estudiante universitario y le costaba sostener la atención. Usó un temporizador de cocina con forma de tomate (pomodoro en italiano) y se propuso algo mínimo: concentrarse en una sola tarea durante un rato corto y definido, sin interrupciones.",
          "La versión clásica es simple. Trabajás 25 minutos, descansás 5, y repetís. Después de cuatro bloques, tomás un descanso más largo, de entre 15 y 30 minutos. No tiene nada de mágico: lo que funciona es el contrato que hacés con vos mismo. Durante el bloque hay una sola cosa para hacer, y cuando suena la alarma, parás aunque estés a mitad de una idea.",
          "Esa estructura ayuda por varias razones. Empezar cuesta menos cuando el compromiso es de solo 25 minutos. El final cercano reduce la tentación de revisar el celular. Y los descansos programados te dan permiso para desconectarte sin culpa, algo que cuando estudiás a ojo suele terminar en una hora de scroll.",
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
          "Los 25 minutos son un punto de partida, no una ley. Hay materias y tareas que piden otro ritmo. Para leer un texto denso, resolver problemas largos de física o escribir un informe, 25 minutos pueden quedar cortos justo cuando entraste en calor. En esos casos probá con 40 o 50 minutos de trabajo y 10 de descanso.",
          "En cambio, si estás cansado, si el tema te aburre muchísimo o si venís de una semana pesada, bajá a 15 minutos. Un bloque corto que sí cumplís vale más que uno largo que abandonás a los diez minutos. Con el tiempo, podés ir subiendo de a poco.",
          "Una forma práctica de calibrar: probá una semana con una duración, anotá cuántos bloques completaste sin distraerte y cómo te sentiste al final del día. Si terminás agotado, acortá. Si sentís que cortabas justo cuando estabas rindiendo, alargá. El modo Foco de la app te deja configurar el temporizador para probar distintas duraciones sin tener que usar el celular.",
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
    updated: "2026-10-16",
    sections: [
      {
        heading: "Por qué releer no alcanza",
        paragraphs: [
          "La estrategia más común entre estudiantes es leer los apuntes una y otra vez, subrayar y armar resúmenes prolijos. Se siente productivo porque el material empieza a resultar familiar. El problema es justamente ese: la familiaridad se confunde con saber. Reconocer algo cuando lo ves es mucho más fácil que reproducirlo desde cero en un examen, donde nadie te muestra la respuesta.",
          "La investigación en psicología cognitiva viene mostrando hace décadas que hay dos técnicas que rinden mucho más que releer: la práctica de recuperación (también llamada testing effect o efecto de evaluación) y el repaso espaciado. Ambas tienen algo en común: hacen que el estudio sea más incómodo en el momento, y por eso mismo dejan una huella más duradera.",
          "En esta guía vas a ver cómo aplicarlas sin necesidad de herramientas especiales. Alcanza con papel, una lapicera y un poco de organización.",
        ],
      },
      {
        heading: "Práctica de recuperación: ponerte a prueba",
        paragraphs: [
          "Practicar la recuperación significa intentar traer la información a la memoria sin mirar el material. Cada vez que lo lográs, o aun cuando fallás y después corregís, fortalecés ese recuerdo y lo hacés más fácil de encontrar la próxima vez. Es lo contrario de repasar pasivamente.",
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
          "El efecto de espaciado dice que repasar en varias sesiones distribuidas en el tiempo produce mejor retención a largo plazo que concentrar todo el repaso en una sola tanda, aun cuando el tiempo total sea el mismo. Dejar pasar un intervalo permite que empieces a olvidar un poco, y el esfuerzo de recordar de nuevo es lo que consolida la memoria.",
          "En la práctica, significa que conviene volver sobre cada tema varias veces con huecos crecientes: al día siguiente, a los pocos días, a la semana, y así. Cuando una tarjeta te sale fácil, la podés espaciar más; cuando te cuesta, volvé antes. Muchas aplicaciones de flashcards automatizan este cálculo, pero también podés hacerlo con cajas de cartón o un cuaderno.",
          "Lo importante es que el repaso sea de recuperación y no de lectura. Volver a leer el capítulo a los tres días sirve mucho menos que cerrar el libro y ver qué recordás.",
        ],
      },
      {
        heading: "Un cronograma de ejemplo",
        paragraphs: [
          "Supongamos que hoy estudiás la unidad 2 de una materia y el parcial es en tres semanas. Un esquema posible sería el siguiente. El día cero hacés la lectura y armás las tarjetas. Al día siguiente, 15 o 20 minutos de recuperación sobre esas tarjetas. A los tres o cuatro días, otra sesión corta. A la semana, otra. Y a las dos semanas, un repaso general mezclado con las otras unidades.",
          "Mientras tanto, vas sumando unidades nuevas, así que cada día incluye un poco de material nuevo y un poco de repasos viejos. Se ve como más trabajo, pero cada sesión es corta y el conjunto te llega al parcial con la mayor parte ya asentada, no con la sensación de estar aprendiendo todo a la vez.",
          "Si te quedan pocos días, igual podés aplicar la idea: dos o tres pasadas de recuperación separadas por unas horas o por una noche de sueño rinden más que una sola maratón.",
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
    title: "Cómo preparar un final: un plan realista, de la inscripción al examen",
    description:
      "Guía para preparar un final universitario: hacé el inventario de temas, un calendario inverso, practicá con exámenes viejos y planificá las últimas 48 horas.",
    readingMinutes: 4,
    updated: "2026-10-16",
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
          "Con la fecha del examen en la mano, planificá desde el final hacia el principio. Reservá los últimos días para repaso general y simulacros, y repartí hacia atrás el estudio de cada tema nuevo. Así descubrís pronto si el tiempo alcanza o si hay que recortar.",
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
          "Dos días antes, el objetivo cambia: ya no se trata de aprender temas nuevos, sino de consolidar lo que sabés y llegar con la cabeza despejada. Hacé una pasada general por tu lista de temas, con foco en recuperar lo que se te escapa y en armar una hoja de una carilla con fórmulas, definiciones o esquemas clave para mirar al final.",
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
    title: "Cómo organizar tu semana de estudio sin morir en el intento",
    description:
      "Aprendé a planificar la semana universitaria con bloques de tiempo, equilibrar clases, trabajos y parciales, y revisar tu plan para que sea sostenible.",
    readingMinutes: 4,
    updated: "2026-10-16",
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
          "Lo que queda en blanco es tu tiempo disponible real. Mirá cuánto es, porque probablemente sea menos de lo que imaginabas. Sumá las horas libres de cada día y restá una parte para comer, descansar y moverte; el número que queda es el que de verdad podés repartir entre las materias. Y no lo llenes por completo: dejá huecos para imprevistos, descanso y vida social. Una semana planificada al 100 % se rompe el martes y te deja la sensación de haber fracasado.",
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
          "El conflicto clásico es que las clases y los trabajos prácticos consumen la semana, y el estudio para el parcial queda para después. La solución más efectiva es asignar un pequeño bloque fijo y regular a cada materia, aun cuando falten semanas para el examen. Estudiar 30 o 40 minutos por día cuesta menos que una maratón de tres días y rinde más.",
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
          "Por último, cuidá el lugar donde estudiás. Tener un sitio al que vas a trabajar, sea tu casa, una biblioteca o una sala de estudio, ayuda a entrar en modo estudio más rápido. Si usás una sala compartida, mirar antes si hay lugar te ahorra el viaje en vano y permite que ajustes el plan si está llena.",
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
    updated: "2026-10-16",
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
          "Para la mayoría de los estudiantes, el principal enemigo de la concentración está en el bolsillo. La mera presencia del teléfono a la vista tienta a revisarlo, y cada interrupción tiene un costo de reenganche: retomar la tarea lleva varios minutos aunque la pausa haya sido de segundos.",
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
          "Una sala funciona bien cuando cada uno aporta un poco. Hablá bajo o salí al pasillo para conversar, poné el celular en silencio, evitá comer cosas ruidosas o de olor fuerte, y levantá tus residuos al irte. Cuidá también el mobiliario y dejá la mesa como la encontraste.",
          "Un punto especialmente importante es el uso de los lugares. En una sala sin reservas, un asiento ocupado con una mochila y nadie sentado le quita un lugar a alguien que lo necesita. Si vas a ausentarte un buen rato, llevate tus cosas y dejá la silla libre. Una pausa breve para ir al baño o tomar agua es razonable, pero un almuerzo largo no lo es.",
          "Cuando termines por el día, liberá tu lugar de verdad. En la app, marcar que ya no estás ahí permite que los demás vean ese asiento como libre y no pierdan tiempo buscando uno que en realidad está vacío. Cuanto más actualizada esté la información, más útil es para todos.",
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
      "Por qué dormir bien, hacer pausas, moverte e hidratarte mejora lo que aprendés, y por qué las trasnochadas antes de un examen suelen jugar en tu contra.",
    readingMinutes: 4,
    updated: "2026-10-16",
    sections: [
      {
        heading: "Estudiar más horas no siempre es estudiar mejor",
        paragraphs: [
          "Hay una idea muy extendida entre estudiantes: cuanto más tiempo sentado frente a los libros, mejor. Sin embargo, el rendimiento cognitivo no es lineal. La atención, la memoria de trabajo y la capacidad de razonar se desgastan con el esfuerzo sostenido y con la falta de descanso. Pasadas ciertas horas, seguir estudiando rinde cada vez menos.",
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
        heading: "Sueño y consolidación de la memoria",
        paragraphs: [
          "Durante el sueño, el cerebro no se apaga: reorganiza lo que viviste y aprendiste durante el día. La investigación sobre el tema sugiere que dormir después de estudiar favorece la consolidación de los recuerdos, es decir, el proceso por el cual lo aprendido se vuelve más estable y fácil de recuperar. Además, dormir bien ayuda a que a la mañana siguiente tengas mejor atención y estado de ánimo.",
          "Por eso, estudiar con sueño recortado tiene un doble costo: aprendés peor mientras estás cansado y dejás menos tiempo para consolidar lo aprendido. Un hábito sencillo es priorizar horarios de sueño bastante regulares, incluso en época de exámenes, en lugar de compensar con una noche larga los fines de semana.",
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
          "La noche en vela antes del examen es casi un ritual universitario, pero tiene desventajas bien documentadas. Cuando dormís poco, empeoran la atención, la velocidad de razonamiento y la capacidad de recordar, justo lo que necesitás al rendir. Además, lo que estudiaste de madrugada tiene menos chances de consolidarse.",
          "Esto no significa que nunca vayas a estar apurado. Si por algún motivo te quedaste corto de tiempo, es mejor priorizar: repasar lo más importante, dormir lo que puedas y llegar descansado. Una noche de sueño razonable suele rendir más que dos o tres horas extra de estudio con la cabeza fundida.",
          "El café y otras bebidas con cafeína pueden ayudar a corto plazo, pero no reemplazan el descanso, y en exceso pueden aumentar el nerviosismo y arruinar el sueño siguiente. Si dependés de ellos cada día, probablemente conviene revisar tu rutina de fondo.",
        ],
      },
      {
        heading: "Movimiento, comida y agua",
        paragraphs: [
          "La actividad física regular está asociada con mejor estado de ánimo, menos estrés y mejor descanso. No hace falta entrenar duro: una caminata de veinte minutos, andar en bicicleta o estirar entre bloques ya suma. Si pasás horas sentado, levantate cada tanto para mover el cuerpo.",
          "La hidratación también importa. Una botella de agua en la mesa facilita tomar con frecuencia, y evita que confundas la sed con cansancio. Con la comida, la idea general es comer a horarios razonables y evitar pasar muchas horas en ayunas o depender solo de snacks muy dulces, que dan un pico de energía seguido de una caída. Una fruta, frutos secos o un sándwich simple suelen ser buenos acompañantes de estudio.",
          "Tomar luz natural durante el día también suele ayudar a regular el reloj interno. Si estudiás todo el día en un lugar cerrado, salir un rato afuera en un descanso puede hacer una diferencia notable en cómo te sentís.",
        ],
      },
      {
        heading: "Cuidar la cabeza y armar una rutina sostenible",
        paragraphs: [
          "El estrés antes de los exámenes es normal, pero no tiene que ocupar toda tu vida. Reservá tiempo para actividades que disfrutes, charlá con amigos y no te aísles. Hablar de cómo te sentís con compañeros, familia o un profesional puede aliviar mucho más de lo que imaginás.",
          "Una rutina sostenible suma estos elementos: sueño regular, pausas dentro de cada sesión, algo de movimiento diario, comidas e hidratación decentes y al menos un rato libre cada día. No tienen que ser perfectos; con que se cumplan la mayor parte de los días, ya cambian bastante tu rendimiento.",
          "Probá cambiar una sola cosa por vez. Por ejemplo, durante una semana, acostate treinta minutos antes. A la semana siguiente, sumá una caminata. Los pequeños cambios sostenidos funcionan mejor que una reforma total que abandonás al tercer día. Y recordá: descansar bien es también una forma de estudiar.",
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
