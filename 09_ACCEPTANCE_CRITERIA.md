# Acceptance Criteria

## MVP Core

### Room map
- [ ] Route `/sala/[slug]` exists.
- [ ] Initial room renders 12 main tables.
- [ ] Initial room renders 4 wall bars.
- [ ] Exactly 108 positions render.
- [ ] Entrance wall bars are on side walls, not across the bottom.
- [ ] Mobile layout is usable.
- [ ] Desktop layout is usable.
- [ ] Seat state is visually distinguishable.
- [ ] Seat detail opens on tap/click.

### Anonymous mode
- [ ] Anonymous user can load room and state.
- [ ] Anonymous user cannot mutate occupancy.
- [ ] Mutation UI clearly requests login.

### Auth
- [ ] Google login works.
- [ ] Email/password works.
- [ ] Logout works.
- [ ] NestJS API derives authenticated user server-side.

### Presence
- [ ] Browser can request location.
- [ ] API validates distance to configured room coordinates.
- [ ] API rejects stale locations.
- [ ] API rejects unacceptable accuracy.
- [ ] UI handles permission denial.
- [ ] Exact coordinates are not broadcast publicly.

### Check-in
- [ ] Authenticated present user can press `Estoy acá`.
- [ ] Check-in expires after 60 minutes.
- [ ] User cannot have two active check-ins.
- [ ] Seat cannot have two active self check-ins.
- [ ] Moving seats closes previous check-in atomically.
- [ ] State becomes OCCUPIED after valid self check-in.
- [ ] Check-out works.

### Observations
- [ ] Present registered user can submit FREE.
- [ ] Present registered user can submit OCCUPIED.
- [ ] Observation is persisted.
- [ ] FREE observation initially expires after 15 minutes.
- [ ] OCCUPIED observation initially expires after 20 minutes.
- [ ] Active self check-in has priority.
- [ ] Conflicting evidence can produce UNCERTAIN.
- [ ] No fresh evidence produces UNKNOWN.

### Realtime
- [ ] Client loads initial state through REST.
- [ ] Client joins room socket channel.
- [ ] Other clients receive seat changes.
- [ ] Summary counters update.
- [ ] Reconnecting client reloads canonical state.
- [ ] Socket is not treated as source of truth.

### Daily reset
- [ ] Scheduled around 04:00 room timezone.
- [ ] Active check-ins expire.
- [ ] Observations expire.
- [ ] Current states reset to UNKNOWN.
- [ ] Historical events are preserved.
- [ ] Operation is idempotent.

### Security
- [ ] No direct browser DB credential.
- [ ] Protected APIs derive current user server-side.
- [ ] Rate limiting protects mutation endpoints.
- [ ] Database constraints prevent duplicate active ownership.
- [ ] Security events can be recorded.
- [ ] CORS configured for production origins.

## Later social/moderation acceptance

### Profiles
- [ ] User controls public fields independently.
- [ ] LU is optional.
- [ ] Seat identity is opt-in.

### Chat
- [ ] Room chat realtime.
- [ ] DM supported.
- [ ] Block prevents further DM server-side.
- [ ] Chat has rate limiting.

### User reports
- [ ] User can report from profile/chat.
- [ ] Reason required.
- [ ] Description optional/configurable.
- [ ] Photo optional.
- [ ] Mobile camera capture supported.
- [ ] Evidence stored privately in R2.
- [ ] Only authorized admin can obtain signed evidence URL.

### Rankings
- [ ] Today/week/month/all-time.
- [ ] Historical sessions are source data.
- [ ] Anti-gaming rules exist.

### Ads
- [ ] Ads are isolated components.
- [ ] No ads overlap room interactions.
- [ ] No mandatory entry popup.
