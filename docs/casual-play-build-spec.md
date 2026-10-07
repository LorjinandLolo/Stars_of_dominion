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

### Item 10 design decisions (agreed 2026-10-01)

1. **Who creates a galaxy:** a Server Master — a paying client/customer. The owner creates galaxies free.
2. **Size:** up to 15 human players per galaxy, 30 empires in all (the rest AI).
3. **One account may play in several galaxies at once.**
4. **One season clock for every galaxy** (the Fortnite model): seasons start and end together everywhere; a galaxy created mid-season joins the season in progress.
5. **The public gazette is per galaxy.**
6. **Hosting model: a worker pool, one galaxy per worker process** (option A, agreed 2026-10-01). Workers take a lease on any galaxy nobody is running; capacity is `--scale worker=N`. Server Masters are paying customers whose galaxy runs on the owner's machines with admin powers inside it (not on their own hardware); their galaxies carry no ads. The owner expects to pass 100 galaxies quickly, so the first version is built for several galaxies per worker process from the start: worlds are data keyed by galaxy id, not the module singleton (the 52-file refactor is in scope, not deferred), each worker leases a batch of galaxies, and strategic ticks are staggered per galaxy. Delta sync (or push) is the prerequisite for the next order of magnitude and the document must schedule it.

## Item 11: one espionage page that reaches the real system

Audit of 2026-10-06, verified in code. The dock shows two espionage pages (`components/shell/dockConfig.tsx:112-113`): OPERATIONS is `components/panels/IntelligencePanel.tsx`, AGENCY is `components/intrigue/EspionageAgencyPanel.tsx`. Both have agents, recruitment and an op launcher, and they disagree with each other. Neither reaches the system the worker actually runs:

- The 20-operation catalog (`lib/espionage/operation-catalog.ts`: Infiltrate Government, Technology Theft, Fake Fleet Signature, Fund a Coup, Election Interference, Covert Piracy, Counter-Intel Sweep, ...) is launched only by the AI (`lib/ai/intelligence-ai-service.ts:59` calls `launchCatalogOperation`). The player's `ESP_LAUNCH_OP` (`scripts/game-loop.ts:3076`) goes through the legacy `launchOperation` (`lib/espionage/espionage-service.ts:75`): three vague domains, no Intel cost, no network-stage gate, no capacity. The Intel counter, the infiltration bar and the "Next: Deep Assets at 65" line the UI shows therefore gate nothing the player can do.
- AGENCY > COVERT OPS makes the player pick an agent, then `launchCovertOpAction` (`app/actions/espionage.ts`) never sends the agent id. Its "estimated success" box is a client-side formula unrelated to the server's. AGENCY > ROSTER deploys with a hardcoded `domain: 'infrastructureSabotage'`; `SpyAgent.deployedDomain` is written and read by nothing. `applyAgentOpConsequences` (`lib/espionage/agent-service.ts`) is never called from resolution, so agents gain no XP and lose no cover from ops.
- Results never reach the player: `op.narrative`, `succeeded` and `attributionState` are set in `resolveOperation` and rendered nowhere; no `fireNotification` on resolution for either side. Resolved ops sit in the OPERATIONS list for 72 h labelled "resolved" with an investment bar.
- Counter-intelligence has no UI at all: `counterIntelBudget`, `regionalCounterIntel`, `counterIntelStrength` exist in `FactionIntelState` and no component reads or sets them. The only defensive move is a board "threat" card.
- OPERATIONS launch form uses hardcoded investment 0.5 / risk 0.2 and lists regions; AGENCY lists every system including the player's own and fails silently on a wrong target.
- Manual section 9 (`lib/manual/manual-data.ts:274`) describes mechanics that do not exist (24-hour fleet disable, "Logic Modifier", leader bonus).
- Smaller: two recruitment flows with different cost labels (INTEL vs credits; the worker charges credits), AgentCard shows a sliced raw system id, the AGENCY recruit modal is a fixed 800 px and breaks in the preview pane, footer filler "Shadow protocol alpha engaged".

Build, in sub-items (one session each):

**11a. One page.** Delete `EspionageAgencyPanel.tsx` and its dock entry. Keep `IntelligencePanel` with tabs Board, Networks, Operations, Reports, Agents (recruitment folds into Agents). Names, not ids, everywhere (system and faction display names). Remove the footer filler. Fix the manual section to describe what 11b ships.

