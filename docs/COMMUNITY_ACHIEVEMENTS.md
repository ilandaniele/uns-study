# Insignias y colaboración

## Permisos

El superadmin es la cuenta verificada de `OWNER_EMAIL` con rol ADMIN: actualmente
Ilan Daniele, propietario, creador y desarrollador. No es un rol que otros admins
puedan conceder. Las insignias de juego no otorgan permisos.

| Acción | Administrador de la sala | Superadmin |
| --- | --- | --- |
| Marcar todos ocupados, elegir lugares y deshacer | Sí | Sí |
| Revisar, abrir, resolver o descartar reportes | Sí | Sí |
| Revisar sugerencias y moderar usuarios | Sí | Sí |
| Consultar perfiles administrativos, con auditoría | No | Sí |
| Vaciar el chat de la sala | No | Sí |
| Gestionar anuncios | No | Sí |
| Ver/cambiar/probar ubicación del geocerco | No | Sí |
| Ver campañas, destinatarios o enviar mails | No | Sí |
| Dar/quitar ADMIN, blindar o eliminar cuentas | No | Sí |
| Sumar/quitar horas manualmente | No | Sí |

Los endpoints vuelven a comprobar los permisos; esconder controles no es una
barrera de seguridad. Las restricciones activas también se aplican al personal.
Las reglas anteriores del rol legado MODERATOR se conservan, sin acceso a las
operaciones exclusivas del propietario. Los avisos publicados siguen siendo públicos.
La auditoría también oculta a otros admins los metadatos de geocerco y campañas;
no se pueden recuperar las coordenadas o los detalles de mails por esa vía.

## Semillas por actualizaciones

- Cada 10 lugares distintos actualizados dentro del mismo día local dan 1 semilla.
- Máximo 100 lugares y 10 semillas base por persona y día, en la zona horaria de la sala.
- La fecha de la sala principal se determina en America/Argentina/Buenos_Aires.
- Cuenta un reporte individual que terminó correctamente, tras validar presencia,
  asiento, rate limits y reglas de abuso. No cuenta observar el asiento propio.
- Repetir el mismo asiento o alternar estados no vuelve a contar ese día.
- El botón masivo, su deshacer y otros cambios administrativos masivos no dan semillas.
- No hay acreditación retrospectiva de reportes anteriores a esta actualización.
- `collaboration_updates` tiene clave única usuario/día/asiento. Las inserciones se
  serializan en una transacción, incluida la comprobación del tope diario.
- El saldo se deriva de este registro; ningún endpoint acepta cantidades de premios
  del navegador. Releer, reintentar o plantar no acredita semillas dos veces.
- Son reportes aceptados, no una garantía independiente de que cada observación
  describía la realidad. Los límites y la revisión humana siguen siendo necesarios.
- Se mantienen las semillas por tiempo, las compras y los canjes existentes. Las
  semillas extra no hacen crecer plantas: el crecimiento requiere estudio registrado.

## Premio semanal por colaboración

Desde esta actualización, alcanzar 30 lugares distintos en el mismo día local da
30 semillas adicionales y 7 días de Pro promocional. Requiere correo verificado.
Se puede obtener como máximo una vez cada 7 días completos, desde el momento de
la obtención anterior. Sólo cuentan los reportes individuales aceptados y
verificados por presencia; las repeticiones, rechazos y acciones masivas no cuentan.

`collaboration_rewards` conserva una obtención por usuario/día con su vencimiento
y confirmación de lectura. El crédito de colaboración, el premio y el incremento
de semillas se escriben en una sola transacción. Reintentar, releer el perfil,
cerrar el popup o limpiar la auditoría no vuelve a otorgar el premio. No se concede
un premio sólo por consultar actividad anterior; se dispara al registrar una
actualización nueva que cumpla las condiciones.

El pase Pro es independiente de Mercado Pago: no crea ni modifica suscripciones,
pagos o períodos de facturación. `/me`, el guard Pro, las consultas en lote y el
badge reconocen el pase mientras siga vigente. Al cumplirse exactamente el plazo
deja de dar acceso; las semillas y las suscripciones pagas existentes se conservan.
El premio tampoco concede roles ni omite la aprobación de solicitudes de admin.

El popup privado muestra el premio y su vencimiento, permite ir al jardín y
respeta movimiento reducido y foco de teclado. Espera si hay otro modal abierto.
Su lectura se confirma sólo para la cuenta autenticada. Las recompensas pendientes
y fechas de vencimiento no aparecen en perfiles públicos ni perfiles con alias.
Se muestra también el progreso en el jardín y en las insignias del perfil.
Los otros dispositivos consultan el acceso y los avisos al volver al primer plano.

Migración aditiva `0017_collaboration_rewards`: tabla de recibos con índices por
usuario/fecha y eliminación en cascada con la cuenta. Este registro es operativo,
independiente de la retención del log de moderación.

## Insignias y ascenso

Las ocho insignias de estudio existentes se combinan con cuatro de colaboración:
10, 50, 100 y 500 lugares. Las medallas son ilustraciones SVG propias, con niveles
bronce, plata, oro y diamante. La animación de desbloqueo no usa material de juegos,
no reproduce audio automáticamente y se vuelve estática con reduced motion.

El servidor persiste una obtención por usuario/insignia en `user_achievements`.
Los logros ya obtenidos son permanentes mientras exista la cuenta. La confirmación
de visualización sólo puede modificar los logros del usuario autenticado; el cliente
no puede conceder insignias ni roles.

Con 100 lugares actualizados en al menos 3 días, sin rol de staff ni spam score >= 5,
se puede enviar una solicitud. No existe ascenso automático. El propietario ve las
pendientes en la campanita y en `/admin/colaboradores`. Su aprobación concede ADMIN,
cierra la solicitud y escribe la auditoría en una sola transacción. Una revisión
repetida es idempotente. Las cuentas sin correo verificado o suspendidas/baneadas
no se aprueban. Tras un rechazo hay 7 días de espera para volver a solicitarlo.

## Perfiles y privacidad

El ranking enlaza identidades visibles a `/u/:userId` y alias a `/alias/:alias`.
Un perfil con alias no entrega el identificador de cuenta, nombre, email, rol,
redes sociales, ubicación ni asiento. No redirige a la cuenta si el alias deja de
ser la identidad pública. Respeta bloqueos en ambas direcciones. Las lecturas
asíncronas vuelven a comprobar privacidad y bloqueos antes de responder.

La opción de visibilidad del ranking controla también la actividad e insignias
públicas. Desactivarla devuelve actividad nula e insignias vacías. El jardín conserva
su regla vigente de visitas autenticadas sin bloqueos, sin compartir saldo ni compras.

La vista administrativa completa de un alias usa un endpoint separado,
`/admin/aliases/:alias/profile`, con los mismos permisos, verificación, auditoría
y respuestas private/no-store que `/admin/users/:id/profile`. No se agregan los datos
privados al DTO del perfil con alias.

Los tres registros nuevos se eliminan por cascade con la cuenta. No se ha agregado
una purga por antigüedad; borrar el registro de colaboración sin consolidar previamente
las semillas reduciría saldos existentes. Ver `DATA_RETENTION.md`.
