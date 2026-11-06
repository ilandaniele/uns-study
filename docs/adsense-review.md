# Revisión de contenido público y AdSense

Fecha: 26 de octubre de 2026.

## Nueva revisión: 6 de noviembre de 2026

El propietario recibió nuevamente **Needs attention / Low value content**. Se revisaron las indicaciones actuales de Google y la versión pública, sin sesión. La propiedad seguía verificada: cambiar Google Cloud OAuth no resuelve este rechazo.

### Evidencia y cambios

- La portada de producción entregaba 59 palabras de texto en el HTML, sin título principal ni explicación suficiente del servicio. Los artículos, en cambio, sí se entregaban completos (por ejemplo, la guía Pomodoro superaba las mil palabras). No se detectó un bloqueo HTTP diferente al consultar con navegador común, Googlebot y Mediapartners-Google. Estos datos no permiten identificar con certeza la causa de la decisión de Google.
- Una prueba de navegador sin JavaScript detectó además que el contenido situado dentro del límite de carga de la sala permanecía oculto en el bloque de streaming de React: sólo quedaba visible la navegación. La información pública se mueve fuera de ese límite: se puede leer y navegar sin hidratar el mapa ni cargar datos de cuenta. El nuevo test de navegador cubre ese recorrido real.
- La portada conserva el mapa al principio y agrega información visible para todos sobre estados, vencimientos, colaboración, horarios, contacto y lecturas útiles. El aviso sin JavaScript distingue la información estática de la disponibilidad actual: no se inventa una ocupación de respaldo.
- Se agrega una guía específica de la sala Manuel Gil de Alem 1253, con un ejemplo de interpretación de disponibilidad, la diferencia entre observación y presencia personal, un ejemplo de vencimiento a las dos horas y pasos para corregir errores. Los números del ejemplo se identifican como ilustrativos.
- Las fuentes oficiales consultadas no coinciden en la apertura entre semana: Biblioteca Central publica 07:00 y Enfoque U 2025 menciona 08:00. La guía explicita esa diferencia y conserva la configuración de 08:00 confirmada por el propietario; no modifica el calendario operativo ni presenta una fuente como confirmación de la otra.
- Los artículos identifican a Ilan Daniele como responsable, enlazan el criterio editorial y uso de IA, ofrecen un índice con anclas nativas y un correo para correcciones sin cuenta. La fecha de consulta de las fuentes nuevas no reemplaza las fechas anteriores sin haberlas revisado de nuevo.
- La única unidad manual de cada artículo se mueve después del contenido completo. Portada, índice, búsquedas vacías y páginas informativas siguen sin unidades AdSense. No se modifica la configuración de la cuenta ni se activan anuncios automáticos.
- El artículo entra en la biblioteca, la búsqueda y el sitemap. No se crean páginas duplicadas para rastreadores ni se usa un contenido distinto según el agente de usuario.

### Revisión siguiente

Antes de volver a declarar resuelto el problema, el propietario debe leer el contenido publicado y confirmar que representa la sala y el proyecto. Debe comprobar también los anuncios automáticos en su cuenta, pues esa configuración puede insertar publicidad adicional fuera de los componentes manuales de la app.

Después, en AdSense: `Sitios → saladeestudio.com.ar → I confirm I have fixed the issues → Request review`, cuando esté habilitado. El despliegue no envía esa declaración ni garantiza aprobación. No hay una cantidad mínima de artículos o palabras que asegure la aceptación.

## Situación informada

El panel del propietario muestra **Needs attention / Low value content**, con propiedad verificada y **Ads.txt: Authorized**. No es un problema de encontrar `ads.txt`. La decisión de aceptación del sitio corresponde a Google; este cambio prepara una versión más clara y restringe dónde se solicita publicidad, pero no declara que el sitio esté aprobado.

## Hallazgos y correcciones

