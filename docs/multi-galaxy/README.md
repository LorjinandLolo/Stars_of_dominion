# Multi-galaxy tenancy

*Design document. Casual-play spec Item 10. Written 2026-10-01 against commit `5de053b6`. Nothing here is implemented; the spec says the build is its own piece of work.*

Today Stars of Dominion is one galaxy for everyone: one snapshot row named `default-session`, one worker holding one world in memory, one set of tables with no notion of "which galaxy". This document describes how it becomes many galaxies on one database and one login, and lists every place the single galaxy is baked in.

## 1. Decisions this design is built on

From the spec (Item 10, agreed 2026-10-01):

1. A **Server Master** — a paying customer — creates a galaxy. The owner creates galaxies free. A Server Master's galaxy runs on the owner's machines, with admin powers inside it, and shows no ads. Nothing runs on the customer's hardware.
2. **Up to 15 human players per galaxy, 30 empires in all**; the rest are AI.
3. **One account may play in several galaxies at once.**
4. **One season clock for every galaxy.** Seasons start and end together everywhere; a galaxy created mid-season joins the season in progress.
5. **The public gazette is per galaxy.**
6. **Hosting: a worker pool, several galaxies per worker process, from the first version.** The owner expects to pass 100 galaxies quickly, so the one-galaxy-per-process shortcut is not taken. Worlds become data keyed by galaxy id; workers lease batches of galaxies; strategic ticks are staggered per galaxy. Delta sync (or push) is the prerequisite for the next order of magnitude.

Decisions 3 and 4 are what rule out "copy the whole stack per galaxy": accounts and the season have to be shared, so the database and the login are shared, so everything else needs a galaxy id.

## 2. Measured starting point

One galaxy today (14 empires, a few weeks of play), measured 2026-10-01:

| | |
|---|---|
| Database, whole galaxy incl. 322 articles and 768 chronicle rows | 11 MB |
| World snapshot (`multiplayer_sessions.snapshot`) | 1.25 MB |
| All empire shards (`game_factions.data`) | 0.66 MB |
| Worker process resident memory after one minute | ~130 MB (of which ~110 MB is node + tsx; the world itself is a fraction) |
| Worker cycle | every 5 s; a strategic tick every 24 real minutes is the CPU spike |
| Files hard-coding `default-session` | 21 (list in §7) |
| Files reaching for the one in-memory world (`getGameWorldState()`) | 18 outside tests and probes, 34 scripts (list in §7) |

At 30 empires, expect the world and the tick cost to roughly double. The marginal memory of one more galaxy *inside* an existing process is the parsed world — tens of MB, not 130 — which is the whole reason for decision 6.

## 3. The data model

### 3.1 A `Galaxy` table

```prisma
model Galaxy {
  id           String   @id            // "galaxy-<cuid>"; the existing galaxy keeps a fixed id, §8
  name         String
  slug         String   @unique        // in URLs: /g/<slug>, /gazette/<slug>
  ownerUserId  String                  // who made it (the owner or a Server Master)
  tier         String                  // 'free' | 'master'   → ads or no ads, admin powers
  status       String                  // 'open' | 'running' | 'archived'
  maxPlayers   Int      @default(15)
  maxEmpires   Int      @default(30)
  seed         String                  // galaxy generation seed, §5.4
  tickOffsetS  Int                     // stagger for the strategic tick, §4.4
  createdAt    DateTime @default(now())
  archivedAt   DateTime?
  @@map("galaxies")
}
```

`status` is the lifecycle: *open* (in the lobby, seats free, worker may already run it), *running*, *archived* (worker stops it, snapshot kept, gazette stays readable, no orders accepted). Archiving is what keeps the worker count from growing forever; a galaxy with no human sign-in for N weeks is archived by a nightly job.

### 3.2 `galaxyId` on every game table

Every row that belongs to a galaxy gets `galaxyId String` with an index, and every unique constraint that was "unique in the galaxy" becomes "unique per galaxy":

