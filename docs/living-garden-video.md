# Jardín vivo y cambios del video — 27 de octubre de 2026

## Alcance

Se revisaron las imágenes y la narración del video aportado por el usuario. Se aplican sus propuestas de sugerencias desplegables, apoyo al mantenimiento desplegable, una portada más breve y medición del uso de secciones. La indicación directa del usuario de conservar Pro prevalece sobre la opinión del video acerca del pronóstico: los gates, beneficios, importes y servicios Pro se conservan.

La información extensa de la portada sigue accesible desde las páginas públicas Sobre el proyecto, Cómo usar la app y Guías. La portada conserva un resumen breve y enlaces legibles sin JavaScript. No se agrega publicidad ni se modifica el plano de asientos.

## Jardín

- 48 especies: se agregan 12 pastos, hierbas y plantas de humedal a las 36 anteriores.
- El vivero muestra primero una selección de pastos, flores y acuáticas, con filtros por familia.
- Se conservan los 25 índices de parcelas, las plantas guardadas y sus reglas de compra, crecimiento y canje.
- La proyección del jardín separa dos orillas con un arroyo y un puente. Las acuáticas flotantes tienen una parcela de agua y las palustres un borde húmedo. Son recursos visuales: no se crean restricciones nuevas para plantar ni se alteran saldos.
- Todas las especies y etapas tienen movimiento CSS suave. El punto de apoyo sigue en (128,270); sólo las flotantes tienen una oscilación vertical de hasta un píxel del sprite.
- Un único IntersectionObserver comparte la visibilidad de la escena y las plantas. Fuera de pantalla o con la pestaña oculta, se pausan las animaciones. No hay JavaScript por fotograma.
- Con prefers-reduced-motion se muestran las plantas y el agua estáticas.

Las fuentes botánicas individuales están en packages/contracts/src/garden-native-species.ts. Se consultaron SIB/APN, organismos de Buenos Aires, el Instituto de Investigaciones Marinas y Costeras y SINAVIMO. Son ilustraciones del juego, no láminas para identificar o recolectar plantas; los tiempos son virtuales.

## Imágenes y reproducción

Generación: herramienta integrada GPT de imágenes, con el atlas propio de plantas nativas como referencia de estilo. Los recortes y cambios de tamaño se hacen con sharp, sin pintar ni sustituir los dibujos con vectores.

Archivos finales en apps/web/public/garden/:

| Archivo | Bytes |
| --- | ---: |
| pastizal-humedal-adultos-gpt-v1.webp | 148496 |
| pastizal-humedal-jovenes-gpt-v1.webp | 67486 |
| brotes-acuaticos-gpt-v1.webp | 3298 |
| **Nuevos assets** | **219280** |

El catálogo completo de 48 especies y todas sus etapas usa 11 atlas compartidos, **1139902 bytes** en total. No se descargan archivos individuales por planta. Se mantiene el canal alfa original. Los colores del RGB de píxeles totalmente transparentes no son halos visibles: se comprobó también su composición sobre fondos claros.

Desde apps/web:

```powershell
node scripts/build-native-tree-atlases.mjs --wetland adultos.png jovenes.png brotes.png
```

Fuentes GPT seleccionadas (PNG originales conservados en generated_images de Codex, fuera del repositorio):

- Adultas: exec-7a82d937-afd8-4b2f-ad41-2e0bae2eb2ed.png
- Jóvenes: exec-d1da6926-2621-4198-81bf-fa37c230fec7.png
- Brotes: exec-72e62849-d4c7-4a78-aa94-3dafb869f03b.png

## Estadísticas de secciones

- POST /api/v1/usage/section acepta sólo un enum de sección; sin cuenta, URL, IP, referencia, coordenadas ni contenido de mensajes en el registro.
- La petición omite credenciales. Se agrupa localmente la ruta antes de enviar, incluidos los jardines visitados y el chat flotante.
- Como máximo se intenta registrar una apertura por minuto, pestaña y sección. Se respeta Do Not Track y Global Privacy Control.
- El servidor limita las escrituras anónimas por IP con un bucket corto en memoria. Sólo persiste día de Buenos Aires, sección y conteo; no guarda la clave del visitante en la tabla de uso.
- La migración aditiva 0010_section_usage crea app_section_daily_views. No cambia cuentas, pagos ni datos de plantas.
- GET /api/v1/admin/usage/sections?days=7 o days=30 requiere administrador/moderador y devuelve agregados sin caché. El panel aparece en Administración, junto a las estadísticas existentes.
- Los conteos se empiezan a reunir desde el despliegue; no se inventa historial. Son aperturas aproximadas, no personas únicas, sesiones ni minutos de uso.
- La limpieza mantiene 30 fechas locales y se ejecuta al registrar actividad y después del reinicio diario. El fallo de esta limpieza no revierte el reinicio de la sala.

## Sugerencias y apoyo

El formulario embebido reutiliza la API y la validación existentes. Para visitantes, mantiene el email opcional y la verificación cuando la solicita el servidor. La verificación envía automáticamente el mensaje; un fallo permite obtener un token nuevo y reintentar.

La tarjeta de apoyo empieza cerrada y se llama Ayudanos a mantener la app. Conserva los importes, el alias y el flujo de Mercado Pago existentes. No se hacen cobros durante la verificación.

## Prompts exactos

Todas las llamadas pidieron fondo transparente; se usó la herramienta integrada, sin CLI ni dependencia nueva del proyecto.

### Plantas adultas

