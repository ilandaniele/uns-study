# DNDA — borrador de preparación de software publicado

Preparado el 27 de octubre de 2026. **No presentado.**

## Ficha propuesta

| Campo | Dato para revisar |
| --- | --- |
| Denominación de trabajo | Sala de Estudio |
| Tipo | Aplicación web / PWA, con servicios de servidor en Cloudflare Workers |
| Titular propuesto | Ilan Daniele, persona física |
| Autoría declarada | Desarrollo personal con asistencia de IA; alcance y materiales externos según la declaración de origen y el inventario |
| Versión a depositar | Commit exacto y SHA-256 del paquete generado; no usar simplemente «última versión» |
| Primera publicación y lugar | Domingo 18 de octubre de 2026; Bahía Blanca, Buenos Aires, Argentina. Declarado por el titular el 27 de octubre de 2026; no inferido de Git ni certificado por el agente |
| Sitio de referencia | https://saladeestudio.com.ar |
| Registro anterior | PENDIENTE: declarar si existe, sin presumir que no lo hay |
| DNI / CUIT / domicilio / nacionalidad | Completar sólo en el portal o expediente privado |

## Descripción breve propuesta

Sala de Estudio es una aplicación web para consultar y actualizar colaborativamente la disponibilidad de asientos de una sala de estudio en Bahía Blanca. Incluye acceso verificado, presencia con validación de cercanía, actualizaciones en tiempo real, perfiles y moderación, herramientas de enfoque, guías y un jardín virtual que progresa con el tiempo de estudio registrado. No realiza reservas ni administra el edificio.

## Descripción técnica

Monorepo TypeScript con Next.js/React para la web, Hono y Better Auth para la API, y SQLite/Drizzle en un Durable Object de Cloudflare. Se distribuye como aplicación web/PWA; los ejecutables de servidor son módulos JavaScript para el runtime Workers y el cliente utiliza JavaScript, CSS y recursos estáticos. Hay contratos compartidos y migraciones de estructura sin datos de producción.

La solicitud debe delimitar los aportes originales protegibles de Ilan Daniele. Las dependencias conservan sus licencias; los recursos gráficos generados con IA se declaran como tales, sin asegurar que sus resultados sean susceptibles de exclusividad autoral. Las fotografías y demás elementos ajenos con derechos pendientes no se declaran de autoría propia.

El titular declaró que el logo, el plano y las imágenes de la sala de día/noche se generaron con IA a partir de material propio. Los cinco archivos individualizados en `declarations.json` se incluyen como recursos de ese origen, sin presentarlos como creación humana exclusiva. La fotografía `ceniza-recuerdo.webp` queda expresamente excluida del paquete de registro y de la declaración de autoría, por indicación del titular. Los demás recursos sin confirmación individual siguen identificados en el inventario.

## Material preparado

- Copia de fuentes de una versión exacta, licencia, documentación e inventario SHA-256.
- Relación de dependencias, licencias y recursos externos.
- Borrador de declaración de origen; no firmado por el agente.
- Relación de exclusiones. No se incluyen secretos, bases de datos, usuarios, reportes, chats ni comprobantes personales.

## Antes del depósito

1. Revisar la fecha y lugar declarados y acompañar los antecedentes que correspondan, sin confundir la declaración con una certificación de publicación. Completar versiones y registros anteriores. Revisar si corresponde el trámite de software publicado y si la web requiere una inscripción complementaria distinta.
2. Consultar el formato de depósito con DNDA: la ficha exige copia de la obra completa y TAD menciona código ejecutable. Una copia de fuentes no debe presentarse como si ya cubriera ese requisito. En Workers deben acompañarse el build del servidor y cliente, sus requisitos de ejecución y la separación de recursos de terceros según lo que admita el organismo.
3. Leer requisitos y aranceles vigentes en la ficha oficial al momento de pagar. No transferir a cuentas copiadas de documentos antiguos ni utilizar importes como definitivos.
4. Ingresar personalmente a TAD, completar identificación fiscal/representación y anexar lo aceptado por el organismo. Si se requiere información sobre el uso de IA, describirla fielmente sin declarar generación humana exclusiva de materiales generados automáticamente.
5. Revisar la presentación completa; firmar, abonar y guardar comprobante y número de expediente reales fuera de Git. Seguir las subsanaciones hasta recibir el certificado.

## Fuentes oficiales consultadas

- https://www.argentina.gob.ar/node/37071 — inscripción de software puesto en conocimiento público.
- https://tramitesadistancia.gob.ar/tramitesadistancia/detalle-tipo?id=536 — trámite y referencia a código ejecutable.
- https://www.argentina.gob.ar/normativa/nacional/42755/actualizacion — Ley 11.723, especialmente artículos 1, 4 y 55 bis.
- https://www.boletinoficial.gob.ar/detalleAviso/primera/150228/20160901 — Disposición DNDA 2-E/2016, información de origen de la obra.
