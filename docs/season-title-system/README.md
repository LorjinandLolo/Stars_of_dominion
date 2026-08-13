# Stars of Dominion — Seasons & Titles

This is the design for how the galaxy keeps score without ever ending: **there is no victory screen and no defeat screen**. Seasons are scoring windows over a world that never stops; titles are the trophies that windows produce; the press turns both into history. The systems that would traditionally end the game — conquest, elimination, collapse — instead award titles, trigger turbulence, and keep running.

The one-sentence architecture:

```
Simulation metrics → title evaluation (tick) → held titles (contested crowns)
                                             → earned titles (permanent record)
Season clock → modifiers tilt the world → season close → held titles snapshot to Hall of Fame
                                                        → legacy bonuses (capped) → next season
```

---

## Design philosophy

**The game never ends; the season does.** A persistent multiplayer world with a win condition has a scheduled funeral. Every long-horizon system in this repo — tech diffusion, government cohesion, pirate organizations, the shadow economy — is built for ongoing play, and a "you win" screen orphans all of it. The season boundary is the finish line instead: it arrives on a clock, not on a kill, and the world on the far side of it is the same world with the same map.

**Defeat is emergent, not declared.** The engine already destroys factions convincingly: secession, coups, civil war, economic collapse, piracy eating the space between planets. A faction can lose everything without a modal telling it so. `DefeatManager` survives in this design as a *diagnosis*, not a verdict — its doom score and active-defeat list feed the UI and the press ("the Vell Compact is dying, and everyone can read it in the gazette"), never a game-over state. An eliminated faction is a faction with zero planets, and the same systems that reduced it offer the road back.

**Two kinds of title, deliberately different.**
- **Earned titles** are permanent achievements: awarded once when a faction (or leader) does a thing, kept forever, listed in the record. "First to break a Stage III pirate confederacy." "Survived a civil war intact."
- **Held titles** are contested crowns: one holder at a time, taken by overtaking the metric that defines them. "Dominant Trade Power." "The Galactic Arsenal." Held titles are where the competitive pressure lives — players chase crowns instead of a win screen, and losing one is news.

**Seasons give held titles stakes.** During a season a crown can change heads any day. At season close, the current holder of each crown is written into the permanent record: "Dominant Trade Power, Season 3" becomes an earned title nobody can take away. The season-end tally of crowns *is* the scoreboard — most crowns at the bell is the closest thing to "winning the season", and the world does not stop to celebrate.

**Feats replace victory conditions.** The repo's existing win conditions — total conquest, economic monopoly, enlightenment — do not disappear; they are demoted from "end the game" to **galactic feats**: near-unrepeatable accomplishments that award a unique earned title, fire the highest-band chronicle event the galaxy can produce, and trigger the already-built `PostVictoryTransition` (48 hours of amplified instability, espionage, and bloc pressure). Conquering the galaxy makes you *Sovereign of All Stars* and immediately hands you a galaxy-sized rebellion problem. That is the design: the feat is the peak, the aftermath is the game.

**Titles are narrative fuel, not stat sticks.** A title's mechanical weight is deliberately small (prestige, capped legacy bonuses); its real payload is identity and news. Every award, loss, and season snapshot emits a chronicle event for the narrative system (`docs/narrative-system/README.md`) — a crown changing heads writes its own headline. Bonuses must never snowball: the config already says `permanentBonusCap`, and this design keeps that rule load-bearing.

**Leaders get epithets.** The leadership system already generates characters with a formal `title` field ("Chancellor"). Epithets are the informal second name history gives them — "the Shipbreaker", "the Usurper" — earned the same way faction titles are, carried until death, and inherited by the faction's lore when they die. Cheap to award, disproportionately effective.

---

## What already exists in the code

This design absorbs four systems that currently overlap and disagree.

**Seasons — Pillar 7, half-wired** (`lib/seasons/season-service.ts`, `lib/seasons/season-types.ts`, config at `lib/movement/movement-config.json` → `seasons`):
- `ActiveSeason` with phases `announced → active → ending → complete`, 2–3 modifiers drawn from a six-entry pool (trade volatility, military escalation, commodity scarcity, gate flux, deep-space bloom, ideological drift), 30-day duration, 5-day announcement lead. Duration is a deployment setting, not a design constant — 7 days for playtests, 60–100 for a real 15-player season.
- `SeasonFactionRecord` already has `earnedTitles`, `prestige`, `bonusesApplied` — the title vocabulary exists in the schema.
- `endSeason()` scores factions on holding shared-state variables above 0.6 under pressure plus tech-identity tags, and awards titles from the config pool (`Pioneer`, `Merchant Prince`, `Warlord`, `Pathfinder`, `Chronicler`).
- World state carries `activeSeason`, `seasonHistory`, `hallOfFame`, `milestones`, `legacyPrestigeBonuses`, `shared.seasonalModifiers`, `shared.seasonDayElapsed` (`lib/game-world-state.ts:119-129`).

