# Stars of Dominion

Next.js 16 / React 19 / TypeScript. PostgreSQL via Prisma (`prisma/schema.prisma`, client generated into `lib/generated/prisma/`, singleton in `lib/db.ts`), better-auth for accounts (`lib/auth.ts`), Zustand state, Tailwind, Jest.

- Database: `docker compose up -d` (Postgres 17 on port 5433). Migrations: `npm run db:migrate`.
- Dev server: `npm run dev`. Game loop worker: `npm run worker` (scripts/game-loop.ts) — required for the live game.
- Bootstrap a fresh DB: `npx tsx scripts/push-init-state.ts` (world snapshot) then `npm run setup:duel` (dev accounts + faction claims).
- Client gets game state by polling `/api/game/sync` (hooks/useGameSync.ts); JSON-bearing DB columns are TEXT holding JSON strings — call sites JSON.parse/stringify.
