# Jardín personal y foco sincronizado — 2026-10-28

## Jardín y vivero
- 25 parcelas iniciales. Se compran cinco adicionales por vez hasta 50, usando semillas virtuales.
- Para habilitar cada ampliación se requieren al menos capacidad actual menos cinco parcelas plantadas.
- Precios de las ampliaciones: 75, 100, 125, 150 y 175 semillas. La API calcula el precio; no acepta precios/saldos enviados por el navegador.
- Confirmación explícita en la interfaz; capacidad esperada en la petición y transacción SQLite para impedir compras dobles. Plantar fuera de la capacidad comprada se rechaza.
- Plantas, identificadores, colección y crecimiento existentes se conservan. La compra de parcelas no acredita estudio ni acelera el crecimiento.
- Un valor visual de baja entropía, estable por cuenta y persistido al escribir, elige entre ríos diagonales en ambos sentidos, rectos, curvos y laterales, con distintas posiciones de puente. No se publica el identificador de cuenta como semilla. Puede haber jardines con variantes iguales.
- Propietario y visitantes reciben la misma capacidad y variante. Los bloqueos y las restricciones de las visitas se mantienen.
- El vivero muestra cinco especies completas y una segunda tanda recortada con degradado. “Ver las especies” expande sólo por acción explícita. Cambiar filtro vuelve a compactarlo y conserva el encabezado bajo el header general.
- Las nuevas plantas conservan las animaciones desde su punto de apoyo, pausa fuera de pantalla y prefers-reduced-motion.

## Nuevas especies y arte
Se agregan doce especies (60 en total), con origen nativo contrastado con el SIB de Parques Nacionales. Cada ficha del vivero enlaza a su fuente oficial: coronillo, anacahuita, caraguatá, flechilla, pasto plateado, chilca, plumerillo rosado, Santa Lucía, petunia blanca, saeta, duraznillo de agua y helechito de agua. Caraguatá es una hierba de Apiaceae, agrupada por su forma en el filtro de pastos; su ficha lo aclara.

Ilustraciones originales generadas con la herramienta integrada GPT; no se copian archivos de Forest. El dibujo del terreno es SVG propio. Las ilustraciones son representaciones del juego, no una guía de identificación botánica.

Assets finales en apps/web/public/garden/:
- ribera-nativa-adultos-gpt-v1.webp: 133044 bytes.
- ribera-nativa-jovenes-gpt-v1.webp: 65830 bytes.
- Total nuevo: **198874 bytes**, con doce celdas por archivo.
Se recortan únicamente márgenes transparentes, se normalizan y se empaquetan con el script existente, modo --ribera. La etapa joven usa el mismo dibujo a escala reducida; semilla/brote reutilizan los atlas correspondientes a su familia. No se agregan dependencias.

### Prompt de generación (herramienta integrada)
Production game sprite atlas for an original Argentine native garden game. Use the supplied image ONLY as reference for its warm painterly botanical cutout style and atlas organization; create new distinct plants. TRUE TRANSPARENT background, NO checkerboard painted in, NO text, NO labels, NO grid lines, NO pots, NO environment, NO water painted outside plants, NO cast shadows. Exactly twelve isolated whole mature specimens in 4 columns by 3 rows of EQUAL cells, large consistent gutters so no leaf crosses any cell boundary. Camera slightly elevated, upright botanical miniature, softly lit detailed brush-painted semi-real foliage, varied natural silhouette, readable at 80px. Every specimen grounded at exactly 91% height of its cell, centered horizontally. Fill about 70% cell width and 65% cell height; trees may reach 80% cell height, compact herbs stay shorter. All silhouettes have clean alpha edges with no glow or color fringing. Row-major exact subjects: ROW1: (1) Coronillo Scutia buxifolia small gnarly dark evergreen tree dense small oval leaves (2) Anacahuita Blepharocalyx salicifolius small elegant willow-leaved tree with tiny creamy flowers (3) Caraguatá Eryngium pandanifolium dramatic rosette of long narrow serrated arching leaves and a few tall branched flower stems (4) Flechilla Nassella neesiana fine green tussock with slender golden violet-tinged awned grass seed stems. ROW2: (5) Pasto plateado Bothriochloa laguroides tuft of narrow green blades with airy SILVERY fluffy branching panicles (6) Chilca Baccharis salicifolia branched shrub with narrow green leaves and clusters of tiny fluffy creamy flower heads (7) Plumerillo rosado Calliandra parvifolia airy small shrub with finely pinnate leaves and delicate pale pink powderpuff flowers (8) Santa Lucía Commelina erecta compact leafy perennial with unmistakable bright BLUE two-petaled flowers and small yellow centers. ROW3: (9) Petunia blanca Petunia axillaris loose green herb with simple WHITE trumpet flowers (10) Saeta Sagittaria montevidensis upright arrow-shaped green leaves, white three-petaled flowers with deep purple spots at petal bases (11) Duraznillo de agua Ludwigia peploides low sprawling shiny oval-leaf aquatic herb with yellow five-petaled flowers (12) Helechito de agua Salvinia biloba compact floating mat of small paired folded fuzzy velvety light green oval leaves, no flowers. Cohesive original high-quality game art, attractive rich natural colors, adult forms distinct, no branding or copied Forest assets.