**Milestones and the second season-ender** (`lib/victory/milestone-service.ts`, called from `step20_milestonesAndSeasons` in `lib/time/tick-processor.ts:650`):
- Four "galactic first" milestones (first to 10 systems, 50k credits, 15 techs, 1500 fleet power) — these are earned titles in all but name, announced galaxy-wide via `fireNotification`.
- `calculateFactionPrestige()` — a working power-ranking formula over economy, military, tech, and stability.
- `resolveSeasonTransition()` — a *second, competing* end-of-season path: ranks factions by prestige, awards `Grand Sovereign` / `Exarch` / `Legate` to the top three, writes `legacyPrestigeBonuses`, archives to `hallOfFame`, clears milestones. Explicitly a soft reset: territory, fleets, and tech survive.

**Victory, twice** — neither of which this design keeps as a game-ender:
- `lib/victory/manager.ts` — `VictoryManager.checkVictory` (economic monopoly ≥ 75%, last faction standing). **Never called anywhere.** Dead code with its own `VictoryState` type in `@/types/victory` that collides by name with the seasons' `VictoryState`.
- `lib/victory/victory-service.ts` — the Pillar 7 conquest/enlightenment machinery (`ConquestState` with `rebellionPressure`, `EnlightenmentProgress` with qualification/transcendence phases, `PostVictoryTransition` with 48h instability multipliers, `TerritoryPersistenceRecord`). Exercised only by `lib/victory/victory-tests.ts`; not wired into the tick.

**Defeat** (`lib/defeat/manager.ts`, called every tick in step 20):
- Seven conditions across terminal / strategic / internal / crisis categories, a 0–100 doom score, statuses `ALIVE → DYING → ELIMINATED`.

**Adjacent hooks that already work:** `Leader.title` and `Leader.history` (`lib/leadership/types.ts`), the seeded `RNG` (`lib/trade-system/rng.ts`), `fireNotification` (`lib/time/notification-hooks.ts`), the press system's publishers for coverage, and the pirate system's infamy/metrics (`docs/pirate-system/metrics.md`) as a ready-made source of pirate-facing titles.

**Six defects the design has to fix, not inherit:**
1. ~~**Seasons never actually run.**~~ *(fixed — phase 1.)* `scheduleNextSeason` and `tickSeasonModifiers` were reachable only from debug endpoints; the live tick neither started a season, nor applied modifier pressure, nor scheduled the next after a close. The pillar was dormant in production. Step 20 now drives the whole clock.
2. ~~**Two competing season-end truths.**~~ *(fixed — phase 1.)* The tick closed a season via `MilestoneService.resolveSeasonTransition` (prestige ranking, Grand Sovereign); the debug path closed it via `endSeason` (modifier endurance, Merchant Prince). Merged into one closer, where both scores now have a defined job.
3. **Two `VictoryState` types** with the same name in different modules, one of them belonging to a system that is never invoked. *(Phase 3 deletes the dead one.)*
4. ~~**Elimination spam.**~~ *(fixed — phase 0.)* `step20` fired a `FACTION ELIMINATED` notification with a fresh `Date.now()` id **every tick** for as long as the condition held. Now latched to status transitions.
5. **Non-determinism.** ~~`scheduleNextSeason` used `Math.random()`~~ *(fixed — phase 1; seeded on season number, so a restart reschedules the identical season)*; defeat and victory records still stamp `new Date()` rather than the sim clock. Same defect class the pirate migration is eliminating.
6. ~~**Titles have no registry.**~~ *(fixed — phase 0.)* `earnedTitles` were loose strings in season records and milestones lived in a separate map; nothing owned the catalog, checked uniqueness, or remembered who held what when. `lib/titles/` does all three.

---

## The title registry

