# Seat photo verification: model contract

After tapping "Estoy acá", a user can optionally take a photo from their seat.
The API forwards the photo to a **seat verifier** model, run inside the API Worker. The model
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

The model runs inside the API Worker (see "In-process verifier" below).
The contract below is the shape of its input and output.

## Configuration (API env)

| Variable | Meaning |
|---|---|
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Worker secrets. When either is set, the verifier runs in-process in the API Worker (Gemini wins when both are set). With neither, the feature is off and the web explains its unavailability without offering an upload. |
| `VERIFIER_MODEL` | Optional, default `gemini-2.5-flash` (`claude-sonnet-5-5` with the Anthropic key). Reported as `modelVersion: "sala-seat-v1:<model>"`. |
| `SEAT_VERIFIER_MIN_CONFIDENCE` | Optional, default `0.8`. |
| `SEAT_VERIFIER_MODE=mock` | Dev/test only (ignored when `NODE_ENV=production`). Accepts every photo as the claimed seat with confidence 0.9. |

## Request (API to model)

JSON, timeout 10 s.

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
- Provider retention and data use are governed by the provider's terms, not by the
  app's no-photo-storage implementation. The UI names the configured provider before
  confirmation and links to the photo privacy notice. The unpaid Gemini API may use
  content to improve products. A paid project's different data-use terms do not
  imply zero retention. Review the [Gemini API terms](https://ai.google.dev/gemini-api/terms).

## Suggested approach for the model

- Collect photos from each seat, looking forward over the desk, at several
  times of day. Label each photo with the seat code.
- Tables are symmetrical, so the photo alone is ambiguous. Use landmarks
  (windows, entrance, wall bars, columns) to tell sides and rows apart.
- Return `null` rather than guess when two seats are plausible.

## In-process verifier

The reference implementation is folded into the API Worker
(`apps/api/src/verification/`). There is no separate app and no extra
deployment: the standalone `apps/verifier` service (and its Fly app) was
removed. It follows this contract using Gemini vision (or Claude vision). It
sends the model a labelled floor plan, the user's photo and a text description
of the seat layout, and forces structured JSON output (a `report_seat` tool call
on Claude) so the answer is strict JSON. A seat code that is not in the request's
`seats` is turned into `null` with confidence 0. Model errors and timeouts carry a
sanitized failure category; they are never reported as an ambiguous photo. The static system prompt and the
floor plan are prompt-cached.

The model call has a 9 s timeout, under the web client's 20 s POST timeout. The
web distinguishes timeout, provider error, ambiguous photo, low confidence and
seat mismatch. Failed attempts never verify the check-in or reserve the photo hash;
the same photo can be retried. Existing rate limits still apply.

Configure the provider through the deployment's managed Worker secrets. Never
place credentials in the public repository, diagnostics or client bundle.

App-side storage guarantee: the verifier never writes the photo to a database or
disk and never logs it. Its operational log contains only `{evt, outcome, failure, ms}`,
without user/seat identifiers or provider payloads.

## Diagnostics and mobile capture

- Public `GET /verification/status` returns availability and provider name for informed
  confirmation. It exposes no keys, model configuration or attempt history.
- `GET /admin/verification/status` requires the canonical, unrestricted SUPERADMIN.
  It reports provider/model and the last attempt/failure in this process: TIMEOUT,
  CREDENTIALS, QUOTA, MODEL, PROVIDER or RESPONSE. Restarting the Worker clears that
  in-memory diagnostic; configured availability does not prove live quota or photo accuracy.
- `POST /admin/verification/test` is also SUPERADMIN-only. It sends the app's own floor
  plan through the configured verifier to test credentials, model availability, quota
  and structured responses. It consumes one model request, never a personal photo,
  and never creates/verifies a check-in or changes study time. A mock is reported as
  simulated, not as a working real provider.
- Gemini Flash 2.5 requests reserve 1024 output tokens and disable optional thinking
  for this short structured classification. Other model families keep their own defaults.
  Model availability must be checked against the provider's current
  [catalog/deprecations](https://ai.google.dev/gemini-api/docs/deprecations).
- Camera/gallery selection compresses and strips metadata locally, then shows a
  preview. Only the explicit verification button sends it. Failed/cancelled attempts
  restore controls, including selecting the same file again.
- The native image decoder is used when `createImageBitmap` cannot decode an iPhone
  camera image. Presence reuses the same live server-validated grant as other seat actions;
  an expired grant still requires a fresh GPS validation.
- Accurate seat prediction still needs a real photo with landmarks. Symmetric tables
  may remain ambiguous; do not lower confidence or auto-accept to hide this limitation.
