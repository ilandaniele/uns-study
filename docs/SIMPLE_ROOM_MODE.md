# Modo común y simple

El selector de la portada aparece sólo para cuentas verificadas. `GET/PATCH /api/v1/me/room-mode` guarda `COMMON` o `SIMPLE` en una preferencia privada por usuario; no depende de cookies o localStorage compartidos. El inicio de sesión, la recarga y el regreso a la pestaña consultan la preferencia de esa cuenta. Una sesión ajena nunca recibe el modo de otra. Las cuentas existentes empiezan en común.

En simple, el mapa no se modifica ni se renderiza: se presenta un botón rojo de “Estoy acá”, que pasa a “Me voy” mientras hay un check-in. Cambiar de modo no crea, mueve, renueva ni elimina presencias. El modo común conserva sus opciones, incluida la renovación y la selección de duración de Pro. El check-in simple usa la duración estándar y los mismos límites de horario, presencia, moderación, Turnstile, privacidad, expiración, estudio y realtime.

Si no es posible asignar automáticamente, se ofrece primero un lugar cercano o el último asiento propio terminado/verificado de esa sala, si sigue disponible para una presencia propia. “Tu último lugar” siempre requiere tocar “Sí, estoy acá”; el historial nunca sustituye una medición ni crea una presencia automáticamente. No se sugieren check-ins cancelados, asientos desactivados ni lugares con otra persona. La sugerencia se devuelve sólo al titular autenticado y no se guarda historial adicional. “Estoy en otro lugar” abre el selector; tocar una mesa y luego el asiento marca directamente ese lugar, sin una tercera confirmación.

## Precisión y calibración

