# Ampliación del vivero nativo — 26 de octubre de 2026

Se agregan 24 especies a las 12 existentes. Los dibujos son ilustraciones originales generadas con la herramienta integrada GPT de generación de imágenes; no se incorporan imágenes ni archivos de Forest. El atlas existente se usó como referencia de estilo. Son representaciones de juego, no láminas para identificar plantas silvestres.

## Archivos finales y presupuesto

En `apps/web/public/garden/`:

| Archivo | Bytes |
| --- | ---: |
| arboles-extra-adultos-gpt-v1.webp | 137018 |
| arboles-extra-jovenes-gpt-v1.webp | 96464 |
| plantas-nativas-adultos-gpt-v1.webp | 120020 |
| plantas-nativas-jovenes-gpt-v1.webp | 74130 |
| brotes-nativos-gpt-v1.webp | 17194 |
| **Nuevos assets** | **444826** |

Se conservan los tres atlas anteriores (475796 bytes). El catálogo completo de 36 especies y todas sus etapas suma **920622 bytes**, no se descarga un archivo por planta. La pestaña inicial muestra árboles y usa 387654 bytes de atlas adultos; las demás familias y etapas usan sus atlas cuando se dibujan. Una escena con varias etapas puede requerir archivos adicionales.

La normalización sólo recorta márgenes transparentes, escala y empaqueta; no pinta ni altera la anatomía generada. Cada celda mide 256×288 y el punto de apoyo está en (128,270). El tamaño máximo de las ilustraciones nuevas es 160×186 antes de empaquetar; se reutilizan en las miniaturas y en el jardín sin agrandar el mapa de la sala.

## Reproducir los atlas

Desde `apps/web`:

```powershell
node scripts/build-native-tree-atlases.mjs --expansion arboles-adultos.png arboles-jovenes.png plantas-adultas.png plantas-jovenes.png brotes.png
```

Fuentes GPT seleccionadas (en el directorio de imágenes generadas de Codex; no se publican los PNG originales pesados):

- Árboles adultos: exec-e7c956fe-e00f-459a-9c08-095261867066.png
- Árboles jóvenes: exec-5e4acdb4-f87e-49f5-8359-aa7aae85d45d.png
- Plantas adultas: exec-d8d97466-919b-4b04-8909-fc2357ed25eb.png
- Plantas jóvenes: exec-cf1b2b64-afd5-40dc-bc57-29a5bdd3d189.png
- Brotes: exec-b8d06ae3-cb17-4c39-a3b1-eef17c52b463.png

## Fuentes botánicas

