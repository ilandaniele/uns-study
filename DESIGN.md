---
name: Sala de Estudio
description: Live, crowd-verified seat map for one study room, readable in seconds like the building's own signage.
colors:
  primary: "#0f6e7e"
  primary-deep: "#0a5562"
  primary-night: "#5fc4d3"
  on-primary: "#ffffff"
  ink: "#131816"
  muted: "#535b57"
  faint: "#646c67"
  paper: "#eceee9"
  surface: "#fbfbf9"
  surface-2: "#e3e6e0"
  border: "#d6dad3"
  border-strong: "#b9bfb6"
  night-bg: "#0d1110"
  night-surface: "#151a19"
  night-surface-2: "#1d2422"
  night-ink: "#e7ebe8"
  seat-free: "#16a34a"
  seat-occupied: "#dc2626"
  seat-uncertain: "#d9773a"
  seat-saved: "#eab308"
  seat-unknown: "#7d6570"
  oak: "#c8955c"
  oak-border: "#a56a3a"
  seat-backrest: "#5a3b25"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 118"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 118"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 118"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 112"
  data:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "'tnum' 1"
rounded:
  md: "5px"
  lg: "6px"
  xl: "8px"
  2xl: "10px"
  3xl: "12px"
  sheet: "22px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "12px 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-primary-compact:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "0 16px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  card-tonal:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  chip-observation:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    height: "56px"
  nav-tab:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "48px"
  nav-tab-active:
    textColor: "{colors.ink}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
---

# Design System: Sala de Estudio

## Overview

**Creative North Star: "La Sala Señalizada"**

The room is drawn as wayfinding signage: a building plan you can read in seconds. Everything on screen behaves like the plates, door signs and boards of a real study hall. Table names sit on dark plates over oak tabletops, the entrance carries a marker, headings are set in expanded uppercase capitals, and the counts on the status board never jitter. The interface around the map stays quiet so the map and its seat states do the talking.

The mood is calm, functional, institutional-but-unofficial, and honest about freshness. It borrows the clarity of public signage without borrowing any institution's identity. Density is moderate and phone-first: one column of plain, tactile, signposted controls on mobile; three columns on desktop with the map in the centre. Light mode is cool graphite ink on a grey-green "pizarra clara" paper; dark mode is the same layering at night, a near-black green with lifted teal.

Color is rationed. One petrol-teal accent drives action and focus; the only saturated palette belongs to seat state, and state is never told by color alone. The one place the system becomes illustrative is the room itself: oak tables, wooden chairs with backrests, terracotta floor, windows and wall bars. That warmth stays inside the map. Navy and cream UI paper are rejected.

**Key Characteristics:**
- Grey-green paper, graphite ink, one petrol-teal accent.
- Saturated hues only for seat state, always paired with a word, letter or count.
- Expanded uppercase Archivo for place names and screen headings, like signage plates.
- Tabular mono figures for counts, times and the donation alias.
- Flat tonal layering at rest; the strong shadow is reserved for sheets lifted over the map.
- Tight, signage-like corners (5 to 12px), never soft pills except avatars, dots and the entrance marker.
- Motion is transform and opacity only; the only loops live on seats.

## Colors

A cool, low-chroma graphite-and-paper base carrying one petrol-teal accent and a separate, strictly functional seat-state palette.

### Primary
- **Pizarra Teal** (`primary`): filled CTAs ("Estoy acá", "Ingresar", chat send), the active-tab bar, the brand armchair plate, focus outlines, selection tint, caret and native control accent. Fixed in light mode so white text keeps contrast on filled buttons. It also fills the "mine" seat state, which makes your own seat read as part of the accent.
- **Deep Pizarra Teal** (`primary-deep`): hover state of filled primary buttons.
- **Night Teal** (`primary-night`): the accent in dark mode, for text links, focus rings, the active-tab bar and the mine seat; lighter so it reads on near-black.

