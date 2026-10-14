# Relevamiento: ¿se puede mover todo a Cloudflare?

Fecha: 2026-10-13. Es solo investigación: no se cambió código ni infraestructura.

## 1. Qué corre hoy y dónde (según el repo)

| Pieza | Dónde | Detalle relevante |
|---|---|---|
| Web (`apps/web`) | Fly `sala-de-estudio`, gru, shared-cpu-1x 512 MB, `min_machines_running = 1` | Next.js 16 standalone (`Dockerfile.web`). `src/proxy.ts` arma la CSP con nonce para cada request (matcher `/:path*`). Los rewrites `/api/auth/*` y `/api/v1/*` van a `API_PROXY_TARGET` para que la cookie de Better Auth sea first-party (Safari/iOS). Usa `sharp` y `generateStaticParams`. Socket.IO va directo al host de la API. |
| API (`apps/api`) | Fly `uns-study-api`, gru, 256 MB, 1 máquina siempre prendida, deploy bluegreen | NestJS 12 + Express 5, unas 14k líneas. Socket.IO con `@socket.io/postgres-adapter` (LISTEN/NOTIFY), Better Auth, `web-push`, Resend, Mercado Pago, S3 client contra R2. |
| Jobs | Adentro del proceso de la API (`@nestjs/schedule`) | `daily-reset` con `@Cron` cada minuto. `@Interval` para expiration, recordatorio de check-in, disputas, barrido de adjuntos y envío de emails (`FOR UPDATE SKIP LOCKED`). Además, el gateway tiene un `setInterval` propio. |
| Verifier (`apps/verifier`) | Fly `sala-de-estudio-verifier`, escala a 0 | Servicio HTTP chico que llama a Gemini/Claude Vision. |
| DB | Fly Postgres self-managed `sala-de-estudio-db` (postgres-flex 17, 1 máquina, volumen de 1 GB, gru) | 30 migraciones. La API entra por `.internal` sin TLS. |
| Redis | Upstash está en el código (`@upstash/ratelimit`, `ioredis`) pero la base se borró | Hoy los rate limits caen a la tabla `rate_limit_hits` en Postgres. |
| CI/CD | `.github/workflows/deploy.yml` | Migra con `ops/migrate-fly-db.sh` (`fly ssh` + `fly proxy`) y después hace `flyctl deploy` de la API, la web y el verifier. |

### Funcionalidades de Postgres que hoy sostienen la correctitud

- **Índices únicos parciales**: `uq_checkin_active_user` y `uq_checkin_active_seat` (`WHERE status = 'ACTIVE'`), `uq_dispute_open_seat`, `uq_table_name_proposals_active` y los de `presence`/`notifications`.
- **`pg_advisory_xact_lock(hashtext(...))`** en `disputes.service.ts` (6 usos), `observations.service.ts`, `room-state.service.ts` y `table-names.service.ts`.
- **`SELECT ... FOR UPDATE`** en `groups.service.ts` y **`FOR UPDATE SKIP LOCKED`** en `email-send.job.ts`.
- **Transacciones interactivas** (`db.transaction`) en unos 15 servicios: checkins, observations, daily-reset, expiration, subscriptions, entre otros.
- **`pgEnum`** (unos 15 enums), **`jsonb`**, un índice único sobre `lower(alias)`, CHECK constraints y **LISTEN/NOTIFY** para el adapter de Socket.IO.

> **Ojo:** las garantías de "un check-in activo por usuario" y "un check-in activo por asiento" dependen de los índices únicos parciales y de las transacciones de Postgres. Lo mismo pasa con la serialización de disputas y observaciones vía advisory locks. Cualquier opción que saque Postgres obliga a rediseñar esas garantías y a volver a testear los casos de colisión concurrente, de expiración y de reset diario.

## 2. Qué ofrece Cloudflare para cada pieza

### Web: Next.js 16 con `@opennextjs/cloudflare` en Workers

