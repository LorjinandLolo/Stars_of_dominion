# Systems — engine integration and migration plan

How the pirate system attaches to the code that already runs. Read this before touching the engine.

Project rules that constrain everything below: all faction-state mutation flows through the **order queue** handled in `scripts/game-loop.ts`, never through API routes; JSON-bearing DB columns are **TEXT holding JSON strings** (call sites `JSON.parse`/`stringify`); new state is additive inside aggregates the serializer already carries, so **no Prisma migration is required**; the game-loop worker (`npm run worker`) must be **restarted after deploy**.

---

## 1. State shape

New top-level aggregate on `GameWorldState`, beside `movement`, `economy`, `espionage`:

```ts
export interface PiracyWorldState {
  organizations: Map<string, PirateOrganization>;
  bases: Map<string, PirateBase>;
  blackMarkets: Map<string, BlackMarket>;          // marketId → market
  protectionContracts: Map<string, ProtectionContract>;
  sponsorships: Map<string, Sponsorship>;          // also indexed on the org
  bounties: Map<string, PirateBounty>;
  emergenceLog: EmergenceRecord[];                 // ring buffer, ~200 entries
  /** systemId → 0–100, recomputed each tick. Cache, not source of truth. */
  opportunityIndex: Map<string, number>;
  /** Deterministic stream position for the piracy RNG. */
  rngCursor: number;
}
```

Initialized in `lib/game-world-state-singleton.ts` beside the existing `espionage: { ... shadowEconomyNodes: new Map(), ... }` block.

### 1.1 Unifying the two existing layers

Today there are two independent piracy models (see [README.md](README.md)). The migration resolves them:

| Today | After |
|---|---|
| `world.economy.piracyFleets: Map<string, PiracyFleet>` — abstract, cap 4, own spawn logic | **Derived cache.** Rebuilt each tick from `faction-pirates` fleets parked on route paths. Same `PiracyFleet` shape, so `tickPiracyInterdiction` keeps working unchanged. |
| `world.movement.fleets` with `factionId: 'faction-pirates'` — physical, cap 15, own spawn logic | **Ground truth.** Every such fleet gains `organizationId`. Spawning moves to the emergence pass. |
| `spawnPiracyFleet()` called from `tickPiracy` | Called only by the derivation step; no longer a spawn point. |
| `step11_pirateSpawning` | Deleted; replaced by `step11a_piracyEmergence`. |

`PiracyFleet` gains two fields: `organizationId: string` and `posture: 'skim' | 'prey' | 'strangle'` (drives the siphon rate that is currently a flat `0.05 + rng.next()*0.35`). `interdictionStrength` is computed from the contributing physical fleets rather than assigned at spawn.

This keeps `lib/trade-system/piracy-service.ts` and its integration in `settleTradeFlows` intact — the economic consequences of raiding already work and should not be rewritten.

### 1.2 Additions to existing types

| Type | Field | Why |
|---|---|---|
| `SystemNode` | `piracyOpportunity?: number` | POI cache for UI and AI ([emergence.md §1](emergence.md)) |
| `SystemNode` | `pirateInfluence?: Record<string, number>` | orgId → 0–100; the second truth on the map |
| `Corridor` | `pirateControlByOrg?: Record<string, number>` | corridor-level control ([operations.md §6](operations.md)) |
| `Fleet` | `organizationId?: string` | which org owns a `faction-pirates` fleet |
| `TradeRoute` | `protectedByOrgId?: string` | a route under a protection contract — raid resolution must skip it |
| `Faction` | `infamy?: number` | the empire-side shadow metric ([metrics.md §1.1](metrics.md)) |
| `PiracyFleet` | `organizationId`, `posture` | §1.1 |

All optional, all additive, none breaking existing snapshots.

---

## 2. Tick placement

The current tick runs steps 11–13 for piracy after `step10_visibility`, each wrapped in its own `try/catch` (added after a throw there once froze the game clock — keep that pattern).

**Ordering constraints:**
- Interdiction must run **inside** the trade tick (`step6_trade` → `tickPiracy` → `settleTradeFlows`), because it needs live flows. It stays there.
- Organization bookkeeping must run **after** politics (`tickCohesion`, `tickGovernments`) so POI reads this tick's cohesion and corruption.
- Emergence must run **after** visibility so newly created fleets get sensible detection state on the next pass.

**Replacement block**, in place of today's `step11`–`step13`:

```
step11a_piracyMetrics       infamy/heat decay, loyalty drift, treasury upkeep, wages
step11b_piracyOpportunity   recompute POI for every system; write the cache
step11c_piracyEmergence     seeded spawn rolls; absorb into an org or found one
step11d_piracyBases         upkeep, concealment decay/recovery, discovery rolls
step11e_pirateTacticalAI    existing processPirateTurn, made org-aware
step11f_pirateEconomy       loot → base storage → black market clearing → treasury
step11g_pirateContracts     protection fees, tribute, sponsorship funds, bounties
step11h_pirateExposure      sponsorship evidence accrual, attribution transitions
step11i_pirateInternal      pressure drift, satisfaction, succession, fracture, stage checks
```