### Ajuste de espaciado
Se pidió a la misma herramienta conservar las doce plantas y su orden, reducirlas a un máximo de 58% del ancho y 65% del alto de cada celda y dejar separadores totalmente transparentes. Los dos atlas finales se empaquetan a partir de esta segunda imagen, conservando sus bordes alfa.

## Privacidad
La vista privada de perfiles, alias→cuenta, fotos ocultas y directorio de usuarios requiere SUPERADMIN tanto en guards como en servicios. ADMIN/MODERATOR conservan moderación, reportes y sugerencias. Reportes/sugerencias muestran a esos roles sólo la identidad pública y ocultan correos de cuenta/contacto. Las notificaciones con datos de contacto de sugerencias se envían sólo al correo del propietario. El contenido escrito voluntariamente en un reporte sigue siendo visible para revisarlo.

## Reloj de foco
GET/POST /api/v1/me/focus requieren sesión, responden private/no-store y nunca toman userId del cuerpo. user_focus contiene sólo reloj, ajustes y estadísticas personales del Pomodoro, con FK de eliminación en cascada. No contiene tareas, sonidos, credenciales ni datos de otros usuarios.
- El motor puro de Pomodoro se comparte entre navegador y servicio.
- Las acciones utilizan una versión de SQLite. Un cambio antiguo recibe 409 y el cliente adopta el estado actual, sin reproducir la acción sobre una sesión más reciente.
- Las fases vencidas se concilian al consultar, aunque el dispositivo que inició el bloque esté cerrado. Las estadísticas remotas usan la fecha de Buenos Aires.
- El evento privado focus:changed lleva sólo versión. Cada dispositivo relee el estado canónico. Se reconsulta al reconectar, volver al primer plano y cada 15 segundos visibles como respaldo.
- El reloj continúa localmente sin conexión; los comandos pendientes usan su versión original al reintentar, evitando créditos repetidos tras una respuesta perdida.
- Cada cuenta usa una caché local distinta. Una respuesta pendiente de la cuenta anterior se ignora.
- El reloj antiguo sin identificación de cuenta no se sube automáticamente: “Traer mi reloj anterior” permite importarlo una vez, si la cuenta aún no tiene un reloj guardado. Para sesiones anteriores a esta actualización, esa importación debe hacerse en el dispositivo donde estaban.
- Sonidos, tareas y combinaciones personalizadas permanecen por dispositivo. Los gates Pro se conservan. El Pomodoro personal no crea horas verificadas, semillas ni puntos de ranking.

Migración aditiva 0012_garden_landscapes_focus: tabla user_focus y dos columnas en user_gardens. No cambia ni borra las plantas o saldos existentes.

## Verificación
Pruebas de servicio/HTTP con SQLite cubren capacidad, compra concurrente, saldo, aislamiento entre cuentas, conciliación y permisos. La revisión de navegador usa cuentas sintéticas y una API Hono/SQLite local real; no modifica asientos, cuentas reales ni realiza compras de Mercado Pago.

## Regalos de semillas del súper admin
En el perfil administrativo y en Administración → Usuarios, el propietario puede abrir “Regalar semillas”, ingresar entre 1 y 10.000, indicar un motivo y confirmar antes de enviar. La ruta POST /admin/users/:id/garden/seeds vuelve a verificar SUPERADMIN, correo verificado y restricciones, aplica 30 envíos por hora y valida los datos en servidor. No cambia horas, crecimiento ni compras de Mercado Pago.

Saldo, comprobante y auditoría se escriben en una transacción. El comprobante de garden_seed_grants sobrevive a la retención del log, por lo que un reintento no duplica el regalo aunque se haya limpiado la auditoría. Se rechaza reutilizar el comprobante para otra cuenta o cantidad. Los comprobantes se borran con la cuenta receptora. La migración aditiva es 0013_owner_seed_gifts.

Ante una respuesta incierta, el formulario conserva el mismo regalo y permite reintentarlo sin cambiar monto/persona. El aviso privado garden:changed invita al destinatario a actualizar su saldo; se reconsulta también al volver a la ventana. Los admins comunes no ven el formulario ni pueden invocar la ruta. La auditoría para staff usa nombres públicos y oculta los metadatos de regalos; el súper admin conserva la información completa.

La moderación se mantiene disponible desde perfiles públicos y reportes sin cargar la vista privada de la cuenta.
