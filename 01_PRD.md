# Product Requirements Document — UNS Study

## 1. Product vision

UNS Study is a collaborative web/PWA that helps people know whether a university study room has available seating before or while they are going there.

The system is not an official booking platform and must not behave like one. It provides **recent, community-generated occupancy information**.

The product combines:

- real-time approximate seat availability;
- collaborative observations;
- verified self check-ins;
- optional social profiles and Study Mode;
- room-wide and private chat;
- moderation and anti-abuse mechanisms;
- optional advertising once the product has real usage.

The first release supports one study room. The domain model must support multiple rooms later.

## 2. Main user problem

A person currently has to physically go to the study room to find out:

- whether there is room;
- which area has free seats;
- whether occupancy is high;
- whether people are studying similar subjects.

The first question the app must answer in seconds is:

> “¿Hay lugar para estudiar ahora?”

## 3. Non-goal: reservations

There is no reservation system.

Do not implement:

- reserve a seat;
- hold a seat;
- save a seat for a friend;
- book a future time;
- mark a seat as yours while away.

“Estoy acá” means only:

> “I am physically using this seat right now.”

## 4. User types

### 4.1 Anonymous visitor

Can:

- open the app;
- view the room;
- view current seat states;
- view occupancy summaries;
- view general announcements/content;
- see advertising.

Cannot:

- change seat information;
- check in;
- submit observations;
- use Study Mode;
- chat;
- DM;
- appear in rankings;
- report users.

### 4.2 Registered user

Authentication:

- Google OAuth;
- email/password.

No mandatory university verification.

Student number / LU is optional.

Can:

- mark “Estoy acá”;
- report another seat as free/occupied;
- create a profile;
- choose what profile fields are public;
- optionally show their identity in the room;
- use Study Mode;
- use global room chat;
- send private messages;
- block users;
- report users;
- upload photo evidence for a report;
- participate in rankings.

## 5. Initial room

The initial room is a long rectangle.

Capacity:

- 12 main tables;
- 8 seats per main table;
- 96 main-table seats;
- 4 wall bars;
- 3 positions per wall bar;
- 12 bar positions;
- **108 total positions**.

Main-table arrangement:

- 6 tables in the left block;
- 6 tables in the right block.

Wall bars:

- left wall near entrance — 3 places;
- right wall near entrance — 3 places;
- left wall near the back — 3 places;
- right wall near the back — 3 places.

Important geometry note:

The two bars near the entrance run **along the side walls**. They are not horizontal bars across the bottom of the plan.

Furniture is generally fixed, though an individual chair may occasionally move.

## 6. Seat states

Canonical server states:

- `UNKNOWN`
- `FREE`
- `OCCUPIED`
- `UNCERTAIN`

`MY_SEAT` is a client-side visual state only and should not be persisted as the canonical server status.

Every seat state also has:

- confidence;
- last update timestamp;
- source summary.

Suggested visual mapping:

- green = FREE;
- red = OCCUPIED;
- yellow = UNCERTAIN;
- gray = UNKNOWN;
- blue = current user's own active seat.

The UI does not need to expose a raw confidence percentage. It can display human-friendly labels such as “alta confianza”, “información reciente”, etc.

## 7. Self check-in

Action: **Estoy acá**

Requirements:

- authenticated user;
- fresh browser geolocation;
- server-side geofence validation;
- acceptable location accuracy;
- user passes rate limiting;
- target seat exists in that room.

Rules:

- one active check-in per user;
- one active self check-in per seat;
- if a user moves to another seat, previous active check-in is atomically closed;
- initial duration: 60 minutes.

Before expiry, the app may ask:

> “¿Seguís acá?”

Extending the session requires fresh presence validation.

## 8. Seat observations

Registered users physically present may report:

- “Está libre”
- “Está ocupado”

This creates an observation, not an authoritative state mutation.

The canonical seat state is derived from recent signals.

Initial observation lifetimes:

- FREE observation: 15 minutes;
- OCCUPIED observation: 20 minutes;
- corroborated evidence may influence state slightly longer.

## 9. Confidence / consensus

The server calculates canonical state from signals such as:

- active self check-in;
- recent observations;
- number of independent agreeing users;
- conflicting observations;
- user reputation;
- optional QR verification;
- signal age.

Initial deterministic behavior should be simple and explainable.

Examples:

- active self check-in -> OCCUPIED, very high confidence;
- multiple recent FREE observations and no conflict -> FREE;
- recent FREE and OCCUPIED conflict -> UNCERTAIN;
- no recent valid evidence -> UNKNOWN.

Keep the state-calculation logic in one domain service so weights/rules can be tuned without changing controllers or UI.

## 10. GPS / presence

Browser geolocation is used to establish that a user is near the room/building.

It must **not** be used to infer the exact desk/seat inside the room.