`step14_empireFleetRepair` and the rest keep their numbers; only the pirate steps are replaced. `step13_pirateSafeHavens`'s lawlessness accrual moves into `step11b`, and its pirate-fleet repair into `step11d` (repair now requires an actual base, not just a `corsair_den` tag).

---

## 3. Movement graph — hidden lanes

`hidden_lane` bases ([bases.md §5](bases.md)) add a restricted edge. Two options; take the second:

1. A `GraphEdge` with `type: EdgeType.DEEP_SPACE` plus an access list — cheapest, but `lib/trade-system/pathfinding.ts` and `lib/movement/lane-graph.ts` both walk edges without an access concept, so every consumer would need the filter.
2. **A `Corridor` restricted to one organization**, with `denialFieldActive` semantics inverted (passable only by the owner). `Corridor` already carries `controllingFactionId` and a node list, and corridor membership is already consulted per-fleet in movement. Add `restrictedToOrgId?: string` and filter at path expansion.

Selling a lane grants a second entry in an `allowedOrgIds`/`allowedFactionIds` list, which is what makes lane sale a transferable asset rather than a permanent gift.

---

## 4. Order catalog

New `PIR_*` cases in the `scripts/game-loop.ts` switch, following the existing `ESP_*` / `DIP_*` / `PRESS_*` conventions (validate, mutate world state, push a notification, return a result object).

**Counter-piracy (any faction):**

| Order | Payload | Notes |
|---|---|---|
| `PIR_POST_BOUNTY` | `{ targetOrgId \| targetLeaderId \| targetBaseId, credits }` | claimable by any actor |
| `PIR_OFFER_AMNESTY` | `{ organizationId, terms }` | resolved per internal wing |
| `PIR_NEGOTIATE` | `{ organizationId, agreementKind, terms }` | opens/updates a `PirateRelation` |
| `PIR_PAY_PROTECTION` | `{ organizationId, scope, feePerTick }` | signs a `ProtectionContract` |
| `PIR_DISPOSE_CREW` | `{ captureId, disposition }` | mirrors the existing `POW_DISPOSE` |
| `PIR_CUSTOMS_ENFORCE` | `{ systemId, level }` | smuggling interception at a controlled chokepoint |

**Sponsorship:**

| Order | Payload |
|---|---|
| `PIR_SPONSOR_ORG` | `{ organizationId, fundingPerTick, supplies, covert }` |
| `PIR_SET_OPERATION` | `{ organizationId, intensity, targetFactionId }` |
| `PIR_CUT_SPONSORSHIP` | `{ sponsorshipId }` |
| `PIR_ISSUE_MARQUE` | `{ organizationId, targetFactionId }` |
| `PIR_SEED_ORGANIZATION` | `{ regionId, doctrine, funding }` |
| `PIR_BACK_SUCCESSOR` | `{ organizationId, candidateDoctrine }` — requires `standing ≥ 60` |

**Shadow economy (any faction):**

| Order | Payload |
|---|---|
| `PIR_BLACKMARKET_BUY` / `PIR_BLACKMARKET_SELL` | `{ marketId, resource, units }` |
| `PIR_BUY_INTEL` | `{ organizationId, product }` |
| `PIR_BUY_LANE` | `{ baseId }` — purchase hidden-lane access |

**Pirate-player orders** (a player controlling an organization):

| Order | Payload |
|---|---|
| `PIR_ASSIGN_RAID` | `{ fleetIds, targetRouteId \| targetSystemId, raidType }` |
| `PIR_SET_POSTURE` | `{ routeId, posture }` |
| `PIR_ESTABLISH_BASE` | `{ kind, systemId, planetId? }` |
| `PIR_SET_RACKET` | `{ payerId, scope, feePerTick, exclusiveDefence }` |
| `PIR_SPLIT_LOOT` | `{ crewShare }` — the loyalty/treasury trade-off |
| `PIR_ACCEPT_MARQUE` / `PIR_REFUSE_MARQUE` | `{ sponsorshipId }` |
| `PIR_LEGITIMIZE` | `{}` — Stage V only |

**Reused, not duplicated:** `ECON_ASSIGN_ESCORTS` (convoys), `ESP_LAUNCH_OP` with the `shadowEconomy` domain (network detection), `ESP_INFILTRATE_NETWORK` retargeted at an organization, `MIL_MOVE_FLEET`/patrol (navy), `PRESS_*` (exposure stories), `DIP_*` (consequences of exposure).

