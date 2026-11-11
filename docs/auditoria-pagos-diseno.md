# Auditoría de interfaz y pagos — 11 de noviembre de 2026

## Alcance y límites

Barrido de Sala, Foco, Jardín, Ranking, Personas, Guías, Más, Pro e ingreso en escritorio Chrome (1440 px), WebKit móvil (440 px) y Chrome móvil pequeño (360 px), en temas claro/oscuro. Las 27 visitas públicas respondieron HTTP 200, sin desbordes horizontales, imágenes rotas ni errores JavaScript. Esto no certifica todas las combinaciones posibles de usuarios, permisos o dispositivos.

El jardín no es pixel art: combina ilustraciones naturalistas WebP con texturas y composición SVG. No fuerza `image-rendering: pixelated`. Se conserva este estilo y el mapa de la sala. La comprobación privada usa cuentas, horas y jardines sintéticos; no modifica datos de producción.

## Problemas corregidos

- `apps/api/src/subscriptions/mercadopago.client.ts`: la llamada al proveedor fallaba con `Illegal invocation` en Cloudflare al ejecutar `fetch` con la instancia como receptor. También usaba `redirect: "error"`, que Workers rechaza. Ahora conserva el receptor global y usa `manual`, rechazando respuestas no exitosas sin reenviar credenciales a redirecciones. Afectaba al transporte compartido de donaciones, Pro, compras y consultas de pagos.
- `apps/api/src/garden/garden-purchases.service.ts`: una confirmación nueva con igual estado y saldo no actualizaba su fecha. Una respuesta antigua podía entonces modificar un saldo más reciente. Se conserva la fecha más nueva incluso cuando el crédito no cambia.
- `apps/web/src/features/subscriptions/SubscriptionPageClient.tsx`: un fallo al consultar la suscripción podía presentar el botón de compra como si no existiera suscripción. Ahora muestra carga, error y reintento. Una confirmación pendiente al volver de Mercado Pago permite actualizar el estado sin sugerir otra compra.
- `apps/api/src/email/resend.client.ts`: el transporte de campañas tenía los mismos problemas de contexto y redirecciones en Workers. Se corrigen sin enviar campañas reales.
- `apps/api/src/avatars/avatars.service.ts`: importar la foto de Google usaba el modo de redirección incompatible. Ahora rechaza redirecciones con `manual`, conserva la validación del dominio y no reemplaza la foto si la descarga falla.

La llamada de Gemini para verificar fotos ya usa una función envolvente compatible con Workers; no se modifica.

## Evidencia de pagos

Antes de los cambios, producción informaba `subscriptionsEnabled: true`, pero crear una preferencia de donación sin pagar devolvía HTTP 500. El registro de esa solicitud confirmó `Illegal invocation`. No se obtuvo ni imprimió ningún secreto. No se realizaron pagos, suscripciones autorizadas, reintegros reales ni envíos de correo.

Pruebas locales:

- Reproducción con workerd/Miniflare: código anterior HTTP 500; transporte corregido HTTP 200 contra proveedor sintético. Esta prueba verifica compatibilidad con el runtime, no credenciales reales.
- Transporte: importe y moneda enviados por el servidor, clave de idempotencia, errores del proveedor y rechazo de redirecciones.
- Flujo HTTP completo con SQLite y Mercado Pago simulado: compra protegida por sesión, webhook firmado, consulta del pago al proveedor, 100 semillas por $5.000 ARS, acreditación única ante reintentos, aislamiento del titular, rechazo de firmas falsas, pagos pendientes/importe incorrecto sin crédito y reversión idempotente del reintegro.
- Conciliación: reintentos concurrentes, reintegros parciales, contracargos, respuestas antiguas, rollback y compras deshabilitadas sin verificación de webhooks.
- Interfaz: fallo inicial recuperable, no ofrecer otro checkout mientras se desconoce la suscripción y consulta manual si el webhook tarda.

## Comprobación pendiente con el proveedor real

Una respuesta exitosa al crear una preferencia confirma acceso al checkout; no confirma un pago aprobado ni la recepción de su webhook. El estado de la cuenta comercial, sus medios habilitados y un pago completo no se pueden deducir de las pruebas simuladas.

En Mercado Pago Developers, revisar que el webhook de producción sea `https://saladeestudio.com.ar/api/v1/webhooks/mercadopago`, con eventos de **Pagos** y **Planes y suscripciones**. Deben estar configurados `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en el Worker; no copiar sus valores a GitHub ni a este documento. Las compras de semillas requieren ambos. Mantener los entornos de prueba y producción separados.

Para cerrar la validación comercial: usar cuentas/tarjetas de prueba según Mercado Pago, comprobar el retorno, la notificación firmada y el saldo/estado en la cuenta compradora. Las donaciones no otorgan semillas. Un retorno con parámetros `approved` nunca debe acreditar por sí solo.

Fuentes oficiales: [errores de contexto en Workers](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors), [webhooks de Mercado Pago](https://www.mercadopago.com.ar/developers/en/docs/zero-dollar-auth/additional-content/your-integrations/notifications/webhooks).

## Pendientes externos ya conocidos

La aprobación de AdSense, la actualización del índice de Google y las presentaciones oficiales DNDA/INPI dependen de sus respectivos organismos. La asignación automática de una silla por GPS sigue requiriendo referencias físicas y precisión suficiente. Esta auditoría no los considera resueltos por haber pasado pruebas de código.

## Validación final de código

`pnpm lint`, `pnpm typecheck` y `pnpm test` correctos (2.354 pruebas: API 1.581, web 685, contratos 56, base de datos 32). Build de Next correcto. Navegación privada del jardín y recuperación de consulta de Pro verificadas en los tres tamaños; confirmación demorada y actualización manual verificadas en escritorio. No se agregaron dependencias ni assets.

## Resultado del despliegue y comprobación real

Versión de código `14e6eac` desplegada mediante los workflows habituales:

- [Staging — 43034899322](https://github.com/ilandaniele/uns-study/actions/runs/43034899322): CI, API, web y smoke correctos.
- [Producción — 43036262035](https://github.com/ilandaniele/uns-study/actions/runs/43036262035): CI, API, web y smoke correctos.

Después del despliegue, el botón de donación recibió HTTP 200 y una preferencia real de Mercado Pago en `www.mercadopago.com.ar`. El enlace respondió HTTP 200 en Chrome con un agente de usuario normal y referencia al sitio. Las solicitudes identificadas como automatización habían recibido 403; no se interpreta ese bloqueo como un pago rechazado. Una notificación sin firma recibió HTTP 401, como corresponde. Se generaron únicamente preferencias sin pagar; no se cargaron tarjetas ni se autorizaron suscripciones.

La creación de la preferencia confirma que el transporte y las credenciales permiten abrir el checkout. **No confirma todavía un pago aprobado, la entrega real de su webhook, la acreditación efectiva de semillas ni la primera autorización/cobranza de Pro.** Esos pasos siguen pendientes de una prueba comercial con el proveedor. La prueba HTTP de acreditación descrita arriba utiliza exclusivamente datos sintéticos.

También se verificaron en ambos dominios: salud de API y mapa (200), protección de jardín/privacidad sin sesión (401), sitemap, robots, noindex del jardín y los assets actuales (200).
Las pruebas privadas de interfaz (API sustituida por la fixture sintética local) también pasaron sobre los frontends desplegados de dev y producción, en los tres tamaños.
