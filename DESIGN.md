---
name: Sala de Estudio
description: Live, crowd-verified seat map for one study room, drawn like an architect's plan and readable in seconds.
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
  text-faint: "#646c67"
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
  seat-glyph-saved: "#422006"
  seat-unknown: "#7d6570"
  oak: "#c8955c"
  oak-border: "#a56a3a"
  seat-backrest: "#5a3b25"
  night-alert-danger-bg: "rgb(127 29 29 / 0.35)"
  night-alert-danger-text: "#fca5a5"
  night-alert-danger-border: "#7f1d1d"
  night-alert-warning-bg: "rgb(120 53 15 / 0.35)"
  night-alert-warning-text: "#fde68a"
  night-alert-warning-border: "#92651a"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 118"
  heading:
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
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  data:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum' 1"
  wordmark:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 118"
rounded:
  xs: "2px"
  control: "4px"
  float: "8px"
  sheet: "12px"
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
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-primary-compact:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  ruled-section:
    textColor: "{colors.ink}"
    padding: "16px 0 0"
  list-row:
    textColor: "{colors.ink}"
    padding: "12px 0"
  floating-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.float}"
    padding: "16px"
  alias-ticket:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.control}"
  chip-observation:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
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

**Creative North Star: "La Sala como plano"**

The room is drawn as an architectural plan. The interface around it behaves like the sheet the plan is printed on: hairlines, whitespace and a title block, not boxes. Content is grouped by thin rules and generous space. In-flow content never sits in a card. The map is the drawing, and everything else is annotation.

The mood is calm, functional, institutional-but-unofficial and honest about freshness. Density is moderate and phone-first: one column on mobile; on desktop a "tablero" with the map on the left and a single sticky rail on the right. Light mode is cool graphite ink on a grey-green "pizarra clara" paper; dark mode is the same layering at night.

Color is rationed. One petrol-teal accent drives action and focus; the only saturated palette belongs to seat state, and state is never told by color alone. Orange appears only inside the logo. The room itself (oak tables, wooden chairs, terracotta floor) is the one illustrative place, and that warmth stays inside the map.

**Key Characteristics:**
- Grey-green paper, graphite ink, one petrol-teal accent.
- Hairlines and whitespace group content. No in-flow cards.
- Floating things (sheets, dialogs, menus, toasts, ads, the map frame) get a border or tone and an 8px radius. Sheet tops get 12px.
- Expanded uppercase Archivo only for place names and screen headings.
- Tabular mono figures for counts, times and the donation alias.
- Tight corners: 4px controls, 8px floating, 12px sheet tops, full only for avatars, dots and the entrance marker.
- Motion is transform and opacity only; the only loops live on seats.

## Colors

### Primary
- **Pizarra Teal** (`primary`): filled CTAs, the active-nav marker, focus outlines, selection tint, caret and the "mine" seat. Fixed in both themes so white text keeps contrast.
- **Deep Pizarra Teal** (`primary-deep`): hover of filled primaries.
- **Night Teal** (`primary-night`): the accent for text links and focus in dark mode.

### Neutral
- **Pizarra Paper** (`paper`): the app background.
- **Chalk Surface** (`surface`): inputs, header, bottom nav, sheets and floating surfaces.
- **Slate Wash** (`surface-2`): quiet buttons, observation chips, hover fills and the alias ticket.
- **Graphite Ink** (`ink`): body text and headings. Prefer it over muted for body copy.
- **Graphite Muted** (`muted`): truly secondary text and labels.
- **Graphite Faint** (`text-faint`): tertiary meta such as timestamps and counts, still above 4.5:1.
- **Hairline** (`border`) and **Strong Hairline** (`border-strong`): rules, dividers, the alias ticket and scrollbars.
- **Night Paper / Surface / Wash / Ink**: the same stack in dark mode.

### Seat State
- **Libre Green**, **Ocupado Red**, **Dudoso Amber**, **Guardado Yellow**, **Sin Datos Mauve** (`seat-*`): seats, counters, swatches, status pills and observation chips only. Dark mode lifts each hue; the roles do not change.

### Alerts (dark mode)
- **Night Danger / Night Warning**: translucent red and amber washes that re-skin the light-mode error and warning styles in dark mode only.

