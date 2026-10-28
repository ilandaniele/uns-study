# Personas y amigos

La sección Personas conserva la lista de quienes se muestran en la sala y agrega búsqueda por nombre/alias público, amigos y solicitudes recibidas/enviadas. Hay accesos desde Más, el perfil propio y los perfiles visitados. La campanita muestra solicitudes pendientes.

## Consentimiento y privacidad

- Sólo cuentas verificadas y sin suspensión/baneo pueden gestionar amistades. No requiere ubicación ni Pro.
- Una solicitud es pendiente hasta que su destinatario la acepta. Enviarse solicitudes cruzadas no acepta automáticamente. Se puede rechazar, cancelar o quitar una amistad; estas acciones son privadas.
- La lista es propia: no hay endpoint para leer la lista de otra persona. Ser amigos no desbloquea email, nombre oculto, foto, legajo, ubicación ni mensajes desactivados.
- La búsqueda sólo compara el nombre/alias que se devuelve públicamente, con soporte de acentos. No compara email, nombre legal oculto, biografía, legajo o Instagram. Requiere dos caracteres y pagina de a 25.
- `showInPeopleSearch` y `allowFriendRequests` se gestionan en Perfil → Privacidad. Por defecto habilitan encontrar la identidad pública y solicitar consentimiento, sin habilitar campos privados.
- Los alias se referencian por alias, sin devolver el id de la cuenta. Una relación iniciada bajo alias conserva esa separación: si luego se publica un nombre, esa relación no lo revela ni redirige al perfil nominal. Las consultas de amigos se proyectan nuevamente con la privacidad actual.
- Bloquear por cualquiera de las dos vías elimina solicitudes/amistades de la pareja en la misma transacción. Desbloquear no las restaura. También se puede bloquear un contacto desde sus opciones, sin conocer el id de una cuenta con alias.
- No se envían emails ni se publican mensajes o eventos de amistad en la sala.

## API privada

- `GET /people/search?q=...&cursor=...`
- `GET /me/friends?view=friends|incoming|outgoing&q=...&cursor=...` (incluye contadores propios)
- `POST /me/friends/state` y `POST /me/friends/requests`, con `{target: {kind: "user", userId} | {kind: "alias", alias}}`.
- `POST /me/friends/requests/:id/respond`, con `{action: "ACCEPT" | "DECLINE"}`.
- `DELETE /me/friends/:id`, para cancelar una enviada o quitar una amistad propia.
- `POST /me/friends/:id/block`, sólo para miembros de la relación.

Todas las rutas exigen sesión, ignoran cualquier identidad del cliente excepto la referencia al destinatario y usan respuestas privadas/no-store. Los cuerpos son estrictos; las escrituras verifican la relación, bloqueos y restricciones canónicas. La búsqueda está limitada a 60/min y las solicitudes a 30/h por persona. Los bloqueos comparten su límite de 30/h con el endpoint existente.

## Persistencia

`0014_people_friends.sql` agrega dos preferencias y `friendships`, sin modificar ocupación ni autenticación. La pareja ordenada es única, no permite autoamistad y el remitente debe pertenecer a ella. Las decisiones se realizan en transacciones SQLite síncronas. Reintentos y solicitudes concurrentes no duplican relaciones ni eventos.

Las relaciones cerradas mantienen un cooldown de 24 h para impedir insistencia. Una solicitud posterior recibe un id nuevo, para que una respuesta atrasada no acepte otra solicitud. Las relaciones se eliminan por FK al borrar una cuenta. Los registros cerrados se conservan hasta el borrado de la cuenta o bloqueo para mantener ese control y la separación del alias.

`friends:changed` invalida sólo las vistas privadas de sus dos participantes; el payload es vacío. El navegador también refresca al volver a la ventana, reconectar o cada minuto visible. Los datos se separan por cuenta y se ignoran respuestas tardías.

Las listas y el buscador cargan identidades, preferencias, bloqueos y restricciones por lotes; la cantidad de consultas no crece por cada resultado.

## Verificación

`apps/api/src/friends/friends.http.test.ts` prueba Hono y SQLite reales: consentimiento, reintentos, solicitudes cruzadas, permisos, rechazo/cancelación/cooldown, bloqueos, alias, preferencias, búsquedas sin datos privados, paginación, restricciones y borrado. La revisión de navegador utiliza cuentas y base de datos ficticias; no crea amistades ni envía solicitudes a usuarios reales.