Cada especie conserva su enlace oficial en `packages/contracts/src/garden-native-species.ts`. Se consultó el [Sistema de Información de Biodiversidad de Parques Nacionales](https://sib.gob.ar/), el [catálogo de árboles de Argentina](https://www.argentina.gob.ar/node/492317), [SINAVIMO](https://www.sinavimo.gob.ar/cultivos/aspidosperma-quebracho-blanco), el [Jardín Botánico de Buenos Aires](https://buenosaires.gob.ar/gcaba_historico/jardinbotanico/senderofloranativa), [Provincia de Buenos Aires](https://www.gba.gob.ar/node/26830) y el [catálogo oficial de cactus de Rio Grande do Sul](https://sema.rs.gov.br/upload/arquivos/201708/25132604-cactos-do-rio-grande-do-sul-compressed.pdf) (distribución de Parodia mammulosa en Argentina, Brasil y Uruguay). El cardón figura como Trichocereus terscheckii en SIB, con Echinopsis terscheckii como sinónimo.

Los tiempos de crecimiento son virtuales. No se cambian el precio del paquete de semillas, el cálculo de horas ni la acreditación de pagos.

## Visitas y permisos

Los jardines se pueden visitar siempre desde el perfil por otras personas con sesión. Las visitas exponen sólo plantas y colección. Se mantienen los bloqueos en ambas direcciones, la comprobación de usuario existente y los encabezados privados sin caché. El saldo, las compras y el historial no forman parte de la respuesta de visita.

Las filas existentes con `shared=false` también son visitables, sin migrar ni reescribir balances. El campo `shared` y la ruta anterior de visibilidad se conservan por compatibilidad con pestañas antiguas; responden con visibilidad habilitada y no ofrecen un control en la interfaz.

El botón de hacer admin usa la capacidad `canManageAdmins` del propietario y la ruta de administración existente. La API vuelve a comprobar propietario con correo verificado y registra la acción en auditoría. Las pruebas de navegador usan permisos y escrituras simulados; no promueven cuentas reales.

## Prompts exactos

Modo: herramienta integrada; fondo transparente en todas las llamadas.

### Árboles adultos

```text
Create a production game sprite atlas of TWELVE DIFFERENT ARGENTINE NATIVE TREES at mature size. The attached atlas is STYLE REFERENCE ONLY: keep its richly painted botanical miniature quality, detailed natural branching and leaves, soft upper-left lighting, 2.5D slightly elevated view compatible with an isometric garden. Original illustrations, no Forest assets or logos. Transparent background.
CRITICAL layout: exactly FOUR columns and THREE rows, twelve separate centered cutouts in equal rectangular cells. Keep VERY WIDE EMPTY TRANSPARENT GUTTERS between every crown, and margins all around. Each whole plant entirely contained within its cell; absolutely no overlapping or touching sprites. No labels, text, pots, ground tiles, grass, shadows below roots, checkerboard or opaque background. A visible trunk/root contact point centered horizontally near the bottom of every cell. Natural realistic botanical silhouettes, harmonious restrained foliage; readable at 120px.
Exact row-major order:
ROW1: (1) Ombú Phytolacca dioica, massive swollen buttress roots and broad bright green crown; (2) Sauce criollo Salix humboldtiana, fine narrow leaves, elegant drooping green branches; (3) Timbó Enterolobium contortisiliquum, spreading flat umbrella crown, strong trunk, fine leaflets and a few dark curled ear-shaped pods; (4) Tipa Tipuana tipu, airy spreading crown with sprays of yellow flowers.
ROW2: (5) Ibirapitá Peltophorum dubium, rounded tall crown, fernlike leaves and dense yellow blossom clusters; (6) Peteribí Cordia trichotoma, tall straight gray-brown trunk, broad leaves and delicate cream flower panicles; (7) Guayacán Libidibia paraguariensis, compact irregular dark-green crown, fine leaflets and dark deeply textured trunk; (8) Quebracho colorado Schinopsis balansae, sturdy rough reddish-brown deeply fissured trunk, dense dark green foliage.
ROW3: (9) Quebracho blanco Aspidosperma quebracho-blanco, pale fissured bark, narrow leathery leaves, sparse olive green airy crown; (10) Yerba mate Ilex paraguariensis, glossy oval dark green leaves, bushy small tree with a few tiny red berries; (11) Lenga Nothofagus pumilio, Patagonian tree, branching gray trunk, richly textured AUTUMN amber and copper foliage; (12) Notro Embothrium coccineum, graceful small tree with narrow leaves and vivid scarlet tubular flower clusters.
Distinguish all silhouettes and trunks; avoid generic round lollipop trees. Atlas landscape aspect 4:3.
```

### Separación de árboles adultos

```text
Edit ONLY the arrangement and padding of this twelve-tree transparent atlas. Preserve every species, exact row-major order, botanical style and transparency. Current crowns touch: fix this for production sprite extraction. Keep exactly FOUR equal columns and THREE equal rows. SHRINK EACH WHOLE TREE to 65% of its current size and center it in its own cell. Every crown, branch and root must have a clear fully TRANSPARENT moat around it, with at least 50px clear horizontal gaps and 40px vertical gaps. Do not add text, background, ground or shadows. Do not crop trees or merge crowns. Preserve all twelve distinct tree designs. Transparent landscape atlas 4:3.
```

### Árboles jóvenes

```text
Create YOUNG SAPLING growth-stage companions for the twelve mature Argentine trees in this reference atlas. Keep the EXACT FOUR column THREE row arrangement, exact species order, hand-painted detailed botanical 2.5D style, lighting, transparency and generous blank padding. Every sapling has a thin juvenile trunk and sparse small developing crown, NOT simply a tiny adult; fewer branches/leaves, no flowers, fruit or pods. Each root contact centered bottom of its cell. WIDE TRANSPARENT GUTTERS. No pots, background, shadows, grass, ground, text, labels or extra sprites.
ROW1: Ombú Phytolacca dioica (young pale slightly swollen stem, broad green leaves); Sauce criollo Salix humboldtiana (thin upright stem with narrow slightly drooping leaves); Timbó Enterolobium contortisiliquum (fine bipinnate foliage, small open umbrella); Tipa Tipuana tipu (thin branching stem, paired leaflets).
ROW2: Ibirapitá Peltophorum dubium (fine fernlike compound leaves); Peteribí Cordia trichotoma (straight stem, broad leaves); Guayacán Libidibia paraguariensis (small fine-leaf bushy sapling); Quebracho colorado Schinopsis balansae (slender brown stem, developing green crown).
ROW3: Quebracho blanco Aspidosperma quebracho-blanco (pale thin stem, narrow olive leaves); Yerba mate Ilex paraguariensis (glossy oval green leaves, no berries); Lenga Nothofagus pumilio (small rounded serrated leaves, young autumn amber foliage); Notro Embothrium coccineum (narrow evergreen leaves, no flowers).
Keep all twelve whole and clearly separated inside their equal cells.
```

### Palmeras, flores, pastos y cactus adultos

```text
Production botanical game sprite atlas, TWELVE ARGENTINE NATIVE PLANTS, exactly FOUR columns THREE rows on a truly TRANSPARENT background. Attached image is STYLE REFERENCE ONLY, match its finely hand-painted natural botanical miniatures, realistic leaf detail and organic silhouettes, gentle upper-left light, slight elevated 2.5D view for an isometric garden. Original illustration, no game logos or copied assets.
Every whole plant is isolated in an equal cell with WIDE EMPTY TRANSPARENT GUTTERS and large margins, not touching or crossing any cell boundary. Center root contact at bottom. No pots, dirt platforms, scenery, text, labels, ground shadows or checkerboard. Naturally varied heights: grass/herbs and round cactus smaller than palms, do not turn shrubs into trees.
Exact row-major order:
ROW1: 1 Yatay Butia yatay, arched blue-green feather palm fronds and thick textured trunk; 2 Pindó Syagrus romanzoffiana, slender smooth gray trunk, feathery lush green fronds with a small orange fruit cluster; 3 Caranday Trithrinax campestris, short thick fibrous trunk and stiff SILVER-GREEN FAN-shaped fronds; 4 Guarán Tecoma stans, branching leafy shrub with many yellow TRUMPET flowers.
ROW2: 5 Sen del campo Senna corymbosa, leafy bush with paired leaflets and loose clusters of five-petalled yellow flowers; 6 Plumerillo rojo Calliandra tweedii, ferny shrub and RED POWDERPUFF filament blossoms; 7 Margarita punzó Glandularia peruviana, LOW spreading leafy herb with flat heads of tiny SCARLET five-petalled flowers; 8 Salvia azul Salvia guaranitica, herbaceous stems with deep COBALT BLUE tubular flowers and serrated leaves.
ROW3: 9 Cortadera Cortaderia selloana, arching tuft of narrow green grass blades, tall ivory feathery plumes; 10 Cardón Echinopsis terscheckii, huge ribbed green branching columnar cactus with two lifted arms and fine golden spines, no leaves; 11 Quimil Opuntia quimilo, open branching cactus with large FLAT BLUE-GRAY OVAL PADS and a few small RED flowers, no green tree leaves; 12 Cactus bola Parodia mammulosa, squat ROUND RIBBED cactus, cream spines, one YELLOW funnel flower, no trunk.
Landscape 4:3 atlas. All twelve distinct and botanically recognizable at thumbnail size. No stylized emoji or flat vector blobs.
```

### Separación de plantas adultas

```text
Edit ONLY layout and spacing of this twelve-plant transparent atlas, preserving every plant's exact botanical design, colors and FOUR column THREE row order. The current row 2 shrubs touch row 3 plants: fix this. SHRINK each whole plant to 65% of its current size, center it inside its equal grid cell, keep each base near the bottom of its own cell. Leave at least 50px clear FULLY TRANSPARENT gaps both horizontally and vertically between every sprite, generous outer padding. No clipping, no merging, no text, no background, ground, shadow, or pots. Keep all twelve whole sprites, including tiny spines and palm frond tips. Transparent landscape 4:3.
```

### Plantas jóvenes

```text
Create the YOUNG GROWTH STAGE companion to this 12-plant atlas. Preserve exact species order FOUR columns THREE rows and the same detailed botanical hand-painted 2.5D style, lighting and transparent background. Young plants are genuinely juvenile, with sparse leaves, small shoots, thin trunks where appropriate and NO flowers, fruit or seed plumes. Do not just shrink mature plants. Make all sprites fit comfortably in their cells with large FULLY TRANSPARENT GUTTERS and wide outer margins, center root at bottom. No pots, dirt, scenery, ground, shadow, text or labels.
ROW1: 1 juvenile yatay feather palm, short base and a few blue-green fronds; 2 juvenile pindó feather palm with short slender base and several green fronds; 3 juvenile caranday palm, low base, three silver-green FAN leaves; 4 guarán seedling shrub, leafy short forked stems, no flowers.
ROW2: 5 young Senna corymbosa, delicate paired leaflets; 6 young Calliandra tweedii, fine fernlike leaves, no red puffs; 7 Glandularia peruviana, a small low mat with a few leaves; 8 Salvia guaranitica, a few stems of serrated green leaves.
ROW3: 9 Cortaderia selloana juvenile GRASS clump, green blades only, NO plumes; 10 Echinopsis terscheckii juvenile single short ribbed cactus column, NO arms, no leaves; 11 Opuntia quimilo juvenile two or three blue-green flat oval pads and spines, no flowers; 12 Parodia mammulosa tiny spherical ribbed cactus with cream spines, no flower.
Keep all twelve separated, slightly smaller within cells than the mature source, natural proportions and visibly different silhouettes.
```

### Germinación por tipo de planta

```text
A production game sprite atlas of EIGHT very early plant growth cutouts, transparent background, FOUR columns TWO rows. Same richly hand-painted miniature botanical style and upper-left lighting as the attached reference, slightly elevated 2.5D garden view. No scenery, ground, dirt, pots, shadows, labels, numbers or text. Each whole sprite centered horizontally low in its cell, SMALL with generous FULLY TRANSPARENT margins and wide empty gutters. These are newly germinated seedlings, not adult miniatures.
ROW1 exactly: 1 freshly germinated palm seed, tiny split oval tan seed and ONE tiny green spear rising; 2 palm sprout with three narrow juvenile strap leaves (not a trunk, not mature fronds); 3 cactus germinating seed, tiny pale seed husk and tiny rounded green shoot with no leaves; 4 cactus sprout, small ribbed green green oval with a few delicate spines, NO leaves or flowers.
ROW2 exactly: 5 grass germination, tiny pale oval seed with one short fine blade; 6 grass sprout, five thin arching green blades in a small tuft, no plumes; 7 herb germinating, tiny brown seed and two very small cotyledons; 8 herb sprout, short tender green stem with two pairs of small developing leaves.
Consistent root contact at bottom, no exposed long roots. Eight clearly isolated specimens in their exact grid cells.
```