- OpenNext soporta todas las versiones minor de Next 16. Funcionan App Router, RSC, SSR/SSG, ISR (hay que configurar el cache incremental en R2/KV), PPR, `after`, `'use cache'` y la optimización de imágenes (con **Cloudflare Images**, que tiene costo aparte; `sharp` no corre en Workers).
- **Riesgo puntual:** OpenNext dice que la "Node Middleware" todavía no está soportada. En Next 16, `proxy.ts` corre en runtime Node. Antes de migrar hay que confirmar que nuestro `proxy.ts` (solo genera nonce y headers) compila con OpenNext. Si no compila, la salida es volver a un `middleware.ts` edge, que está deprecado pero funciona.
- Límite del Worker: 10 MiB comprimido en el plan Paid.
- **Cloudflare Pages ya no es el camino para Next**: el adapter `next-on-pages` quedó superado por OpenNext sobre Workers.
- Los rewrites a la API externa siguen andando, así que la cookie se mantiene first-party.

### API: NestJS en Workers

- Workers ya ofrece `nodejs_compat` y `httpServerHandler` para servidores `node:http`/Express, pero **no hay evidencia de NestJS corriendo en producción así**.
- El problema de fondo no es el adapter: **no existe un proceso de larga vida**. Eso rompe `@Interval`/`@Cron`, el `setInterval` del gateway, Socket.IO, LISTEN/NOTIFY y los pools `pg` globales.
- **No es viable sin reescribir.** El reemplazo natural sería Hono más handlers.

### API: Cloudflare Containers

- Están en **GA desde el 13 de abril de 2026**. Cada contenedor lo controla un Durable Object y le entra tráfico vía un Worker.
- Instancias desde `lite` (1/16 vCPU, 256 MiB) y `basic` (1/4 vCPU, 1 GiB).
- Cold start de **1 a 3 s**. Duermen después de `sleepAfter` (10 min por defecto). El disco es efímero. **Todavía no hay autoscaling para apps stateless.**
- **Región: no se puede fijar.** Arranca "en la ubicación pre-inicializada más cercana con capacidad, normalmente pero no siempre" en la región de quien hace el request. No encontré documentación que confirme capacidad en Sudamérica. Si la API termina corriendo en EE.UU. con la DB en gru, cada query suma unos 120 ms ida y vuelta. **Hay que medirlo antes de decidir.**
- Para no romper los jobs y Socket.IO habría que mantenerla siempre despierta (sleepAfter largo), lo que se parece mucho a lo que ya tenemos en Fly.

### Realtime: Durable Objects con WebSockets (Hibernation API)

- Encaja bien: un DO por sala, con hibernación (no se cobra duración mientras está idle).
- Los mensajes entrantes se facturan a razón de 20:1 y los salientes son gratis. El broadcast a todos los sockets de la sala reemplazaría al postgres-adapter.
- **Requiere reescribir cliente y servidor**: Socket.IO no corre sobre DO. Hay que pasar a WebSocket nativo con protocolo propio (rooms, auth por token, reconexión, budget de eventos por IP).

### Cron

- Los Cron Triggers tienen granularidad mínima de 1 minuto y se expresan en UTC. El reset de las 04:00 ART es `0 7 * * *`; Argentina no tiene horario de verano, pero el job actual ya chequea cada minuto.
- Los `@Interval` de menos de un minuto tendrían que pasar a **alarms de Durable Objects**.

### Otras piezas

- **Better Auth**: corre en Workers con `nodejs_compat` (usa `AsyncLocalStorage`). Necesita adapter Drizzle sobre D1 o sobre Hyperdrive/Postgres.
- **web-push**: el paquete `web-push` usa `crypto` de Node. En Workers habría que pasar a `@pushforge/builder` o `web-push-neo` (Web Crypto + fetch).
- **Resend / Mercado Pago**: son HTTP con fetch, así que no tienen problema. Los webhooks (validación HMAC) se portan con Web Crypto.

### Base de datos: D1 vs. Postgres con Hyperdrive

- **D1 (SQLite)**:
  - Drizzle lo soporta. SQLite tiene índices parciales, pero **no tiene enums** (se reemplazan por CHECK), **no tiene `FOR UPDATE`** y **no tiene advisory locks**.
  - Lo más grave: **no hay transacciones interactivas desde el binding de Workers**. `db.transaction()` falla y solo queda `batch()`, que es atómico pero no permite leer, decidir y escribir dentro de la misma transacción.
  - Además, tiene un escritor único con ubicación primaria fija (no hay primario en Sudamérica).
  - Conclusión: habría que reescribir toda la lógica de concurrencia (check-in, disputas, observaciones, emails) y migrar 30 migraciones y los datos. **Alto riesgo de regresión en el slice principal.**
