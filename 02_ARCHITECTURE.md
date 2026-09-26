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

Deploy to Vercel.

### API

- NestJS
- TypeScript
- REST for commands/queries
- Socket.IO for real-time events

Deploy to Railway.

### Database

- PostgreSQL
- Neon

### ORM

- Drizzle ORM
- Drizzle migrations

### Authentication

- Better Auth
- Google OAuth
- email/password

### Redis

- Upstash Redis

Uses:

- rate limiting;
- ephemeral presence;
- anti-spam counters;
- distributed coordination;
- job/queue support where appropriate.

### Jobs

Prefer:

- BullMQ-style jobs for delayed expiration when operationally practical;
- recovery cron that periodically reconciles expired check-ins;
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
    | HTTPS + Socket.IO
    |
    +-------------------------+
    |                         |
Vercel                    Railway
Next.js                   NestJS API
                              |
               +--------------+--------------+
               |              |              |
             Neon          Upstash           R2
          PostgreSQL        Redis        private files
```

## 4. Monorepo structure

Suggested:

```text
uns-study/
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
Socket.IO SEAT_STATE_CHANGED
```

Server-side validation is authoritative.

## 7. Realtime

The client:

1. loads initial room state once using REST;
2. connects to Socket.IO;
3. joins `room:{roomId}`;
4. receives incremental events.

Do not poll occupancy every second.

Potential Socket.IO rooms later:

- `room:{roomId}`
- `chat:{roomId}`
- `user:{userId}`
- `conversation:{conversationId}`

## 8. State correctness

PostgreSQL is the source of truth.

Redis may cache or coordinate but must not be the only authoritative record of occupancy.

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
