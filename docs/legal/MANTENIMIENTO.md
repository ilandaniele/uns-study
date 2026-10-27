# Protección y mantenimiento — lista operativa

Revisión del 27/10/2026. Esta lista prepara el trabajo; no acredita cumplimiento integral, permisos de terceros, auditoría de seguridad, trámites presentados ni registros concedidos. Responsable de seguimiento: Ilan Daniele.

## Lo documentado

- Titular declarado, primera publicación, uso de IA y exclusiones individualizadas en `declarations.json`.
- Licencia sobre los aportes propios protegibles, avisos de terceros y modelo sin firmar para colaboraciones.
- Canales públicos para permisos, suplantaciones, reportes de seguridad y ejercicio de derechos sobre datos.
- Exportación de fuentes, documentos, builds opcionales e inventario SHA-256 fuera del repositorio.
- CI, análisis estático, revisión semanal de dependencias/secretos y actualizaciones agrupadas de Dependabot configurados en `.github/`. Son comprobaciones automatizadas, no una certificación de seguridad.

## Pendientes que no se resuelven publicando cláusulas

| Prioridad | Acción | Evidencia para cerrarla |
| --- | --- | --- |
| Alta | Revisar el origen y los permisos de la foto de Ceniza, sus referencias/sprites y los demás recursos pendientes de `ASSETS.md`. La exclusión del depósito no autoriza su uso en la app. Si no se obtiene permiso, reemplazar el recurso o retirarlo. | Autorización/licencia y alcance documentados en privado, o commit de sustitución. No atribuir autoría propia por defecto. |
| Alta | Confirmar con DNDA cómo depositar la aplicación completa para Workers/OpenNext y las exclusiones; revisar y presentar la versión elegida. | Expediente, comprobantes, depósito completado y eventual certificado, conservados en privado. |
| Alta | Completar búsqueda oficial de marca y evaluación del signo/clases antes de solicitar INPI. | Informe de búsqueda, solicitud real, comunicaciones y eventual título. No usar ® antes de corresponder. |
| Alta | Completar la identificación y domicilio del responsable exigidos por la normativa; evaluar la inscripción del responsable y de las bases ante AAIP. Nunca inventar un domicilio a partir del lugar de publicación. | Datos confirmados por el titular y revisión profesional; constancias de registro cuando corresponda. No publicar DNI/CUIT ni documentación personal en Git. |
| Alta | Revisar con los prestadores la ubicación, contratos y garantías de las transferencias internacionales de datos y reflejar el tratamiento real en privacidad. | Inventario de encargados, destinos y acuerdos aplicables guardado en privado. No afirmar que los datos permanecen en Argentina. |
| Alta | Implementar y probar la purga prevista a los 180 días para eventos de seguridad y evidencia de reportes resueltos. Hoy no hay un job por esos plazos: `AttachmentSweepJob` sólo elimina adjuntos PENDING de más de una hora. | Pruebas de límites temporales, reportes abiertos, objetos R2 y reintentos, y configuración comprobada del job. Hasta entonces privacidad informa el estado real y las solicitudes requieren atención del responsable. No ejecutar una purga masiva como parte de esta revisión documental. |
| Alta | Revisar las obligaciones por compras y suscripciones: identificación comercial/fiscal, facturación, atención al consumidor, baja y arrepentimiento. Pro conserva sus precios y beneficios; esta lista no modifica los cobros. | Revisión contable/legal y flujos operativos probados en sandbox. No presentar un simple texto o enlace de email como cumplimiento automático. |

Fuentes para privacidad: [obligaciones de responsables](https://www.argentina.gob.ar/aaip/datospersonales/responsables/obligaciones), [inscripción de responsable](https://www.argentina.gob.ar/servicio/inscribir-un-responsable-de-bases-de-datos-personales-privadas) y [derechos](https://www.argentina.gob.ar/aaip/datospersonales/derechos). La inscripción y el domicilio requieren datos y revisión del titular; el agente no los completó ni presentó.

Para compras, revisar la [Disposición 954/2025](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-954-2025-417152/texto): acceso visible a arrepentimiento y baja, identificación de la solicitud dentro de 24 horas y atención al consumidor. La [Disposición 3/2026](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto) permite verificaciones razonables de identidad y seguridad; no sustituirlas por obstáculos arbitrarios. Revisar en particular cancelación en Mercado Pago antes de borrar una cuenta, tratamiento de semillas/reintegros y seguimiento de solicitudes. No ejecutar compras, devoluciones ni cancelaciones reales para probar.

## Antes de cada versión pública

1. Conservar originales, prompts y decisiones humanas de los recursos nuevos en privado; actualizar procedencia y licencias antes de incorporarlos. Firmar los acuerdos necesarios antes de integrar aportes de otra persona.
2. Revisar dependencias y actualizar sus avisos cuando cambien. Comprobar que ningún recurso pendiente pasó por error al paquete de registro.
3. Revisar que términos, privacidad y contactos reflejen las funciones reales. Fechar los cambios y solicitar aceptación expresa cuando corresponda; no inferirla de una visita al sitio.
4. Ejecutar lint, typecheck, tests y `pnpm legal:check`. Desplegar primero en staging y verificar sin escribir sobre datos reales; luego seguir el procedimiento autorizado para producción.
5. Para archivar una versión: hacer commit, dejar el árbol limpio, compilar la web de ese mismo commit y ejecutar `node scripts/legal/create-evidence.mjs --output <carpeta-nueva-fuera-del-repo> --api-executable --web-build`. Revisar `COMPLETADO.json`, el commit y todas las huellas de `SHA256SUMS.txt`. No mezclar un build anterior con fuentes nuevas ni sobrescribir paquetes históricos.
6. El exportador incluye como PDF todos los Markdown rastreados directamente en `docs/legal/`. Conservar copia adicional cifrada y comprobar su recuperación. Un hash identifica contenido, no certifica autoría ni fecha cierta; consultar mecanismos de prueba adicionales si se necesitan.

## Seguimiento continuo

- Revisar los avisos de CI/Dependabot y el canal privado de seguridad. Mantener MFA, accesos mínimos y códigos de recuperación fuera del repositorio; verificar su configuración en las consolas, sin presumir que ya está activa.
- Probar restauraciones de backups en un entorno aislado sin exponer datos ni afectar producción. Revisar retención, borrado y atención de solicitudes de privacidad contra el comportamiento efectivo.
- Para un reclamo por copia o suplantación: preservar en privado URL, fecha, capturas y contexto; separar aportes propios, terceros e ideas generales. Revisar el caso y el canal de denuncia de la plataforma con asesoramiento antes de presentar afirmaciones jurídicas.
- Cuando exista un registro real, conservar título y comunicaciones, anotar sus vencimientos y obligaciones desde las fechas oficiales, y actualizar los textos públicos sólo con datos comprobables. No programar fechas de renovación a partir de una solicitud todavía inexistente.

Los expedientes, documentación fiscal, contratos firmados, permisos, reportes de seguridad y datos de usuarios no van en este directorio público. Esta lista no crea recordatorios automáticos ni implica que se hayan habilitado ajustes de cuentas externas.
