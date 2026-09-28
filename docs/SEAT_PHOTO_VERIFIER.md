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

The user can take a new photo to renew the protection. Protection ends when the
check-in ends, whichever comes first.

The model is not part of this repository. The API only needs an HTTP endpoint
that follows the contract below.

## Configuration (API env)

| Variable | Meaning |
|---|---|
| `SEAT_VERIFIER_URL` | HTTPS endpoint of the model. Unset means the feature is off and the web hides the button. |
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
- The hash blocks reuse: the same image cannot verify a check-in for a
  different user.
- The model endpoint must not store the photo either, unless the user has
  opted in to training data (not implemented yet).

## Suggested approach for the model

- Collect photos from each seat, looking forward over the desk, at several
  times of day. Label each photo with the seat code.
- Tables are symmetrical, so the photo alone is ambiguous. Use landmarks
  (windows, entrance, wall bars, columns) to tell sides and rows apart.
- Return `null` rather than guess when two seats are plausible.