### Room Materials
- **Oak**, **Oak Edge** and **Chair Backrest**: tabletops, wall-bar wood and chair frames. The map's floor, wall, window and radiator tokens belong to the illustration only.

### Named Rules
**The State Palette Rule.** Green, red, amber, yellow and mauve report seat state. Never decoration, never a section tint.

**The One Accent Rule.** Pizarra Teal is the only accent. Orange lives only inside the logo. For extra emphasis use weight, size or a Slate Wash fill.

**The Never Color Alone Rule.** Every state color travels with a word, letter or number, and that text stays ink.

## Typography

**Display Font:** Archivo at expanded width. **Body Font:** Archivo at normal width. **Data Font:** Geist Mono.

### Hierarchy
- **Display** (800, 28px, uppercase, 118% width, `t-display`): the room name and seat heading.
- **Heading** (800, 22px, uppercase, 118% width, `t-heading`): screen headings and the wordmark (15px in the header).
- **Title** (600, 18px, sentence case, `t-title`): section titles inside a screen, dialog titles.
- **Body** (400, 15px, line-height 1.5): descriptions and lists. Inputs are 16px to avoid mobile zoom.
- **Caption** (500, 13px, `t-caption`): secondary text, helper copy, small notes.
- **Label** (700, 11px, 0.08em tracking, uppercase, `t-label`): small signage labels and field captions.
- **Data** (Geist Mono, tabular figures, `t-data`): counts, times, codes and the alias.

### Named Rules
**The Signage Caps Rule.** Expanded uppercase is for names of places and screens only. Section titles, body copy, buttons and messages stay sentence case.

**The Steady Figures Rule.** Any number that updates live uses tabular figures.

## Layout

Mobile first. On phones the room page is one column with 16px gutters: header, hero, quick actions, notices, the counters strip directly above the map, then the map, then people and the donation block, with a fixed bottom tab bar above the safe area.

At `lg` (1024px) the room page becomes a tablero: a flexible map column on the left and one 360px sticky rail on the right, separated by a hairline, inside a 1280px container. The rail carries the room header, hero, counters, the seat detail or its empty state, quick actions, breakdown, how-to and people, each section ruled by a top hairline. Below the map frame a lg-only title block (the rótulo) names the room and shows the live status; it is decorative and hidden from assistive tech. Spacing follows the 4px step; the working rhythm is 8, 12 and 16px. Touch targets are at least 44px; primary actions are 48 to 56px tall.

## Elevation & Depth

Flat at rest. In-flow content separates by hairline and whitespace, not by fill or shadow. Shadows appear only on things that float above content: menus, the map zoom control, toasts, dialogs and sheets. Inside the map, depth is illustrative.

### Shadow Vocabulary
- **Float** (`0 1px 2px rgb(19 24 22 / 0.08), 0 4px 12px -4px rgb(19 24 22 / 0.14)`): small floating controls such as the map zoom stack.
- **Overlay** (`0 2px 4px rgb(19 24 22 / 0.08), 0 16px 32px -12px rgb(19 24 22 / 0.28)`): menus and dialogs.
- **Sheet lift** (`0 -8px 24px rgba(0,0,0,0.18)`): bottom sheets. One value everywhere.

### Named Rules
**The Flat Plan Rule.** Nothing in flow gets a shadow or a card. A hairline and 16px of space are the grouping device.

**The Lifted Sheet Rule.** The upward shadow belongs to bottom sheets only.

## Shapes

Five radii, no others: 2px (`xs`) for swatches, 4px (`control`) for buttons, inputs, chips, nav pills and the map frame, 8px (`float`) for floating surfaces such as dialogs, menus, toasts, ads and chat bubbles, 12px (`sheet`) for the top edge of bottom sheets, and full rounding for avatars, status dots, the grab handle, toggles and the "Entrada" marker. Arbitrary radii are not used. Borders are 1px hairlines; the donation alias is the one dashed border, marking it as a tear-off ticket.

## Components