One new module, `lib/titles/`, owning the catalog and the ledger. State lives in the world snapshot (repo convention: serialized with the world, JSON-string columns, call sites parse).

```ts
// lib/titles/types.ts

export type TitleKind = 'earned' | 'held';
export type TitleSubject = 'faction' | 'leader' | 'pirate_org' | 'company';

export interface TitleDefinition {
    id: string;                  // 'held_trade_dominance', 'earned_first_coup_survivor', ...
    kind: TitleKind;
    subject: TitleSubject;
    name: string;                // "Dominant Trade Power"
    description: string;
    /** Held titles: the metric that decides the holder (see catalog). */
    metricId?: string;
    /** Held titles: challenger must exceed holder by this fraction to take the crown. */
    challengeMargin?: number;    // default 0.10
    /** Held titles: consecutive evaluations the margin must hold. */
    challengeDwell?: number;     // default 3
    /** Earned titles: event predicate id evaluated against chronicle/tick facts. */
    triggerId?: string;
    /** Prestige granted on award (earned) or per season held at close (held). */
    prestige: number;
    /** Held titles: display-only decoration while held. Never a modifier. */
    cosmetic?: { badge?: string; mastheadLine?: string };
    /** 'unique' = one award galaxy-wide ever (feats, firsts). */
    uniqueness?: 'unique' | 'repeatable';
}

export interface TitleAward {
    titleId: string;
    subjectId: string;           // factionId or leaderId
    /** Sim-clock seconds. Never wall clock. */
    awardedAtSeconds: number;
    seasonNumber: number;
    /** Held titles only: when lost (null = currently held). */
    lostAtSeconds: number | null;
    /** Season-close snapshot flag: this hold was ratified into the permanent record. */
    ratified: boolean;
}

export interface TitleWorldState {
    /** titleId → current holder award (held titles only). */
    currentHolders: Map<string, TitleAward>;
    /** Full append-only ledger, earned + historical holds. */
    ledger: TitleAward[];
    /** Held-title challenge progress: titleId → { challengerId, dwellCount }. */
    challenges: Map<string, { challengerId: string; dwellCount: number }>;
}
```

**Evaluation is deterministic and cheap.** A single tick step (see integration below) computes each held title's metric for every faction — every metric in the catalog is derived from state the engine already tracks, most of it already aggregated by `calculateFactionPrestige`. Earned-title triggers piggyback on the moments systems already announce outcomes (the same ~15 emission sites the narrative system's chronicle instruments).

**Hysteresis, or crowns flap.** A held title changes hands only when a challenger's metric exceeds the holder's by `challengeMargin` for `challengeDwell` consecutive evaluations. Without this, two factions trading 1% economic leads generate a title swap every tick and the news becomes noise. Dwell progress resets the moment the challenger drops below the margin.

**Every transition is an event.** Award, loss, ratification, and feat completion each emit a chronicle event (or, pre-narrative-system, a `fireNotification` — the emission site is the same either way, which is deliberate: the titles system is instrumented for the chronicle from day one).

---

## Title catalog (initial)

Metrics reference state that exists today. The catalog is data (`lib/titles/catalog.ts`), not scattered logic — adding a title is adding an entry.

### Held titles — the crowns

A crown pool that is only ever "biggest number, seven ways" collapses into one race that the largest empire wins seven times. Half of these deliberately measure *how* a faction plays rather than how big it is — geography, restraint, usefulness to rivals — so that a two-system minor and a pacifist can both hold something an empire wants.

| Title | Metric | Source |
|---|---|---|
| **Dominant Trade Power** | share of total trade-route flow | `world.economy` trade network |
| **The Galactic Arsenal** | total fleet power (`basePower × strength`) | `world.movement.fleets` |
| **Master of the Web** | unlocked tech count, diffusion-weighted | `world.tech` |
| **The Open Hand** | highest average planetary happiness (min. 3 planets) | `world.construction.planets` |
| **Shadow Broker** | espionage network reach / active intel ops | `lib/espionage/` state |
| **Scourge of the Lanes** | pirate org infamy (see `docs/pirate-system/metrics.md`) | piracy metrics |
| **Voice of the Galaxy** | press credibility × reach | press system state |
| **Warden of the Gates** | most gate and chokepoint systems controlled | `world.movement.gates`, lane graph |
| **The Anvil** | share of galactic industrial output | `world.economy` production |
| **Keeper of the Long Peace** | longest unbroken streak without initiating a war | war states / rivalry escalation |
| **The Kingmaker** | active diplomatic web, weighted by partner prestige | `world.treaties`, `world.diplomacy` |
| **Speaker of the Houses** | highest average approval across population blocs | `empirePostures[].blocs` |
| **The Free Port** | foreign trade volume transiting your territory | trade route paths |
| **The Reaper's Toll** | enemy fleet power destroyed this season | combat results, rolling window |

