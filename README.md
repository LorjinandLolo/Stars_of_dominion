# 🌌 Stars of Dominion

**Stars of Dominion** is a space-themed grand strategy game built with **Next.js** and **PostgreSQL**. Command your faction, manage your government, and navigate interstellar crises in a galaxy full of intrigue and danger.

## 🚀 Getting Started

### Prerequisites
1. **Docker Desktop** (runs the PostgreSQL database) and **Node.js 22+**.
2. Copy `.env.local` values (or create it) with at least:
   ```text
   DATABASE_URL="postgresql://stars:dominion@localhost:5433/stars_dominion"
   BETTER_AUTH_SECRET=<any long random string>
   BETTER_AUTH_URL=http://localhost:3000
   GAZETTE_WINDOW_DAYS=2
   ```

### Installation
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the database and apply migrations**:
   ```bash
   npm run db:up
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
   npm run worker   # the game engine (required)
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
