# Reacciones de mensajes

Una persona puede elegir una de veinte reacciones por mensaje, cambiarla o
quitarla. Se usan emojis del sistema, sin librerías de selección ni imágenes.

## API y privacidad

- `GET /api/v1/message-reactions/:scope/:threadId?ids=...` recibe hasta 50 UUID.
- `PUT /api/v1/message-reactions/:scope/:threadId/:messageId` recibe
  `{ "emoji": "👍" }` o `{ "emoji": null }`. Es idempotente: un reintento no
  vuelve a alternar el estado.
- `scope` es `ROOM`, `DM` o `GROUP`. Todas las rutas requieren sesión y devuelven
  `Cache-Control: private, no-store`.
- Los privados requieren ser participante; los grupos requieren membresía.
  La autorización, el estado del mensaje y los bloqueos se revalidan en la
  transacción de escritura. Los mensajes eliminados no aceptan reacciones.
- Se respetan `MUTE_CHAT`, suspensión, bloqueo de cuenta y bloqueos entre usuarios.
- La respuesta sólo contiene emoji, cantidad y `mine` para el solicitante; nunca
  expone la lista de personas que reaccionaron ni identifica autores con alias.
- El límite es 40 mutaciones por minuto y persona.

La tabla `message_reactions` usa claves externas a los tres tipos de mensajes,
una restricción que exige exactamente un mensaje y tres índices únicos para
impedir reacciones duplicadas por persona. La eliminación física del mensaje o
de la cuenta elimina sus reacciones en cascada. Migración: `0008_message_reactions`.

## Cliente y tiempo real

Los tres chats comparten `MessageReactions.tsx`. Se consultan grupos de hasta 50
mensajes y se reutilizan los ya cargados al agregar mensajes nuevos. El evento
`chat:reaction-changed` sólo anuncia scope, hilo y mensaje: cada cliente vuelve
a consultar su respuesta autorizada. Los privados y grupos usan los canales
personales existentes; la sala usa su canal de chat. Las reacciones no modifican
la fecha del mensaje ni generan mensajes nuevos, unread o push.

El selector funciona con teclado, Escape, clic exterior y controles táctiles.
Los errores de escritura se muestran sin cambiar visualmente el estado guardado.

La acción para reaccionar vive junto al mensaje y sólo se muestran contadores
cuando existen reacciones. En las burbujas comparten una línea de altura fija
con la hora: agregar reacciones no aumenta su altura. El menú usa un popover nativo sobre la capa
superior: cinco emojis frecuentes y un acceso al selector completo de veinte,
sin agrandar el historial. El mismo selector permite insertar emojis en el
campo de escritura, conservando el cursor, la selección y el límite de texto.
Escape cierra primero el selector; el chat flotante permanece abierto.

## Cambios de interfaz asociados

- Navegación: Sala, Foco, Jardín, Ranking y Más. Guías permanece en Más.
- `/comunidad` redirige a `/ranking`; los anuncios siguen en la campana.
- El mapa aparece primero en móviles y mantiene sus coordenadas, imágenes,
  avatares sujetos a privacidad y animación de Ceniza. Sus datos secundarios se
  agrupan debajo; compartir es un botón circular junto al título.
- El panel del asiento ordena observaciones, check-in e información del lugar,
  y elimina la información duplicada y los avisos de liberación superiores.
- Instagram público es un enlace sólo cuando el servidor comparte ese campo.

## Recuerdo de Ceniza

`apps/web/public/room/ceniza-recuerdo.webp` es una versión a 384 × 364 de la foto
acreditada a **@elgordoceniza** y publicada en
<https://bahiablanca.substack.com/p/ricoteros-goleador-nutria-y-mas>.
El texto resume su vínculo con la comunidad de la UNS; no agrega fechas,
diagnósticos ni detalles biográficos no confirmados. El modal enlaza al perfil
<https://www.instagram.com/elgordoceniza/>. La procedencia de la foto queda
documentada aquí; el modal no muestra el pie editorial.
No se incluye WhatsApp, por indicación del usuario.
