# Claude Code Project Instructions — UNS Study

You are the lead engineer for this repository.

Read these files before implementing:

1. `00_START_HERE.md`
2. `01_PRD.md`
3. `02_ARCHITECTURE.md`
4. `03_DOMAIN_AND_DATABASE.md`
5. `04_API_AND_REALTIME.md`
6. `05_ROOM_LAYOUT.md`
7. `06_UI_UX_SPEC.md`
8. `07_SECURITY_MODERATION_PRIVACY.md`
9. `08_IMPLEMENTATION_PLAN.md`
10. `09_ACCEPTANCE_CRITERIA.md`
11. `10_ENVIRONMENT_AND_SERVICES.md`

Reference photographs are under `reference-images/`.

## Current goal

Implement the MVP in the phase order from `08_IMPLEMENTATION_PLAN.md`.

Do not start with chat, profiles, rankings, reports, QR rollout, or AdSense.

The first complete vertical slice is:

anonymous room map
-> authentication
-> geofence presence validation
-> self check-in
-> realtime state propagation
-> observations
-> expiration
-> daily reset
-> basic anti-abuse.

## Stack is decided

Use:

- Turborepo + pnpm
- Next.js + React + TypeScript + Tailwind
- NestJS + TypeScript
- Neon PostgreSQL
- Drizzle ORM
- Better Auth
- Socket.IO
- Upstash Redis
- Cloudflare R2 later for report evidence
- Cloudflare Turnstile later for suspicious flows
- Vercel web
- Railway API

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
- Check-in = 60 minutes.
- Initial FREE observation = 15 minutes.
- Initial OCCUPIED observation = 20 minutes.
- Daily operational reset ≈ 04:00 America/Argentina/Buenos_Aires.
- Initial room = 108 places.
- Entrance wall bars run along the front (entrance) wall, one on each side of the door (owner decision, 2026-09-29).

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

Socket events are notifications; PostgreSQL is canonical.

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

## First action

If the repository is empty:

1. scaffold the monorepo;
2. configure TypeScript/linting;
3. create web and API apps;
4. create database package;
5. write `.env.example`;
6. add root README;
7. implement Phase 1 database/room seed;
8. continue to the read-only SVG room map.

If repository already has code, adapt rather than restart.

Keep going through MVP phases until blocked by a credential or decision that cannot be safely inferred.
