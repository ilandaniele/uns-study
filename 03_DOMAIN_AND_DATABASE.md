# Domain Model and Database Specification

## 1. Important auth note

Better Auth owns its authentication tables.

Do not manually create a second competing authentication model.

Use Better Auth's generated/migrated user/account/session/verification tables according to the installed version and configuration.

Application-domain tables should reference the Better Auth user identifier.

Keep auth integration isolated so an ID type adjustment can be made once during initial setup.

## 2. Domain entities

### Room
- id
- slug
- name
- description
- latitude
- longitude
- geofenceRadiusM
- timezone
- dailyResetTime
- active
- timestamps

### RoomTable
Represents either a normal table or a wall bar.

- id
- roomId
- code
- label
- type: `MAIN_TABLE | WALL_BAR`
- x, y
- width, height
- rotation
- timestamps

### Seat
- id
- roomId
- tableId
- code
- seatNumber
- x, y
- rotation
- active
- timestamps

### SeatCurrentState
- seatId
- status: `UNKNOWN | FREE | OCCUPIED | UNCERTAIN`
- confidence 0..1
- sourceSummary
- lastUpdatedAt
- updatedAt

### CheckIn
- id
- userId
- roomId
- seatId
- status: `ACTIVE | COMPLETED | EXPIRED | CANCELLED`
- showIdentity
- presenceVerified
- locationAccuracyM
- startedAt
- expiresAt
- endedAt
- timestamps

Database constraints:
- maximum one ACTIVE check-in per user;
- maximum one ACTIVE check-in per seat.

Use partial unique indexes.

### SeatObservation
- id
- userId
- roomId
- seatId
- observedStatus: `FREE | OCCUPIED`
- presenceVerified
- qrVerified
- confidenceWeight
- observedAt
- expiresAt
- timestamps

### SeatStateEvent
Append-only.

- id
- roomId
- seatId
- userId nullable
- eventType
- oldStatus
- newStatus
- metadata JSONB
- createdAt

Example event types:

- CHECK_IN
- CHECK_OUT
- SESSION_EXTENDED
- SESSION_EXPIRED
- OBSERVATION_CREATED
- STATE_CHANGED
- DAILY_RESET

### UserProfile
- userId
- firstName
- lastName
- nickname
- avatarKey/url
- career
- bio
- instagram
- studentNumber
- timestamps

### UserPrivacySettings
- userId
- showFullName
- showNickname
- showCareer
- showCurrentSubject
- showInstagram
- showStudentNumber
- showInRoom
- showSeat
- allowDirectMessages
- timestamps

### UserReputation
Internal only.

- userId
- observationScore
- attendanceScore
- spamScore
- confirmedObservations
- rejectedObservations
- timestamps

### UserRoomPresence
- userId
- roomId
- presenceVerified
- firstSeenAt
- lastSeenAt
- active

### StudyStatus
- userId
- roomId
- subject
- message
- lookingForGroup
- active
- startedAt
- updatedAt

### RoomQrCode
- id
- roomId
- tableId nullable
- token
- active
- timestamps

### UserBlock
- blockerId
- blockedId
- createdAt

Unique `(blockerId, blockedId)`.

### UserReport
- id
- reporterId
- reportedUserId
- roomId nullable
- reason
- description
- status: `OPEN | UNDER_REVIEW | RESOLVED | DISMISSED`
- createdAt
- resolvedAt

### UserReportAttachment
- id
- reportId
- objectKey/storagePath
- contentType
- sizeBytes
- createdAt

Private storage only.

### SecurityEvent
- id
- userId nullable
- eventType
- ipHash nullable
- metadata JSONB
- createdAt

## 3. Chat entities — later phase

### ChatRoom
- id
- roomId
- name
- timestamps

### ChatMessage
- id
- chatRoomId
- userId
- content
- deletedAt
- createdAt

### DirectConversation
- id
- userA
- userB
- createdAt