Four of these carry deliberate design weight. **Warden of the Gates** is a geography crown — sitting on the right two systems beats owning twenty of the wrong ones, and everyone resents whoever worked that out. **Keeper of the Long Peace** is fragile on purpose: one opportunistic strike ends a three-season streak in a headline, which gives a pacifist a crown worth defending and gives everyone else a reason to tempt them. **The Free Port** is won by being *useful to your rivals*, an incentive knot worth having in a game otherwise about denying them things. **The Reaper's Toll** is the villain crown, and it resets naturally because the window is the season.

### Earned titles — faction achievements (repeatable unless marked unique)

- **Pioneer / Merchant Prince / Warlord / Pathfinder / Chronicler** — the existing config pool, reinterpreted as season-performance titles (kept: they are already in `movement-config.json` and the endurance scoring in `endSeason` is a decent trigger).
- **Galactic Hegemon / Economic Tycoon / The Oracle / Military Titan** — the four existing milestones, migrated into the registry as `unique` galactic firsts (their definitions and thresholds move; `world.milestones` retires).
- **Kingbreaker** *(unique per pirate org)* — dismantled a Stage III+ pirate organization.
- **The Phoenix** — regained a homeworld after losing every planet.
- **Ironbound** — survived a civil war without territorial loss.
- **The Quiet Knife** — completed a top-tier espionage op that stayed `invisible` for a full season.
- **Giantslayer** — won a war against a faction holding ≥2× your prestige at war start.
- **Regicide** — took a crown from a holder who had kept it 2+ consecutive seasons.
- **Dynasty** — held the same crown three seasons running. Regicide and Dynasty chase each other: every season a crown is successfully defended makes taking it worth more.
- **The Silent Coup** — took a crown in a season without starting a single war.

### Disgraces — the shame half of the ledger

The ledger is append-only, so a disgrace is exactly as permanent as an honour: never revoked, only outlived. That is the point — it hands the press a reputation to reach for years later, and it makes the ledger a record of character rather than a trophy shelf. Disgraces carry negative prestige (`valence: 'disgrace'`).

- **Oathbreaker** — broke a treaty within a season of signing it.
- **The Vulture** — annexed 3+ planets, every one of them from a faction in `DYING` status. The doom score already computes this, so detection is free.

### Feats — former victory conditions, now unique earned titles

| Feat title | Trigger (existing machinery) | Aftermath |
|---|---|---|
| **Sovereign of All Stars** | `ConquestState` — full territorial control (`lib/victory/victory-service.ts`) | `PostVictoryTransition` 48h + `rebellionPressure` accrual — the empire is now the scenario |
| **The Ascended** | `EnlightenmentProgress` transcendence completes | `PostVictoryTransition` + `structuralImpact` legacy |
| **Master of Coin** | economic monopoly ≥ 75% of galactic income (from dead `VictoryManager`, re-homed as a feat trigger) | trade-volatility surge; every other faction gets a sanctions casus belli |

Feats end nothing. `lastVictoryType`/`lastVictoryFactionId` on `VictoryState` remain as the historical record they already are.

### Leader epithets

Same registry, `subject: 'leader'`, written into `Leader.history` and displayed beside `Leader.title`. **the Shipbreaker** (led a fleet that destroyed 3+ enemy fleets), **the Usurper** (took office via coup), **the Beloved** (popularity ≥ 90 for a season), **the Undying** (survived an assassination op), **the Architect** (in office when a feat completed), **the Silvertongue** (brokered 3+ treaties), **the Butcher** (ground campaigns that left mass unrest — a disgrace), **the Grey Cardinal** (a spymaster whose ops were never once attributed), **the Liberator** (retook an occupied planet and returned it to its original owner), and **the Martyr** (assassinated in office — posthumous). Epithets are permanent; a dead leader's stay in faction lore and the narrative system's obituary pipeline picks them up for free.

---

## The season lifecycle, unified