### Buttons
Plain, tactile, signposted: every button names its action and presses down 1px on tap.
- **Primary:** Pizarra Teal fill, white bold text, 4px corners. The main seat action is full width and 52px tall.
- **Hover / Focus:** hover deepens to Deep Pizarra Teal; focus is the global 2px teal outline; disabled drops to 50% opacity.
- **Secondary:** Chalk Surface with a hairline border, Slate Wash on hover.
- **Quiet:** Slate Wash fill, 48px tall, for dismissals.
- **Icon:** 40 to 44px square, muted icon, Slate Wash on hover.

### Chips
- **Observation chips:** three equal tiles, Slate Wash fill, 4px corners, 56px tall, a state dot above ink text.
- **Status pill:** a 12px state square (2px corners) beside the bold state label.

### Ruled Sections and Lists
- **Ruled section:** a top hairline and 16px of padding. No fill, no radius, no shadow. This replaces cards everywhere in flow.
- **List:** rows separated by hairline dividers (`divide-y`), optionally framed by a hairline above and below. Rows have 12px of vertical padding and no fill.
- **Card-in-card:** never.

### Floating Surfaces
Sheets, dialogs, menus, toasts, ads, chat cards and the map frame carry a border or tone. Floating surfaces use 8px corners; sheet tops use 12px.

### Inputs / Fields
Chalk Surface, 1px hairline border, 4px corners, 16px text, 8px by 12px padding. Focus is the global teal outline. Errors in red text below the field; disabled at 50% opacity.

### Navigation
- **Mobile:** fixed bottom tab bar on tinted Chalk Surface with backdrop blur and a top hairline. Tabs are at least 48px, a 22px icon over an 11px label. Active: ink bold label, teal icon and a flat teal bar on the top edge.
- **Desktop:** sticky header, 57px tall, with the logo and uppercase wordmark in ink, then nav items with a 4px radius. Active item: ink text with a 2px underline drawn as an inset shadow, no tonal fill.

### Bottom Sheet
A Chalk Surface sheet rising from the bottom edge with a 12px top radius, a top hairline, a grab handle and the Sheet lift shadow. The seat sheet has no backdrop so the map stays tappable; prompts use a 40% black scrim.

### Status Board
Five columns (Libres, Ocupados, Guardados, Dudosos, Sin datos) between hairlines, framed by a hairline above and below. Each cell shows a state swatch, a mono count and an 11px caption. A thin proportional strip shows the room's mix and animates with a scale transform only.

### Alias Ticket
The one tonal inset in the system: the donation alias as a tappable ticket with a dashed Strong Hairline border, 4px corners and Slate Wash fill, a label over the alias in mono, and a "Copiar" tag that flips to "Copiado" for two seconds.

### The Seat (signature)
Each of the 108 seats is drawn top-down in SVG: a dark-wood backrest bar, a wooden frame and a rounded-square cushion filled with its state color, carrying a white state letter. Your own seat has a pulsing teal ring, an open dispute a pulsing amber ring, a selected seat a solid teal ring, and keyboard focus a dashed teal ring. The invisible hit area is 56px across.

### Motion
State changes move transform and opacity only, eased with `cubic-bezier(0.22, 1, 0.36, 1)`. Looping motion exists only on the map and stops under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** group content with hairlines and whitespace on Pizarra Paper with Graphite Ink text.
- **Do** use Pizarra Teal for the one primary action per view, the active nav marker, focus and selection.
- **Do** pair every seat-state color with its label, letter or count.
- **Do** set place and screen names in expanded uppercase and everything else in sentence case.
- **Do** use Geist Mono tabular figures for counts, times and the alias.
- **Do** keep to the five radii: 2, 4, 8, 12 and full.
- **Do** keep touch targets at 44px or more.
- **Do** animate with transform and opacity only.

### Don't:
- **Don't** use gradients.
- **Don't** put a decorative icon in a circle or square tile.
- **Don't** add eyebrow labels above headings.
- **Don't** use left borders thicker than 1px as accents.
- **Don't** put shadows on in-flow elements, or the upward sheet shadow on anything but a bottom sheet.
- **Don't** nest cards, or use a card for in-flow content.
- **Don't** use arbitrary radii such as `rounded-[14px]`.
- **Don't** use seat-state colors for decoration, or add a second accent hue. Orange stays inside the logo.
- **Don't** use any university's logo, crest or institutional colors.
