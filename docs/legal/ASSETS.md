# Inventario de procedencia de los recursos

Este documento distingue archivos y derechos. «Declarado» no significa que exista certificado, permiso firmado o exclusividad autoral. Los hashes del expediente identifican archivos, no a sus autores.

| Recursos | Evidencia disponible | Tratamiento propuesto |
| --- | --- | --- |
| Código y documentación específicos del proyecto | Ilan Daniele declara desarrollo personal con asistencia de IA; historial Git | Reservar sólo sus aportes originales protegibles. Declarar la asistencia y separar el código de terceros. |
| 11 atlas WebP de plantas en `public/garden/` | Prompts y procesos en los documentos de arte del jardín | Declarar generación con GPT y contribuciones humanas identificables. No afirmar exclusividad autoral automática de las imágenes generadas. No son recursos de Forest. |
| SVG de animales y reacciones | Script `copy-animal-avatars.mjs`, paquete `@twemoji/svg` | Material de terceros CC BY 4.0. Preservar atribución y licencia; no reclamar dibujos propios. |
| Archivo y Geist Mono | Fuentes locales y sus OFL junto a los archivos | Mantener las licencias originales y los avisos distribuidos. |
| Iconos de controles | Paquete Phosphor | MIT; conservar aviso. |
| `public/room/ceniza-recuerdo.webp` | `docs/MESSAGE_REACTIONS.md`: fotografía publicada por 8000, acreditada a @elgordoceniza; el titular pidió excluirla el 27 de octubre de 2026 | Exclusión expresa del paquete para registro y de la declaración de autoría. La respuesta del titular no acredita una licencia de la fotografía ni modifica su procedencia externa. |
| `public/room/principal-dia.webp`, `principal-noche.webp` y `reference-images/Plano.png` | El titular declaró el 27 de octubre de 2026 generación con IA a partir de material propio | Se incluyen como recursos IA de origen declarado; conservar los originales y el proceso en privado. No afirmar creación humana exclusiva ni certificación independiente. |
| `public/icons/logo-mark.webp` y `logo-mark-dark.webp` | El titular declaró el 27 de octubre de 2026 generación con IA a partir de material propio | Se incluyen con ese origen declarado. Evaluar el signo para marca por separado; la declaración no equivale a disponibilidad ni concesión INPI. |
| Otras referencias de sala, iconos PWA y favicon | Archivos usados; sin individualización adicional de su origen en esta confirmación | No extender automáticamente la declaración a archivos distintos. Siguen fuera del paquete de fuentes; el icono del anexo marcario sólo es material de revisión, sin atribución exclusiva. |
| Sprites `public/room/ceniza-v6.webp` | Historial de animación, derivado de imágenes de referencia | Confirmar origen y derechos sobre las referencias; distinguir animación/código y dibujo. Excluidos de la copia de recursos hasta aclarar. |
| Sonidos de Foco | `focus-audio.ts` sintetiza con Web Audio, sin archivos de grabaciones | Declarar el código de síntesis según su contribución humana/IA. No afirmar que toda composición generada esté libre de cualquier derecho por ser sintetizada. |
| Mensajes, fotos y avatares de usuarios | Datos de uso de la plataforma | No se exportan, no se registran a nombre del proyecto y no se reclaman como propios. |

Las declaraciones adicionales del titular deben incorporarse con fecha y evidencia sin borrar la procedencia externa ya documentada. La declaración general de haber desarrollado la app no convierte en propias las dependencias ni la fotografía externa.

La declaración recibida se conserva de forma estructurada en `declarations.json`. Su inclusión en el manifiesto documenta lo declarado por el titular; no convierte los hashes en una prueba de autoría o fecha cierta.
