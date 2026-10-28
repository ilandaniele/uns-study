# Retención de datos

Este documento resume cuánto tiempo se conserva cada categoría de dato personal o generado por
usuarios, y qué pasa con ella cuando una cuenta se elimina. Es la referencia para B1–B4 y para
cualquier feature nueva que toque datos de usuarios. Revisión del 27/10/2026: los plazos objetivo se distinguen de los mecanismos ya implementados. Este documento no acredita una purga automática por el mero transcurso de esos plazos.

## Ubicación / geolocalización

- Nunca se guarda la coordenada exacta del usuario más allá de la request que la usó para validar
  presencia (`PresenceService.validate`).
- Lo único que persiste indefinidamente son agregados no identificables: la precisión (`accuracy`)
  y un bucket de distancia al geocerco, dentro de `seat_state_events` / eventos de seguridad. Esto
  se conserva para siempre porque no permite reconstruir dónde estuvo una persona.

## Eventos de seguridad (`security_events`)

- Objetivo de política: 180 días desde su creación. La purga periódica por antigüedad no está implementada; el responsable debe atender solicitudes de supresión y completar el mecanismo antes de prometer ese límite como comportamiento efectivo.

## Evidencia de reportes (`user_report_attachments` + objetos en R2)

- Objetivo de política: 180 días **después de que el reporte se resuelve** (`RESOLVED` o `DISMISSED`), para
  permitir apelaciones. Pasado ese plazo, tanto el objeto en R2 como la fila de adjunto deben
  purgarse (job futuro). `AttachmentSweepJob` sólo limpia adjuntos PENDING de más de una hora; no implementa este plazo. La política pública debe reflejar esa diferencia.

## Chat y mensajes directos

- El contenido de un mensaje borrado (`deleted_at` seteado) se purga a los 30 días: la fila queda
  como tumba (id, autor, timestamps) pero `content` se limpia. Hasta ese momento el cliente ya lo
  trata como borrado (`deleted: true`, `content: null` en la DTO).
- Los mensajes de un usuario cuya cuenta se elimina **se cascadean junto con la fila `user`** (FK
  `on delete cascade` en `chat_messages.user_id`, `direct_messages.sender_id`,
  `direct_conversations.user_a/user_b`). No quedan mensajes "anonimizados" en pie: desaparecen del
  historial visible para la otra parte. Esto es una decisión de esquema (batch A) más simple que
  anonimizar in-place; se documenta acá como la implementación real.

## Eliminación de cuenta (`POST /me/delete`)

Al eliminar una cuenta:

1. Se cierra el check-in activo (si lo hay), liberando el asiento y emitiendo el evento de
   realtime correspondiente.
2. Se inserta una fila de auditoría en `moderation_actions` (`action: "ACCOUNT_DELETED"`) **antes**
   de borrar el usuario, con `actor_id` y `target_user_id` apuntando al usuario que se borra.
3. Se borra la fila `user`. Todas las tablas con FK a `user.id` están declaradas `on delete
   cascade` (perfil, privacidad, reputación, roles, check-ins, observaciones, bloqueos, mensajes
   de chat/DM, sesiones de estudio, etc.), excepto las que declaran `on delete set null`
   (`moderation_actions.actor_id/target_user_id`, `user_reports.resolved_by`,
   `announcements.created_by`, `user_restrictions.created_by`). Como resultado, la fila de
   auditoría del paso 2 queda **sin ningún identificador personal** una vez completado el borrado:
   esto describe esos identificadores de auditoría, no demuestra la desaparición de toda información personal en reportes, objetos de almacenamiento, copias de respaldo o prestadores externos. Esos casos requieren revisar sus propias reglas y cumplir las obligaciones legales aplicables.

## Reputación / puntajes

- `user_reputation` se borra junto con la cuenta (cascade). No hay retención post-mortem: no tiene
  sentido conservar el spam score de una cuenta que ya no existe.

## Insignias y recompensas de colaboración

- `collaboration_updates` conserva usuario, asiento, sala y día local de cada
  actualización premiable, sin coordenadas. Su clave evita premios duplicados y
  el saldo de semillas depende de sus conteos. No se agregó purga por antigüedad;
  antes de purgarlo hay que consolidar las semillas ganadas para no quitar saldos.
- `user_achievements` conserva la insignia, su fecha y si se mostró la animación.
  `admin_applications` conserva la solicitud y revisión de ascenso; nunca concede
  roles por sí sola. Estos tres registros se borran por cascade con la cuenta.
