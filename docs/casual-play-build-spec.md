# Stars of Dominion: casual-play build spec

Goal: a player who gives the game five minutes a day, once in a while, can log in, understand what happened, make one or two decisions, and leave. Wordle model: hard stop, shared story, something to show friends, nothing lost by being away. Depth players keep every panel they have today; the casual path is layered on top, not carved out of the simulation.

Read `CLAUDE.md` first. Repo: `C:\dev\Stars_of_dominion`. Next.js 16, React 19, Prisma, Zustand. Game state is produced by the worker (`scripts/game-loop.ts`) and polled by the client (`hooks/useGameSync.ts`). Client bundle must not import `lib/db`.

## Ground rules for every item

- One item per session. Do not bundle items. Finish, verify, commit, stop.
- Worker-side changes get a probe script under `tmp/test-<name>.ts` (pattern: existing `tmp/test-*.ts` and `scripts/*-probe.ts`). Probes drive the singleton world; inline game-loop code is invisible to them, so any change inside `scripts/game-loop.ts` also needs a live worker run.
- UI changes are verified in the browser preview. Sign in with the "DEV 1 · Aurelian" quick-login button on `/login` (dev only). The worker is usually not running in the preview session.
- Invariants that must survive: order queue fails closed on ownership; `chargeOrderCost` before handler, `refundOrderCost` on every refusal; fleet/planet fog is server-side (`projectPublicShard`, `shard-privacy.ts`); chronicle never imports `lib/db`; narrator only reads what the simulation writes; ship recruit orders resolve through `resolveRecruitSpec`.
- JSON-bearing DB columns are TEXT holding JSON strings.
- Commit messages: conventional type prefix (`feat`, `fix`, `perf`, `docs`), one-line subject describing the player-visible effect.

## Facts to build on (all verified in code on 2026-09-23)

- Sim clock is 15x real (`scripts/game-loop.ts:345-352`: 5 s poll, 75 sim-seconds per cycle). Strategic tick = 6 sim hours = 24 real minutes (`lib/time/time-config.ts:9`, `game-loop.ts:735`). Season = 300+15 sim days ≈ 21 real days (`lib/movement/movement-config.json:400-403`).
- Real-time durations today: ping 2 s, scan 8 s, survey 32 s, colonize instant, buildings 20 s to 2.7 min, ships 20 s to 160 s, hyperlane hop 2 min, tier-1 tech 3 to 4 real hours, tier-3 tech ~17 real hours. Diplomatic offer TTL = 48 sim hours ≈ 3.2 real hours (`lib/diplomacy/diplomacy-types.ts:224`). Crisis response window = 12 real hours (`lib/crisis-manager.ts:8-10`).
- Navigation: bottom `CommandDock` (`components/shell/CommandDock.tsx`, config `components/shell/dockConfig.tsx:44-118`): 7 categories, 16 sub-tabs, plus GALAXY / SYSTEM / GUIDE. `TopNav` (`components/shell/TopNav.tsx`) is read-only chips and 4 controls.
- Orders: 175 action strings in one switch at `scripts/game-loop.ts:1561`; registry in `lib/actions/registry.ts`.
- Tutorial: `lib/tutorial/tutorial-data.ts` (18 steps), `components/tutorial/TutorialOverlay.tsx`, `TutorialLauncher.tsx` (auto-starts 1.5 s after first login). Seven steps reference DOM ids that do not exist (`navbar-root`, `tick-countdown`, `galaxy-map-canvas`, `economy-tab`, `tech-tab`, `diplomacy-tab`, `intelligence-tab`). Step 1 says the galaxy updates "every 6 hours" (real: 24 minutes). Step 2 describes the removed `components/Navbar.tsx`. Clicking the backdrop skips the whole tutorial (`TutorialOverlay.tsx:74-78`).
- Notifications: worker queue in `lib/time/notification-hooks.ts` (in-memory, cap 500, broadcast TTL 30 min), drained onto `faction.pendingNotifications` each cycle, delivered through the private faction shard, stored client-side in `lib/notifications/notification-store.ts`, shown by `components/notifications/NotificationFeed.tsx`. 46 `fireNotification(` call sites across 21 files. "STRATEGIC CYCLE COMPLETE" fires every tick. Many notifications print raw faction ids (`faction-leopantheri`, `rebel-faction-midrim-106`, `banking_clan`).
- `crisisWindows` in `lib/store/ui-store.ts:410` is never written by `useGameSync`; the crisis counters in `TopNav.tsx:170-185` and `CommandDock.tsx:114-117` are permanently zero.
- Automation that exists with no UI: exploration `setAutomationDoctrine` / `tickAutomation` (`lib/exploration/exploration-service.ts:400-430`); cabinet advice `CabinetAdviceSnapshot` (`types/ui-state.ts:364-369`, synced as `cabinetAdvice`); governors (`lib/government/governor-service.ts`); AI services under `lib/ai/` that run for unclaimed factions only (gated by `isAIRunFaction` / `claimedFactionIds`).
- Comeback system fully written, zero consumers: `lib/comeback/data.ts`, `manager.ts`, `detector.ts`; only `scripts/test-comeback-system.ts` uses it. `DefeatOverlay` (`components/defeat/DefeatOverlay.tsx`) "Continue as Observer" only dismisses; no observer mode exists. `DefeatModal.tsx`, `DoomTracker.tsx` are dead.
- Breakaway states already exist from civil war / secession (`lib/government/secession-service.ts`); not claimable by humans.
- Lobby: `components/LobbyScreen.tsx`, 14 factions from `data/factions/lobby-factions.ts:22-191`, claim route `app/api/lobby/claim/route.ts` (permanent for the season, self-release via DELETE). Registration is open; no invite gate (`SERVER.md:366,373`). Player `displayName` is only exposed in the lobby response (`claim/route.ts:127-133`).
- Gazette: `app/api/gazette/route.ts` (window `GAZETTE_WINDOW_DAYS`, default 2), rendered only inside `components/panels/PressPanel.tsx` via `components/Newspaper.tsx`. No public route. Needs the narrator process (`npm run narrator`).
- No chat, no free-text messaging, no email/push/Discord. Diplomacy is structured `DIP_*` orders only.
- Login page copy: "NEURAL LINK REQUIRED", "ACCESS TERMINAL", password labelled "VORTEX KEY", button "Initiate Uplink" (`components/auth/LoginForm.tsx`).
- Orphaned components (zero importers): `components/Navbar.tsx`, `StatusBar.tsx`, `ResourcesPanel.tsx`, `GalaxyMap.tsx`, `CrisisDashboard.tsx`, `panels/MilitaryPanel.tsx`, `panels/DoctrinePanel.tsx`, `panels/ColdWarPanel.tsx`, `economy/TradePanel.tsx`, `shell/SaveLoadModal.tsx`, `notifications/TickCountdown.tsx`, `defeat/DefeatModal.tsx`.