- **Hyperdrive con Postgres**:
  - Hace pooling y cache, sin cargo de transferencia. En el plan Paid las queries son ilimitadas.
  - La doc lista como **no soportados**: advisory locks, LISTEN/NOTIFY, `PREPARE` a nivel SQL y estado de sesión (`SET`).
  - Las transacciones normales funcionan con el pooling en modo transacción. Que `pg_advisory_xact_lock` (a nivel transacción) funcione bajo Hyperdrive **no está garantizado por la doc: hay que testearlo**. Si falla, se reemplaza por `SELECT ... FOR UPDATE` sobre la fila del asiento o la disputa.
  - Hyperdrive solo sirve para Workers. Un Container puede conectarse directo a Postgres.
  - La DB de Fly hoy solo es accesible por la red privada `.internal`. Para usarla desde Cloudflare habría que exponerla con IP pública y TLS, o con Cloudflare Tunnel. Otra alternativa es pasarla a Neon o Supabase en São Paulo.
- **Latencia**: desde Bahía Blanca el PoP más probable es EZE (Buenos Aires, unos 15 a 25 ms). De EZE/GRU a una DB en gru hay unos 30 a 40 ms. Con Smart Placement o placement hints, el Worker corre cerca de la DB. Es aceptable si se evitan muchas queries secuenciales por request.

### Redis / rate limits

- Upstash ya no está en uso; Postgres hace de backend.
- En Cloudflare, el [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) o un DO contador son las opciones correctas.
- **KV no sirve** para rate limits: es eventual consistent.

## 3. Costos mensuales aproximados (cientos a pocos miles de usuarios por día)

| Concepto | Fly hoy | Opción A (todo CF) | Opción B (CF + Containers) | Opción C (web CF, API Fly) |
|---|---|---|---|---|
| Plataforma | – | Workers Paid USD 5 | Workers Paid USD 5 | Workers Paid USD 5 (o Free si alcanza) |
| Web | ~USD 3–4 (512 MB siempre prendida) | incluido | incluido | incluido |
| API | ~USD 2–3 (256 MB) | incluido + DO (dentro de lo incluido) | `basic` 1 GiB 24/7 ≈ 730 GiB-h → ~USD 6 de memoria + CPU ≈ USD 6–10 | ~USD 2–3 (Fly) |
| DB | ~USD 2–5 (máquina + 1 GB de volumen) | D1 (dentro de lo incluido) | Postgres externo: Fly ~USD 3–5 o Neon/Supabase USD 0–25 | igual que hoy |
| Imágenes | sharp (gratis) | Cloudflare Images (~USD 0–5) | igual | igual |
| Verifier | ~USD 0–1 (escala a 0) | Worker con fetch a Gemini | igual | Fly |
| **Total aprox.** | **~USD 8–13** | **~USD 5–10** | **~USD 15–25** | **~USD 10–15** |

Notas:
- Los números de Fly son estimaciones por tamaño de máquina; gru es un poco más cara que EE.UU. Conviene confirmarlos con la factura.
- **Pasarse a Cloudflare no baja la cuenta de forma relevante**: la diferencia es de pocos dólares. El argumento a favor sería operativo (CDN, DDoS, un solo proveedor), no de costo.

## 4. Opciones

### A. Reescritura total a Cloudflare: Workers + D1 + Durable Objects

- **Qué cambia**:
  - La API se reescribe sin Nest, con Hono o handlers.
  - Todo `packages/database` pasa a sqlite-core: 30 migraciones nuevas, enums a CHECK y jsonb a text.
  - Se reemplaza toda la lógica transaccional y de locks: `CheckInService`, `ObservationService`, `DisputesService`, `room-state.service`, `table-names.service`, `groups.service`, `email-send.job`, `daily-reset.job` y `expiration.job`.
  - `RoomRealtimeGateway` pasa a un DO y el cliente Socket.IO a WebSocket nativo.
  - Jobs a Cron Triggers y alarms. web-push a una librería con Web Crypto. Rate limits a binding o DO. Hay que migrar los datos y armar un CI nuevo con wrangler.
- **Esfuerzo**: **25 a 40 días**.
- **Riesgo**: muy alto. Se pierden las garantías de concurrencia que hoy da Postgres, D1 tiene un solo escritor lejos de Argentina y no hay transacciones interactivas.
- **No recomendado** en la primera versión de este relevamiento. **Revisado en la sección 6**: con un Durable Object por sala la concurrencia no se pierde y la opción pasa a ser viable.