- La portada tenía dos unidades AdSense alrededor de un resumen breve, además de la posibilidad de laterales. Se retiraron las dos unidades de la portada. El mapa conserva su posición inicial y geometría.
- La regla por prefijo permitía anuncios en el índice de guías, resultados vacíos y cualquier URL bajo `/guias`, incluidas páginas inexistentes. Ahora solo se admite la ubicación `article` en rutas exactas de las doce guías publicadas. Los tests comparan ese registro liviano con los artículos reales y rechazan las demás ubicaciones y rutas.
- Los laterales pasan a mostrar únicamente promociones propias en las pantallas donde ya estaban permitidas. Las páginas informativas y de lectura quedan excluidas de laterales y avisos de apertura.
- Cada unidad de artículo tiene la etiqueta «Publicidad» y aparece después de contenido del artículo. La ocultación para usuarios sin anuncios sigue vigente.
- La portada explica sin JavaScript cómo consultar la sala, interpretar «Sin datos», colaborar y encontrar ayuda, contacto y guías. Se agrega `/proyecto`, con finalidad del servicio, límites, horarios, estados, funcionamiento, financiación, contacto público y enlace al código del proyecto.
- Se elimina la afirmación no verificada de que las guías están escritas por personas que usan la sala todos los días. Se explica el uso de asistencia de IA y se distingue este material de una publicación académica o asesoramiento profesional.
- Se agregan lecturas complementarias identificadas en las doce guías, con fecha de consulta, vínculo al criterio editorial y canal de correcciones. Los enlaces no se presentan como avales ni como autoría de las universidades.
- La ayuda dejaba el cierre a medianoche para todos los días; ahora comparte los horarios confirmados: 08:00 a 00:00 en días de semana, 08:00 a 22:00 los fines de semana y feriados. Se aclara que el GPS comprueba cercanía a la sala y que «Sin datos» no implica un asiento libre.
- `/proyecto` entra al sitemap. Robots mantiene dev fuera del índice y evita rastrear pantallas privadas/de cuenta que no aportan contenido público. No se da una versión distinta a los rastreadores.
- Se conservan la verificación de propiedad por meta tag y el endpoint `ads.txt` existente. No se cambian credenciales, auth, API ni configuración de Cloudflare.

## Comprobaciones

- `pnpm lint`, `pnpm typecheck` y `pnpm --filter @sala/web test`.
- Build de Next y CI completo antes de cada despliegue.
- HTML público legible sin JavaScript para portada, proyecto, índice y doce artículos; contacto, navegación, referencias y metadata.
- Navegadores Chromium/WebKit a 320, 440 y 1720 px; mapa de 108 asientos, lectura, búsqueda sin resultados y página 404.
- Con anuncios configurados, una unidad inline en un artículo real y ninguna unidad en portada, índice, errores, páginas privadas o informativas; los requests de terceros se interceptan durante las pruebas para no generar impresiones de prueba.
- La respuesta HTTP de producción se consulta con navegador común, `Googlebot` y `Mediapartners-Google`. Esto detecta bloqueos observables, pero no confirma cómo Google decide la revisión.

## Paso del propietario en AdSense

Después de revisar el contenido publicado en producción:

1. Abrir `Sitios` → `saladeestudio.com.ar` → el detalle de «Low value content».
2. Leer la información pública, las guías y sus lecturas complementarias. Corregir lo que el responsable del sitio considere inexacto antes de confirmar la declaración del panel.
3. Verificar la configuración de **Anuncios automáticos** en la cuenta. La app implementa unidades manuales; si Auto ads está activo, desactivarlo o configurar sus exclusiones para que no inserte anuncios adicionales en mapas, navegación, pantallas vacías, privadas o de error. Ese ajuste de la cuenta no se controla desde este repositorio.
4. Marcar «I confirm I have fixed the issues» y pulsar «Request review», si Google habilita la opción.
5. Esperar la resolución. No hay un número de palabras, páginas ni cambio técnico que garantice la aprobación.

La solicitud del panel no se envía desde el despliegue. No se declara un resultado de Google que no se haya recibido.

## Referencias oficiales

- [Google: pantallas sin contenido del editor](https://support.google.com/publisherpolicies/answer/11112688?hl=es).
- [Google: preparar las páginas para AdSense](https://support.google.com/adsense/answer/7299563).
- [Google: corregir problemas de políticas y solicitar revisión](https://support.google.com/adsense/answer/7003627).