El SVG tiene coordenadas lógicas, **no metros**. La foto tampoco es un plano medido. La UNS publica un [esquema de cuerpos del Complejo Alem](https://servicios.uns.edu.ar/proyectos/edificios/complejo_alem.asp) y una [página de sus salas de lectura](https://bc.uns.edu.ar/salasdelectura/); en la búsqueda realizada no se encontró un plano acotado y georreferenciado de los 108 asientos. Una superficie total de biblioteca o una coordenada del edificio no determina las posiciones de las sillas.

La [especificación W3C de geolocalización](https://www.w3.org/TR/geolocation/#accuracy) define `accuracy` como un margen en metros con confianza del 95 %. `enableHighAccuracy` solicita una lectura mejor, sin garantizar precisión de interiores o de asiento. El modo simple recolecta una lectura nueva y permite hasta seis segundos para mejorarla; nunca reutiliza el caché de 45 segundos de las acciones normales. Un timeout o permiso denegado no escribe un check-in.

Si el sistema operativo sólo devuelve una lectura reciente en caché, se conserva su timestamp original. Puede servir para comprobar cercanía y pedir confirmación manual, como en el modo común; no se rejuvenece el timestamp para presentarla como una nueva ubicación de asiento. La asignación automática exige que tanto la edad en el dispositivo como la edad medida por el servidor sean de hasta diez segundos.

La asignación automática está **desactivada por falta de calibración inicial**. No se instalaron referencias ficticias en dev ni en producción. El modo simple sigue siendo utilizable mediante confirmación de su último lugar o elección de mesa/asiento.

Sólo SUPERADMIN puede leer, guardar o eliminar las referencias en Administración → Ubicación de la sala → Asientos del modo simple. `GET/PUT/DELETE /api/v1/admin/rooms/:slug/seat-calibration` exige el dueño verificado con ADMIN, y audita cambios sin copiar coordenadas a los eventos. Requiere tres asientos medidos, distintos y no alineados, su latitud/longitud, una fuente y un error máximo del plano completo. No usar como medida precisa el GPS común del celular ni clics aproximados en Google Maps. El margen debe incluir el error del mobiliario, no sólo el de los puntos de referencia.

Una transformación afín deriva las coordenadas geográficas de cada silla conservando los IDs y el dibujo existentes. Se validan referencias dentro del geofence y dimensiones no degeneradas. Un hash del conjunto de sillas/posiciones invalida las referencias si el plano lógico cambia. Revisar físicamente la calibración cuando se mueva el mobiliario, aunque el SVG no cambie.

## Decisión y concurrencia

`POST /api/v1/checkins/simple` exige autenticación y ubicación en cada intento. Un grant anterior por sí solo no basta. Sin `confirmedSeatId`, el servidor:

1. Comprueba horario, geofence, restricciones, el bucket de check-in compartido y el desafío adaptativo.
2. Devuelve el check-in existente sin moverlo o renovar su vencimiento.
3. Suma el margen informado por el dispositivo y el error del plano. La lectura automática no puede tener más de diez segundos ni una precisión nula.
4. Exige que todo el círculo de incertidumbre esté dentro del recinto y dentro de la celda del asiento más cercano, comparándolo también con sillas ocupadas o sin datos. Además exige proximidad física al asiento y estado `FREE` o `UNKNOWN`, sin disputa ni check-in. El botón es una declaración explícita de presencia propia; se puede ocupar un lugar sin reportes previos como en el modo común. No se fabrica un reporte `FREE` para hacerlo.
5. Si hay dudas, no escribe presencia: devuelve `CONFIRM`. No salta una silla cercana ocupada, guardada o dudosa para colocar a la persona en otra silla más lejana. Una sugerencia por ubicación requiere frescura, cercanía y que sea la silla físicamente más cercana, incluso cuando no se puede asignar automáticamente.
6. Antes de escribir, dentro de la transacción canónica, vuelve a comprobar las referencias, la geometría, que la persona siga sin otro check-in y que el asiento siga elegible. La unicidad de usuario/asiento sigue respaldada por SQLite. Una carrera perdida vuelve a confirmación y nunca elige otra silla silenciosamente.

La confirmación pide que la persona ya esté sentada allí; permite confirmar un asiento sin datos como en el flujo común. Para no repetir esperas ni activar otra vez el GPS, esa confirmación puede reutilizar la lectura de este mismo intento durante hasta 45 segundos, con precisión de hasta 80 m, conservando su fecha original. Si no cumple, se obtiene otra lectura. Cada nuevo toque del botón rojo para asignación automática siempre vuelve a medir. Cancelar, completar el check-in o cambiar de cuenta descarta la lectura temporal. El servidor vuelve a validar ubicación y no permite tomar un check-in ajeno ni mover un check-in creado entretanto por otro dispositivo propio. No se guardan coordenadas de visitantes ni se emiten en realtime; sólo se conserva la precisión y la presencia derivada existentes. Las coordenadas estáticas de calibración sólo se devuelven al dueño. La migración 0015 agrega dos tablas y no modifica la geometría, usuarios o presencias existentes; la preferencia se borra por cascada con su cuenta.

## Pruebas

Geometría con rotaciones, límites de incertidumbre, posiciones exteriores/vencidas y referencias inválidas; HTTP real sobre Hono/SQLite para permisos, aislamiento de preferencias, fallback, grants insuficientes, confirmación, carreras, reportes intercalados, calibración retirada y límites antiabuso. Muestreo de navegador para no reutilizar GPS de otra silla. QA de navegador con cuentas/datos sintéticos, sin marcar asientos reales ni cambiar preferencias o referencias de personas en los entornos desplegados.


## QR por asiento y control de permanencia (29/10/2026)

Administración → Códigos QR permite generar un código de un asiento (`M01-S01`) o el conjunto completo. La generación del conjunto conserva los tokens activos existentes: volver a generarlo no invalida las etiquetas ya impresas. Los códigos desactivados se omiten al imprimir. Hay que imprimir y colocar cada etiqueta en su asiento real; el despliegue no coloca etiquetas físicas.

La cámara del teléfono abre `/q/:token`. Un QR de asiento presenta temporalmente el modo simple, sin cambiar la preferencia guardada. La persona toca Estoy acá para declarar que está sentada allí. El servidor resuelve el token, comprueba cercanía, vigencia, silla activa y disponibilidad, y vuelve a comprobar el QR dentro de la transacción. No necesita calibración de sillas ni precisión GPS de interiores. Copiar un QR no omite geofence, restricciones ni Turnstile. Los QR anteriores de sala o mesa conservan su función.

El control de permanencia se aplica a los check-ins, en ambos modos. El cliente obtiene una lectura breve cada tres minutos mientras el documento está visible. Cada prueba válida dentro del radio de 50 m renueva por cinco minutos el período acreditable. Si faltan lecturas, hay error, se retira el permiso o se suspende la página, las horas se detienen al vencer ese período, aunque el navegador no ejecute más JavaScript. Al regresar, una nueva prueba inicia otro intervalo: el hueco no se rellena.

Una salida se considera detectada sólo cuando la distancia al centro de la sala MENOS el error GPS supera 50 m. Para confirmar regreso, distancia MÁS error debe quedar dentro de 50 m y del geofence configurado. Lecturas ambiguas, vencidas, futuras, de precisión nula o excesiva no confirman salida ni renuevan estudio. La antigüedad máxima de una muestra es 45 s.

Una salida detectada pausa las horas y el reloj de foco de esa cuenta. Una hora después, si no se confirmó regreso, el job persistido de expiración termina el check-in, registra sólo el estudio acreditado y recalcula el asiento; no fabrica un reporte Libre. Funciona incluso si el teléfono se cierra después de comunicar la salida. Un regreso posterior no revive la presencia vencida. Falta de GPS no prueba una salida: pausa el estudio, y el asiento mantiene su vencimiento normal.

El navegador de origen se vincula con un identificador aleatorio local, sin coordenadas. Otros dispositivos autenticados pueden consultar el estado, pero sus ubicaciones no pueden pausar ni renovar esa presencia. Los check-ins previos al cambio sólo pueden vincularse por primera vez desde un dispositivo con lectura dentro de la sala. El identificador no reemplaza la autenticación ni concede permisos.

La migración 0016 añade los intervalos y estados derivados y el alcance de asiento del QR; conserva el tiempo previo de presencias activas y las horas históricas. No guarda coordenadas ni recorridos. Historial, rankings, rachas, insignias y crecimiento del jardín usan los mismos intervalos efectivos, incluidos los descansos y cruces de medianoche. Las modificaciones manuales del superadmin mantienen sus reglas.

### Límite de la plataforma web

Los navegadores no garantizan geolocalización continua cuando se bloquea la pantalla o se cierra la app. No se promete seguimiento en segundo plano. El vencimiento del período acreditable evita sumar horas indefinidas sin pruebas; detectar una salida concreta requiere que llegue al servidor una ubicación suficientemente precisa. Las referencias cartográficas exteriores no activan una calibración de sillas.