| Table (Prisma model) | Today | After |
|---|---|---|
| `multiplayer_sessions` (`MultiplayerSession`) | `id = 'default-session'`, plus the lease row `'worker-lease'` | `id = galaxyId`. The world snapshot row *is* the galaxy's state. The lease row moves to its own table (§4.2). |
| `game_factions` (`GameFactionShard`) | `id = factionId` | `id = "<galaxyId>:<factionId>"`, columns `galaxyId`, `factionId`, index `(galaxyId, factionId)`. Faction ids repeat across galaxies (every galaxy has a `faction-aurelian`), so the shard key has to carry the galaxy. |
| `game_orders` (`GameOrder`) | `factionId` | `+ galaxyId`; index `(galaxyId, processed, createdAt)`. The worker drains only its galaxies' orders. |
| `player_profiles` (`PlayerProfile`) — the claims | `userId @unique`, `factionId @unique` | `+ galaxyId`; unique `(galaxyId, userId)` and `(galaxyId, factionId)`. One account, one seat per galaxy, any number of galaxies. `briefSeenAt` and `uiPrefs` stay on the claim: the brief is per galaxy, the dock preference could be per account but per galaxy is simpler and harmless. |
| `invites` (`Invite`) | `inviterFactionId` | `+ galaxyId`. A link puts the friend next to the host *in the host's galaxy*. |
| `empire_messages` (`EmpireMessage`) | `fromFactionId`, `toFactionId` | `+ galaxyId`; cooldown index `(galaxyId, fromFactionId, toFactionId, createdAt)`. |
| `chronicle_events` (`ChronicleEvent`) | — | `+ galaxyId`; indexes gain it as the first column. The chronicle stays append-only. |
| `narrative_articles` (`NarrativeArticle`), `gazettes` (`Gazette`), `feuds` (`Feud`) | — | `+ galaxyId`; `Feud` unique `(galaxyId, factionAId, factionBId)`. |
| `game_saves` (`GameSave`) | per faction | `+ galaxyId`. |
| `user`, `session`, `account`, `verification` (better-auth) | global | **unchanged**: the login is shared. |
| `world_state`, `events`, `factions`, `user_profiles`, `armies`, `planets`, `ships`, `crises`, `systems`, `game_fleets` | legacy Appwrite-era tables | not extended; §7.3 says which readers are dead and should go. |

What does **not** get a galaxy id: the season (§5.3), the account tables, `lib/data` content, `generated-systems.json` (the map is the same for every galaxy until §5.4 says otherwise).

### 3.3 Inside the snapshot

The world snapshot gets one field, `galaxyId`, at the top level, so a world in memory knows what it is and `serializeWorld`/`deserializeWorld` round-trip it. The worker refuses to save a world into a row whose id is not the world's `galaxyId` — the same kind of guard as the lease.

`claimedFactionIds`, `factionNames`, `factionPlayerNames`, `delegation`, `firstWeekGoals`, `empireMessages` are already per world; they stay where they are and are simply loaded per galaxy.

## 4. The worker: a pool, many galaxies per process

### 4.1 Shape

```
worker process (WORKER_GALAXIES=8)
  ├─ registry: Map<galaxyId, { world, tickCounter, lastShardSaved, knownShardFactionIds, ... }>
  ├─ every 5 s: for each leased galaxy, in order → runGameTick(galaxy)
  ├─ every 60 s: heartbeat the leases; pick up unleased galaxies while under WORKER_GALAXIES
  └─ chronicle, notifications, crisis engine, tick scheduler: per galaxy (§4.3)
```

`runGameTick` today is a function over module state; it becomes a function over a `GalaxyRuntime` object. The order handlers in `scripts/game-loop.ts` (the giant `switch`) take `world` already — they were written against `world`, not the singleton, which is why `tmp/` probes could drive them. The per-cycle bookkeeping around them (`cachedWorld`, `lastShardSaved`, `knownShardFactionIds`, `tickCounter`, `cycleInProgress`, `cycleStartedAtMs`) is what moves into the runtime.

