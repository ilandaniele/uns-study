# Jardín nativo: paisajes y vivero

Actualizado el 10 de noviembre de 2026.

## Experiencia

Cada cuenta conserva una semilla de paisaje estable. Ocho trazados combinan dos orientaciones, curvas de distinta amplitud y arroyos rectos. Las orillas y las parcelas comparten la misma proyección para evitar tierras superpuestas. El cauce es más angosto y de ancho variable; las ondas y la corriente se animan con CSS, sin JavaScript por cuadro. Se detienen fuera de pantalla, al ocultar la pestaña y con `prefers-reduced-motion`.

El selector de Bosque, Vivero y Colección sigue la sección visible. Su altura y la del encabezado determinan los márgenes de desplazamiento y la posición del filtro del vivero. Los filtros muestran cinco especies y una vista parcial de las cinco siguientes; ampliar siempre requiere una acción explícita.

Las ampliaciones existentes siguen habilitándose al plantar las parcelas requeridas. Agregan cinco parcelas a cambio de semillas, hasta 50, con precio visible y confirmación. No se modificaron compras reales, beneficios Pro, horas de estudio ni recompensas existentes.

## Colaboración

Los desbloqueos permanentes son cosméticos: Pampa inicial; Ribera a los 5 lugares; Espinal a los 15; Andino a los 30. Algunas especies nuevas requieren 5, 10 o 15 lugares. Las 60 especies anteriores mantienen su acceso.

Se usa el historial canónico de colaboraciones aceptadas: un lugar por cuenta y día, con validación de presencia, límites diarios y exclusión de reportes masivos y del propio asiento. Los créditos anteriores cuentan. El servidor vuelve a comprobar el progreso en la transacción de selección o plantación; el cliente no puede enviar progreso, saldo ni permisos. Visitar un jardín muestra su bioma, plantas y colección, sin saldo, horas ni progreso privado. Foco básico y las funciones Pro conservan sus condiciones.

## Ilustraciones originales

Generadas con la herramienta integrada `image_gen` de GPT, sin imágenes de referencia externas. Son ilustraciones de juego, no láminas de identificación botánica.

| Archivo en `apps/web/public/garden/` | Tamaño |
| --- | ---: |
| `biomas-nativos-adultos-gpt-v1.webp` | 159.048 bytes |
| `biomas-nativos-jovenes-gpt-v1.webp` | 83.160 bytes |
| Total nuevo | 242.208 bytes |

Cada atlas tiene 12 celdas de 256 × 288, con contenido recortado por alfa, escalado al tamaño de uso y anclado a la raíz. El script `apps/web/scripts/build-native-tree-atlases.mjs --biomes adulto.png joven.png` reproduce la optimización. Las etapas iniciales reutilizan brotes del tipo correspondiente.

Orden: lirio azul, lirio del pastizal, salvia colorada, pañil, chaguar, pasto miel, cactus de flor larga, tunilla, azolla, elodea, amapola de agua, espiga de agua.

## Prompts de generación

Adultos:

```text
Use case: stylized-concept. Asset type: production game botanical sprite atlas. Create an ORIGINAL high quality semi-realistic hand-painted 3D-like botanical game sprite sheet, not a copy of another app. Transparent background with real alpha, no floor/background/checkerboard/grid/labels/text/pots/landscape. Exactly 12 separate adult plant cutouts in a perfectly regular 4-column by 3-row grid, all upright at a coherent 30-degree elevated isometric camera, soft upper-left lighting, natural detailed leaves and botanical silhouettes, warm green palette, delicate highlights and shadows within the foliage. Each cell has generous transparent gutters at least 25px, no overlapping neighboring plants. Show entire root contact/tiny soil mound or tiny water pad at bottom center of each cell; all bottom contact points aligned by row. Species ORDER left-to-right then top-to-bottom: ROW1: 1 Sisyrinchium chilense, clump of slender grasslike leaves and tiny six-petalled blue-violet flowers with yellow eyes; 2 Herbertia lahue, short irislike leaves and violet iris flowers with three broad outer petals; 3 Salvia coccinea, branching herb with red tubular flowers on slender upright spikes; 4 Buddleja globosa, small dense broad-leaf shrub with clusters of orange spherical flowers. ROW2: 5 Bromelia serra, broad thorny strap-leaf rosette green outside and muted red inner leaves, low plant no trunk; 6 Paspalum dilatatum, natural tuft of green grass with several delicate lateral seed spikes; 7 Echinopsis eyriesii, cluster of ribbed green round cactus heads with a long trumpet-shaped pale pink flower; 8 Opuntia sulphurea, low cluster of flattened spiny oval pads with yellow flowers. ROW3: 9 Azolla filiculoides, very low small floating mat of tiny fernlike green-russet fronds; 10 Egeria densa, several upright green aquatic stems with whorled small narrow leaves, one tiny white flower, grounded in a tiny water pad; 11 Hydrocleys nymphoides, low aquatic plant with rounded glossy floating leaves and large pale yellow cup flowers; 12 Pontederia cordata, clump of broad heart-shaped/lanceolate leaves with tall violet-blue flower spikes rooted on a tiny water pad. Botanical variation and clean readable silhouettes matter more than excessive ornaments. Mature plants, detailed high resolution natural illustration, each plant centered and isolated, transparent background.
```

Jóvenes: el mismo orden y composición, solicitando versiones de menor tamaño, con menos hojas, brotes y botones florales en lugar de ejemplares adultos, manteniendo las raíces apoyadas y el fondo transparente.

## Fuentes botánicas

Catálogo SIB de la Administración de Parques Nacionales, consultado el 10/11/2026:

- https://sib.gob.ar/especies/sisyrinchium-chilense
- https://sib.gob.ar/especies/herbertia-lahue
- https://sib.gob.ar/especies/salvia-coccinea
- https://sib.gob.ar/especies/buddleja-globosa
- https://sib.gob.ar/especies/bromelia-serra
- https://sib.gob.ar/especies/paspalum-dilatatum
- https://sib.gob.ar/especies/echinopsis-eyriesii
- https://sib.gob.ar/especies/opuntia-sulphurea
- https://sib.gob.ar/especies/azolla-filiculoides
- https://sib.gob.ar/especies/egeria-densa
- https://sib.gob.ar/especies/hydrocleys-nymphoides
- https://sib.gob.ar/especies/pontederia-cordata

Las descripciones son propias y breves; las imágenes pueden simplificar rasgos. Los paisajes son ambientaciones visuales y no restricciones ecológicas o recomendaciones de cultivo.