### B. Web en Workers + API en Containers + Postgres (Hyperdrive o conexión directa)

- **Qué cambia**:
  - La web pasa a OpenNext.
  - `Dockerfile.api` casi igual, con un Worker y un DO de entrada y `sleepAfter` alto.
  - Exponer Postgres de forma segura (Tunnel o TLS público) o migrarlo a Neon/Supabase en São Paulo.
  - Socket.IO necesita sticky sessions al container. Con una sola instancia funciona igual.
  - CI con `wrangler deploy` y build de imagen.
- **Esfuerzo**: **8 a 15 días**.
- **Riesgos**:
  - **No se puede fijar la región del container**: puede terminar lejos de la DB.
  - Cold start de 1 a 3 s si duerme, que es justo el problema que se resolvió con `min_machines_running = 1`.
  - No hay autoscaling.
  - Sale más caro que hoy.

### C. Híbrido: web en Cloudflare Workers, API, DB y verifier en Fly (recomendada)

- **Qué cambia**:
  - Agregar `@opennextjs/cloudflare` y `wrangler.jsonc` en `apps/web`.
  - Validar `proxy.ts` (CSP con nonce) bajo OpenNext.
  - Configurar el cache incremental en R2 y Cloudflare Images (o `images.unoptimized`).
  - Dejar los rewrites con `API_PROXY_TARGET`; `NEXT_PUBLIC_SOCKET_URL` sigue apuntando a Fly.
  - Cambiar el job `web` de `deploy.yml` por `wrangler deploy`.
  - Apuntar el DNS (ya está en Cloudflare) al Worker.
- **Opcional**: poner `api.saladeestudio.com.ar` con proxy naranja de Cloudflare delante de Fly, para WAF/DDoS y Turnstile, que ya está en el roadmap.
- **Esfuerzo**: **2 a 4 días**.
- **Riesgo**: bajo. No se toca el dominio crítico ni la DB, y el rollback es volver el DNS a Fly.

## 5. Recomendación y orden de migración

1. **Quedarse con la opción C.** La lógica crítica (check-in, observaciones, expiración, reset diario) sigue en Postgres y NestJS sin cambios.
2. Orden sugerido:
   1. Prueba de concepto de OpenNext en un preview (`*.workers.dev`): build, `proxy.ts`/CSP, login con Google (cookie first-party vía rewrites), mapa, push y ads.
   2. Medir TTFB desde Argentina contra la web actual en Fly.
   3. CI con `wrangler deploy`.
   4. Cambio de DNS con TTL bajo y la web de Fly prendida una semana como rollback.
   5. Si da resultado, poner la API detrás del proxy de Cloudflare (los WebSockets andan a través del proxy).
3. **Reevaluar B solo si** Cloudflare publica placement por región para Containers con cobertura en Sudamérica, o si Fly se vuelve un problema de confiabilidad. Antes de B, testear `pg_advisory_xact_lock` y las transacciones bajo Hyperdrive o con conexión directa.
4. **Descartar A** mientras las reglas de concurrencia dependan de índices únicos parciales, transacciones interactivas y locks de Postgres.

## 6. Revisión: mover todo a Cloudflare, base incluida

Contexto nuevo: perder los datos actuales no es problema y el tiempo de trabajo no importa. La única condición es **no romper funcionalidad**. Con eso la respuesta cambia: **sí se puede**.

### 6.1 Corrección de la conclusión anterior

La sección 4.A decía que se perdían las garantías de concurrencia. Eso vale para "D1 solo", no para el diseño correcto:

- Un **Durable Object (DO) por sala** procesa los pedidos de esa sala **de a uno** (single-threaded, con input/output gates) y guarda su estado en su propio SQLite con `transactionSync()`. Todo check-in, observación, disputa y nombre de mesa de esa sala queda serializado. Es una garantía **más fuerte** que los advisory locks y `FOR UPDATE` de hoy, que hay que acordarse de tomar en cada lugar.
- SQLite soporta índices únicos parciales (`WHERE status = 'ACTIVE'`), índices por expresión (`lower(alias)`), CHECK, `ON CONFLICT ... DO UPDATE ... WHERE` y `RETURNING`. Las 5 restricciones únicas parciales se portan tal cual.
- Hoy hay **una sola sala** (`principal`). "Un check-in activo por usuario" se resuelve adentro del DO de la sala. Si en el futuro hay más salas, se agrega un DO por usuario como árbitro (reserva, después confirma o compensa).
- Los jobs de 15 y 30 segundos (disputas, expiración, emails) pasan a **alarms del DO**, con precisión de milisegundos. En vez de barrer cada 30 s, cada check-in o disputa programa su propia alarma.
- Socket.IO se reemplaza por los **WebSockets del mismo DO** (Hibernation API, hasta 32.768 sockets por objeto). La sala ya es el hub, así que desaparece el adapter de LISTEN/NOTIFY.

### 6.2 Arquitectura propuesta (opción D)

