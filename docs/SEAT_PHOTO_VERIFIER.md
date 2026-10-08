# Seat photo verification: model contract

After tapping "Estoy acá", a user can optionally take a photo from their seat.
The API forwards the photo to an external **seat verifier** model. The model
says which seat the photo was taken from. If the model agrees with the seat the
user checked in to, that check-in becomes **verified**.

A verified check-in is protected for `VERIFIED_PROTECTION_MINUTES` (120, i.e. 2
hours) from the time of the photo, or until the check-in expires if that is
sooner:

- nobody can open a "Me senté acá", "Esa persona no está" or "Está guardado"
  vote on that seat (`DISPUTE_NOT_ALLOWED`);
- "Está libre" observations on that seat are rejected (`SEAT_VERIFIED`);
- the map shows the seat as "Verificado con foto".

There is at most **one photo verification per check-in** (max 2 hours of
protection per seating — renewing with "Sigo acá" keeps the check-in alive but
never extends the protection past 2 hours from the photo): once a check-in's `verifiedAt` is set, a second photo
for the same check-in is rejected with `ALREADY_VERIFIED`, even after the
protection window has lapsed. To renew, the user has to check out and check
back in ("Estoy acá") — that starts a fresh check-in, which can be verified
again. Protection also ends when the check-in itself ends, whichever comes
first.

The model is not part of this repository. The API only needs an HTTP endpoint
that follows the contract below.

## Configuration (API env)

| Variable | Meaning |
|---|---|
| `SEAT_VERIFIER_URL` | HTTPS endpoint of the model. Unset means the feature is off and the web hides the button. **Must be `https://` in production** — a non-https URL there is treated as unset (feature disabled, loud startup warning) rather than sending photo bytes and the bearer token in the clear. |
| `SEAT_VERIFIER_TOKEN` | Optional. Sent as `Authorization: Bearer <token>`. |
| `SEAT_VERIFIER_MIN_CONFIDENCE` | Optional, default `0.8`. |
| `SEAT_VERIFIER_MODE=mock` | Dev/test only (ignored when `NODE_ENV=production`). Accepts every photo as the claimed seat with confidence 0.9. |

## Request (API to model)

`POST $SEAT_VERIFIER_URL`, `Content-Type: application/json`, timeout 10 s.

```json
{
  "roomSlug": "principal",
  "claimedSeatCode": "M04-S03",
  "image": { "mimeType": "image/jpeg", "base64": "<...>" },
  "seats": [
    { "code": "M04-S03", "tableCode": "M04", "x": 312, "y": 640 }
  ]
}
```

- `claimedSeatCode` is the seat the user checked in to. The model should still
  predict independently and not just echo it.
- `seats` is the full room layout, in the same SVG coordinates used by the map.
  With it, the model can map what it sees to a seat without its own copy of the
  layout.
- The web client resizes the image to 1280 px on the long side, JPEG quality
  0.8, and strips EXIF. The API rejects images over 2 MB.

## Response (model to API)

```json
{ "seatCode": "M04-S03", "confidence": 0.93, "modelVersion": "sala-seat-v1:claude-sonnet-5-5" }
```

- `seatCode`: the predicted seat, or `null` if the model cannot tell.
- `confidence`: a number from 0 to 1.
- `modelVersion`: a free-form string. It is stored with the result for audits.

The API verifies the check-in only when `seatCode === claimedSeatCode` and
`confidence >= SEAT_VERIFIER_MIN_CONFIDENCE`. Any non-2xx response, timeout or
malformed body counts as "could not verify". The user is not penalised for it.

## Privacy

- The API never stores the photo. It keeps only the result (predicted seat,
  confidence, model version, time) and a SHA-256 hash of the image bytes.
- The hash blocks reuse: the same image can never verify more than one
  check-in — not a different user's, and not even a later check-in by the
  same user. This is enforced by a database-level unique constraint, not just
  an application check, so it holds under concurrent requests too.
- The model endpoint must not store the photo either, unless the user has
  opted in to training data (not implemented yet).

## Suggested approach for the model

- Collect photos from each seat, looking forward over the desk, at several
  times of day. Label each photo with the seat code.
- Tables are symmetrical, so the photo alone is ambiguous. Use landmarks
  (windows, entrance, wall bars, columns) to tell sides and rows apart.
- Return `null` rather than guess when two seats are plausible.

## Reference implementation: apps/verifier

`apps/verifier` (`@sala/verifier`) is a small Node 22 HTTP service that follows
this contract using Gemini vision (or Claude vision). It sends the model a labelled floor plan, the
user's photo and a text description of the seat layout, and forces structured JSON output (a
`report_seat` tool call on Claude) so the answer is strict JSON. A seat code that is not in
the request's `seats` is turned into `null` with confidence 0, and any model
error or timeout answers `{ "seatCode": null, "confidence": 0 }` with HTTP 200.
The static system prompt and the floor plan are prompt-cached.

Endpoints: `POST /` (the contract above, `Authorization: Bearer`), `GET /health`.

| Variable | Meaning |
|---|---|
| `VERIFIER_TOKEN` | Required in production. Must equal the API's `SEAT_VERIFIER_TOKEN`. |
| `GEMINI_API_KEY` | Required in production (free tier from Google AI Studio). `ANTHROPIC_API_KEY` is used instead when no Gemini key is set. |
| `VERIFIER_MODEL` | Optional, default `gemini-2.5-flash` (`claude-sonnet-5-5` with the Anthropic key). Reported as `modelVersion: "sala-seat-v1:<model>"`. |
| `PORT` | Optional, default `8080`. |

Deploy:

```
fly deploy -c fly.verifier.toml --remote-only
fly secrets set -c fly.verifier.toml VERIFIER_TOKEN=... GEMINI_API_KEY=...
# on the API app:
fly secrets set SEAT_VERIFIER_URL=https://sala-de-estudio-verifier.fly.dev/ SEAT_VERIFIER_TOKEN=...
```

The verifier machine stops when idle (`min_machines_running = 0`). A cold start
plus inference can exceed the API's 10 s timeout; that degrades to "could not
verify" and the user can simply try again.

No-storage guarantee: the service keeps no database or disk state, never writes
the photo anywhere and never logs it. It logs only `{evt, claimed, predicted,
confidence, ms}`. The photo is sent to the Gemini API (or the Anthropic API). On the Gemini free tier Google may use prompts and images to improve its products; use a paid Gemini key if that is not acceptable.
