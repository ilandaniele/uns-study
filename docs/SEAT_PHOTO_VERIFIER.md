# Seat photo verification: model contract

After tapping "Estoy acá", a user can optionally take a photo from their seat.
The API forwards the photo to an external **seat verifier** model. The model
says which seat the photo was taken from. If the model agrees with the seat the
user checked in to, that check-in becomes **verified**.

A verified check-in is protected for `VERIFIED_PROTECTION_MINUTES` (30) from
the time of the photo:

- nobody can open a "Me senté acá", "Esa persona no está" or "Está guardado"
  vote on that seat (`DISPUTE_NOT_ALLOWED`);
- "Está libre" observations on that seat are rejected (`SEAT_VERIFIED`);
- the map shows the seat as "Verificado con foto".

There is at most **one photo verification per check-in** (max 30 minutes of
protection per seating): once a check-in's `verifiedAt` is set, a second photo
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
  "roomSlug": "sala-principal",
  "claimedSeatCode": "M04-3",
  "image": { "mimeType": "image/jpeg", "base64": "<...>" },
  "seats": [
    { "code": "M04-3", "tableCode": "M04", "x": 312, "y": 640 }
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
{ "seatCode": "M04-3", "confidence": 0.93, "modelVersion": "uns-seat-v1" }
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
