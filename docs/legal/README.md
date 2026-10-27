# Protección del proyecto — carpeta de revisión

Titular indicado por el usuario: **Ilan Daniele, persona física**. Declaró que desarrolló el proyecto personalmente con asistencia de IA. Esta declaración no sustituye la comprobación de materiales externos identificados en el repositorio.

Estado: documentación preparatoria y avisos del proyecto. **No hay constancia de solicitud presentada, pago, registro DNDA, solicitud de marca ni concesión INPI.** No usar ®, «marca registrada», «patentado» ni números de expediente inventados.

## Documentos

- [Preparación DNDA](DNDA.md): descripción, alcance de la versión, datos pendientes y presentación.
- [Evaluación de marca](INPI.md): signo actual, clases candidatas, búsqueda pendiente y campos del trámite.
- [Inventario de recursos](ASSETS.md): procedencia y límites de las declaraciones.
- [Acuerdo de colaboración](COLABORADORES.md): modelo sin firmar para futuros aportes.
- [Declaración de origen](DECLARACION_ORIGEN.md): borrador para revisar y firmar personalmente.
- [Dependencias](dependencies.json): inventario técnico; se complementa con los avisos originales.
- [LICENSE](../../LICENSE) y [avisos de terceros](../../THIRD_PARTY_NOTICES.md): alcance de los derechos reservados.

## Expediente privado y copias

`node scripts/legal/create-evidence.mjs --output <carpeta-absoluta-fuera-del-repo>` genera una copia de fuentes rastreadas por Git, un inventario con SHA-256, historia técnica sin emails de colaboradores, copias de los documentos y recursos de marca para revisión. Sólo funciona con el árbol limpio y toma una versión exacta de Git. No lee archivos de entorno, bases de datos, backups, credenciales ni imágenes de usuarios.

Con `--api-executable` compila además el módulo JavaScript del servidor con esbuild ya instalado, sin cargar archivos de entorno ni llamar a un despliegue de Wrangler. El módulo requiere el runtime y los bindings de Workers; no es un ejecutable autónomo ni sustituye el build del cliente o las instrucciones de depósito que establezca DNDA. El generador también prepara seis PDF de revisión. Requiere bsdtar (incluido en Windows) y el Chromium de Playwright ya instalado en el proyecto.

Después de ejecutar `pnpm --filter @sala/web build`, `--web-build` incorpora los módulos compilados del cliente y servidor Next, sin copiar cachés, entornos ni trazas. El build debe corresponder a las fuentes de la versión elegida. Incluye sus requisitos de runtime y la advertencia de que no es una copia autónoma de producción ni sustituye el formato que indique DNDA. Los tres flags se pueden combinar en una misma exportación.

`pnpm legal:check` comprueba la exclusión de entornos, credenciales, bases de datos, archivos privados, rutas inseguras y recursos con derechos pendientes antes de exportar.

La documentación personal, los acuerdos firmados, DNI/CUIT, domicilio y comprobantes se completan y guardan **fuera del repositorio público**, en los portales oficiales o en un archivo privado. No pegar esos datos en issues, commits ni este directorio.

El paquete de fuentes es evidencia técnica; no se presenta como prueba concluyente de autoría ni como el depósito oficial completo. El trámite de software publicado requiere una copia de la obra y las instrucciones oficiales se refieren a código ejecutable: comprobar con DNDA el formato apto para una aplicación web/Workers y preparar el build correspondiente antes de presentar. El generador enumera explícitamente los recursos con derechos pendientes que excluye de la copia.

## Pendientes que requieren al titular

1. Confirmar fecha y país de primera publicación, y antecedentes registrales si los hubiera. No se deduce la publicación pública de la fecha del primer commit.
2. Completar identificación fiscal y domicilio en privado; revisar los materiales que no tengan autorización documentada.
3. Revisar el alcance jurídico de los aportes con IA, de las cesiones y de la marca propuesta con un profesional argentino de propiedad intelectual.
4. Validar el signo y los productos/servicios, acceder a TAD/INPI con la cuenta propia, revisar, firmar, pagar y conservar el expediente real.

No se ha cambiado la visibilidad del repositorio. Estos documentos no revocan licencias de terceros ni permisos válidos que ya se hubieran otorgado.