One path, as of phase 1. `endSeason` in `lib/seasons/season-service.ts` is the only closer — the tick, the debug endpoint and any admin action all call it. `MilestoneService` is deleted: its milestones went to the title registry and `calculateFactionPrestige` to `lib/seasons/prestige.ts`, where it is the ranking metric and tiebreaker rather than a separate title source.

```
schedule (RNG seeded on seasonNumber) → announced (5d lead, modifiers public)
  → active (modifiers pressure shared state; held titles contested; earned titles fire)
  → ending (last 20%: crown standings surfaced in UI — the "final lap" broadcast)
  → close:
      1. ratify: every currently-held crown → permanent earned record ("<title>, Season N")
      2. rank: prestige leaderboard; top three get Grand Sovereign / Exarch / Legate for the season
      3. legacy bonuses written (capped by permanentBonusCap; replace, never stack)
      4. archive SeasonRecord → seasonHistory + hallOfFame
      5. clear seasonalModifiers; emit season-retrospective chronicle event
      6. schedule season N+1 immediately (no dead air between seasons)
```

**What resets: almost nothing.** Territory, fleets, tech, governments, pirate organizations, and all earned titles persist — the soft reset already implemented in `resolveSeasonTransition` is correct and stays. What resets: seasonal modifiers, held-title *challenge* progress (crowns themselves carry over — the holder starts the new season defending), and legacy bonuses (replaced by the new season's, never accumulated). `TerritoryPersistenceRecord` is taken at every close as the audit snapshot it was designed to be.

**Scoring = crowns + prestige.** The season's headline result is the ratified crown count; `calculateFactionPrestige` breaks ties and fills the leaderboard below the crowns. This replaces both existing scorers: modifier-endurance survives as the trigger behind the Pioneer-pool earned titles, not as the ranking.

---

## Tick integration

All of it lives where step 20 already is (`lib/time/tick-processor.ts:650`), renamed `step20_seasonsAndTitles`:

1. **Season clock** — schedule first season if `activeSeason` is null and none pending; run phase transitions and `tickSeasonModifiers` (moving it out of debug-only existence); close at `endsAt` via the unified closer.
2. **Held-title evaluation** — compute metrics, update challenges, transfer crowns past hysteresis. Cheap: one pass over factions per title, all in-memory aggregation.
3. **Earned-title triggers** — drain the tick's trigger buffer (systems call `titles.notify(triggerId, subjectId)` at their existing announcement sites, mirroring the chronicle's `record()` pattern — synchronous, buffered, no I/O).
4. **Feat checks** — the conquest/enlightenment evaluators from `victory-service.ts`, now actually invoked; `PostVictoryTransition` ticked alongside.
5. **Collapse diagnosis** — `DefeatManager` runs as today, but **latched**: a status transition (ALIVE→DYING, DYING→ELIMINATED, and recoveries) fires exactly one notification/chronicle event; steady state fires nothing.

Determinism rules (inherited from the pirate migration, non-negotiable): modifier selection and any random flavor use `RNG` seeded on `(seasonNumber)`; all timestamps are `world.nowSeconds`; no `Math.random`, no `Date.now()` in any of these paths.

---

## Invariants

1. **No code path ends the game.** No feat, defeat status, or season close may halt ticking, lock a faction out of orders, or force a reset. ELIMINATED is a display status over a zero-planet faction, nothing more.
2. **The title ledger is append-only.** Holds end (`lostAtSeconds`), awards are never deleted. History is not edited — same rule as the chronicle.
3. **Mechanical weight stays capped.** Holding a crown grants cosmetics only — badge and masthead, never a modifier. Legacy bonuses (awarded at ratification) respect `permanentBonusCap`, are replaced each season, and never compound. A title must never be the reason its holder keeps winning.
4. **One season-end path.** The unified closer is the only function that ratifies crowns, writes bonuses, or archives records. Debug endpoints call it, not a sibling.
5. **Held titles are pure functions of current state**, with three declared exceptions, all serialized with the world: challenge dwell counters, the per-season kill tally behind *The Reaper's Toll*, and the war marks behind *Keeper of the Long Peace*. Nothing else accumulates inside the titles module — a crashed-and-restored world computes the same holders. Every metric must also tolerate a snapshot that predates the state it reads: an unscored crown stands, it never throws inside the tick.
6. **Every transition emits exactly one event.** Latched, deduplicated, sim-clock stamped.

---

## Phased plan