```text
Create a transparent production game sprite atlas of TWELVE native Argentine grasses, wild herbs and wetland plants. Attached atlas is STYLE REFERENCE ONLY: original rich hand-painted botanical miniatures, natural detailed leaves, soft upper-left light, slight elevated 2.5D view suitable for isometric garden. Do not copy Forest assets, no logos.
CRITICAL: exactly FOUR columns THREE rows, twelve equal rectangular cells. Keep each ENTIRE plant SMALL within its own cell, about 65% of cell width and height, with VERY WIDE completely TRANSPARENT GUTTERS and outer margins. No plants touching. Every base centered horizontally at bottom of its cell. No text, labels, pots, ground tiles, water patches, shadows or opaque background. Show whole plants, not just trees; genuine varied silhouettes.
ROW1: (1) Nassella tenuissima, fine arching green grass tussock with silky pale wheat-colored fine seed panicles; (2) Paspalum quadrifarium, tall broad-bladed dense green grass clump with rusty-red upright fine seed panicles; (3) Paspalum notatum, LOW spreading green grass with several slender stems ending in two V-shaped seed fingers; (4) Oxalis articulata, small LOW clump of trifoliate heart-shaped green leaves and delicate five-petalled PINK flowers on slim stems.
ROW2: (5) Baccharis articulata, slender upright branching BLUE-GREEN WINGED stems, almost leafless, with tiny cream flower tufts at branch tips; (6) Achyrocline satureioides, small silvery-gray narrow-leaved herb with compact clusters of tiny straw-YELLOW button flowers; (7) Verbena bonariensis, tall sparse branching square stems, small leaves, little flat-topped PURPLE flower clusters; (8) Typha domingensis, upright emergent wetland cattail tuft, long straplike green leaves and two smooth cylindrical BROWN cattail spikes.
ROW3: (9) Schoenoplectus californicus, tall slim upright cylindrical GREEN rush stems with small brown lateral seed clusters; (10) Pontederia crassipes, floating water hyacinth rosette, round glossy green leaves on swollen bulb-like petioles, one small upright LAVENDER flower spike; (11) Pistia stratiotes, LOW floating water lettuce rosette, soft pale-green velvety RIBBED fan-shaped leaves, no flowers, no trunk; (12) Nymphoides indica, LOW cluster of flat round heart-notched floating green leaves and delicate WHITE five-petalled fringed star flowers with yellow centers.
For floating plants show only leaves/flowers at the waterline, no dangling long roots; the game draws its own water below. Maintain species accuracy and natural proportions. Landscape 4:3 atlas.
```

### Plantas jóvenes

```text
Generate the YOUNG GROWTH STAGE atlas corresponding to this exact mature plant atlas. Original detailed hand-painted botanical miniatures, same gentle upper-left lighting and slight elevated 2.5D view. Transparent background, FOUR columns THREE rows, same exact species order. All plants must be genuine juveniles: fewer leaves, fine stems, NO flowers, NO seedheads or brown cattail spikes, no fruit. SMALL inside cells, huge transparent gaps, wide outer padding. Entire plants separated with roots/contact base centered horizontally low in each cell. No labels, text, pots, soil, shadows, water surfaces or backgrounds.
ROW1: 1 Nassella tenuissima juvenile fine wispy green grass tuft; 2 Paspalum quadrifarium young upright strap-leaved grass clump; 3 Paspalum notatum low short grass patch, no seed stems; 4 Oxalis articulata few delicate trifoliate green heart-shaped leaves, no pink flowers.
ROW2: 5 Baccharis articulata several thin upright blue-green winged stems, almost leafless; 6 Achyrocline satureioides small silvery-gray narrow-leaved herb, no flowers; 7 Verbena bonariensis short sparse young branching stems with a few opposite leaves, no flowers; 8 Typha domingensis young emergent tuft of just several long straight strap leaves, NO brown spikes.
ROW3: 9 Schoenoplectus californicus young tuft of just several smooth slim upright green rushes, no seedheads; 10 Pontederia crassipes juvenile floating rosette, 3-4 glossy rounded green leaves with small swollen petioles, no flower; 11 Pistia stratiotes SMALL young pale green water-lettuce rosette of just 5-6 soft ribbed leaves; 12 Nymphoides indica young floating cluster of 2-3 small flat round heart-notched green leaves, no flowers.
For floating species show leaves at waterline with no long dangling roots. Keep the same 12-cell order and isolated game-ready silhouettes.
```

### Brotes flotantes

```text
Create a tiny production sprite atlas with exactly TWO isolated early-stage FLOATING AQUATIC PLANT cutouts on a truly transparent background. Two equal columns, ONE row, large empty gutters and margins, bases at same centered water-contact line. Same richly hand-painted botanical game style as the attached reference, gently elevated 2.5D view, upper-left natural soft light.
LEFT CELL: very newly planted aquatic shoot: one tiny fresh oval green floating leaf unfolding from a small green bud, no exposed brown seed or long stem.
RIGHT CELL: aquatic sprout: a very small loose floating rosette with THREE delicate rounded green leaves, just beginning to unfold.
No flowers, trunks, pots, soil, stones, platforms, shadows, labels, text, background or water surfaces: the game draws its own water. No dangling roots. Keep each specimen small within its cell, natural organic detail, not a cartoon icon. Wide landscape atlas.
```

### Recortes de brotes flotantes

```text
Remove ALL the yellow-green glow, haze, halo, drop shadows and background from these two aquatic plant sprites. Preserve exactly the leaf and bud drawings, colors and their two-column one-row arrangement. Everything outside the crisp natural leaf/bud edges must be fully transparent, not black or tinted. No rim glow. No water, shadow, ground, extra objects or text. Return clean transparent game cutouts with wide clear transparent space around them.
```
