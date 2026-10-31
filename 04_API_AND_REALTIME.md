# API and Realtime Contracts

Prefix REST API with:

`/api/v1`

The exact transport may evolve, but do not expose raw DB writes from the browser.

Authenticated `GET /rooms/:idOrSlug/occupants` also returns the latest live
FREE/OCCUPIED/SAVED observation per seat without a check-in. Its author is the
chosen public display name or alias, including administrative marks. Account
IDs, emails and hidden names are never included; blocked observers remain
"Alguien". The seat detail displays attribution only when its kind matches the
current seat state, and refreshes it when opening a seat or returning to the app.

## 1. Room reads

### GET /rooms

Returns available active rooms.

### GET /rooms/:roomId

Returns room metadata.

### GET /rooms/:roomId/map

Returns:

- room geometry;
- tables/bars;
- seat geometry;
- current seat states;
- occupancy summary.

Suggested response:

```json
{
  "room": {
    "id": "uuid",
    "slug": "principal",
    "name": "Sala de Estudio"
  },
  "summary": {
    "total": 108,
    "free": 0,
    "occupied": 0,
    "uncertain": 0,
    "unknown": 108
  },
  "tables": [],
  "seats": []
}
```

## 2. Presence

### POST /presence/validate

Authenticated.

Input:

```json
{
  "roomId": "uuid",
  "latitude": -38.0,
  "longitude": -62.0,
  "accuracy": 25,
  "capturedAt": "ISO-8601"
}
```

Response:

```json
{
  "valid": true,
  "reason": null,
  "expiresAt": "ISO-8601"
}
```

The client response is informational only. Sensitive commands revalidate presence server-side.

## 3. Check-ins

### POST /checkins

Input:

```json
{
  "roomId": "uuid",
  "seatId": "uuid",
  "location": {
    "latitude": 0,
    "longitude": 0,
    "accuracy": 0,
    "capturedAt": "ISO-8601"
  },
  "showIdentity": false,
  "qrToken": null
}
```

Server:

- authenticate;
- rate-limit;
- validate location;
- validate target seat;
- atomically close old check-in if necessary;
- create 60-minute check-in;
- recalculate states;
- emit realtime event.

### DELETE /checkins/current

Close current active check-in.

### POST /checkins/current/extend

Requires fresh location.

Extends another configured interval, initially 180 minutes (was 60).

## 4. Observations

### POST /observations

Input:

```json
{
  "roomId": "uuid",
  "seatId": "uuid",
  "status": "FREE",
  "location": {
    "latitude": 0,
    "longitude": 0,
    "accuracy": 0,
    "capturedAt": "ISO-8601"
  },
  "qrToken": null
}
```

Server determines:

- presence validity;
- expiry;
- reputation weight;
- QR validity;
- canonical state.

## 5. Profiles — later

### GET /profiles/:userId
Return only public fields allowed by privacy settings.

### PATCH /profiles/me
Update own profile.

### PATCH /profiles/me/privacy
Update privacy settings.

## 6. Study Mode — later

### POST /study/start
### POST /study/stop
### GET /rooms/:roomId/people

Only return users who opted into visibility.

## 7. Blocks — later

### POST /users/:userId/block
### DELETE /users/:userId/block

Blocking must affect DM authorization immediately.

## 8. Reports — later

### POST /users/:userId/reports

Input:

- reason;
- description;
- roomId optional;
- attachment metadata optional.

For evidence uploads, prefer:

1. request signed upload instruction from API;
2. upload directly to R2;
3. finalize report attachment reference.

Never make report evidence public.

## 9. Chat — later

### GET /rooms/:roomId/messages
Paginated history.

### POST /rooms/:roomId/messages
Create message after authorization/rate limit.

### GET /conversations
### POST /conversations/:id/messages

Block rules and DM privacy must be enforced server-side.

---

# WebSocket

Raw WebSocket (Hibernation API in the Durable Object) at `GET /api/v1/realtime/ws`. Frames are JSON `{ e, d, id? }` (client to server) and `{ e, d }` / `{ ack, d }` (server to client); event names are the same as before.

## Authentication

Socket connection must use authenticated session/token context where available.

Anonymous clients may join room occupancy channels read-only.

Do not trust a user ID supplied directly by socket payload.

## Client -> server

### `room:join`

```json
{
  "roomId": "uuid"
}
```

### `room:leave`

```json
{
  "roomId": "uuid"
}
```

Later:

- `chat:join`
- `conversation:join`
- typing events if needed.

## Server -> client

### `seat:state-changed`

```json
{
  "roomId": "uuid",
  "seatId": "uuid",
  "status": "OCCUPIED",
  "confidence": 0.98,
  "lastUpdatedAt": "ISO-8601"
}
```

### `room:summary-changed`

```json
{
  "roomId": "uuid",
  "free": 20,
  "occupied": 60,
  "uncertain": 5,
  "unknown": 23,
  "total": 108
}
```

### `room:daily-reset`

Client should invalidate/reload room state.

Later:

### `chat:message-created`
### `dm:message-created`

## Reliability rule

Socket events are notifications, not the source of truth.

If a client reconnects, it must reload current canonical state via REST.