Each phase ships alone and is testable alone (tsx scripts, per repo convention — jest is unconfigured).

**Phase 0 — Registry + earned titles.** *(shipped — `scripts/test-titles-phase0.ts`, 49 checks.)* `lib/titles/` types, catalog, ledger in world state, the `notifyTitleTrigger` buffer, migration of the four milestones into the registry (`world.milestones` retired). `DefeatManager` notifications latched to transitions.

**Phase 1 — Seasons actually run.** *(shipped — `scripts/test-titles-phase1.ts`, 52 checks.)* `tickSeasonModifiers` now runs from step 20 and starts a season when none is in flight; modifier selection is seeded on the season number; `endSeason` is the single closer and schedules its own successor, so the galaxy never sits between seasons. `MilestoneService` is deleted — its prestige formula lives in `lib/seasons/prestige.ts`, its milestones in the title registry. The crown-ratification loop is in the closer already and is inert until phase 2 fills `currentHolders`.

**Phase 2 — Held titles.** *(shipped — `scripts/test-titles-phase2.ts`, 64 checks.)* All fourteen metrics in `lib/titles/metrics.ts`, hysteresis and transfer in `lib/titles/crown-service.ts`, ratification and tenure at the season close, cosmetic badge/masthead on every transition, `crownStandings()` for the ending-phase UI. *Scourge of the Lanes* is held by pirate organizations, proving the non-faction subject path. Dynasty fires at the third consecutive ratified close; Regicide fires when a crown is taken off a two-season holder. Company metrics remain unwired — the seam is a catalog entry plus a metric function.

**Phase 3 — Feats + leader epithets.** Invoke conquest/enlightenment evaluators from the tick; re-home the monopoly check from dead `VictoryManager` and delete it (resolving the `VictoryState` name collision — `@/types/victory` goes with it); epithet triggers into `Leader.history`. Test: victory-tests migrate and extend.

**Phase 4 — Narrative + UI.** Chronicle emission for all transitions (or notification fallback until the narrative system's phase 0 lands); Hall of Fame / crown-board panel; per-faction title case in the faction view.

---

## Decisions

**Crowns are not a faction privilege.** Pirate organizations and charter companies hold them too. `TitleSubject` is `faction | leader | pirate_org | company`; the metrics already exist on both sides (org infamy in `docs/pirate-system/metrics.md`, corporate route share in `lib/economy/corporate/`). This is the design earning its keep: *Dominant Trade Power* held by a chartered company, or *Scourge of the Lanes* held by the Crimson Corsairs rather than the navy that failed to stop them, says something about the galaxy that a faction-only leaderboard cannot. Phase 2 evaluates faction metrics first because they are already aggregated; adding the other two is catalog work, not schema work.

Display follows the holder. A crown held by a faction shows on the faction panel and the map. A crown held by a pirate organization shows on the pirate dashboard and in the gazette — and, importantly, on the *public* crown board, because a crown is public knowledge even when the organization holding it is not fully known to you. (The asymmetric-information rules in `docs/pirate-system/systems.md` §8 still govern everything else about that org; the crown board leaks its fame, never its bases.) A company's crown shows on its charter page and on its host empire's economy screen.

**Held titles grant a cosmetic perk only.** Map badge and a gazette masthead line while the crown is held; prestige lands at ratification. No stat modifier ever attaches to holding a crown, which keeps invariant 3 trivially true and stops the leader from compounding their lead. `TitleDefinition.cosmetic` carries the badge and masthead strings.

**Season length is per-deployment, not per-design.** Config already externalizes `durationDays`. Playtest at 7 days so a full boundary is observable in a sitting; a real 15-player season runs **60–100 days**. The mechanics that scale with length are the held-title dwell counter (evaluations, not days — unaffected) and legacy bonus magnitude (unaffected, capped). Nothing else needs a second look when the number changes.

**The Phoenix stays, and it needs a road back.** Comeback mechanics for a zero-planet faction — exile fleets, government-in-exile through the parliament system, pirate patronage as a lifeline with a price — are their own design, deliberately out of scope here. The title exists now and awards correctly the moment a faction retakes a planet; what it should cost and how a faction survives long enough to earn it is the next design doc, and it should land before anyone actually hits zero.

## Open questions

- Where the crown board lives in the UI: its own panel, or a section of the Hall of Fame? Phase 4 decides; both read the same ledger.
