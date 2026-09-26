# Initial Room Layout

## Known facts

The room is a long rectangle.

There are:

- 12 main long tables;
- 8 chairs/positions per table;
- 4 wall bars;
- 3 positions per wall bar;
- 108 total study positions.

Main tables are arranged as two long blocks:

Left block:
- M01
- M02
- M03
- M04
- M05
- M06

Right block:
- M07
- M08
- M09
- M10
- M11
- M12

## Wall bars

- B01: left wall near entrance, 3 positions
- B02: right wall near entrance, 3 positions
- B03: left wall near back, 3 positions
- B04: right wall near back, 3 positions

### Critical correction

B01 and B02 are attached to the **side walls near the entrance** and run along those walls.

They are perpendicular to the front/bottom edge in a top-down floor plan.

Do NOT draw them as two horizontal bars across the bottom of the room.

## Schematic orientation

```text
BACK / WINDOWS

┌──────────────────────────────────────────────┐
│ B03                                      B04 │
│ ○                                         ○  │
│ ○                                         ○  │
│ ○                                         ○  │
│                                              │
│    M06                       M12              │
│  [────────]                [────────]         │
│                                              │
│    M05                       M11              │
│  [────────]                [────────]         │
│                                              │
│    M04                       M10              │
│  [────────]                [────────]         │
│                                              │
│    M03                       M09              │
│  [────────]                [────────]         │
│                                              │
│    M02                       M08              │
│  [────────]                [────────]         │
│                                              │
│    M01                       M07              │
│  [────────]                [────────]         │
│                                              │
│ B01                                      B02 │
│ ○                                         ○  │
│ ○                                         ○  │
│ ○                                         ○  │
│                                              │
│                   ENTRANCE                   │
└──────────────────────────────────────────────┘
```

This is schematic, not a measured architectural plan.

## Main-table seat numbering

Use a deterministic seat numbering rule.

For each main table:

- seats 1-4 along one long side;
- seats 5-8 along the opposite long side.

Example:

```text
     S01 S02 S03 S04
   ┌────────────────┐
   │      M01       │
   └────────────────┘
     S08 S07 S06 S05
```

The exact orientation can be reversed later without changing IDs.

Seat codes:

- `M01-S01`
- ...
- `M12-S08`

Wall bar codes:

- `B01-S01`
- `B01-S02`
- `B01-S03`
- ...
- `B04-S03`

## SVG coordinate system

Suggested room viewBox:

`0 0 1000 1600`

Keep furniture positions in DB so the layout can later be adjusted without rewriting React components.

## Reference photos

See `reference-images/`.

The photos are visual references only. Do not infer exact dimensions from perspective photography.