| Pieza | Hoy | En Cloudflare |
|---|---|---|
| Web | Next.js en Fly | Next.js con `@opennextjs/cloudflare` en Workers. El soporte de `proxy.ts` (runtime Node) entró el 2026-08-25 como experimental (PR #1309). |
| API HTTP | NestJS + Express | Worker con Hono. Se reusa la lógica de negocio; se reescriben controllers, guards, pipes y la inyección de dependencias. |
| Estado de sala | Postgres + advisory locks | `RoomDO`: asientos, check-ins, observaciones, disputas, nombres de mesa, estado calculado, alarms y WebSockets. `SeatStateCalculator` queda igual (es puro). |
| Datos globales | Postgres | **D1**: usuarios y sesiones (Better Auth con `drizzleAdapter`, provider `sqlite`), perfiles, alias, grupos, DMs, rankings, push, emails, suscripciones, moderación y anuncios. Las escrituras de leer-decidir-escribir pasan a sentencias condicionales o a `batch()`. Los grupos con tope de miembros y el webhook de Mercado Pago se serializan con un DO chico. |
| Realtime | Socket.IO | WebSockets del `RoomDO` (sala y chat) y un `UserDO` para eventos personales (DMs, resultado de disputas, "Sigo acá"). En la web cambia solo `apps/web/src/lib/socket.ts`: una fachada mantiene `on/emit` y los ~15 hooks no se tocan. |
| Jobs | `@nestjs/schedule` | Reset diario: Cron Trigger `0 7 * * *` (04:00 ART, los cron son UTC). Expiración, recordatorio y disputas: alarms. Emails: Cloudflare Queues o un DO. Barrido de adjuntos: cron horario. |
| Push | `web-push` (Node) | `@pushforge/builder` (Web Crypto, sin dependencias). |
| Rate limits | Postgres | Binding de Rate Limiting o contador en DO. |
| Archivos | R2 vía S3 SDK | Binding nativo de R2. |
| Verifier | Fly | Worker (fetch a Gemini/Claude); los archivos que hoy lee con `fs` pasan a assets embebidos. |
| Tests | PGlite | `@cloudflare/vitest-pool-workers` (Miniflare con D1 y DO reales en local). |

### 6.3 El costo real: latencia

- **Ni D1 ni los Durable Objects corren en Sudamérica.** D1 no tiene región `sam`. Para DO el hint `sam` existe, pero la doc aclara que hoy no se crean ahí: caen en el este de EE.UU. (ENAM).
- Cada acción que escribe ("Estoy acá", "Está libre", votar) haría Argentina, Virginia, Argentina: unos **130 a 170 ms** de ida y vuelta, contra 30 a 40 ms hoy a São Paulo. Un toque tardaría ~0,2 s en vez de ~0,05 s. Se nota poco, pero es peor que hoy.
- La carga del mapa puede seguir rápida: el DO publica la foto del estado y el Worker la sirve con ETag desde el PoP de Buenos Aires.
- Si Cloudflare habilita DO en Sudamérica, el DO **no se mueve solo**: hay que crear uno nuevo y copiar el estado.

### 6.4 Alternativa con la base cerca (opción E)

Si la latencia de la opción D molesta:

- **PlanetScale Postgres** se puede crear y pagar **desde Cloudflare** desde el 2026-06-18, y PlanetScale tiene región São Paulo (`aws-sa-east-1`). Falta confirmar que esa región se pueda elegir desde el flujo de Cloudflare.
- La API actual (NestJS + Socket.IO casi sin cambios) puede correr en **Cloudflare Containers con placement `SAM`**, que ahora figura en la doc. Falta confirmar capacidad real en SAM y medir el arranque en frío; habría que dejarla siempre prendida.
- Cambios: los advisory locks pasan a `SELECT ... FOR UPDATE` sobre la fila del asiento o la disputa (si se usa Hyperdrive, que no soporta advisory locks ni LISTEN/NOTIFY). Con una sola instancia, LISTEN/NOTIFY no hace falta.
- Ventaja: se conservan schema, migraciones y los 97 tests con PGlite. Desventaja: la base corre en AWS (aunque la factura Cloudflare) y Containers sale más caro que Fly.

### 6.5 Comparación

| | D: todo nativo Cloudflare | E: Containers SAM + PlanetScale São Paulo |
|---|---|---|
| ¿Todo facturado por Cloudflare? | Sí | Sí |
| ¿La base corre en Cloudflare? | Sí (D1 + DO) | No (PlanetScale en AWS) |
| Latencia de escritura desde Argentina | ~150 ms | ~30–40 ms |
| Concurrencia | Más fuerte (sala serializada) | Igual que hoy |
| Reescritura | Grande: API a Hono, schema a SQLite, realtime, jobs, tests | Chica: locks, deploy, conexión |
| Riesgo de romper funcionalidad | Medio (se baja portando primero los tests de colisión, expiración y reset) | Bajo |
| Costo mensual aprox. | USD 5–10 | USD 15–30 (Container siempre prendido + PlanetScale; precio sin confirmar) |

### 6.6 Recomendación

1. **Se puede mover todo a Cloudflare sin perder funcionalidad.** El camino "todo adentro de Cloudflare" es la opción D.
2. Antes de reescribir, hacer una **prueba de concepto de 1 a 2 días**: un `RoomDO` mínimo con WebSocket y un check-in, desplegado en `*.workers.dev`. Medir desde Bahía Blanca el tiempo de un toque y de un broadcast. Si se siente bien, seguir con D; si no, ir por E.
3. Orden para D, sin apagar Fly hasta el final:
   1. Portar los tests de dominio (geofence, cálculo de estado, colisión de check-in, cambio de lugar, expiración, reset diario) a `vitest-pool-workers`.
   2. `RoomDO` con estado, alarms y WebSockets; fachada de socket en la web.
   3. D1 con Better Auth y los módulos globales; API en Hono.
   4. Push, emails, pagos, R2 y verifier.
   5. Web en OpenNext.
   6. Cambio de DNS, con Fly como respaldo durante una semana.

## Fuentes

- OpenNext Cloudflare (versiones y features soportadas): https://opennext.js.org/cloudflare
- Containers GA (2026-04-13): https://developers.cloudflare.com/changelog/2026-04-13-containers-sandbox-ga
- Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Containers FAQ (ubicaciones, cold start, sleepAfter): https://developers.cloudflare.com/containers/faq/
- Durable Objects pricing (WebSockets 20:1, hibernación): https://developers.cloudflare.com/durable-objects/platform/pricing/
- WebSocket Hibernation API: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Hyperdrive pricing: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Hyperdrive, features soportadas y no soportadas: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- D1 SQL statements: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Drizzle y transacciones en D1 (issue): https://github.com/drizzle-team/drizzle-orm/issues/2463
- Servidores Node HTTP en Workers: https://blog.cloudflare.com/bringing-node-js-http-servers-to-cloudflare-workers/ y https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Better Auth en Workers (`nodejs_compat`): https://www.better-auth.com/docs/integrations/hono
- DO, ubicación y hint `sam`: https://developers.cloudflare.com/durable-objects/reference/data-location/
- DO, SQLite storage y `transactionSync`: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- DO, alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- DO, límites: https://developers.cloudflare.com/durable-objects/platform/limits/
- D1, ubicación: https://developers.cloudflare.com/d1/configuration/data-location/
- PlanetScale facturado por Cloudflare: https://developers.cloudflare.com/changelog/
- Containers, placement: https://developers.cloudflare.com/containers/
- OpenNext, soporte de Node middleware: https://github.com/opennextjs/opennextjs-cloudflare/pull/1309
- Web Push compatible con Workers: https://github.com/draphy/pushforge y https://github.com/ryoppippi/web-push-neo