Cycles run galaxies sequentially in one process. With 8 galaxies at ~50 ms each an idle cycle is 0.4 s of a 5 s budget; a strategic tick is seconds, and §4.4 keeps two galaxies from ticking in the same cycle. The hang watchdog watches the *cycle* (all galaxies); a stuck galaxy still takes its siblings down with it on restart, which is the price of the pool. Keep `WORKER_GALAXIES` modest (8–16) so the blast radius stays small; scale with more processes, `docker compose up --scale worker=N`.

### 4.2 Leases

Today: one row `worker-lease` in `multiplayer_sessions`, one holder, dead-holder takeover after 3 minutes without a session save. After:

```prisma
model GalaxyLease {
  galaxyId    String   @id
  workerId    String
  heartbeatAt DateTime
  @@map("galaxy_leases")
}
```

- A worker with a free slot claims an unleased `running`/`open` galaxy, or one whose `heartbeatAt` is older than 3 minutes, with a conditional update (`WHERE heartbeatAt < now() - interval '3 minutes' OR workerId IS NULL`) — the database decides races, as it does for the current lease.
- Heartbeat every minute per held galaxy. On SIGTERM the wrapper (`scripts/worker-forever.js`, Item 9) waits for the worker to release all its leases.
- The existing takeover logic ("holder presumed dead, taking over") carries over per galaxy.
- `scripts/clear-lease.ts` / `clear-worker-lease.ts` become `clear-galaxy-lease.ts <galaxyId>`.

### 4.3 Module-level state that has to become per galaxy

These are correct today only because one process holds one world. Each becomes a field on `GalaxyRuntime` (or a `Map<galaxyId, …>` inside the module, with the id passed in):

