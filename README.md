# 🌌 Stars of Dominion

**Stars of Dominion** is a space-themed grand strategy game built with **Next.js** and **Appwrite**. Command your faction, manage your government, and navigate interstellar crises in a galaxy full of intrigue and danger.

## 🚀 Getting Started

### Prerequisites
1. **Create Appwrite project** and a **Database** with id `game` (or change `DB_ID` in code).
2. Create collections:
   - `world_state` (attributes: `day:int`, `resources:json`)
   - `events` (attributes as in `appwrite/collections.json`)
   - `gazettes` (attributes in `collections.json`)
3. Create a document in `world_state` with `day=1` and resources JSON.
4. Copy `.env.example` to `.env.local` and fill values:
   ```text
   NEXT_PUBLIC_APPWRITE_ENDPOINT=...
   NEXT_PUBLIC_APPWRITE_PROJECT=...
   APPWRITE_API_KEY=...
   GAZETTE_WINDOW_DAYS=2
   ```

### Installation
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Open the Game**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## 🎮 Gameplay Features

- **Faction Management**: Choose from various factions, each with unique origins and traits.
- **Interstellar Politics**: Navigate a complex web of governments, doctrines, and policies.
- **Dynamic Events**: Respond to galactic crises and manage your society's growth.
- **Advanced Simulation**: Detailed buildings, propaganda, and societal development mechanics.

## 🛠️ Project Tools
- **Import events**: 
  ```bash
  APPWRITE_API_KEY=... npm run import:data -- data/events.json
  ```
- **Functions**: Deploy `advanceDay` and `resolveEvent` in Appwrite Console (Node 18+).

---

*Made with love by [LorjinandLolo](https://github.com/LorjinandLolo)*