---

## 5. AI

**Organization AI** — `lib/piracy/pirate-org-ai.ts`, one decision pass per organization per tick: score targets, assign fleets, set postures, decide purchases per doctrine, evaluate offers (protection, marque, amnesty, bounty claims), and run the internal vote. Deterministic given `(tick, orgId)`.

**Fleet tactical AI** — the existing `lib/ai/pirate-ai-service.ts` `processPirateTurn`, with three changes: read the org's assigned target instead of scanning the whole galaxy for `tradeValue`; retreat to a base the org actually owns instead of any `corsair_den`; and replace `Math.random()` with the seeded RNG.

**Faction counter-piracy AI** — extends `lib/ai/strategic-ai-service.ts` with the comparison in [counter-piracy.md §7](counter-piracy.md) so AI empires choose between patrols, convoys, negotiation, bounties and doing nothing. AI espionage is already enabled and should be allowed to target organizations.

**Corporate AI** — `lib/economy/corporate/corporate-ai.ts` currently just reduces `piracyRisk` on its worst route. Extend it to compare protection-fee cost against escort cost and buy the cheaper one ([shadow-economy.md §4](shadow-economy.md)).

---

## 6. Determinism

Today `step11_pirateSpawning` and `processPirateTurn` call `Math.random()` directly. Pirate history is therefore unreproducible, diverges across worker restarts, and cannot be tested. Every roll in this system draws from the seeded `RNG` in `lib/trade-system/rng.ts`, keyed on a stable tuple:

```
piracyRng(world, tickIndex, 'emergence', systemId)
piracyRng(world, tickIndex, 'raid', organizationId, routeId)
piracyRng(world, tickIndex, 'discovery', baseId, factionId)
piracyRng(world, tickIndex, 'fracture', organizationId)
```

Same rule the planet-surface system follows. Nothing in `lib/piracy/` may call `Math.random()` or `Date.now()` for game logic; ids use the tick counter, not a wall clock (the current `spawnPiracyFleet` builds ids from `Date.now()` — fix that in Phase 0).

---

## 7. Rewiring existing hooks

| Existing | Today | After |
|---|---|---|
| `ShadowEconomyNode` | espionage side effect with `piracyChancePerHour` | becomes an **input to POI** (`instability` term) and can seed a `sponsored`-origin organization; `insuranceCostInflation` feeds the merchant's protection-vs-escort comparison |
| `openShadowHub` (InfraAction) | handled generically in `movement-service.ts:762` | creates an `underground_market` base owned by an organization |
| `establishSmugglersLane` | same | creates a `smuggler_port` or `hidden_lane` base |
| espionage `shadowEconomy` op raising `route.piracyRisk` | direct mutation (`espionage-service.ts:525`) | additionally attributes the risk to an organization, so the victim's investigation has something to find |
| `corsair_den` tag | set at `lawlessness ≥ 100`, drives repair + map visuals | unchanged as a *condition*; `pirate_station` becomes a built asset with an owner |
| `PIRACY_SUPPRESSION_PER_FLEET` (corporate) | flat `piracyRisk` reduction | unchanged, plus corporations may buy protection instead |
| `pathway-logic.ts` | dead code | wired to `Faction.infamy` ([organizations.md §2](organizations.md)) or deleted — do not leave it dead |
| tech-web `emg_` trigger at `docs/tech-web/systems.md:275` | expects `pirate.raidsSuffered` and `corsair_den` adjacency | the History Ledger metric is emitted by `step11f` |

---

## 8. Persistence and sync

- All new Maps rehydrate in `lib/persistence/save-service.ts` beside the existing guards (`if (!(esp.shadowEconomyNodes instanceof Map)) esp.shadowEconomyNodes = new Map()`). Every Map in `PiracyWorldState` needs one.
- Serialization is additive inside existing JSON TEXT columns. **No Prisma migration.**
- `/api/game/sync` must expose a *filtered* view: a faction sees organizations it has contact with, bases in `knownToFactionIds`, its own sponsorships and contracts, and `attributionState` — never another faction's covert sponsorships, never `IntelReport.accurate`, never base contents it has not discovered. Put the filter in one place and test it; leaking the pirate state client-side destroys the entire exposure mechanic.
- UI reads via the Zustand store like every other system (`lib/store/ui-store.ts`, `types/ui-state.ts`).

---

## 9. UI surface

| Surface | Content |
|---|---|
| Galaxy map overlay | POI heat tiles, known bases, `pirateInfluence` shading that disagrees with ownership colour |
| Route panel (`components/economy/EconomicTerminal.tsx`) | already shows `piracyRisk` and `escortLevel`; add protection status and the fee-vs-escort comparison |
| Threat panel | organizations you know of: stage, infamy, heat *toward you*, known bases, active contracts |
| Negotiation dialog | the agreement table from [sponsorship.md §5](sponsorship.md) |
| Sponsorship panel | your sponsorships, funding, intensity, and your current `attributionState` — the tension surface |
| Black market | stock, discount, and a traceability warning |
| Pirate faction UI (if playing one) | the five metrics, wings and their pressure/satisfaction, base network, contracts — and **no territory count** |