**11b. Expose the catalog to the player.** New order `ESP_LAUNCH_CATALOG_OP` (registry + game-loop case) wrapping `launchCatalogOperation`; it already enforces Intel cost, capacity and the stage gate (`lib/espionage/network-stages.ts`). Operations tab: pick a target empire, see your stage against it, then catalog cards grouped by category; locked cards stay visible and say which stage unlocks them ("needs Embedded Network, 35"). Each card shows Intel cost, duration range and risk tier from the definition. Success preview comes from the server (`computeCatalogSuccessChance`), carried in the shard per (target, definition) or fetched on demand; no client formula. Retire the legacy launch form; keep `ESP_LAUNCH_OP` only until `lib/ai/strategic-ai-service.ts:376` is moved to the catalog path, then delete it.

**11c. Agents matter.** A catalog op may name one available agent. Trait bonus to success via the existing trait-to-domain bridge; on resolution call `applyAgentOpConsequences` (cover loss by risk, XP, burn at zero cover). Deploy means one thing: build a network in a system (drop the `domain` parameter and `deployedDomain`). Recruitment charges credits and says so.

**11d. Outcomes reach the player.** `fireNotification` on resolution: to the actor (outcome + narrative), and to the target when attribution is suspected or exposed (what happened, where, who is suspected). Reports tab shows after-action entries next to intel reports. Resolved ops leave the active list.

**11e. Counter-intelligence tab.** Budget slider that spends Intel per hour into `counterIntelStrength`, plus a per-system investment list (`regionalCounterIntel`, which `computeAttributionProbability` already reads). One order `ESP_SET_COUNTERINTEL`. Counter-Intel Sweep launches from here.

Acceptance: one espionage entry in the dock; DEV 1 can launch Infiltrate Government against an AI empire, see it refuse Fund a Coup with the stage reason, get a notification when it resolves, and see the victim notified when a risky op is caught; probe `tmp/test-espionage-player-path.ts` drives recruit, deploy, catalog launch, resolve and agent consequences through the services the order handlers call; `scripts/approval-probe.ts` and `scripts/enlightenment-soak-probe.ts` still green (AI counterplay against a transcending empire runs through the same catalog).

## Item 12: the case board (detective board)

A player who is hit by a covert operation should be able to work out who did it, and be wrong. The substrate exists: a `ChronicleEvent` records the real actor in `actorIds` and the public ceiling in `attribution` (`lib/narrative/chronicle-types.ts`), `IntelReport` carries a hidden `accurate` flag, `AttributionRecord` holds a suspected faction and a probability, and the press already prints suspected names. Today attribution is one deterministic roll at resolution (`resolveAttribution`); the board turns it into a process the player plays.

Two prerequisites found in the audit: `recordOperationToChronicle` always writes `suspected:<real actor>` (`espionage-service.ts:636`), so a suspicion can never be wrong yet; and nothing ever sets an agent to `captured`, so there is no interrogation source.

### Item 12 design decisions (agreed 2026-10-06)

1. **A case opens for the victim** when an op resolves against them and is not instantly exposed (exposed means caught red-handed, no board). The case shows the effect only: what, where, when. Never the author.
2. **Suspects** are every faction the victim has contact with, unsorted. The board does no inference for the player; an optional "analyst estimate" line may be added for the casual path later.
3. **Clues arrive over time**, at a rate scaled by the victim's `counterIntelStrength` (this is what counter-intel buys). Each clue is a card with text and a source, and a server-side hidden weight for or against each suspect. Sources: method signature (catalog category and `requiredTech`, e.g. "this needed Black Market Operations"), sensor contacts near the time (`world.movement.sensorSources`), motive (feuds and grievances from `lib/narrative/memory-service.ts` and the grievance store), press (Gazette articles naming a suspect, wrong under a false flag), intel reports from the victim's own ops against a suspect (may be inaccurate), and interrogation of an agent captured by Counter-Intel Sweep (lies when the agent has the `double_agent` trait).
4. **The player pins clues to suspects**, then files an **accusation** (`ESP_FILE_ACCUSATION`, one faction). The worker checks the chronicle truth. Right: the op flips to exposed retroactively, the diplomatic penalty lands on the actor, the victim's chamber debate opens (`espionage_exposed_on_us`), the press gets a scandal, and the victim gains Intel and political capital. Wrong: tension with the innocent faction, reputation loss for the accuser, and the real actor gains infiltration. Alternatives to accusing: leak to the press (investigation article, no diplomatic effect), or keep the case as leverage for Blackmail a Minister.
5. **False flags become real.** `false_flag_border_raid` (and any op marked so in the catalog) plants clues pointing at a third faction.
6. **AI empires build cases too**, simply: accuse when summed clue weight passes a threshold scaled by personality. The player's own ops face the same board.
7. A Server Master seeding a red herring is one planted clue; design the clue record so a non-simulation author is possible, do not build the tooling yet.

