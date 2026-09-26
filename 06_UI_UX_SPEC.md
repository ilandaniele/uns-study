# UI / UX Specification

## 1. Principles

- Mobile-first.
- Availability must be understandable within seconds.
- The room map is the primary interaction surface.
- Avoid visual clutter.
- Do not expose confidence math unless helpful.
- Avoid turning the product into a booking interface.
- Make anonymous read-only usage frictionless.

## 2. Navigation

Initial mobile navigation can use:

- Sala
- Personas
- Chat
- Ranking
- Perfil

Only `Sala` is required for the first MVP.

Desktop can use a top navigation/header.

## 3. Room page

Top summary:

```text
Sala de Estudio

32 libres
51 ocupados
5 dudosos
20 sin datos
108 total
```

Then:

- interactive SVG room map;
- legend;
- last freshness indication.

## 4. Seat interaction

Tap/click a seat.

Mobile:
- bottom sheet.

Desktop:
- right-side panel or anchored popover.

Display:

- table/bar;
- seat number;
- current status;
- last update recency;
- optional confidence wording.

Anonymous:

> “Iniciá sesión para colaborar.”

Logged in but not validated present:

> “Tenés que estar en la sala para actualizar lugares.”

Eligible user actions:

- `Estoy acá`
- `Está libre`
- `Está ocupado`

Do not add “Reservar”.

## 5. Check-in identity prompt

After successful self check-in, if visibility has not been chosen:

> “¿Querés que otras personas registradas vean que estás sentado acá?”

Actions:

- “Sí, mostrarme”
- “No, mantener privado”

Default privacy should be private.

## 6. Presence errors

Friendly Spanish messages:

### Permission denied
> “Necesitamos tu ubicación sólo para comprobar que estás cerca de la sala. Podés seguir mirando el mapa sin compartirla.”

### Outside geofence
> “Parece que no estás en la sala. Podés mirar la disponibilidad, pero las actualizaciones están habilitadas sólo para personas presentes.”

### Poor accuracy
> “Tu ubicación no tiene suficiente precisión todavía. Probá de nuevo cerca de una ventana o esperá unos segundos.”

### Network
> “No pudimos actualizar el lugar. Tu cambio no fue guardado.”

## 7. State colors

- FREE = green
- OCCUPIED = red
- UNCERTAIN = yellow/amber
- UNKNOWN = neutral gray
- MY_SEAT = blue

Also use icon/shape/label support where practical so color is not the only accessibility signal.

## 8. Zoom and pan

Mobile map should support reasonable pinch/zoom and panning.

Do not build a complex CAD interaction.

Desktop should generally fit the room without requiring zoom.

## 9. People / profile — later

Profile may show:

- avatar;
- chosen display name;
- nickname;
- career;
- subject;
- bio;
- Instagram;
- LU only if enabled;
- Study Mode status.

Every field respects privacy settings.

## 10. Report user — later

Form:

```text
Reportar usuario

Motivo
[ select ]

Descripción
[ textarea ]

Foto opcional
[ Sacar foto ] [ Elegir archivo ]

[ Enviar reporte ]
```

Explain:

> “La evidencia sólo será visible para moderación.”

## 11. Chat — later

Global room chat:

- compact;
- real-time;
- report/block actions;
- no unmoderated rich-media uploads initially.

DM:

- standard thread;
- block/report accessible from conversation menu.

## 12. Ads — later

Never place an ad:

- inside the interactive room plan;
- directly adjacent to `Estoy acá`;
- between seat action buttons;
- as an unavoidable initial modal.

Ad component should be isolated, e.g.:

`<AdSlot placement="room-bottom" />`
