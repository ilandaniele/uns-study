# Security, Moderation and Privacy

## 1. Core rule

Never trust the client for:

- authenticated user identity;
- room presence;
- seat state;
- seat ownership;
- expiration;
- reputation;
- moderation permissions.

## 2. Rate limiting

Use Redis-backed rate limits.

Initial values are tunable, not product truth.

Suggested starting points:

- check-in: 5 attempts/minute/user;
- observation: 6 actions/minute/user;
- distinct seats observed: cap over rolling 10-minute window;
- global chat: 20 messages/minute/user;
- DM: 15 messages/minute/user;
- report creation: strict daily cap unless admin.

New accounts may have stricter mutation limits.

## 3. Abuse signals

Record security events for:

- rapid seat toggling;
- observations across many seats in a short time;
- repeated rejected/conflicting reports;
- excessive chat/DM attempts;
- many accounts tied to suspicious network/device patterns where legally/technically appropriate;
- impossible transitions between distant rooms when multiple rooms exist.

Do not automatically ban solely from a heuristic score unless the behavior is clearly abusive.

## 4. IP handling

Do not depend only on IP blocking.

If storing IP-related data, prefer a rotating or salted hash where feasible for abuse correlation.

Document retention.

## 5. Turnstile

Use Cloudflare Turnstile for:

- suspicious signup/login flows;
- repeated report submissions;
- suspicious message/seat mutation patterns;
- other high-risk actions.

Do not put a CAPTCHA in front of every normal seat interaction.

## 6. Location privacy

Exact geolocation is sensitive.

Rules:

- never expose raw latitude/longitude publicly;
- never include it in room realtime events;
- minimize retention;
- store only accuracy and derived validation when enough;
- if exact coordinates are temporarily logged for debugging/security, define short retention and restrict access.

## 7. User report evidence

Photo evidence must be private.

Cloudflare R2 object:

- private by default;
- non-guessable object key;
- no public bucket URL;
- access only through backend-authorized signed URL;
- short signed URL expiration.

Record:

- content type;
- size;
- uploader;
- report ID;
- upload timestamp.

Set file-size and MIME validation.

## 8. Blocking

Blocking is enforced server-side.

For DMs:

- check both directions for an active block before creating message;
- do not rely only on hiding the UI button.

## 9. Authentication

Better Auth controls sessions.

The API must validate auth/session for protected REST and WebSocket actions.

Deployed accounts must prove email ownership before authenticated access. Email registration uses a single-use six-digit code; creating a pending password account is disabled. Legacy unverified accounts must use code sign-in, which revokes their unproven credentials and sessions. See [EMAIL_OWNERSHIP.md](docs/EMAIL_OWNERSHIP.md).

Do not trust `userId` from request body.

## 10. Database security

Use a least-privilege DB credential where feasible.

Do not expose Neon connection strings to the browser.

Only backend/database tooling gets direct DB credentials.

## 11. CORS

API should allow only expected frontend origins in production.

WebSocket origin rules must be configured too.

## 12. Upload security

For report photos:

- image MIME allowlist;
- maximum size;
- optional image re-encoding later;
- strip or avoid serving metadata publicly;
- no executable files.

## 13. Moderation

Admin actions later:

- dismiss report;
- warn user;
- mute chat;
- restrict seat observations;
- temporary suspension;
- permanent ban.

All moderation actions should be audited.

Verified, unrestricted ADMIN accounts may inspect stored account/profile fields, privacy preferences and current presence through the dedicated `/admin/users/:id/profile` endpoints. MODERATOR alone is insufficient. Public profiles, room lists, map identity and block behavior keep their existing privacy rules. Private profile/photo reads are audited without copying field values into metadata, use private/no-store responses and never return credentials, session tokens or coordinates. Privacy notices and profile settings disclose this administrative access.

## 14. Data deletion / retention

Before production launch, define:

- how users delete account;
- how long report evidence is retained;
- how moderation/audit history is retained;
- what happens to messages after account deletion;
- location evidence retention.

Do not postpone these decisions indefinitely.