## Item 0: cleanup (one session, low risk)

1. Stop emitting the per-tick "STRATEGIC CYCLE COMPLETE" notification. Find its `fireNotification` call in `scripts/game-loop.ts` and remove it. Keep the tick counter in TopNav.
2. Every notification body that prints a faction id must print the faction's display name instead (empire name; if a human holds it, also the player's `displayName`). Add one helper used by all 46 call sites rather than editing each string.
3. Fix or remove the seven broken tutorial targets. Either add the missing `id` attributes to the live dock buttons and map canvas, or set `targetElementId: null`. Rewrite step 1 ("every 6 hours" is wrong; say "every 24 minutes, and your empire keeps running while you are away") and step 2 (describe the bottom Command Dock, not the old Navbar).
4. Backdrop click must not skip the tutorial. Only the Skip button skips.
5. Login page copy: "Email" and "Password". Keep the title. Remove "NEURAL LINK REQUIRED".
6. Either wire `crisisWindows` in `useGameSync` or remove the dead counters from TopNav and CommandDock.
7. Delete the orphaned components listed above.

Acceptance: tutorial spotlights land on real elements in the preview; bell no longer fills with cycle notices; no raw `faction-*` ids in the feed.

## Item 1: daily brief

The first thing a returning player sees. Replaces the notification bell as the primary surface (the bell can stay as the raw log).

Build:

- A new screen/overlay mounted in `components/shell/GameShell.tsx`, shown on login when there is anything to report or decide, and reachable from TopNav afterwards.
- Three sections: **What happened** (at most five lines, last 24 real hours, drawn from notifications plus chronicle events for this faction; prefer narrated gazette headlines when the narrator has produced any), **Decisions waiting** (pending diplomatic offers, gambits, debates, crises, secession prompts, each with its deadline shown in real time, each with an inline Accept/Decline/Open button that dispatches the existing order), **One suggested move** (see item 4; until item 4 exists, use a simple rule: no fleet → commission one; no survey in progress → survey the nearest unsurveyed system; a settle target is affordable → settle it).
- Persist "last brief seen at" per player (Prisma column on the session/claim record, or a small new table) so the brief covers real time since last visit, not since last poll.
- Empty state: "Nothing needs you today. Next tick in N minutes." and a Done button that closes the screen.

Server side: one projection function in `lib/` that takes the faction shard plus the player's last-seen timestamp and returns the brief as plain data. No new order types. The `/api/game/sync` route may carry it, or add `/api/game/brief`.

Acceptance: DEV 1 logs in after the worker has run for an hour and sees a brief with real names and real deadlines; every decision button issues an order that the queue accepts; probe `tmp/test-daily-brief.ts` asserts the projection over a synthetic shard.

