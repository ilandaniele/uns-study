# Orillas, agua y ecorregiones del jardín

10 de noviembre de 2026.

## Corrección de piedras

El anclaje anterior situaba el punto de contacto sobre el límite del terreno. La base del sprite sobresalía aunque su punto estuviera en la orilla. Ahora se comprueba una elipse de contacto completa contra todos los segmentos de la orilla: se transforma a un círculo unitario y se rechazan intersecciones con cualquier borde. Se busca una posición interior hacia parcelas cercanas, con un tamaño menor como alternativa y separación entre decoraciones. Se agrega una sombra de contacto. No se recorta la parte alta de las piedras ni se alteran plantas o parcelas guardadas.

Las pruebas independientes muestrean el perímetro de cada huella en las 192 combinaciones de capacidad (25–50) y semilla de paisaje (32 variantes), además del caso de una piedra anclada en una esquina.

## Agua

Atlas original con dos materiales: fondo de guijarros sumergidos y superficie con pequeñas ondas y reflejos. El fondo queda fijo; dos capas de reflejos avanzan a distinta escala y velocidad dentro del cauce. Se quitaron las líneas discontinuas artificiales y se afinó el borde. Los patrones llenan su viewport sin bandas vacías. La animación se pausa fuera de pantalla, con la pestaña oculta y bajo prefers-reduced-motion.

## Diez paisajes

Se conservan los cuatro paisajes anteriores y sus requisitos. Se agregan:

| Paisaje | Colaboraciones aceptadas | Referencia oficial |
| --- | ---: | --- |
| Selva Paranaense | 40 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/selva-paranense |
| Yungas | 50 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/yungas |
| Monte de Sierras y Bolsones | 60 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/monte-de-sierras-y-bolsones |
| Estepa Patagónica | 70 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/estepa-patagonica |
| Puna | 80 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/puna |
| Esteros del Iberá | 100 | https://www.argentina.gob.ar/parquesnacionales/ecorregiones/esteros-del-ibera |

Fuentes de APN consultadas el 10/11/2026. Descripciones originales breves, ilustraciones ambientales de juego y no recomendaciones de cultivo. Las especies existentes pueden plantarse en todos los paisajes. Los umbrales usan el mismo historial validado de lugares distintos por día: no se crean créditos nuevos ni se cambian premios o Pro. El servidor verifica el requisito y conserva el paisaje para el dueño y sus visitantes. No requiere migración de base de datos.

## Assets y generación

Herramienta integrada image_gen de GPT, sin fotos externas. Sólo se redimensionó y optimizó el resultado con Sharp ya instalado.

- apps/web/public/garden/ecorregiones-argentinas-gpt-v3.webp: 1152×768, atlas 3×2, **286.510 bytes**. Cada celda de 384×384 se proyecta en las coordenadas lógicas existentes del jardín.
- apps/web/public/garden/agua-arroyo-gpt-v3.webp: 1024×512, atlas 2×1, **80.298 bytes**.
- Total nuevo: **366.808 bytes**. No se agregaron dependencias.

Reproducción: `pnpm --filter @sala/web exec node scripts/build-native-tree-atlases.mjs --ecoregions suelo.png agua.png`.

### Prompt de materiales

```text
Production seamless terrain material atlas for a realistic Argentine botanical garden, exactly THREE columns and TWO rows of equal square cells, 1536x1024 composition, straight overhead orthographic photography, opaque edge-to-edge, no dividers/gutters, no text or labels. SIX clearly different native Argentine ecoregion ground textures in this exact reading order. Top left SELVA PARANAENSE: deep red lateritic soil with humid small broadleaf litter, dark green low moss patches, a few tiny decomposing twigs. Top middle YUNGAS: cloudy montane forest humus, fine brown damp fallen leaves, abundant delicate low moss, subdued cool green, fine ground texture. Top right MONTE DE SIERRAS Y BOLSONES: pale warm ochre sandy gravel, fine dry soil with scattered tiny low grey-green drought groundcover, natural mineral grains, arid. Bottom left ESTEPA PATAGONICA: wind-worn grey-brown stony earth with sparse low straw-colored grass tufts and fine cold mineral gravel, subdued sage. Bottom middle PUNA: pale tawny high altitude gravel, dusty muted reddish mineral patches, tiny sparse compact straw tussocks, occasional pale small stones, distinctly dry and open. Bottom right ESTEROS DEL IBERA: very damp deep green fine sedge groundcover, short fine marsh grass, small dark wet organic soil patches, subtle low creeping vegetation. All cells are neutral even daylight and independently tileable across edges, no obvious repeating macro motifs. Real tactile fine-scale details compatible with miniature isometric garden rendering. No large plants, trees, flowers, rocks bigger than tiny gravel, water channels, river, island, bridges, perspective, shadows across the image, artificial lawn, squares, frames, paths, structures or UI.
```

### Prompt del agua

```text
A realistic river material texture atlas, exactly TWO equally sized square panels side by side, 1536x768 composition, seamless opaque edge-to-edge material photography straight overhead, natural soft daylight, no frame or gap. LEFT PANEL: shallow clean stream water over many small irregular rounded pebbles in muted grey, brown, mossy olive and pale sand, refracted underwater appearance with delicate naturally irregular light caustics, pebbles are small fine texture, not large boulders, water is clear with subtle green tint, no bank visible. RIGHT PANEL: deeper calm natural river surface with fine irregular low ripples, soft fragmented reflections of sky and distant vegetation, dark slate blue-green mixed with subdued silvery green reflections, gently undulating, NOT wavy ocean, NOT high contrast or plastic, no foam or bubbles. Both cells independently tileable; broad smooth lighting, realistic subtle reflections, detailed small-scale patterns without obvious repetition, no distinct straight or dashed lines, arrows, grid, drawings, labels, boats, animals, shore, land or buildings. Intended as layered textures clipped to a small meandering garden stream; the user must visibly perceive real water rather than a flat painted blue ribbon.
```