---

## 10. Migration plan

Nine phases, each shippable on its own, each leaving the live game better than it found it.

**Phase 0 — determinism and unification.** No new features. Seed every pirate roll from `lib/trade-system/rng.ts`; remove `Math.random()` and `Date.now()` from `step11_pirateSpawning`, `processPirateTurn` and `spawnPiracyFleet`; make `world.economy.piracyFleets` a derived cache of physical `faction-pirates` fleets so a route can no longer be taxed twice for the same pirates; add `organizationId` to `Fleet` and `PiracyFleet`. Decide `pathway-logic.ts`: wire or delete.

**Phase 1 — the organization.** `PiracyWorldState`, the `PirateOrganization` entity, metrics ([metrics.md](metrics.md)), stages I–III with their gates, and the `step11a`/`step11i` bookkeeping steps. Existing spawned raiders are adopted into generated organizations on first tick after deploy (a repair pass, in the style of the tech Phase 0 fix). No new player orders — the galaxy simply starts having *named* pirates with histories.

**Phase 2 — emergence.** The Piracy Opportunity Index, `step11b`/`step11c` replacing `step11_pirateSpawning`, origins, absorption, and the `EmergenceRecord` log. Pirates now appear where the players caused them, and the log can say so.

**Phase 3 — bases.** `PirateBase`, the eight kinds, concealment and discovery, base-gated fleet caps and repair, rollup mechanics, hidden lanes as restricted corridors. `pirate_station` becomes an owned asset. Counter-piracy becomes a campaign rather than a patrol.

**Phase 4 — operations.** Raid types, posture (skim/prey/strangle) driving the siphon rate, convoy attacks, economic raids, terror effects, and the trade-route-warfare transmission through the existing economy. Hostage negotiations.

**Phase 5 — the protection economy.** `ProtectionContract`, tribute, `networkControl` and corridor-level `pirateControl`, tolls and access gating, the merchant's fee-vs-escort comparison, and the corporate AI extension.

**Phase 6 — the shadow economy.** `BlackMarket`, smuggling runs and customs interception, the intelligence marketplace (selling `IntelReport`s, including false ones), `Faction.infamy`, and the rewiring of `openShadowHub` / `establishSmugglersLane`.

**Phase 7 — sponsorship and exposure.** `Sponsorship`, operation intensities, the evidence model on the existing `AttributionState`/`AttributionRecord`, letters of marque, pirate diplomacy and the negotiation table, and consequence delivery through press, diplomacy and the government system.

**Phase 8 — internal politics and endings.** Wings, pressure drift, satisfaction, leaders and succession, fracture into civil war, mergers, the collapse cascade, Stages IV–V, and legitimization into a real faction. Counter-piracy's capture/amnesty/informant dispositions and the leader arcs that follow.

**Phase 9 — the pirate as a player.** Pirate-player orders, the pirate UI, and the six victory objectives in `lib/victory/`.

Phases 0–2 are the ones that fix live defects; everything after is new capability. Phases 4–7 can ship in any order once 3 lands.

---

## 11. Testing

Jest is not configured in this repo — verify with `tsx` scripts under `scripts/`, in the style of `scripts/test-blockade.ts`, `scripts/test-government-phase6-5.ts`, `scripts/test-tech-phase5.ts`:

| Script | Asserts |
|---|---|
| `scripts/test-piracy-phase0.ts` | same seed + same world ⇒ identical pirate history across two runs; no double-taxation of a route |
| `scripts/test-piracy-phase1.ts` | stage gates promote and demote; metrics update; adoption repair pass finds orphan raiders |
| `scripts/test-piracy-phase2.ts` | POI ranks a fat unescorted lane above an empty lawless void; escorts suppress emergence |
| `scripts/test-piracy-phase3.ts` | base loss removes the right capability; rollup requires 60%; dispersal rebuilds elsewhere |
| `scripts/test-piracy-phase5.ts` | a merchant switches to protection when the fee undercuts escorts; a breach voids contracts |
| `scripts/test-piracy-phase7.ts` | evidence ladder advances on the right inputs; exposure fires press + diplomacy consequences; the sync filter never leaks a covert sponsorship |
| `scripts/test-piracy-phase8.ts` | pressure drift follows the revenue mix; fracture splits assets deterministically; legitimization spawns a faction and a splinter |

Run the worker (`npm run worker`) after deploying any phase — the tick processor is a long-lived process and will otherwise keep executing the previous build.
