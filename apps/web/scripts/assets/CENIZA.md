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

The vertical walking sources have 4 columns × 4 rows (sixteen phases).
The lateral replacement has 4 columns × 2 rows (eight coherent contact/passing
phases). All cells are 128 × 128 in the optimized sources:

- `ceniza-side-source.webp`: right-facing walk (mirrored at runtime for left).
- `ceniza-up-source.webp`: walking away from the viewer.
- `ceniza-down-source.webp`: walking toward the viewer.
- `ceniza-settle-source.webp`: eight phases standing, bending elbows, lowering
  chest, folding hips, shifting weight and rolling onto the flank, head down.

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

Lateral replacement prompt: one sequential eight-phase four-beat walk with
fixed head/trunk geometry, closed mouth, low tail, forward gaze, hip/shoulder
anchors and constant ground baseline; articulate leg contacts and passing
poses rather than changing the torso. The settle prompt requests a reversible
standing-to-flank sequence ending with the whole dog lying on his side and
eyes closed, constant physical scale and ground anchor, transparent background.

The browser downloads only `public/room/ceniza-v6.webp` (20 poses: eight walking,
four resting and eight settling). The output uses eight columns and three rows.
Every direction shares one common crop/scale across its phases. The three nap
styles are curled, lying on the flank, and fully sprawled; posture changes play
forward when lying down and in reverse when waking up. No animation loop runs
during long naps. Runtime movement accelerates/brakes over at most 450 ms,
rather than stretching that interval over 10% of a long trip.

Rest and settling frames are translated vertically, without changing scale,
so their opaque lower edge rests at cell y=89, matching standing paws. This
removes the transparent gap that previously detached lying bodies from shadows.

Current walking source: `ceniza-overhead-source.webp` is a 4 × 2 atlas generated
with the built-in imagegen tool. Prompt: preserve Ceniza's ash-brown coat, white
toes/chest and floppy ears; use a strictly overhead orthographic view, nose up,
eight sequential phases of one relaxed four-beat walk, identical rigid head and
torso in every cell, independently articulated planted/swinging paws, restrained
tail tip, no white neck patch, no lateral torso sway, no floor/shadow/grid/text,
transparent alpha. Reference images were the existing optimized up/side sources.

The build aligns the opaque chest band to a common anchor before resizing;
independently moving tails/feet do not define that anchor. `sprite.test.ts`
checks actual rendered atlas pixels: less than one map pixel of lateral chest
drift at the 70-pixel display size, plus preserved resting ground contact.

Runtime rotates this single overhead gait to the true movement bearing. It turns
in place before moving and samples safe diagonal segments using the photo's
chair coordinates, including the nose/tail extent and the swept turning area.
Tabletop masks still occlude the dog when passing underneath. No business state
is read or changed by this decorative animation. Older directional source sheets
remain available as references; the browser does not download them.
