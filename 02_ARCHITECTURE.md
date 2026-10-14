# Technical Architecture

## 1. Architecture goals

Optimize for:

- one developer being able to maintain the system;
- fast MVP delivery;
- strong server-side control over state transitions;
- real-time room occupancy;
- later reuse of realtime infrastructure for chat;
- easy addition of more rooms;
- low operational complexity;
- no premature microservices.

## 2. Chosen stack

### Monorepo

- Turborepo
- pnpm workspaces

### Web

- Next.js
- App Router
- React
- TypeScript
- Tailwind CSS
- PWA

Deploy as the `uns-web` Cloudflare Worker via OpenNext (`apps/web/wrangler.jsonc`, `wrangler deploy`).

### API

- Hono
- TypeScript
- REST for commands/queries
- Raw WebSocket (Hibernation API) for real-time events

Deploy as the `uns-api` Cloudflare Worker (`apps/api/wrangler.jsonc`). The Worker forwards every request to one
singleton Durable Object (`AppDO`), which runs the Hono app, owns the database and holds the sockets.
`saladeestudio.com.ar/api/*` routes to `uns-api`; every other path goes to `uns-web`, so the browser sees one origin.

### Database

- SQLite inside the Durable Object (`AppDO`)

### ORM

- Drizzle ORM (`drizzle-orm/durable-sqlite`)
- Drizzle migrations, applied by the Durable Object on start

### Authentication

- Better Auth
- Google OAuth
- email/password

### Rate limiting and counters

No external Redis. `AppDO` is the only writer, so:

- rate limiting and anti-spam counters live in the Durable Object (memory for coarse per-IP limits, SQLite for per-user and per-route limits);
- ephemeral presence is derived from the open sockets;
- coordination needs no distributed locks: every read-decide-write runs in one synchronous SQLite transaction.

### Jobs

- a persisted `scheduled_jobs` table multiplexes the single Durable Object alarm (delayed expiration, summaries, reminders);
- a Cron Trigger (`* * * * *`) pings the Durable Object as a safety net and re-arms a lost alarm;
- recurring reconciliation of expired check-ins;
- scheduled daily room reset.

Never rely on only one delayed job for correctness. Database timestamps remain the source of truth.

### Storage

Cloudflare R2.

Buckets / prefixes:

- public-ish avatar assets as appropriate;
- private moderation/report evidence.

Use signed URLs for authorized admin access.

### Bot protection

Cloudflare Turnstile on suspicious/high-risk flows.

## 3. System overview

```text
Browser / PWA
    |
    | HTTPS + WebSocket (one origin: saladeestudio.com.ar)
    |
    +---------------------------+
    |                           |
 /api/*                    everything else
    |                           |
Worker uns-api            Worker uns-web
(Hono)                    Next.js via OpenNext
    |
    v
Durable Object AppDO (singleton)
    |
    +-----------------+------------------+
    |                 |                  |
 SQLite           WebSockets             R2
(canonical)     (Hibernation)       private files
```

## 4. Monorepo structure

Suggested:

```text
sala-de-estudio/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   └── types/
│   │   └── public/
│   │
│   └── api/
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── rooms/
│           ├── seats/
│           ├── presence/
│           ├── checkins/
│           ├── observations/
│           ├── realtime/
│           ├── security/
│           ├── jobs/
│           ├── chat/
│           ├── moderation/
│           ├── reports/
│           ├── rankings/
│           └── storage/
│
├── packages/
│   ├── database/
│   │   ├── src/schema/
│   │   ├── migrations/
│   │   └── src/client.ts
│   │
│   ├── contracts/
│   ├── validation/
│   └── config/
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 5. Core domain separation

Keep these concepts separate:

### CheckIn

“I am personally sitting here.”

### SeatObservation

“I observe that this other seat appears free/occupied.”

### SeatCurrentState

The server-derived materialized state for fast reads.

### SeatStateEvent

Append-only historical event stream for audit/debug/history.

Do not collapse them into one table.

## 6. Critical write path

Example check-in:

```text
Client POST /checkins
    |
Authenticate user
    |
Rate limit
    |
Validate geolocation
    |
Validate room + seat
    |
Database transaction
    |-- close prior active user check-in
    |-- ensure target seat has no conflicting active self check-in
    |-- create new check-in
    |-- derive/update seat current state
    |-- append event
    |
Commit
    |
WebSocket SEAT_STATE_CHANGED
```

Server-side validation is authoritative.

## 7. Realtime

The client:

1. loads initial room state once using REST;
2. connects to the WebSocket endpoint (`/api/v1/realtime/ws`);
3. joins `room:{roomId}`;
4. receives incremental events.

Do not poll occupancy every second.

Potential socket rooms later:

- `room:{roomId}`
- `chat:{roomId}`
- `user:{userId}`
- `conversation:{conversationId}`

## 8. State correctness

SQLite in the Durable Object is the source of truth.

In-memory state (socket attachments, rate-limit counters) may cache or coordinate but must not be the only authoritative record of occupancy.

Delayed jobs may expire sessions, but reads and reconciliation must also treat `expires_at <= now()` as expired even if a worker was late.

## 9. Scaling approach

Initial scale target:

- hundreds to low thousands of concurrent clients;
- one room initially;
- dozens/hundreds of state mutations per minute at peak are acceptable.

Scale vertically first.

Only consider separate services when measured load justifies it.

## 10. Future multi-room support

Do not hardcode a single room in domain services.

All occupancy data must be scoped by `room_id`.

UI may default to the single initial room, but route/model must support:

`/sala/[slug]`
