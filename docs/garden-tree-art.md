# Árboles nativos generados con GPT

Arte original para el vivero, las parcelas y los jardines compartidos. Generado el 26 de octubre de 2026 con la herramienta integrada `image_gen` (GPT), sin CLI ni claves de API. Los dibujos tienen volumen, follaje en capas y siluetas diferentes por especie.

Referencia visual: [Forest, sitio oficial](https://forestapp.cc/), en particular sus ilustraciones y dioramas. Sus imágenes se consultaron como referencia; no se distribuyen en el proyecto.

## Archivos finales

- `apps/web/public/garden/arboles-adultos-gpt-v1.webp`: 12 adultos, 1024 × 864 px, 250.636 bytes.
- `apps/web/public/garden/arboles-jovenes-gpt-v1.webp`: 12 jóvenes, 1024 × 864 px, 210.858 bytes.
- `apps/web/public/garden/brotes-gpt-v1.webp`: 4 brotes iniciales, 512 × 576 px, 14.302 bytes.

Total: **475.796 bytes**, menor a 500 KB. Los tres archivos conservan transparencia. Cada celda mide 256 × 288 px y tiene el mismo punto de apoyo en y=270. Los ejemplares iniciales tienen dibujos propios; las doce especies jóvenes y adultas también. La semilla y el brote del pehuén se distinguen de los de hoja ancha. El arte es estático, incluso con prefers-reduced-motion.

Las especies, tiempos, saldos, compras, horas registradas y permisos de compartir siguen definidos por las reglas del jardín. Este cambio solo reemplaza la presentación de las plantas.

## Preparación de los assets

`apps/web/scripts/build-native-tree-atlases.mjs` detecta los espacios transparentes entre dibujos, recorta cada ilustración completa, reduce su tamaño y alinea las raíces antes de reunirlas en hojas WebP. No dibuja follaje ni modifica el contenido generado. Solo se comitean los WebP optimizados.

Desde `apps/web`:

```sh
node scripts/build-native-tree-atlases.mjs adultos.png jovenes.png brotes.png
```

El script usa la dependencia existente sharp, conserva el canal alfa y comprueba el límite de 500.000 bytes. No se agrega ninguna dependencia. Las variantes por parcela se reflejan horizontalmente conservando el punto de apoyo.

## Prompts finales

### Adultos: generación

```text
Use case: stylized-concept.
Asset type: one production-ready transparent sprite atlas for a cozy isometric Argentine native-tree garden game.
Create a single landscape 4-column by 3-row atlas, EXACTLY 12 isolated mature trees, one per equally sized square cell, in the exact reading order below. Aim for 2048x1536. Every tree must fit entirely inside its cell with at least 8% transparent padding, trunk base at the same baseline about 90% down the cell. No overlapping cells.
Art direction: beautiful premium hand-painted 2.5D game illustrations, reminiscent of the lush collectible forest dioramas in Forest focus app. Original botanical assets, soft dimensional foliage with irregular clustered leaves, beautifully readable silhouettes, warm wooden trunks, soft upper-left lighting, layered leaf color, gentle ambient occlusion. Rich natural greens with luminous spring flowers. Crisp edges, appealing at only 60–160 pixels wide, neither noisy photorealism nor flat circles/SVG blobs, not plastic toys. Consistent slightly elevated orthographic/isometric camera, trees upright with visible top surfaces of the canopy. A tiny soft contact shadow directly below each trunk is allowed; genuinely transparent alpha everywhere else. NO landscape, NO tiles, NO circular ground disks, NO pots, NO text, NO labels, NO borders, NO background, NO checkerboard.
Exact cells, left to right:
Row 1:
1 Espinillo (Vachellia caven): modest spreading thorny acacia, feathery olive-green foliage, branching brown trunk, small bright golden-yellow pompom flower clusters.
2 Tala (Celtis tala): dense irregular rounded crown, small warm-green oval leaves, gnarled branching gray-brown trunk, a few tiny orange fruits; no showy flowers.
3 Ceibo (Erythrina crista-galli): broad sculptural crown, broad trifoliate leaves, crooked stout brown branching trunk, recognizable clusters of scarlet curved coral-tree flowers.
4 Chañar (Geoffroea decorticans): airy small spreading crown, blue-gray green foliage, visible peeling green and ochre bark, delicate golden yellow flowers.
Row 2:
5 Algarrobo blanco (Neltuma alba): broad low umbrella canopy of fine light-green compound leaves, thick rough forked trunk, a few slender hanging tan seed pods.
6 Jacarandá (Jacaranda mimosifolia): graceful wide airy crown, fernlike green leaves, abundant lavender-purple clustered trumpet blossoms, elegant branching brown trunk.
7 Aguaribay (Schinus areira): graceful weeping silhouette, long drooping sprays of narrow dark-green pinnate leaves, delicate clusters of pink peppercorn berries, bent trunk.
8 Palo borracho rosado (Ceiba speciosa): unmistakable bulbous bottle-shaped green trunk with fine conical spines, wide rounded dark-green canopy, scattered large pink five-petaled flowers.
Row 3:
9 Caldén (Neltuma caldenia): old rugged dark branching trunk, asymmetrical broad flat umbrella canopy, fine dusty olive-green foliage, open spaces between main limbs.
10 Lapacho rosado (Handroanthus heptaphyllus): upright branching brown trunk, spectacular rounded crown of abundant pale-to-rich pink trumpet flower clusters, very little green foliage.
11 Arrayán (Luma apiculata): multiple twisting smooth cinnamon-orange trunks, dense deep emerald oval-leaf crown, tiny ivory white flowers.
12 Pehuén (Araucaria araucana): tall straight gray ridged trunk, distinctive evenly tiered horizontal upward-curving branches clothed in stiff dark-green triangular leaves, mature open umbrella-like crown. NOT a generic Christmas pine.
All twelve must be visibly distinct, consistent in rendering style and visually grounded at their trunk base. Render only this atlas.
```

### Adultos: ajuste de separación

```text
Edit the provided tree atlas ONLY to correct spacing for game sprite extraction. Preserve all twelve exact Argentine tree identities, their order, colors, detailed painted 2.5D rendering, distinct silhouettes and transparent background. Do not redesign or add trees.
Re-layout as a strictly regular 4-column by 3-row grid of equal square cells on a landscape 4:3 canvas. Each tree is centered in its OWN cell and must be SMALLER: its complete visible bounding box must fit within the central 70% of the cell width and 78% of its height. Keep every last leaf and all branches fully contained, no clipping. Put trunk bases at 88% down each individual cell. At least 15% completely transparent gutter on each side of every tree. Do not enlarge wide species to fill empty gaps. The broad calden and algarrobo must fit entirely within their own cells too.
No overlap or touching between any trees, rows, shadows or cell edges. Clean transparent alpha, no colored halo, no matte/background, no text, no grid lines or labels, no soil platforms. Keep all twelve trees in their existing row-major order, one tree per cell, total twelve.
```

### Jóvenes (referencia: hoja adulta)

```text
Use case: stylized-concept. Asset: one transparent growth-stage sprite atlas.
Use the supplied mature-tree atlas as the STYLE AND SPECIES reference. Create the YOUNG juvenile version of each of the same twelve Argentine native tree species, preserving their exact left-to-right, top-to-bottom species order in a 4-column 3-row layout. Keep the same beautiful dimensional hand-painted game rendering, upper-left light, crisp contours, natural palette and slightly elevated orthographic camera.
These must look truly YOUNG: slender trunks, a few graceful small branches, smaller and more open crowns, fresh green foliage, visible thin stems. NO large mature flowers, berries, pods, thick old trunks or huge adult crowns. A young palo borracho has a gently swollen slim green stem; a young pehuén has a small conical arrangement of stiff tiered needle branches (NOT a Christmas pine); a young aguaribay already has lightly drooping feathery branches; arrayán has cinnamon slender branching stems. Each young species must be visibly distinguishable by foliage and branching.
Exact row-major order:
Row 1: Espinillo/Vachellia caven; Tala/Celtis tala; Ceibo/Erythrina crista-galli; Chañar/Geoffroea decorticans.
Row 2: Algarrobo blanco/Neltuma alba; Jacarandá/Jacaranda mimosifolia; Aguaribay/Schinus areira; Palo borracho/Ceiba speciosa.
Row 3: Caldén/Neltuma caldenia; Lapacho rosado/Handroanthus heptaphyllus; Arrayán/Luma apiculata; Pehuén/Araucaria araucana.
A SINGLE 4:3 landscape atlas with exactly twelve separated juvenile trees, one in each equal square cell. Whole individual tree with clean transparent gutter on all sides, at least 15% cell padding, stem bases aligned near 88% down each cell. No overlap, no clipping, no ground disks, pots, tiles or scenes. Tiny contact shadow at stem base only. Actual alpha transparency, no matte, no labels, text, grid, logos, watermarks or checkerboard. Optimize silhouettes for a cozy small isometric garden.
```

### Semillas y brotes (referencia: hoja adulta)

```text
Use case: stylized-concept. Asset: one transparent 2-column by 2-row game sprite atlas with FOUR early plant growth stages.
Match the beautiful dimensional hand-painted game art, natural greens, warm soil, upper-left light, crisp edges and elevated orthographic camera of the supplied Argentine tree illustration reference. Create four SMALL delicate seedling cutouts, placed far apart in a strict 2x2 grid with ample transparent margins and all stem bases at the same local baseline.
Top left: a newly germinated broadleaf tree seed with one tiny short green stem and exactly two fresh cotyledon leaves, emerging from a tiny dark-brown crumble of earth.
Top right: a slightly taller broadleaf seedling with a slender green-brown stem, two small side branches and four to six delicate leaves, rooted in a tiny crumble of earth.
Bottom left: a newly germinated Araucaria araucana (pehuén) seedling, short straight stem with a very small tuft of stiff narrow pointed green seedling leaves, a subtle small tan seed remnant by its base.
Bottom right: a slightly taller juvenile Araucaria araucana (pehuén) seedling with a slender straight gray-green stem and two small tiers of stiff triangular pointed leaves.
These are early growing plants, NOT adult trees shrunk down, NO flowers, no fruits, no mature crowns. Keep natural species-appropriate leaves. Entire plant including base, crisp transparent alpha; tiny soft shadow directly underneath. NO pots, circles, terrain platforms, landscape, people, labels, lettering, backgrounds, borders, decorative sparkles or checkerboards. Total four separated drawings only.
```
