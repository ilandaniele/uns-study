# Revisión de indexación — 9 de noviembre de 2026

El propietario compartió los ejemplos de Search Console. No todos requieren un cambio:

| URL o grupo | Comprobación y acción |
| --- | --- |
| `/jardin`: indexada aunque bloqueada por robots.txt | Es una pantalla personal. Se permite rastrearla en producción para que Google lea `noindex, nofollow`, tanto en metadata como en el encabezado HTTP. Se conserva el control de acceso existente; permitir rastreo no habilita datos privados. |
| `/guias/procrastinacion`: rastreada, actualmente sin indexar | Responde 200, está en el sitemap, tiene una URL canónica propia y contenido completo, sin bloqueo ni noindex. No se altera el artículo sólo para simular una actualización. La decisión de indexarlo corresponde a Google. |
| `/favicon.ico`, `/manifest.webmanifest`, `/legal/third-party-notices.txt`: rastreados sin indexar | Responden correctamente y cumplen funciones de icono, instalación y avisos de licencias. No necesitan convertirse en resultados de búsqueda ni bloquearse para que desaparezcan del informe. |
| `/&`: 404 | Dirección mal formada, sin página vigente ni enlaces actuales encontrados. No se convierte en una página válida para ocultar el 404. |
| Fuente `797e433ab948586e-s.p.0r6juujl39pe6.woff2`: 404 | La versión actual no la referencia. Las fuentes actuales Archivo y Geist Mono responden 200. Se conserva el 404 del recurso anterior. |
| Página con redirección | `/sala/principal` redirige permanentemente a `/`, de forma intencional. La captura no identificaba qué URL concreta estaba en ese grupo. |

Las 23 URLs del sitemap respondieron 200 y ninguna estaba bloqueada por robots.txt. Dev conserva `Disallow: /` y su metadata noindex. No se modifica la API, la autenticación ni la configuración de Cloudflare.

## Comprobaciones

- Pruebas de proxy: encabezado noindex sólo en la ruta del jardín, preservando CSP y respuestas públicas.
- Pruebas de robots: producción deja leer la exclusión y staging sigue bloqueado.
- En la versión desplegada: comprobar encabezado y metadata de `/jardin`, guía pública, recursos auxiliares, sitemap y robots.

## Paso en Search Console después del despliegue

1. Inspeccionar `https://saladeestudio.com.ar/jardin` y usar **Probar URL publicada**. Debe poder rastrearse y declararse excluida por noindex; no se solicita su indexación.
2. En el grupo **Indexed, though blocked by robots.txt**, usar **Validar corrección**. El aviso puede tardar en cambiar hasta que Google vuelva a rastrear la URL. Que el jardín pase a **Excluida por noindex** es el resultado buscado.
3. Inspeccionar `https://saladeestudio.com.ar/guias/procrastinacion`. Si la prueba publicada permite indexación, solicitarla una vez. La solicitud no garantiza que Google la indexe.
4. No validar como fallos los 404 intencionales ni tratar los archivos auxiliares como artículos pendientes de indexar. No es necesario reenviar la revisión de AdSense por este aviso de Search Console.

Referencias oficiales: [Google: noindex debe poder rastrearse](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=es), [estados del informe de indexación](https://support.google.com/webmasters/answer/7440203?hl=es).