Store canonical ordering of user IDs or enforce a unique normalized pair to prevent duplicate conversations.

### DirectMessage
- id
- conversationId
- senderId
- content
- deletedAt
- createdAt

## 4. Study session / leaderboard entities — later phase

### StudySession
Separate historical verified study duration from live check-ins.

- id
- userId
- roomId
- checkInId nullable
- startedAt
- endedAt
- verifiedMinutes
- source
- createdAt

Rankings should be derived from StudySession records or materialized aggregates.

## 5. Indexes

At minimum:

- seats(room_id)
- seat_current_state(status)
- check_ins(user_id, status)
- check_ins(seat_id, status)
- check_ins(room_id, status)
- check_ins(expires_at)
- seat_observations(seat_id, expires_at)
- seat_observations(user_id, created_at)
- seat_state_events(room_id, created_at desc)
- security_events(user_id, created_at desc)
- chat_messages(chat_room_id, created_at desc)
- direct_messages(conversation_id, created_at desc)

## 6. Transaction requirements

Check-in creation must be transactional.

Recommended approach:

1. lock/resolve user's active check-in;
2. close it if moving;
3. verify target seat does not have a valid active self check-in;
4. insert new check-in;
5. recalculate affected previous and target seats;
6. append events;
7. commit.

Do not rely only on application checks. Add database uniqueness constraints.

## 7. Daily reset

Daily reset should update operational rows rather than deleting history.

Pseudo transaction:

```sql
UPDATE check_ins
SET status = 'EXPIRED', ended_at = now()
WHERE room_id = $1
  AND status = 'ACTIVE';

UPDATE seat_observations
SET expires_at = LEAST(expires_at, now())
WHERE room_id = $1
  AND expires_at > now();

UPDATE seat_current_state s
SET status = 'UNKNOWN',
    confidence = 0,
    source_summary = 'DAILY_RESET',
    last_updated_at = now(),
    updated_at = now()
FROM seats seat
WHERE s.seat_id = seat.id
  AND seat.room_id = $1;

UPDATE user_room_presence
SET active = false
WHERE room_id = $1;

UPDATE study_status
SET active = false,
    updated_at = now()
WHERE room_id = $1;
```

Exact SQL should match the final Drizzle schema and naming conventions.

### Seat reports and presence votes

- Reporting FREE or SAVED on another person's active check-in opens or joins a five-minute ABSENT dispute. OCCUPIED joins an existing vote as PRESENT; it does not challenge a matching occupied state.
- Each reporter has one replaceable vote: PRESENT (person there), ABSENT (empty seat), or SAVED (person absent, belongings remain). Reports require server-validated room presence and retain the observation rate limits.
- ABSENT and SAVED together determine whether the person left. If absence wins, close the old check-in and record its study session. Then choose FREE or SAVED by their respective vote weights; a tie about belongings leaves SAVED.
- A holder's GPS-validated STILL_HERE response, or a currently protected verification photo, requires at least two absence confirmations besides the opener before ending the check-in. CLAIM cannot displace a photo-protected holder.
- Existing disputes and old clients remain compatible: missing saved vote totals mean zero. The SQLite vote column is unrestricted TEXT, so the additional vote needs no destructive table migration.
- Opening a vote privately invites the room's other unexpired check-in holders. The opener and incumbent are excluded; the incumbent keeps their dedicated challenge. The app shows the deadline as a live countdown on every page and recovers missed invitations on reconnect. Push invitations carry the same deadline and expire with it; votes and timer ticks do not resend them.

## 8. Seed geometry

The seed must create:

- one initial room;
- M01..M12;
- 8 seats on every main table;
- B01..B04 wall bars;
- 3 places on every bar;
- 108 seats total;
- one `seat_current_state` row per seat initialized UNKNOWN.

Geometry should be stored as normalized coordinates or a stable SVG design coordinate system, e.g. 0..1000 width and 0..1600 height.
