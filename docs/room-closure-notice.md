# Aviso público de sala cerrada

Al entrar a la sala, un cartel destacado muestra el cierre vigente, el motivo y la próxima apertura confirmada. Aparece también para visitantes sin sesión y en modo simple. No tapa el mapa ni necesita aceptar un diálogo. Mientras está cerrada se posponen la guía automática de primera visita y la pregunta de identidad para que no oculten el aviso.

Los horarios habituales se calculan en el servidor: abre a las 08:00 todos los días; cierra a las 00:00 entre semana y a las 22:00 sábados, domingos y feriados configurados. No se usa el huso horario del dispositivo para decidir si está abierta.

## Cierres extraordinarios confirmados

Sólo el súper administrador puede gestionarlos:

1. Entrar a **Administración → Anuncios**.
2. Marcar **Cierre extraordinario de la sala**.
3. Escribir un título y el motivo confirmado por la UNS.
4. Indicar inicio y fin en hora de **Bahía Blanca (UTC−3)**. Inicio vacío significa ahora; fin vacío significa hasta nuevo aviso.
5. Pulsar **Publicar cierre**.

Se puede desactivar el anuncio para retirar el cierre; un cierre con fin programado deja de aplicar automáticamente al llegar esa hora. Los intervalos son `[inicio, fin)`. El servidor rechaza un fin anterior o igual al inicio, también en ediciones parciales. Los anuncios comunes conservan su funcionamiento.

No se consultan automáticamente comunicados oficiales de la UNS. El súper administrador debe cargar información confirmada. Si no hay una reapertura conocida, el cartel muestra **Hasta nuevo aviso** en lugar de prometer una apertura a las 08:00. Los cierres superpuestos y el horario nocturno se consideran al calcular la próxima apertura.

## Integración

La migración `0021_room_closure_announcements` añade `announcements.closes_room`, inicialmente falso para todos los anuncios existentes. La lógica de `RoomHours` alimenta el mapa y bloquea marcas/presencias durante el cierre. Las estadías se limitan al comienzo del próximo cierre y el barrido existente expira las estadías anteriores; al reabrir, las presencias previas al cierre no reaparecen.

`RoomDto.operatingHours` incorpora `closure`, `nextOpensAt` y `nextChangeAt` sin quitar campos anteriores. Los cambios de anuncios disparan una recarga mediante el evento de tiempo real existente. También se recarga al próximo límite de horario y al volver a la pestaña; una fecha de transición ya vencida provoca una comprobación inmediata en vez de esperar otro día.

El cartel permanece visible mientras el estado sea cerrado. Los lectores de pantalla lo reciben como un estado informativo. Las posiciones, dibujos y áreas interactivas del mapa no cambian.

## Validación

Pruebas de horarios habituales y feriados, extremos exactos de los intervalos, cierres superpuestos/indefinidos, límites de estadías, reapertura, validación de fechas y conversión explícita de UTC−3. Pruebas en Chrome desktop (1440 px), WebKit móvil (440 px) y Chrome móvil pequeño (360 px): lectura anónima, actualización por eventos, cierre programado con pestaña abierta, modo simple, creación/desactivación por el propietario y rechazo 403 para un usuario común. Estas pruebas usan una base SQLite y cuentas sintéticas; no publican cierres de prueba en producción.
