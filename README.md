# Stars of Dominion — Next.js + Appwrite Starter

A minimal, **data-first** .io game scaffold using **Next.js (App Router)** and **Appwrite**.

## What’s included
- Next.js 14 app with simple UI (Resources, Event, Newspaper).
- Server Actions that read/write **Appwrite Database**.
- `/api/gazette` route to fetch last N days of articles.
- Appwrite schema helper (`appwrite/collections.json`).
- Import script (`scripts/importData.mjs`) to bulk load events from a JSON file.
- Example **Functions**: `advanceDay`, `resolveEvent` (Node18).

## Setup
1) **Create Appwrite project** and a **Database** with id `game` (or change `DB_ID` in code).
2) Create collections:
   - `world_state` (attributes: `day:int`, `resources:json`)
   - `events` (attributes as in `appwrite/collections.json`)
   - `gazettes` (attributes in `collections.json`)
3) Create a document in `world_state` with day=1 and resources JSON.
4) Copy `.env.example` to `.env.local` and fill values:
```
NEXT_PUBLIC_APPWRITE_ENDPOINT=...
NEXT_PUBLIC_APPWRITE_PROJECT=...
APPWRITE_API_KEY=...
GAZETTE_WINDOW_DAYS=2
```
5) Install deps & run:
```
npm i
npm run dev
```
6) **Import events** (optional):
```
APPWRITE_API_KEY=... npm run import:data -- data/events.json
```
7) (Optional) Deploy **Functions** `advanceDay` and `resolveEvent` in Appwrite Console; set runtime to Node 18+ and add your `APPWRITE_API_KEY` as an environment variable.

## Where to put your 4 JSON files
- Convert your `factions/resources/map/events` into Appwrite collections as needed. This starter only requires `world_state`, `events`, and `gazettes` to run. You can add more panels & queries later.

## Notes
- This is intentionally tiny: one event per day demo; even days show the Gazette.
- Replace the placeholder choice handling with your event/effect logic.
