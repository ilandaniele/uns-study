# UNS Study — Start Here

## Purpose

This folder contains the product, architecture, data, UX, security, and implementation context required to begin development of **UNS Study**, a collaborative real-time study-room occupancy PWA.

The first release targets a single study room at UNS. The architecture must support additional rooms later without redesigning the domain model.

## Read in this order

1. `01_PRD.md`
2. `02_ARCHITECTURE.md`
3. `03_DOMAIN_AND_DATABASE.md`
4. `04_API_AND_REALTIME.md`
5. `05_ROOM_LAYOUT.md`
6. `06_UI_UX_SPEC.md`
7. `07_SECURITY_MODERATION_PRIVACY.md`
8. `08_IMPLEMENTATION_PLAN.md`
9. `09_ACCEPTANCE_CRITERIA.md`
10. `10_ENVIRONMENT_AND_SERVICES.md`
11. `CLAUDE.md`

Reference photographs are in `reference-images/`.

## Core product rule

This application **does not reserve seats**.

The primary product flow is:

1. A person opens the app.
2. They immediately see approximate availability.
3. They open the interactive room map.
4. If physically present and authenticated, they can mark **“Estoy acá”** on their own seat.
5. Other users receive the update in real time.
6. Users present in the room can also submit observations that another seat appears free or occupied.

An anonymous visitor is read-only.

## Chosen stack

- Monorepo: Turborepo + pnpm
- Frontend/PWA: Next.js + React + TypeScript + Tailwind
- Backend: NestJS + TypeScript
- Database: PostgreSQL on Neon
- ORM/migrations: Drizzle ORM
- Authentication: Better Auth
- Realtime: Socket.IO from NestJS
- Redis/rate limiting/jobs: Upstash Redis + BullMQ-compatible queue strategy
- Private image storage: Cloudflare R2
- Bot protection: Cloudflare Turnstile
- Frontend hosting: Vercel
- API/WebSocket hosting: Railway
- Analytics: GA4
- Monetization later: Google AdSense

Do not replace this architecture without a concrete technical reason.
