# Componentes y materiales de terceros

La reserva de derechos de `LICENSE` se limita a aportes propios protegibles. No sustituye las licencias de los componentes que utiliza la aplicación.

## Avisos distribuidos

- [Avisos completos de paquetes instalados y fuentes](apps/web/public/legal/third-party-notices.txt). Se generan desde los metadatos y los archivos de licencia instalados, sin incluir rutas locales.
- [Inventario de dependencias](docs/legal/dependencies.json). Es una fotografía de la instalación de Windows de esta versión; no garantiza que coincidan todos los binarios opcionales de Linux/Cloudflare. Deben verificarse de nuevo al redistribuir un build para otra plataforma.
- Los paquetes que no incluyan un archivo de aviso identificable quedan señalados para revisión; un identificador SPDX no demuestra por sí solo que se hayan satisfecho todas las obligaciones.

## Recursos incorporados a la aplicación

| Recurso | Procedencia y condiciones |
| --- | --- |
| Avatares de animales y emojis gráficos | Twemoji, © Twitter, Inc. y otros colaboradores. Gráficos CC BY 4.0. Se renombran/copían SVG; no se reclama autoría de sus dibujos. https://github.com/jdecked/twemoji y https://creativecommons.org/licenses/by/4.0/ |
| Tipografía Archivo | The Archivo Project Authors / Omnibus-Type, SIL OFL 1.1. Aviso original en `apps/web/src/fonts/Archivo-OFL.txt`. |
| Tipografía Geist Mono | © 2023 Vercel, en colaboración con basement.studio, SIL OFL 1.1. Aviso original en `apps/web/src/fonts/GeistMono-OFL.txt`. |
| Iconos de interfaz | Phosphor, a través de `@phosphor-icons/react`, MIT; véase su aviso original en el archivo completo. |
| Fotografía del recuerdo de Ceniza | Documentada como publicada por 8000 y acreditada a @elgordoceniza: https://bahiablanca.substack.com/p/ricoteros-goleador-nutria-y-mas. Excluida de la declaración de autoría y del paquete para registro por indicación del titular el 27 de octubre de 2026. La cita y esa exclusión no equivalen a una licencia de uso de la foto. |

Los textos, fotografías y avatares que aporten usuarios pertenecen a quienes tengan sus derechos. No se incorporan datos ni imágenes de cuentas reales a los expedientes de registro.

## IA y referencias

Los atlas del jardín fueron generados con GPT; su proceso y referencias están en `docs/garden-tree-art.md`, `docs/garden-expansion.md` y `docs/living-garden-video.md`. La consulta de Forest como referencia no implica una licencia de sus recursos ni una relación con sus titulares. No se atribuye al proyecto la autoría de archivos de Forest ni de las fuentes botánicas citadas.

El titular declaró el 27 de octubre de 2026 que el logo, el plano y las imágenes de la sala de día/noche se generaron con IA a partir de material propio. El alcance concreto se documenta en `docs/legal/declarations.json` y en el inventario de recursos; los demás archivos conservan sus estados individuales. La existencia de un commit acredita la presencia de un archivo en una versión, no su autoría ni una cesión de derechos.

## Regeneración

```powershell
pnpm licenses list --prod --json --long > "$env:TEMP/sala-prod-licenses.json"
node scripts/legal/generate-notices.mjs --input "$env:TEMP/sala-prod-licenses.json"
```

No se deben eliminar los avisos de terceros al cambiar la licencia del código propio. Un componente con MPL o LGPL requiere analizar sus obligaciones concretas si se modifica o redistribuye; la mera presencia de ese identificador no transforma automáticamente todo el proyecto en software de esa licencia.