| File | State | Why it matters |
|---|---|---|
| `lib/narrative/chronicle.ts` | `buffer`, `droppedSinceLastFlush` | events of two galaxies would flush into one batch; the flush has to stamp `galaxyId` |
| `lib/narrative/chronicle-flush.ts` | reads that buffer | flush per galaxy, after that galaxy's save (Invariant 2 of the narrative design is per galaxy) |
| `lib/time/notification-hooks.ts` | `_notificationQueue`, `_broadcasts` | a note fired for galaxy A must not be drained into galaxy B's empires |
| `lib/time/notification-names.ts` | `_labels` | empire names are per galaxy once players rename or galaxies differ; register per galaxy before draining that galaxy |
| `lib/time/crisis-engine.ts` | `_activeCrises` | crisis ids would collide across galaxies |
| `lib/time/tick-scheduler.ts` | `_lastProcessedTickAt`, `_tickIndex` | tick index is per galaxy |
| `lib/narrative/press-voices.ts` | roster `cache` | publishers are per galaxy (they are derived from the galaxy's factions) |
| `lib/ai/faction-personalities.ts` | `envoyCache` | keyed by faction id, which repeats across galaxies; key by `galaxyId:factionId` |
| `lib/game-world-state-singleton.ts` | `globalGameStateInstance` | **becomes a factory**: `createGameWorld(galaxy)`; the getter goes (§7.2) |
| `lib/planet-surface/generator.ts` | `surfaceCache` | keyed by planet id; safe *only* while every galaxy uses the same map and the surface is derived from the id alone. The moment seeds differ (§5.4) it is keyed by `galaxyId:planetId` |
| `lib/politics/registry.ts` | `registriesInitialized` | content registry, galaxy-independent: stays |
| `lib/db.ts` | the Prisma client | shared: stays |

### 4.4 Staggered strategic ticks

Ticks fire at fixed UTC hours (`TICK_HOURS_UTC` in `lib/time/time-config.ts`, `lib/time/time-helpers.ts`). With one shared clock, every galaxy would tick in the same second. `Galaxy.tickOffsetS` (0–1439 s, assigned round-robin at creation) shifts each galaxy's tick boundary, so a worker with 8 galaxies sees them tick in different cycles and a machine with 200 sees a smooth load instead of a spike four times a day. Player-facing times ("next cycle in 23 minutes") already come from the world's own clock, so the offset is invisible.

### 4.5 The narrator

`scripts/narrator.ts` becomes a loop over galaxies: for each galaxy with unnarrated events, `narrateOnce({ galaxyId })`. Everything it reads and writes (`memory-service`, `retrospective-service`, feuds, articles, the front page) is filtered by `galaxyId`. Its LLM budget (`NARRATOR_LLM_MAX_PER_HOUR/DAY`) becomes a global budget shared fairly across galaxies, or a Server Master's galaxy gets its own — a pricing question, not a design one. One narrator process is enough for hundreds of galaxies; it is prose, not physics.

## 5. The web app

### 5.1 Which galaxy is this request about?

`lib/multiplayer/caller-faction.ts` today resolves `{ userId, factionId }` from the session cookie. After: `{ userId, galaxyId, factionId }`, where the galaxy comes from, in order:

1. the URL, for pages under `/g/[slug]/…` and `/gazette/[slug]/…`;
2. the `x-galaxy` header / `?g=` for API routes, checked against the caller's claims — a caller may only name a galaxy they hold a seat in (or any galaxy, for read-only public data);
3. otherwise the caller's most recently played claim.

The identity never comes from the body — the current rule — and neither does the galaxy: a claimed-but-wrong galaxy id is a 403, exactly like a wrong faction id today.

### 5.2 Routes and what changes in each

| Route | Change |
|---|---|
| `app/api/game/sync` | snapshot row by `galaxyId`; shards `where: { galaxyId }`; `humanPlayers` from claims `where: { galaxyId }` |
| `app/api/game/order` → `lib/multiplayer/order-queue.ts` | order row gets `galaxyId` from the caller; ownership check per galaxy |
| `app/api/game/brief` | all five reads filtered by `galaxyId`; share card path becomes `/gazette/<slug>/<factionId>` |
| `app/api/game/piracy`, `app/api/game/economy`, `app/api/game/state` | snapshot by `galaxyId` |
| `app/api/lobby/claim` | claim in a galaxy; seat count against `Galaxy.maxPlayers`; empire list of *that* galaxy |
| `app/api/lobby/admin/reset` | scoped to a galaxy; a Server Master may call it for their own galaxy (session-based), the owner for any (secret) |
| `app/api/invites`, `app/api/invites/[code]`, `app/join` | invite carries `galaxyId`; the join page says which galaxy |
| `app/api/messages` | `galaxyId` on the row; cooldown per galaxy pair |
| `app/api/player/prefs` | per claim, unchanged in shape |
| `app/api/narrative/history`, `app/api/gazette` | `galaxyId` filter |
| `app/gazette`, `app/gazette/[factionId]` | become `app/gazette/[slug]` and `app/gazette/[slug]/[factionId]`; `/gazette` becomes a directory of galaxies with their latest headline |
| `app/api/espionage`, `app/api/game-construction`, `app/api/debug`, `lib/actions/debug-actions.ts`, `lib/time/auto-resolve.ts`, and the server actions in `app/actions/*` | these still read the **in-process singleton world inside the web app**, which has been wrong since the worker became authoritative (the app's copy is a fresh, unplayed world). They are the last legacy paths; §7.2 lists them for removal or conversion to orders/snapshot reads. None of them can exist in a multi-galaxy app. |

`hooks/useGameSync.ts` and the store gain `galaxyId`; every fetch sends it. The store is per tab, so one account can have two galaxies open in two tabs.

### 5.3 The shared season

`activeSeason` lives inside each world today (`lib/seasons/season-service.ts`). With one clock for all galaxies it moves out:

```prisma
model Season {
  id           String   @id
  seasonNumber Int      @unique
  name         String
  phase        String   // announced | active | ending | complete
  announcedAt  DateTime
  activatesAt  DateTime
  endsAt       DateTime
  modifiers    String   // JSON
  @@map("seasons")
}
```

The worker reads the current season once a minute and writes it into each world's `activeSeason` (the field stays, so nothing downstream changes: modifiers, rewards, titles, the season clock in the top bar). Season *transitions* — end, rewards, next season — are run by exactly one process (a `season` lease, same table as §4.2 with a fixed id), which then marks the season; each worker applies the per-galaxy consequences (titles, recognition, `world.shared.seasonDayElapsed`) when it sees the phase change. A galaxy created on day 12 of a season reads "The Beginning, day 12" — that is the Fortnite behaviour asked for.

### 5.4 Galaxy generation

Every galaxy uses `generated-systems.json` today. Version 1 keeps that: same map, same 30 empire slots, different history. `Galaxy.seed` is stored from day one so that a later version can generate per-galaxy maps without a schema change; when it does, the `surfaceCache` note in §4.3 applies and the `applyHomeworldNames`/`capitalSystemIdFor` step runs per galaxy.

30 empires means 16 more empire definitions than `data/factions/lobby-factions.ts` has. That is content work (Faction mechanics workstream), not tenancy work; the model must not assume 14 anywhere (`LOBBY_FACTIONS.length`, "all fourteen factions are claimed" in `components/LobbyScreen.tsx`).

## 6. What the lobby becomes

1. **Sign in** (unchanged).
2. **Galaxy directory** — the new first screen for an account with no claim or with several:
   - *Your galaxies*: every galaxy the account holds a seat in, with its season day, an unread count from the brief, and **Enter**.
   - *Open galaxies*: `status = 'open'` with free seats — name, players/15, tier (free = ads, master = none), **Join**.
   - **Create a galaxy** — for the owner always; for others behind the Server Master purchase. Name, optional invite-only flag; the server creates the `Galaxy` row, pushes the initial snapshot (`scripts/push-init-state.ts` becomes a function, `seedGalaxy(galaxyId)`), and a worker picks it up within a minute.
3. **Faction select** — today's lobby, scoped to one galaxy; the empire list and the "claimed by" badges come from that galaxy's claims.
4. **Invites** — `Invite a friend` mints a code bound to the host's galaxy; `/join?code=` shows "X invites you to *Galaxy name*" and drops the friend into step 3 of that galaxy. `INVITE_REQUIRED` stays a server-wide gate on registration; a *galaxy-level* invite-only flag is what a Server Master uses.
5. **Switching** — the identity badge in the top bar lists the account's galaxies; switching sets the active galaxy and reloads the store.
6. **Server Master panel** — inside their galaxy: free a seat, toggle invite-only, rename, archive. Same actions the owner has via the admin secret, session-gated to `Galaxy.ownerUserId`.

Ads: the web app renders the ad slot only when `Galaxy.tier === 'free'`; the flag comes with the sync payload, never decided client-side.

## 7. Finding and removing the single galaxy

### 7.1 `default-session` — every file (21, from `grep -rn "default-session"` on 2026-10-01)

Production code:

- `scripts/game-loop.ts` — `SESSION_DOC_ID`, the load and the save; becomes the registry of §4.1
- `lib/persistence/save-service.ts` — save helper takes a galaxy id
- `app/api/game/sync/route.ts`, `app/api/game/brief/route.ts`, `app/api/game/piracy/route.ts` (2 sites), `app/api/game/economy/route.ts`, `app/api/game/state/route.ts` — read by galaxy id from the caller
- `lib/invites/invite-service.ts` — reads the snapshot to find the nearest empire; by galaxy id
- `lib/gazette/gazette-service.ts` — season and empire names; by galaxy id (and the 60 s cache becomes per galaxy)
- `lib/narrative/press-voices.ts` — the publisher roster; by galaxy id

Setup and operations scripts:

- `scripts/push-init-state.ts` (3 sites) — becomes `seedGalaxy(galaxyId)`
- `scripts/server-bootstrap.ts` — seeds *the first* galaxy (§8) when there is none
- `scripts/setup-dev-duel.ts` — claims in the first galaxy
- `scripts/verify-reseed.ts`, `scripts/migrate-lane-graph.ts` — take a galaxy id argument

Probes (take a galaxy id argument or default to the first galaxy): `scripts/pirate-view-probe.ts`, `scripts/pirate-persistence-check.ts`, `scripts/pirate-leak-check.ts`, `scripts/trade-route-probe.ts`, `scripts/test-narrative-phase0-live.ts`.

Not a hardcode: `lib/generated/prisma/internal/class.ts` (generated client, matches on the word in a comment).

Also the lease row `worker-lease` in the same table: `scripts/game-loop.ts`, `scripts/clear-lease.ts`, `scripts/clear-worker-lease.ts` (§4.2).

### 7.2 The in-memory singleton — every file (`getGameWorldState()`)

The getter goes; `lib/game-world-state-singleton.ts` keeps only `createGameWorld(seed)` (the generator) and the worker owns the instances.

Must change to "world passed in":

- `lib/time/tick-processor.ts` — `worldOverride ?? getGameWorldState()`: the fallback is removed; `runStrategicTick(date, index, world)` always gets its world (the worker already passes it — the fallback is the trap the file's own comment warns about)
- `lib/time/auto-resolve.ts` — reads the singleton; becomes a function of `world`

Must be **removed or converted** — they mutate or read a world the web app holds in its own process, which is not the world players play in (the worker's), and has not been since the order queue landed:

- `app/actions/combat.ts`, `app/actions/construction.ts`, `app/actions/construction-sim.ts`, `app/actions/discourse.ts`, `app/actions/doctrine.ts`, `app/actions/movement.ts`, `app/actions/proxy.ts`, `app/actions/save-load.ts`, `app/actions/tech.ts` — server actions still imported by `components/CreateFactionForm.tsx`, `EventCard.tsx`, `construction/PlanetConstructionPanel.tsx`, `debug/DevToolbox.tsx`, `economy/EconomicTerminal.tsx`, `intrigue/EspionageAgencyPanel.tsx`, `panels/CorporateLedgerPanel.tsx`, `panels/CouncilPanel.tsx`, `panels/DiplomacyPanel.tsx` (the `sponsorProxyAction` import), `panels/DossierPanel.tsx`, `panels/EconomyPanel.tsx`, `panels/GovernmentPanel.tsx`, `panels/IntelligencePanel.tsx`, `panels/LeadershipPanel.tsx`, `panels/ResearchPanel.tsx`, `politics/DiscourseTerminal.tsx`, `shell/GameShell.tsx` (`getFleetsAction`). Each import is either a read the store already has, or a mutation that must become a `dispatchOrder`. This is a sweep with a probe: "no component imports from `app/actions`".
- `app/api/espionage/route.ts`, `app/api/game-construction/route.ts`, `app/api/debug/route.ts`, `lib/actions/debug-actions.ts` — same: read from the snapshot/shards by galaxy, or become orders, or go.

Test harnesses that build a world (fine, they become `createGameWorld()` callers): `lib/combat/combat-manager-tests.ts`, `lib/espionage/intel-reports-tests.ts`, and the 34 `scripts/*.ts` probes.

### 7.3 Dead legacy readers to delete with this work

`app/actions/state.ts` (`worldState`, `gazette` legacy tables), `scripts/importData.ts` (`events`), and the Appwrite-era tables in §3.2 have no galaxy and no players; the tenancy build is the moment to drop them rather than extend them.

### 7.4 Keeping it out

A probe, `scripts/no-singleton-check.ts`, run by the deploy script and the server-setup probe: fails on any occurrence of `'default-session'`, `'worker-lease'`, `getGameWorldState(` or `from '@/app/actions/` outside an allow-list (the generated client, this document). Cheap, and it is how "found and removed" stays true after the build.

## 8. Migration path for the existing galaxy

The live galaxy keeps playing throughout. Every step is a committed Prisma migration applied by the `setup` container (Item 9); the app is redeployed between the steps that need it.

1. **Add without breaking.** New tables `galaxies`, `galaxy_leases`, `seasons`. Insert `galaxies` row `galaxy-1` ("The First Galaxy", `tier = 'free'`, owner = the operator's account, `tickOffsetS = 0`), copy the live world's `activeSeason` into `seasons`. Add `galaxyId String @default("galaxy-1")` to every table in §3.2. Old code keeps working: it never reads the new column.
2. **Rename the snapshot row** `default-session` → `galaxy-1` and move the lease into `galaxy_leases`, in one migration, deployed together with the first galaxy-aware worker and app. This is the only moment with a hard cutover: stop the worker (the wrapper releases the lease), apply, start the new worker. Players see the usual redeploy pause.
3. **Make it real.** Drop the column defaults, add the composite uniques (`(galaxyId, userId)`, `(galaxyId, factionId)`), rewrite `game_factions.id` to `galaxy-1:<factionId>`. The app now resolves the galaxy per request (§5.1); with one galaxy, every caller resolves to `galaxy-1`.
4. **Open the doors.** Ship the galaxy directory and Create galaxy. Existing players land in *Your galaxies* with their one galaxy; nothing else changes for them.
5. **Rollback** at any step before 3: the columns default to `galaxy-1`, so the previous app version still works. After step 3, rollback is a restore from the pre-step backup (`scripts/backup-db.sh`, taken by `deploy-server.sh --backup`).

The public gazette URLs change (`/gazette` → `/gazette/first-galaxy`); the old paths redirect to the first galaxy so shared cards keep working.

## 9. Capacity and the scaling path

From §2, per galaxy at 30 empires: ~30–60 MB inside a worker, ~50 MB of database over a season, a few seconds of CPU per strategic tick.

| Galaxies | Players | Machines | What must exist |
|---|---|---|---|
| 10 | 150 | the home laptop | this document, built |
| 100 | 1,500 | one server, 32–64 GB | staggered ticks (§4.4); `--scale worker=8`, 12 galaxies each |
| 1,000 | 15,000 | 3–4 servers, Postgres on its own | **delta sync or push** — today every player polls `/api/game/sync` every 4 s and each poll reads all the galaxy's shards; at this size the database is spending its time serving polls, not saves. Archive lifecycle (§3.1) running |
| 16,000 | 240,000 | ~10 servers, Postgres partitioned by `galaxyId` with replicas, 2–3 web servers, monitoring, off-site backups, on-call | push updates, per-galaxy caches, a team |

Delta sync is the item to schedule right after this build. It is already "accepted open" in the launch-readiness notes and it is the first wall after memory.

## 10. Build order

Each step ends with a probe under `tmp/` and `scripts/sync-privacy-probe.ts` still green — a galaxy id is a new axis for leaks (a shard of galaxy B served to a caller in galaxy A is the multi-galaxy version of the un-fogged fleets bug).

1. Schema step 1 of §8; `Galaxy`/`Season` rows; nothing reads them yet.
2. Worker registry + leases (§4.1–4.2), `WORKER_GALAXIES=1`; module state per galaxy (§4.3). Probe: two galaxies in one process for 200 cycles, no cross-talk in notifications, chronicle, crises.
3. Caller resolution + every route in §5.2; remove/convert §7.2 and §7.3; `no-singleton-check`. Probe: caller in galaxy A asking for galaxy B gets 403; sync of A carries nothing of B.
4. Shared season (§5.3). Probe: two galaxies, one season row, both worlds show the same day; a season end applies to both.
5. Schema steps 2–3 of §8 on a copy of the live database, then live.
6. Lobby directory, create, join, switch, Server Master panel, ads flag (§6).
7. Staggered ticks; `WORKER_GALAXIES` raised; load probe with 20 galaxies on the dev machine.
8. Public gazette per galaxy + redirects.

## 11. Open questions

- **Empire count per galaxy before there are 30 empire definitions.** Ship with the 14 and `maxEmpires = 14` until the content exists, or fill with generated AI empires? Content decision.
- **Server Master pricing and what it buys** beyond no ads and admin powers (LLM narrator budget, custom galaxy name and description, a larger seat cap).
- **Archiving policy**: how long a galaxy sits idle before it is archived, and whether a Server Master's galaxy is exempt.
- **One account, one name?** `displayName` sits on the claim today; per-galaxy names are possible but probably confusing — the design assumes one name per account, copied onto each claim.
- **Late join (Item 7) across galaxies**: the "game makes a breakaway for the newcomer" rule is per galaxy and needs no tenancy change, but the galaxy directory should route a player whose galaxy is full into that flow rather than to another galaxy by default.