Sensitive actions require server-side presence validation.

Input:

- latitude;
- longitude;
- accuracy;
- captured timestamp;
- room ID.

Reject if:

- coordinates invalid;
- location stale;
- accuracy outside configured threshold;
- user outside configured geofence.

Exact raw coordinates must never be publicly exposed.

Prefer retaining only the minimum location evidence required for security/auditing.

## 11. QR

QR is optional and is not required to use the app.

There may be QR codes on some tables.

A QR may:

- deep-link into a specific table;
- provide an extra presence-confidence signal;
- increase trust for observations about that table.

Example:

`/sala/principal?table=M03&source=qr`

The architecture may later support QR per seat, but the MVP must not require it.

## 12. Daily reset

At a configurable time, initially:

`04:00 America/Argentina/Buenos_Aires`

reset only the **operational state**:

- expire active check-ins;
- expire observations;
- set current seat states to UNKNOWN;
- clear active room presence;
- stop active “studying now” statuses.

Do not delete:

- users;
- profiles;
- messages;
- reports;
- report evidence;
- historical study sessions;
- historical seat events;
- reputation;
- ranking history;
- analytics.

The reset must be idempotent.

## 13. Profiles

Optional fields:

- first name;
- last name;
- nickname;
- avatar;
- career;
- current subject;
- bio;
- Instagram;
- student number / LU.

Each field must have a privacy control.

A user may choose to publicly identify as:

- full name;
- first name;
- nickname;
- nickname + name;
- minimal/hidden identity where allowed.

When checking into a seat, ask whether they want other registered users to see that they are at that seat.

Default should be private.

## 14. Study Mode

Optional “Estudiando ahora” mode.

Possible fields:

- current subject;
- career;
- short status;
- exam/topic;
- looking for a study group.

Examples:

- “Derecho Constitucional”
- “Preparando parcial del viernes”
- “Busco gente para estudiar”

Only expose fields the user has chosen to share.

## 15. People in the room

Registered users can access a social list of users who explicitly opted to appear.

Do not automatically expose every logged-in or checked-in user.

## 16. Chat

### Global room chat

Initial channel:

`#sala-principal`

Needs:

- real-time messages;
- timestamp;
- user profile;
- delete own message;
- block;
- report;
- anti-spam rate limiting;
- moderator controls.

### Direct messages

Any registered user may message another registered user if the receiver allows DMs.

Blocking another user immediately prevents further private interaction.

## 17. User blocking

Blocking is immediate and personal.

If A blocks B:

- B cannot DM A;
- A should not receive DMs from B;
- hide or reduce profile interaction where appropriate.

Blocking and reporting are independent actions.

## 18. User reporting

A registered user can report another user from:

- profile;
- global chat;
- direct-message context.

Report form:

- reason;
- description;
- optional photo evidence.

Suggested reasons:

- spam;
- harassment;
- inappropriate behavior;
- impersonation;
- seat-state trolling / false information;
- offensive content;
- other.

Photo evidence:

- may be captured from mobile camera;
- may be selected from device;
- must be stored privately;
- must be available only to authorized moderation/admin users;
- must never be exposed publicly.

A single report does not automatically ban a user. Moderation actions can be automatic only for clearly defined severe abuse patterns.

## 19. Leaderboards

Tabs:

- today;
- week;
- month;
- all-time.

Possible categories:

- verified study time;
- study streak;
- community contribution.

Use daily caps or other anti-gaming measures so leaving a stale session open does not create a reward.

## 20. Monetization

Google AdSense is a later-stage feature.

Do not place ads:

- on top of the map;
- adjacent to seat controls;
- where accidental clicks are likely;
- as an intrusive entry popup.

Possible placements:

- below room summary;
- below interactive map;
- between community/announcement content.

Advertising must remain secondary to utility.

## 21. Product metrics

Track at minimum:

- DAU;
- registered users;
- room page visits;
- check-ins;
- observations;
- percentage of seats with fresh information;
- D1/D7/D30 retention;
- study sessions;
- Study Mode adoption;
- chat usage;
- reports;
- ad impressions once enabled.

Important product metric:

**Fresh Seat Coverage** = percentage of seats with valid recent evidence.

## 22. MVP definition

The first useful MVP is complete when:

1. room with all 108 places renders;
2. anonymous users can see current state;
3. auth works;
4. presence validation works;
5. a present authenticated user can choose a seat and press “Estoy acá”;
6. only one active check-in per user is possible;
7. check-in lasts 60 minutes;
8. other connected clients receive the change in real time;
9. present users can submit FREE/OCCUPIED observations;
10. observations influence canonical state;
11. stale evidence expires;
12. daily reset works;
13. UI works well on mobile and desktop;
14. server-side authorization and rate limiting protect mutations.