Phases (one session each, in order, after 11a to 11c):

**12a. Worker side.** Case and clue records in the faction shard (JSON TEXT, like the rest); case opening in `resolveOperation`; clue generation tick with the six sources above; `ESP_FILE_ACCUSATION` and `ESP_LEAK_CASE` orders with the consequences in decision 4; fix the two prerequisites (suspected attribution may name an innocent, Counter-Intel Sweep can capture); probe `tmp/test-case-board.ts` asserts that a planted false flag misleads and a correct accusation flips the chronicle attribution.

*12a as built (2026-10-07):* `lib/espionage/case-board.ts`, probe `scripts/case-board-probe.ts`. Differences from the plan above: the press clue reads the attribution record's suspect (the worker cannot read the Gazette, which lives in the narrator's tables); motive reads `world.rivalries` (feuds are derived by the narrator's memory service, also DB-side); two truthful sources were added because a fresh galaxy has no rivalries or foreign ships, the money trail (who could afford the operation) and neighbours (who holds the nearest systems); cases open only for player-run victims, AI cases come with 12c; pins are left to the client (12b). Players learn the verdict of an accusation, never the real sponsor of a wrong one.

**12b. UI.** Case Board tab on the Item 11 page: open cases, suspect column, clue column, pin a clue to a suspect, accuse / leak / hold. Works at 375 px (Item 8 rules).

*12b as built (2026-10-07):* `components/panels/espionage/CaseBoardTab.tsx`, commit a011f833. Pins live in the browser (localStorage) and never reach the worker. A fix on the way (54726453): the client must never import `lib/espionage/case-board.ts`, which reaches `lib/government` and from there a module that reads files from disk; `counter-intel.ts` holds the capture helper for that reason and the case-board probe guards the import list.

### Item 12 refinements (agreed 2026-10-07): an agency, not a clue list

The board as built waits for clues and sorts them. An agency works out why anyone would do this, pursues leads of its own choosing, and writes an assessment. Two further sub-items, both before 12c.

**12b-2. Dossiers, motives, hired foreigners.**

- *Suspect dossiers.* Each suspect is a file of what the victim's service actually knows, never the hidden truth: species and government (civilization registry, `economy.factions[].civilizationId`); standing with us (war, treaties, rivalry level); the last few events between us from `RivalryState.recentEvents`, which is the motive section ("they lost the Aglate route to us 6 days ago"); our access inside them (our infiltration stage, which gates leads); what we know they can do (their stage inside us only if a sweep or prisoner revealed it, their tech only if we have sources inside, otherwise "unknown"); history (prior accusations and verdicts, prisoners of theirs we hold); and an assessment line written from visible facts and the player's pins only ("motive strong, means unconfirmed, no opportunity established").
- *Real motives.* The motive clue stops saying "has the most reason" from a score and names the grievance from the relations log.
- *Species on agents.* `SpyAgent` and `AgentCandidate` carry a species (civilization id). The recruit pool is mostly the recruiter's own people; about one candidate in four is an émigré or mercenary of another species at roughly 1.5x the price.
- *Species traces.* An operation run by an agent and not caught outright leaves a species clue on the victim's case (a witness, a body, a prisoner's accent): "the operative seen at Aglate was Grakkar". It points at every empire of that species. Own species points at the sponsor; a hired foreigner points at the foreigner's empire; no agent leaves no trace and gets no agent bonus. Three real choices for the sponsor. An operation caught outright names the sponsor regardless.
- *Seeing through it.* The lead "trace the operative" (the first pursued lead, see 12b-3) can find the operative is a known hireling who has worked for several services, which weakens the species clue; a captured foreign agent names their real employer under questioning unless they are a Double Agent. Counter-intelligence strength raises the odds.
- *The deceived.* The hired agent's species' empire takes the falsely-accused consequences if the victim bites, and the grudge is discoverable later (a prisoner, a sweep finding the recruitment trail).
- *Three cheap twists.* The mole: a `compromised` agent leaks the owner's case files, so the sponsor learns what has been pinned and who will be accused; a sweep or prisoner can out them. Cui bono: a motive clue built from who actually profited (who gained the route we lost, whose bloc swung), which is sometimes not the sponsor. The convenient witness: planted walk-in sources arrive fast and name a suspect loudly, so a seasoned player learns that a walk-in is the signature of a plant.

