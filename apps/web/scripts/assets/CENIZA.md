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

Each walking source has 4 columns × 4 rows, one complete cycle with sixteen
consecutive phases in row-major order. All sources are 512 × 512 WebP images:

- `ceniza-side-source.webp`: right-facing walk (mirrored at runtime for left).
- `ceniza-up-source.webp`: walking away from the viewer.
- `ceniza-down-source.webp`: walking toward the viewer.

Final prompt set: one atlas per direction using the shared identity/camera
specification above, requesting exactly sixteen equal phases of a single
seamless four-beat walk, tiny sequential changes, individually articulated
planted/lifted paws, shoulder and hip weight transfer, head bob, ear follow-through
and tail sway, constant torso size/anchor, at least 10% transparent cell margins.
Direction-specific constraint: keep the snout right for side, head at top and
tail at bottom for up, face at bottom and tail at top for down. No rotation
within a cycle. Sources generated with the built-in imagegen tool.

`ceniza-rest-source.webp`: the four optimized rest/sleep/bark poses from the
original atlas. These are kept separate from the new walking cycles.

The browser downloads only `public/room/ceniza-v3.webp` (52 poses: 48 walking,
four resting). The output uses eight columns and seven rows to avoid an overly
wide texture. Every direction shares one common crop/scale across its phases.
