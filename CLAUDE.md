# Claude Code Project Instructions — UNS Study

You are the lead engineer for this repository.

Product and technical specs live in `00_START_HERE.md` through `10_ENVIRONMENT_AND_SERVICES.md` (index in `00_START_HERE.md`). Read the ones relevant to the task before changing that area.

Reference photographs are under `reference-images/`.

## Current goal

The occupancy slice (Phases 0–9 of `08_IMPLEMENTATION_PLAN.md`) is shipped. Continue in that plan's phase order; changes must not regress the slice (map, auth, geofence, check-in, realtime, observations, expiration, daily reset, anti-abuse).

## Stack is decided

Use:

- Turborepo + pnpm
- Next.js + React + TypeScript + Tailwind
- Hono on Cloudflare Workers + TypeScript
- Durable Object SQLite + Drizzle ORM
- Better Auth
- WebSocket Hibernation (Durable Objects)
- Cloudflare R2 for report evidence
- Cloudflare Turnstile for suspicious flows
- Cloudflare Workers web via OpenNext (`apps/web/wrangler.jsonc`)
- Cloudflare Workers API (`apps/api/wrangler.jsonc`)

Do not replace this stack unless there is a blocking incompatibility. If there is one, explain it before changing architecture.

## Important business rules

- No reservations.
- `Estoy acá` means the current user is physically seated there.
- One active self check-in per user.
- One active self check-in per seat.
- `Está libre` / `Está ocupado` are observations, not direct canonical state mutations.
- Presence-sensitive writes require server-side geofence validation.
- GPS proves approximate room presence, not exact seat.
- QR is optional and not required for MVP.
- Check-in = 180 minutes. "Sigo acá" reminder 10 minutes before expiry.
- Initial FREE observation = 15 minutes.
- Initial OCCUPIED observation = 20 minutes.
- Daily operational reset ≈ 04:00 America/Argentina/Buenos_Aires.
- Initial room = 108 places.
- Entrance wall bars run along the front (entrance) wall, one on each side of the door.

## Engineering rules

Before editing:

1. inspect only the repository areas needed;
2. report a concise plan;
3. list files that will be created/changed.

Then implement.

Avoid repeated broad repository scans.

Keep domain logic outside controllers/components.

Critical domain modules:

- `PresenceService`
- `CheckInService`
- `ObservationService`
- `SeatStateCalculator`
- `RoomRealtimeGateway`
- expiration/reconciliation job
- daily reset job

Use database transactions and constraints for concurrency correctness.

Never rely solely on client validation.

Never expose DB credentials to web client.

Socket events are notifications; SQLite in the Durable Object is canonical.

## Testing priorities

Write tests first or alongside implementation for:

- geofence calculations;
- seat-state calculation;
- active check-in constraints;
- moving seats;
- concurrent check-in collision;
- expiration;
- daily reset.

Run targeted tests before full suite.

## Do not overbuild

Do not add:

- Kubernetes;
- microservices;
- event bus infrastructure;
- GraphQL unless required;
- CQRS frameworks;
- complex state machines;
- AI/ML confidence scoring.

Use deterministic, testable rules.

Keep working until the task is done or blocked by a credential or a decision that cannot be safely inferred.
