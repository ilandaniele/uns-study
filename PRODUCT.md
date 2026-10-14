# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mobile-first PWA (Next.js on Cloudflare Workers, installable, push notifications). Desktop is a first-class layout too.

## Users

- **Primary:** university students in Bahía Blanca, any career, who use the main study room ("Sala Principal"). Their job is to find out whether there is a free seat before they walk there, or quickly on arrival, and to keep that information accurate for others.
- **Also:** people who are not university students but use the same room (other institutions, non-students). The product must not assume an institutional email, student number or career. Student number (LU) stays optional.
- **Anonymous visitors** can view the room, seat states and summaries. They cannot mutate state, chat or appear in rankings.
- **Admins/moderators** handle reports, announcements, QR codes and audit logs.

## Product Purpose

The app answers one question in seconds: **"¿Hay lugar para estudiar ahora?"**

It shows recent, community-generated occupancy for a physical room with 108 places: 12 tables of 8 seats and 4 wall bars of 3 stools. Success means:

- a high share of seats carry fresh evidence (**Fresh Seat Coverage** is the key metric);
- people trust the map enough to decide whether to go;
- retention (D1/D7/D30).

## Positioning

Crowd-verified seat state for one specific room. Its trust comes from presence-checked actions:

- a server-side geofence;
- one active self check-in per user and per seat;
- observations (`Está libre` / `Está ocupado`) that feed a deterministic state calculator instead of overwriting state;
- votes on disputes.

It is **not a booking system**: no reservations, no holding seats, no saving a seat for someone.

## Operating Context

- Used on phones while walking to or standing in the room. Also on laptops at a desk.
- `Estoy acá` means "I am physically seated here now". A check-in lasts 180 minutes, with a "Sigo acá" reminder 10 minutes before expiry.
- Initial FREE observations last 15 minutes; initial OCCUPIED observations last 20 minutes.
- A daily operational reset runs at about 04:00 America/Argentina/Buenos_Aires.
- The physical room layout is canonical; see `05_ROOM_LAYOUT.md` and `reference-images/`.
- Social layer: optional profiles with per-field privacy (private by default), Study Mode, room chat and DMs, blocking, reporting, rankings.

## Capabilities and Constraints

- Full product and technical specs: `00_START_HERE.md` through `10_ENVIRONMENT_AND_SERVICES.md`.
- GPS proves approximate room presence, not the exact seat. QR is optional.
- The server is canonical (PostgreSQL). Socket events are notifications only. Never trust the client for identity, presence, seat state, ownership or moderation.
- Ads (AdSense) are secondary to utility. Never on top of the map, next to seat controls, or as an entry popup. Accepted exception: the app-open interstitial (mobile and desktop, skippable after a 5 s countdown) is an intentional entry ad.
- Running costs are covered by voluntary donations: Banco Provincia alias `golf.cabina.mulita`.

## Brand Commitments

- Name: **Sala de Estudio**, with the subtitle "Bahía Blanca".
- **Unofficial.** Built by students, with no endorsement from any university. Do not use any university's logo, crest or institutional identity. Do not speak on behalf of the university.
- Voice: Rioplatense Spanish with **vos**. Informal, close, direct and short ("Estoy acá", "Avisame", "Tocá un lugar"). Controls name their action. Errors say what happened and how to fix it.

## Evidence on Hand

- Reference photos and plan of the real room: `reference-images/` (`Plano.png`, `room-reference-01..03.png`).
- No testimonials, user counts, press or partnerships exist. Do not fabricate any, and do not show fake occupancy or fake people in production.

## Product Principles

1. **Answer "is there room?" first.** The map and summary come before everything else, readable in seconds on a phone.
2. **Honest freshness over false precision.** Show recency and uncertainty plainly. Never present community data as official or certain.
3. **Presence earns write access.** Only people physically in the room change seat information. Everyone can read freely.
4. **Private by default.** Identity, profile fields and seat visibility are opt-in.
5. **Utility over monetization.** Ads and donation prompts never block or crowd the core task.

## Accessibility & Inclusion

- Target WCAG 2.2 AA:
  - contrast ≥ 4.5:1 for text;
  - visible keyboard focus, including on map seats;
  - touch targets of about 44px on mobile;
  - `prefers-reduced-motion` respected.
- Seat state is never conveyed by color alone: use labels, counters and accessible names.
