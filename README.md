# 🌌 Stars of Dominion

**Stars of Dominion** is a space-themed grand strategy game built with **Next.js** and **PostgreSQL**. Command your faction, manage your government, and navigate interstellar crises in a galaxy full of intrigue and danger.

## 🚀 Getting Started

### Prerequisites
1. **Node.js 22+** and a **PostgreSQL** database, either:
   - **Native PostgreSQL** (17 or 18) on port 5432 — lighter on a laptop. Once, as the `postgres` superuser:
     ```sql
     CREATE ROLE stars LOGIN PASSWORD 'dominion' CREATEDB;
     CREATE DATABASE stars_dominion OWNER stars;
     ```
   - or **Docker Desktop**: `npm run db:up` starts Postgres 17 on port **5433** (use `5433` in the URL below).
2. Copy `.env.local` values (or create it) with at least:
   ```text
   DATABASE_URL="postgresql://stars:dominion@localhost:5432/stars_dominion"
   BETTER_AUTH_SECRET=<any long random string>
   BETTER_AUTH_URL=http://localhost:3000
   GAZETTE_WINDOW_DAYS=2
   ```

### Installation
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Apply migrations** (Docker users run `npm run db:up` first):
   ```bash
   npm run db:migrate
   ```

3. **Seed the game world and dev accounts**:
   ```bash
   npx tsx scripts/push-init-state.ts
   npm run setup:duel
   ```

4. **Run the game** (two terminals):
   ```bash
   npm run dev      # the website
   npm run worker   # the game engine (required); `npm run worker:forever` restarts it if it exits
   ```

5. **Open the Game**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## 🎮 Gameplay Features

- **Faction Management**: Choose from various factions, each with unique origins and traits.
- **Interstellar Politics**: Navigate a complex web of governments, doctrines, and policies.
- **Dynamic Events**: Respond to galactic crises and manage your society's growth.
- **Advanced Simulation**: Detailed buildings, propaganda, and societal development mechanics.

## 🛠️ Project Tools
- **Import events**:
  ```bash
  npm run import:data -- data/events.json
  ```
- **Inspect the database**: `npm run db:studio` (Prisma Studio).

---

*Made with love by [LorjinandLolo](https://github.com/LorjinandLolo)*
