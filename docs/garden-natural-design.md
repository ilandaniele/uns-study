# Jardín natural: rediseño visual

10 de noviembre de 2026.

Se reemplazaron los rellenos planos y las caras del bloque flotante por materiales de suelo originales, orillas erosionadas y pequeñas rocas y plantas de borde. El puente y su geometría se eliminaron. El terreno conserva la proyección y los identificadores de las 25–50 parcelas; su perímetro tiene pequeñas irregularidades deterministas. La cuadrícula permanente se reemplazó por indicadores discretos y la selección conserva foco y teclado.

El río usa suelo visible bajo el agua, colores naturales, ondas y corriente con CSS. Los cuatro biomas comparten los mismos controles y cambian material, vegetación de borde y agua. La animación se pausa fuera de pantalla o en pestañas ocultas y respeta prefers-reduced-motion. Las pequeñas plantas de borde son decoración: no representan compras ni progreso del usuario.

No se modificaron las reglas, el guardado del jardín, la API ni las compras.

## Assets

Generados con la herramienta integrada image_gen de GPT, sin referencias externas. Optimización reproducible con:

```text
pnpm --filter @sala/web exec node scripts/build-native-tree-atlases.mjs --scenery suelo.png orillas.png
```

- apps/web/public/garden/suelos-nativos-gpt-v2.webp: atlas 2×2 de 1024×1024, **355.280 bytes**.
- apps/web/public/garden/orillas-nativas-gpt-v2.webp: atlas transparente 3×2 de 768×576, **100.000 bytes**.
- Total nuevo: **455.280 bytes**, sin nuevas dependencias.

Las texturas representan materiales de juego, no fotografías del edificio ni identificación botánica de especies.

## Prompts finales

### Materiales

```text
Create a production game material atlas: exactly 2 columns by 2 rows, equal square cells, 2048x2048 total, edge-to-edge opaque imagery. Four ORIGINAL natural ground surface textures, photographed straight down orthographic with neutral daylight, premium realistic miniature botanical garden quality, fine coherent details, subtle organic unevenness, no perspective, no objects casting large shadows. TOP LEFT: temperate Argentine pampas meadow, irregular clover-sized fine short grass, small bare loamy patches, tiny dry blades, olive sage greens. TOP RIGHT: lush Argentine riverbank floor, fine moss, dark damp soil, small creeping groundcover, deep natural green. BOTTOM LEFT: Argentine espinal dry grassland floor, light ochre soil, sparse straw grass, fine sand and tiny pebbles, muted warm olive. BOTTOM RIGHT: Patagonian Andean forest floor, deep moss, fine needles, dark earth and tiny weathered mineral grains, cool subdued greens. Each cell independently seamless/repeatable on all four edges and evenly lit, NO distinct large repeated motifs. Cells meet directly with no frame or gutters. No text, labels, grid lines, planting squares, geometric shapes, trees, flowers, bushes, river, bridge, houses, human objects, pots or UI. Material should look richly tactile and natural, without harsh contrast, neon grass or artificial lawn.
```

### Orillas

```text
Original premium realistic botanical miniatures sprite atlas, transparent background, exactly 3 columns and 2 rows, six isolated objects with generous transparent gutters, consistent orthographic isometric camera looking down at 45 degrees, soft daylight from upper left, realistic detailed textures with a restrained warm natural palette, not cartoon, not pixel art. Read left to right TOP ROW: (1) a low organic group of five smooth grey river stones with one pale limestone stone; (2) an airy small clump of slender riverside sedges with a few tawny seedheads; (3) a modest patch of fine dry golden grass mixed with little green blades. BOTTOM ROW: (4) a low rounded moss-covered boulder with two tiny stones at its foot; (5) a small unobtrusive patch of creeping leaves and tiny white native meadow daisies; (6) a delicate low fern rosette with natural irregular fronds. Every object fully contained in its equal cell, grounded on a tiny irregular tuft of earth that fades into transparent alpha, no cast shadows outside the object, bottom root aligned consistently. Highly natural shapes, varied leaves, weathered stones, fine detail intended for a calm realistic garden scene. No rectangular bases, floating blocks, tiles, river, bridge, trees, pots, text, lettering, icons, labels, borders, bright outlines or solid background.
```