**12b-3. Leads, the grid, the theory, the language.**

- *Leads.* On an open case the player picks a line of inquiry, pays Intel, waits some sim hours, and gets a finding, nothing, or a lie: follow the money (who paid for an operation of this size), question a prisoner (needs a captured agent), ask our sources inside X (needs an Embedded Network in X; honest only with real access), pull the sensor logs (ships near the system in the window), check the method (what stage and tech it needed), trace the operative (12b-2). One lead per case at a time. Passive clues keep trickling, slower; pursued leads are faster and targeted; counter-intelligence strength discounts them. Leads never reveal the hidden sponsor directly; they produce findings like any clue.
- *Motive, means, opportunity.* Every clue is tagged motive, means or opportunity (motive and cui-bono clues = motive; method and money = means; sensors, neighbours and species traces = opportunity). The suspect list becomes a grid of three cells per suspect, filled by the clues pinned to them, with a "cleared" state when a clue clears them. Reading the grid is the deduction; the board still does no inference.
- *Case theory.* The player names a prime suspect and a motive from a short list built from the actual events ("retaliation for the sanctions", "weaken us before a war", "deny us the Archive"). A right culprit with the right motive earns more; a right culprit with a wrong motive still exposes them but the press mocks the reasoning.
- *Agency language.* "Cases" become case files, clues become findings, suspects become persons of interest, every closed file gets a one-paragraph debrief.
- *Linked incidents.* A new case in the same region or with the same method within ten sim days says so ("third sabotage in this region this month"; `regionEscalation` already counts it).

Acceptance for both: a probe shows a hired foreign agent produces a species clue pointing at the foreigner's empire and none at the sponsor; tracing the operative on a hireling weakens that clue; a prisoner from the sponsor's own service names them; a pursued lead costs Intel and lands within its window; the mole leaks pins to the sponsor only while compromised. In the preview, a dossier shows species, standing, recent events and access for a suspect, and the grid fills from pins.

**12c. Pressure on both sides.** False-flag clue planting, AI accusations, press articles seeded from open cases through the chronicle (`investigation_published` and `scandal_confirmed` already exist as event types).

Acceptance: in a probe, a victim of a political op receives at least three clues within 2 sim days at default counter-intel, a false-flag op produces a majority of clues pointing at the innocent, an accusation of the real actor opens the victim's debate and marks the chronicle event exposed, and a wrong accusation raises tension with the innocent; in the preview, DEV 1 can open a case, pin clues and accuse.

## Item 13: rebel cells (the Andor loop)

Oppression breeds cells, cells are funded by someone who stays hidden, the security bureau hunts them, and every crackdown makes more rebels. Every piece exists except the cells: non-state actors with bases, covert sponsorship and infiltration (`lib/piracy/`: `PirateOrganization`, `PirateBase.concealment`, `Sponsorship.covert` with accruing evidence, `compromisedByFactionId`, design in `docs/pirate-system/`); oppression and unrest (`planet.unrest`, bloc dissatisfaction, the `oppression` reputation score, cohesion); the endgame (`lib/government/secession-service.ts`, civil war, breakaway states a human can take in `lib/breakaway/`); the hunters (counter-intel budget, sweeps, prisoners, the case board); and catalog operations that are currently numbers (`incite_rebellion`, `fund_separatists`, `smuggle_weapons`).

### Item 13 design decisions (agreed 2026-10-07)

