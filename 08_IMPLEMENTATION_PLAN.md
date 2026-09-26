# Implementation Plan

## Phase 0 — Repository foundation

### Deliverables

- Turborepo monorepo
- pnpm workspaces
- `apps/web`
- `apps/api`
- `packages/database`
- `packages/contracts`
- shared lint/TypeScript config
- `.env.example`
- local development instructions
- CI-ready scripts

### Done when

- web starts locally;
- API starts locally;
- packages build;
- one root command runs dev environments.

---

## Phase 1 — PostgreSQL + room seed

### Deliverables

- Neon integration
- Drizzle schema
- migrations
- initial room seed
- 12 main tables
- 4 wall bars
- 108 total positions
- initial current state rows = UNKNOWN

### Done when

A DB query returns exactly 108 active study positions for the initial room.

---

## Phase 2 — Read-only interactive room map

### Deliverables

- `/sala/[slug]`
- room REST endpoints
- responsive SVG
- reusable `RoomMap`
- `StudyTable`
- `WallBar`
- `Seat`
- summary counters
- seat detail bottom sheet/panel

### Done when

Anonymous mobile and desktop users can inspect all 108 positions.

This is the first visual milestone.

---

## Phase 3 — Authentication

### Deliverables

- Better Auth setup
- Google OAuth
- email/password
- session integration web -> API
- basic profile row creation

### Done when

A user can log in/out and API recognizes the authenticated identity.

---

## Phase 4 — Presence validation

### Deliverables

- browser geolocation helper
- `PresenceService`
- server-side Haversine or PostGIS-compatible distance validation
- freshness threshold
- accuracy threshold
- user-friendly error states

### Done when

The backend can authoritatively accept/reject a presence-sensitive request.

---

## Phase 5 — Self check-in

### Deliverables

- check-in API
- transaction
- one active check-in/user
- one active self check-in/seat
- 60-minute expiry
- checkout
- extend
- state recalculation
- event log

### Done when

A present user can mark `Estoy acá` and cannot own two seats.

---

## Phase 6 — Socket.IO realtime

### Deliverables

- API Socket.IO gateway
- room join/leave
- seat state events
- room summary updates
- client reconnect/reload behavior

### Done when

Two browsers see occupancy updates without page refresh.

---

## Phase 7 — Seat observations

### Deliverables

- FREE observation
- OCCUPIED observation
- expiration
- deterministic state calculator
- conflict -> UNCERTAIN
- audit events

### Done when

Recent collaborative observations affect the canonical state without directly overriding it.

---

## Phase 8 — Expiration and daily reset

### Deliverables

- delayed expiry jobs or scheduler
- recovery reconciliation cron
- idempotent daily reset at 04:00 local room timezone
- realtime reset notification

### Done when

No stale check-in can survive indefinitely and a new day starts operationally clean.

---

## Phase 9 — Rate limiting and anti-troll

### Deliverables

- Upstash Redis
- mutation rate limits
- suspicious action logging
- account-age-sensitive limits if useful
- Turnstile hook for suspicious flows

### Done when

A single user cannot rapidly mutate dozens of seats without being limited/logged.

---

## Beta launch point

Launch a controlled beta here.

Do not wait for social/chat/ads.

Core beta includes:

- read-only anonymous map;
- auth;
- presence;
- check-in;
- observations;
- realtime;
- expiration;
- daily reset;
- basic abuse protection.

Measure Fresh Seat Coverage and repeated usage.

---

## Phase 10 — Profiles and privacy

### Deliverables

- profile page
- nickname/name preferences
- per-field visibility
- optional seat identity visibility
- LU optional/private by default

---

## Phase 11 — Study Mode

### Deliverables

- current subject
- short status
- looking-for-group
- visible room people list
- privacy respected

---

## Phase 12 — Chat

### Deliverables

- `#sala-principal`
- history pagination
- realtime new messages
- rate limiting
- own-message deletion
- moderation hooks

Then:

- direct conversations
- DMs
- DM privacy.

---

## Phase 13 — Block and report users

### Deliverables

- block/unblock
- server-enforced DM block
- report reasons
- description
- optional camera/file evidence
- private R2 upload
- moderation queue

---

## Phase 14 — Admin

### Deliverables

- live room view
- user search
- reports
- evidence signed URLs
- moderation actions
- audit log
- announcement management

---

## Phase 15 — Rankings

### Deliverables

- verified StudySession history
- daily
- weekly
- monthly
- all-time
- study time
- streak
- contribution

Include anti-gaming caps.

---

## Phase 16 — QR pilot

Do not cover 108 seats.

Start with table-level QR codes on a subset of tables.

Measure use.

If useful, expand.

---

## Phase 17 — PWA refinement

- installability
- icons
- manifest
- offline shell
- stale-state messaging
- performance tuning

---

## Phase 18 — Monetization

Only after real usage exists.

- AdSense abstraction
- room-bottom slot
- community-feed slot
- analytics
- no intrusive entry ad.

---

# Testing strategy

## Unit tests

Prioritize:

- seat-state calculator;
- geofence calculations;
- rate-limit policy helpers;
- visibility/privacy helpers.

## Integration tests

Prioritize:

- check-in transaction;
- moving seats;
- concurrent check-in collision;
- observation creation;
- expiration;
- daily reset;
- block -> DM denial.

## E2E

Core MVP:

1. anonymous sees map;
2. login;
3. location mock inside geofence;
4. check in;
5. second client receives update;
6. move seat;
7. old seat clears;
8. observation changes a non-self seat;
9. expiry returns to derived/unknown state.

## Performance

Do not prematurely load-test thousands of writes.

First ensure room initial payload and socket event handling remain lightweight.