### Neutral
- **Pizarra Paper** (`paper`): the app background in light mode and the light theme-color; a grey-green slate paper, not white and not cream.
- **Chalk Surface** (`surface`): cards, header, bottom nav, sheets, inputs; the brightest layer.
- **Slate Wash** (`surface-2`): the tonal step for nested panels, quiet buttons, observation chips, segmented controls, hover fills and the donation card.
- **Graphite Ink** (`ink`): all primary text and headings.
- **Graphite Muted** (`muted`): secondary text, inactive nav labels, signage labels.
- **Graphite Faint** (`faint`): tertiary text, still above 4.5:1 on paper.
- **Hairline** (`border`) and **Strong Hairline** (`border-strong`): card and divider strokes; the strong variant for the sheet grab handle, the dashed alias ticket and scrollbars.
- **Night Paper / Night Surface / Night Wash / Night Ink** (`night-bg`, `night-surface`, `night-surface-2`, `night-ink`): the same four-layer stack in dark mode.

### Seat State
- **Libre Green** (`seat-free`): free seats, the "Está libre" dot, the Libres counter swatch, and the copied-confirmation flash.
- **Ocupado Red** (`seat-occupied`): occupied seats and their occupant badge ring.
- **Dudoso Amber** (`seat-uncertain`): uncertain seats and the dispute ring.
- **Guardado Yellow** (`seat-saved`): saved seats and the favorite-seat star badge; text on it is dark brown, never white.
- **Sin Datos Mauve** (`seat-unknown`): seats with no fresh evidence; deliberately dull so absence of data never looks like a state.
- Dark mode lifts each state hue (for example free becomes a brighter mint) in the stylesheet; the roles do not change.

### Room Materials
- **Oak** (`oak`) and **Oak Edge** (`oak-border`): tabletops and wall-bar wood.
- **Chair Backrest** (`seat-backrest`): dark-wood backrest and frame under each seat cushion.
- The map also carries its own floor, wall, wainscot, window and radiator tokens. They belong to the illustration only.

### Named Rules
**The State Palette Rule.** Green, red, amber, yellow and mauve exist only to report seat state: on seats, counters, legend swatches, status pills and observation chips. They are never decoration, never a brand color, never a section tint.

**The One Accent Rule.** Pizarra Teal is the only accent. If a second thing on the screen needs emphasis, use weight, size or a Slate Wash fill, not a new hue.

**The Never Color Alone Rule.** Every state color travels with a word, a letter or a number: the seat letter (L, O, ?, G, -), the status pill label, the counter caption, the chip text. Color lives in the dot or swatch; the text stays ink so it keeps full contrast.

## Typography