## Item 2: neglect-safe empire

Rule: absence may slow an empire; it must never wound it. Idle human factions today accumulate coup pressure, unresolved debates, corporate demands, and press attacks.

Build:

- Per-faction `delegation` record in the faction shard: one boolean per system (`government`, `corporate`, `press`, `piracy`, `exploration`, `research`). Default `true` for every newly claimed human faction. Depth players flip them off.
- When a system is delegated, the worker runs the same code path it already runs for AI factions for that system only (`lib/ai/*`, `corporate-ai.ts`, exploration `tickAutomation`, research `manageResearch`), on the human faction, with the conservative choice: resolve debates toward the cabinet's advice (`cabinetAdvice`), decline corporate demands, counter press campaigns with the cheapest response, keep pirate posture defensive, research the cheapest available tech of the faction's current focus.
- Coup pressure and officer-corps dissatisfaction must not rise from inaction alone. Find the pressure sources in `lib/government/` and gate the inaction penalties on `delegation.government === false`.
- UI: one "Advisors" card (Item 1's brief or the EMPIRE panel) listing the six toggles with one sentence each.

Acceptance: probe `tmp/test-delegation.ts` runs 200 ticks on a claimed human faction with no orders and asserts: no coup, stability not below start, at least one tech researched, debates resolved. Then the same run with all toggles off reproduces today's behaviour.

## Item 3: one clock for the player

Introduce "Galactic Day" = 24 real hours as the only unit shown to players for anything they must react to. Do not change the sim speed.

Build:

- Diplomatic offer TTL (`OFFER_TTL_SECONDS`), gambit responses, promise deadlines, crisis windows, secession ultimatums, corporate demand windows: minimum lifetime becomes 1 Galactic Day (15 sim days at 15x). Audit `lib/diplomacy/diplomacy-types.ts`, `lib/crisis-manager.ts`, `lib/time/time-config.ts`, `lib/government/`, `lib/economy/corporate/`, `lib/pirates/` for every deadline constant.
- One formatter in `lib/time/` that renders any sim deadline as "today", "tomorrow", "in N days"; every panel that shows a countdown uses it. TopNav keeps the tick countdown for depth players.
- Notifications and the brief say "yesterday" / "today", never cycle numbers.

Acceptance: probe asserts every deadline-bearing state object created by the worker has a lifetime ≥ 15 sim days; a DEV 1 offer sent to DEV 2 is still answerable after 20 real hours (simulate by advancing `nowSeconds`).

## Item 4: first-week goals and a three-step tutorial

Build:

- A goal list, per faction, in the faction shard: five sequential goals for the first season week. Suggested set: commission a fleet; survey three systems; settle one world; build an orbital shipyard; sign a pact with a neighbour (or send an envoy). Each goal has a one-line hint and a deep link that opens the right panel with the right selection.
- Completion is detected by the worker using the deed ledger (`lib/tech/deed-metrics.ts` `bumpMetric` writers already record colony founded, first survey, treaty signed, fleet built). Add writers where missing.
- The brief's "one suggested move" reads the current goal.
- Tutorial shrinks to three steps: where the map is, where the dock is, where the brief is. Delete the rest of `tutorial-data.ts`. The guidebook stays for depth.

Acceptance: fresh account sees goal 1 in the brief; completing it in the preview advances to goal 2 after the next sync; `tmp/test-first-week-goals.ts` asserts detection for all five.

## Item 5: progressive dock

Build:

- `dockConfig.tsx` gains a `tier` per category: `core` (GALAXY, SYSTEM, ECONOMY, MILITARY, DIPLOMACY, GUIDE) and `advanced` (EMPIRE, RESEARCH, INTELLIGENCE, COMMS, SHIP DESIGNER, CORPORATE).
- Advanced categories are hidden until either the matching first-week goal completes or the player flips "Show everything" in settings (persist per player, same place as the brief timestamp). Default for new accounts: hidden. Existing accounts: shown, so nothing changes for current players.
- Hidden systems are the delegated ones from Item 2; opening a hidden category for the first time offers to turn its delegation off.

Acceptance: fresh account sees six dock buttons; toggle reveals all; existing dev accounts unchanged.

## Item 6: friends layer

Split into four sessions.

**6a. Invite link.** Host generates a link (`/join?code=...`) from the lobby; registration requires a code once `INVITE_REQUIRED=true` (default off for now). Claiming through an invite picks the unclaimed faction whose capital is nearest the inviter's capital (systems graph is in the snapshot) and shows "You start next to <friend>". Prisma: `Invite` table (code, createdBy, usedBy, expiresAt). Remove the dead legacy invite path (`app/actions/faction.ts`, `components/FactionCouncil.tsx`, `/faction-council` route).

**6b. Human badge.** Sync exposes, for every claimed faction, the claimant's `displayName` (public, already shown in lobby). Dossier panel, relations overlay tooltip, and the brief show "<Empire> · played by <name>". AI factions show "AI".

**6c. Messages.** *(Amended 2026-09-30: the one-per-Galactic-Day limit was dropped; a 15-second cooldown per sender and recipient is the only limit.)* Free-text messages between player-run empires, 280 characters, stored in a new `EmpireMessage` table, delivered via the private shard, shown in the brief and the DIPLOMACY panel next to the contact. Sender identity is the session user; server rejects anything not from the claimant. No markdown, escape on render.

**6d. Public gazette and share card.** Route `app/gazette/page.tsx` (no auth) rendering the last N days of `NarrativeArticle` with the season name, plus `/gazette/[factionId]` for one empire's headlines. A "Share today" button in the brief copies a plain-text card: season name, day, one headline about the player's empire, link to the public gazette. No fleet positions or anything fog-protected in the card.

Acceptance per sub-item: routes are session-gated where they must be and open where intended; `scripts/sync-privacy-probe.ts` still passes; messages from a non-claimant are rejected with 403.

## Item 7: late join and comeback via breakaway states

Design first, then build.

- When an empire is eliminated, or a new player joins after all 14 factions are claimed, offer the list of existing breakaway/rebel states (from secession and civil war) as claimable. Claiming converts the rebel faction into a human-run faction: it gets a faction shard, a claim row, and is removed from `isAIRunFaction`.
- Wire `lib/comeback/` for the eliminated player's new state: the path and perks apply to the claimed breakaway.
- Observer mode for a player who declines: read-only shell, orders blocked client-side and rejected server-side, fog unchanged.

Acceptance: probe creates a breakaway, claims it as DEV 2, issues an order, and asserts ownership, fog, and AI gating all hold; `sync-privacy-probe.ts` passes.

### Item 7 design decisions (agreed 2026-09-30)

1. **No breakaway to claim: the game makes one.** A newcomer never waits on luck. The world raises a breakaway for them, told as a large underground movement that has been organising for years and now declares itself.
2. **A small state with money.** 1–3 worlds and a weak fleet, but a treasury for mercenaries. Private banks and charter companies court it: a new state has weak regulations and is still a sovereign state, so capital moves in looking for the loose rules. (Hooks: corporate system, mercenary contracts, Banking Clan.)
3. **The old empire can reconquer — and has to pay attention.** No blanket protection. The story instead: the empire the new state broke from must fight to take it back *while* suppressing the other rebellions its weakness has encouraged. The secession is a pressure on the parent, not a free target.
4. **Comeback perks only for eliminated players.** `lib/comeback/` applies to a player whose empire was destroyed and who takes a breakaway; a late joiner gets the state, not the perks.
5. **No renaming; the press reports it.** The breakaway keeps its name. The gazette runs "a new hand takes the rebellion" when a player claims one.
6. **Observer mode: yes,** for a player who declines (read-only shell, orders refused server-side, fog unchanged).
7. **Invites put the friend near the host.** Invite links come from the host. Two options, to settle when building: the friend takes a rebel state next to the host's empire, or the friend starts *inside* the host's dominion and secedes after a while (a scripted secession). The first is the default unless the second proves simpler.

## Item 8: mobile layout for the casual path

The brief, the goal card, the message box, the public gazette, and the lobby must work at 375 px wide. The galaxy map and depth panels may stay desktop-only with a "best on a larger screen" note. Use the existing Tailwind breakpoints; no new framework.

Acceptance: preview at the mobile preset renders each of those screens without horizontal scroll and with tap targets ≥ 40 px.

## Item 9: one-command host setup

`docker compose -f compose.prod.yaml up` on a clean machine must: start Postgres, run migrations, seed the world (`scripts/push-init-state.ts`) and dev accounts only if the DB is empty, start web, worker (with the forever wrapper), and narrator (template mode when no LLM is configured). Document the four required env vars in `SERVER.md` and fail fast with a readable message when one is missing.

Acceptance: fresh VM, one command, `/login` reachable, DEV 1 can claim and see a running tick.

## Item 10: multi-galaxy tenancy (design document only)

Do not implement in the same session as anything else. Produce `docs/multi-galaxy/README.md` covering: a `galaxyId` on world snapshot, faction shards, orders, sessions, claims, chronicle and narrative tables; one worker per galaxy versus one worker multiplexing; how `default-session` hardcodes are found and removed; migration path for the existing single galaxy; what the lobby becomes (pick or create a galaxy, invite friends into it). List every file that hardcodes the singleton. Stop after the document.

## Order

0, 1, 2, 3 in that order; they are the Wordle promise. Then 4, 5. Then 6a to 6d. Then 8 and 9. Item 7 and item 10 after a design conversation.
