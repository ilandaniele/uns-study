Ceniza animation sources
========================

Generated with the built-in imagegen tool using the owner's original dog image
as the identity reference. Only optimized WebP sources are checked in. Rebuild:

`pnpm --filter @sala/web exec node scripts/build-ceniza-sprite.mjs`

Prompt specification: preserve Ceniza's ash-brown shaggy fur, white chest and
toe tips, floppy ears and bushy tail. Create a transparent animation atlas of a
relaxed, anatomically correct four-beat walking cycle, with articulated leg
lifts, contacts and passing positions, shoulder/hip weight transfer and tail
sway. Fixed camera looking down at 45–50 degrees, constant character scale,
body anchor and identity, full body in each cell, no floor, shadows or text.

`ceniza-walk-source.webp`: 4 columns × 4 rows. First two rows: eight consecutive
right-facing phases (mirrored at runtime to walk left). Last two: eight phases
toward the camera. The top tail of the downward poses reaches the cell boundary;
the crop is intentionally consistent throughout the cycle.

`ceniza-up-source.webp`: the usable middle row of an earlier generated sheet,
seven consecutive phases walking away from the camera. The generated sheet
contained seven columns despite the eight-column prompt; the build explicitly
uses the actual seven columns.

`ceniza-rest-source.webp`: the four optimized rest/sleep/bark poses from the
original atlas. These are kept separate from the new walking cycles.

The browser downloads only `public/room/ceniza-v2.webp` (27 poses).