**Display Font:** Archivo at expanded width (with ui-sans-serif, system-ui)
**Body Font:** Archivo at normal width (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (with ui-monospace, SFMono-Regular) for figures

**Character:** One family in two widths. Stretched and heavy, Archivo reads like the room's plates and door signs; at normal width it is a plain, legible phone text face. Geist Mono carries anything that counts.

### Hierarchy
- **Display** (800, 26px, line-height 1, uppercase, 118% width): the seat heading in the detail panel ("ASIENTO 4").
- **Headline** (800, 22px, line-height 1, uppercase, 118% width): screen and panel headings and the wordmark (15px in the header). Sheets use the same voice at 20px.
- **Title** (600, 16 to 24px, sentence case, 118% width): dialog titles, card titles, the login heading, list section titles that are not place names.
- **Body** (400, 14px, line-height about 1.5): descriptions, lists, helper copy. Inputs render at 16px on mobile to avoid zoom, 14px from `sm` up.
- **Label** (700, 11px, 0.08em tracking, uppercase, 112% width): small signage labels: the "Bahía Blanca" subtitle, section labels like "Información", the table-and-side location line, field captions like the bank alias. Bottom-nav labels are 11px sentence case (500, 700 when active).
- **Data** (Geist Mono 600, 22px on phones, 24px from `sm`, tabular figures): status-board counts, the alias, times and hints inside buttons.

### Named Rules
**The Signage Caps Rule.** Uppercase extrabold expanded Archivo is for names of places and screens, the things a sign would say. Body copy, buttons and messages stay sentence case.

**The Steady Figures Rule.** Any number that updates live (counts, times, durations) uses tabular figures so the board never jitters.

## Layout

Mobile first. On phones the room page is a single column with 16px page gutters and 12 to 16px gaps: the status board, the map and quick actions stack, and a fixed bottom tab bar (Sala, Personas, Chat, Ranking, Perfil) sits above the safe area. Pages reserve bottom padding for the tab bar (3.5rem plus the safe-area inset). At `lg` (1024px) the bottom bar disappears, the sticky header shows the full nav, and the room page becomes a three-column grid (320px, flexible, 340px) inside a 1280px container, map in the centre at a 5:8 aspect. Content screens such as login centre a single 384px column. Spacing follows the 4px Tailwind step; the working rhythm is 8, 12 and 16px, with 20px inside dialogs and sheets. Touch targets are at least 44px; primary actions are 48 to 56px tall.

## Elevation & Depth

The system is flat at rest. In-flow surfaces separate by tone and hairline: paper, then a Chalk Surface card with a border, then Slate Wash inside it. Shadows are tinted with the ink color and kept low; they appear on things that float above content (menus, the map zoom control, toasts, dialogs). The strongest shadow belongs to bottom sheets lifted over the map. Inside the map, depth is illustrative: contact shadows under chairs, a soft table shadow, a light pool and a vignette.

### Shadow Vocabulary
- **Hairline lift** (`box-shadow: 0 1px 2px rgb(19 24 22 / 0.08)`): a barely raised card, such as the login panel.
- **Float** (`box-shadow: 0 1px 2px rgb(19 24 22 / 0.08), 0 4px 12px -4px rgb(19 24 22 / 0.14)`): small floating controls such as the map zoom stack and toggles.
- **Overlay** (`box-shadow: 0 2px 4px rgb(19 24 22 / 0.08), 0 16px 32px -12px rgb(19 24 22 / 0.28)`): menus and dialogs.
- **Sheet lift** (`box-shadow: 0 -10px 40px rgba(0,0,0,0.22)`): mobile bottom sheets over the map only.

### Named Rules
**The Flat Paper Rule.** A card that sits in the page flow gets a border and a tonal step, not a shadow.

**The Lifted Sheet Rule.** The upward sheet shadow is used only by bottom sheets that rise over the map; nothing else casts upward.

## Shapes

Corners are tight and signage-like: 5px (`md`) for segmented-control thumbs, 6px (`lg`) for most controls, nav pills and inputs, 8px (`xl`) for the status board, toasts and menus, 10px (`2xl`) for cards, the map frame, the main CTA and observation chips, 12px (`3xl`) at most for larger panels. Bottom sheets round only their top edge at 22px. Full rounding is reserved for avatars, status dots, the grab handle and the room's "Entrada" marker. Borders are 1px hairlines; the donation alias is the one dashed border, marking it as a tear-off ticket. On the map, chairs are rounded squares (cushion radius 10, frame radius 12 in map units) with a backrest bar, and table names sit on dark rounded plates.

## Components

### Buttons
Plain, tactile, signposted: every button names its action and presses down 1px (or scales to 0.98) on tap.
- **Shape:** gently squared (6px) for compact buttons; 10px for the full-width primary action.
- **Primary:** Pizarra Teal fill, white bold text. The main seat action is full width, 52px tall, 12px by 16px padding, and can carry a muted tabular hint ("· hasta las 18:40"). Compact primaries (header "Ingresar", form submit, chat send) are 8px by 12 to 16px, semibold 14px.
- **Hover / Focus:** hover deepens to Deep Pizarra Teal; keyboard focus is the global 2px teal outline at 2px offset; disabled drops to 50% opacity.
- **Secondary:** Chalk Surface with a hairline border, ink semibold text, Slate Wash on hover ("Cerrar sesión", "Continuar con Google").
- **Quiet:** Slate Wash fill, no border, 48px tall, for dismissals like "Ahora no".
- **Icon:** 40 to 44px square, muted icon, Slate Wash on hover.

### Chips
- **Observation chips:** three equal tiles ("Está libre", "Está ocupado", "Está guardado"), Slate Wash fill, 10px corners, 56px tall, a 10px state dot above ink text. Tap scales to 0.96.
- **Status pill:** a 12px state square (3px corners) beside the bold state label under the seat heading.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** Chalk Surface for primary content; Slate Wash for secondary or nested panels such as the donation card.
- **Shadow Strategy:** none in flow (see Elevation & Depth).
- **Border:** 1px hairline.
- **Internal Padding:** 16px; 20px in dialogs.

### Inputs / Fields
- **Style:** Chalk Surface, 1px hairline border, 6px corners (8px for the chat composer), 8px by 12px padding, 16px text on mobile.
- **Focus:** global 2px teal outline; the chat composer instead shifts its border to teal with a 2px teal ring at 25%.
- **Error / Disabled:** error text in red below the field; disabled at 50% opacity.

### Navigation
- **Mobile:** fixed bottom tab bar on translucent Chalk Surface with backdrop blur and a top hairline. Each tab is at least 48px, a 22px Phosphor icon over an 11px label. Active tab: ink bold label, teal icon and a 3px by 32px teal bar on the top edge like a tab plate. Inactive: muted, ink on hover.
- **Desktop:** sticky header with the teal armchair plate and uppercase wordmark, then 14px semibold nav pills (6px corners). Active pill: Slate Wash fill with a 2px teal underline drawn as an inset shadow.

### Bottom Sheet
A Chalk Surface sheet rising from the bottom edge with a 22px top radius, top hairline, a 44px by 6px grab handle and the Sheet lift shadow. It enters with a 16px rise and fade over 220ms and follows the finger when dragged, settling on `cubic-bezier(0.22, 1, 0.36, 1)`. The seat sheet has no backdrop so the map stays tappable; prompts use a 40% black scrim.

### Status Board
One bordered 8px plate split into five columns (Libres, Ocupados, Guardados, Dudosos, Sin datos) by hairlines. Each column stacks a 20px by 4px state swatch, a Geist Mono count and an 11px caption. A 6px proportional strip underneath shows the whole room's mix and animates with a scale transform only.

### Alias Ticket
The donation alias as a tappable ticket: a full-width Chalk Surface button with a dashed Strong Hairline border and 8px corners, a signage label ("Alias Banco Provincia") over the alias in mono, and a "Copiar" tag on a 10% teal tint that flips to Libre Green "Copiado" for two seconds. The whole ticket copies on tap.

### The Seat (signature)
Each of the 108 seats is drawn top-down in SVG: a dark-wood backrest bar (main tables only, none on wall-bar stools), a wooden frame, and a rounded-square cushion filled with a soft radial gradient of its state color, carrying a white state letter. A contact shadow falls toward the table. Your own seat has a pulsing teal ring, an open dispute a pulsing amber ring, a selected seat a solid teal ring, and keyboard focus a dashed teal ring. Free seats breathe with a slow green glow. Occupied seats can show the occupant's photo or alias animal in a ring of the state color. The invisible hit area is 56px across.

### Motion
State changes move transform and opacity only, eased with `cubic-bezier(0.22, 1, 0.36, 1)` (sheets 220ms, the status strip 500ms). Looping motion exists only on the map: the free-seat glow (2.6s), the mine pulse (1.8s), the dispute pulse (1.4s) and the selected-seat ripple (1.6s). All of it stops under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** keep the UI on Pizarra Paper, Chalk Surface and Slate Wash with Graphite Ink text; step depth by tone and a 1px hairline.
- **Do** use Pizarra Teal for the one primary action per view, the active nav marker, focus and selection.
- **Do** pair every seat-state color with its label, letter or count, and keep that text in ink.
- **Do** set place and screen names in uppercase extrabold expanded Archivo, and everything else in sentence case.
- **Do** use Geist Mono tabular figures for counts, times and the alias.
- **Do** keep corners between 5px and 12px, with 22px only on the top edge of bottom sheets.
- **Do** keep touch targets at 44px or more and primary actions at 48 to 56px.
- **Do** animate with transform and opacity only, and switch every loop off under reduced motion.

### Don't:
- **Don't** use seat-state colors for decoration, icons, section tints or brand moments.
- **Don't** introduce a second accent hue, navy, or cream UI paper. Warm wood and cream tones belong to the room illustration only.
- **Don't** set body copy, buttons or messages in uppercase signage caps.
- **Don't** put shadows on in-flow cards, or the upward sheet shadow on anything but a bottom sheet over the map.
- **Don't** add looping animation outside the seats on the map.
- **Don't** use soft pill shapes for buttons or cards; full rounding is for avatars, dots and the entrance marker.
- **Don't** use any university's logo, crest or institutional colors.