1. **A cell is a political pirate band.** Same entity model as `PirateOrganization` (members, bases with concealment, sponsorships, `knownToFactionIds`, `compromisedByFactionId`), with a cause taken from the loudest dissatisfied bloc on its world ("the miners of Aglate", "the old faith") and no fleet of its own. Reuse the model; do not fork it.
2. **Cells form where unrest and oppression stay high**, on worlds, not in systems: a cell belongs to a planet. Strength grows with grievance (unrest, bloc dissatisfaction, the host's oppression score) and shrinks with prosperity and concessions. A cell that stays small for long dies quietly.
3. **Sponsors stay hidden.** Any empire can covertly fund, arm or train a cell in a rival's space (credits, weapons via `smuggle_weapons`, a seconded agent). Evidence accrues the way covert pirate sponsorship accrues it. The cell may not know who pays; a sponsor can insist on a cutout, so the cell's leader cannot name them under questioning.
4. **Cells act**, on their own schedule, against the host: heists (credits or a blueprint; a sponsor gets a cut), sabotage, propaganda that moves blocs, assassination of a governor, a prison break for captured agents. Each act opens a case on the host's board (Item 12) whose first suspect is the cell, and whose real question is who stands behind it.
5. **The host hunts.** Sweeps find cells like networks. Informants (a lead) name members. A crackdown order raises security and arrests on a world; it works, and it raises the host's oppression score, which recruits for the cell. The trap is the design: every win costs the next one.
6. **Cells are compartmented.** A captured member knows their own cell only; one prisoner rolls up one cell, never the movement.
7. **Escalation.** A cell that survives and grows becomes a movement: open unrest, then a secession crisis (existing), then a breakaway state (existing). A sponsor caught owns a diplomatic incident or a war.
8. **Three seats.** The hunter runs the bureau (budget, sweeps, informants, crackdowns, cases). The sponsor builds a rebellion in a rival's space without being named (the hired-species trick and pirate cutouts apply). The rebel is a late joiner who takes a movement before it has a planet and plays from hiding until it breaks away, extending Item 7's breakaway seat.
9. **AI empires** both sponsor cells in rivals they are hostile to and crack down on cells at home, with personality deciding how hard; a Buthari never sponsors, a Kaer'Ruun never cracks down softly.

Phases (one session each, after 12c):

**13a. Cells and the oppression loop.** Cell entity on the pirate model, formation and growth from unrest and oppression, quiet death, compartments; the crackdown order and its oppression cost; cells visible to the host once found (sweeps, informants) and to the sponsor always. Probe: an oppressed world grows a cell within a season, a crackdown shrinks it and raises oppression, a prosperous world grows none.

**13b. Sponsorship and acts.** Covert sponsorship of a cell (fund, arm, second an agent, cutout), evidence accrual, the cell's acts and their cases on the host's board, the sponsor's cut from heists; AI sponsorship by personality. Probe: a sponsored cell acts within ten sim days, the host's case names the cell first, a prisoner from a cutout cell cannot name the sponsor, one without a cutout can.

**13c. The hunt and the rebel seat.** Informants as a lead, prison breaks, escalation into secession and breakaway, the late-joiner rebel seat with a hidden-movement phase; press articles for acts and crackdowns through the chronicle. Probe: a movement that survives thirty sim days opens a secession crisis; a human can take it as a breakaway; the AI cracks down by personality.

Acceptance: in a soak, oppressive AI empires accumulate cells and mild ones do not; sponsored cells open cases the host can solve by prisoner or informant; nothing about a sponsor reaches a host's shard that the host's service has not found; `scripts/approval-probe.ts` stays green (crackdowns must not reopen the approval collapse).

## Order

0, 1, 2, 3 in that order; they are the Wordle promise. Then 4, 5. Then 6a to 6d. Then 8 and 9. Item 7 and item 10 after a design conversation. Items 11 and 12 (added 2026-10-06) once the playtest galaxy is live: 11a, 11b, 11c first, then 12a, 12b, 12c; 11d and 11e slot into any free session (12a needs 11b for a player-launchable Counter-Intel Sweep). Status 2026-10-07: 11a to 11e, 12a and 12b are built (local commits up to a011f833, unpushed). Queue from here: 12b-2, 12b-3, 12c, then Item 13 (13a, 13b, 13c). Item 13 needs 12c for AI cases and the species trick.
