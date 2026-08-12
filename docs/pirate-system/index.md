# Index — orders, state, ids, and where everything lives

Master lookup for the pirate system. Every id here is canonical.

---

## 1. Order catalog

All handled in the `scripts/game-loop.ts` switch, following existing `ESP_*` / `DIP_*` / `PRESS_*` conventions.

### Counter-piracy — any faction

| Order | Payload | Doc |
|---|---|---|
| `PIR_POST_BOUNTY` | `{ targetOrgId? , targetLeaderId?, targetBaseId?, credits }` | [counter-piracy §6](counter-piracy.md) |
| `PIR_OFFER_AMNESTY` | `{ organizationId, terms }` | [counter-piracy §6](counter-piracy.md) |
| `PIR_NEGOTIATE` | `{ organizationId, agreementKind, terms }` | [sponsorship §5](sponsorship.md) |
| `PIR_PAY_PROTECTION` | `{ organizationId, scope, feePerTick }` | [operations §5](operations.md) |
| `PIR_DISPOSE_CREW` | `{ captureId, disposition }` | [counter-piracy §8](counter-piracy.md) |
| `PIR_CUSTOMS_ENFORCE` | `{ systemId, level }` | [shadow-economy §2](shadow-economy.md) |

### Sponsorship

| Order | Payload | Doc |
|---|---|---|
| `PIR_SPONSOR_ORG` | `{ organizationId, fundingPerTick, supplies, covert }` | [sponsorship §2](sponsorship.md) |
| `PIR_SET_OPERATION` | `{ organizationId, intensity, targetFactionId }` | [operations §7](operations.md) |
| `PIR_CUT_SPONSORSHIP` | `{ sponsorshipId }` | [sponsorship §2](sponsorship.md) |
| `PIR_ISSUE_MARQUE` | `{ organizationId, targetFactionId }` | [sponsorship §4](sponsorship.md) |
| `PIR_SEED_ORGANIZATION` | `{ regionId, doctrine, funding }` | [sponsorship §2](sponsorship.md) |
| `PIR_BACK_SUCCESSOR` | `{ organizationId, candidateDoctrine }` | [sponsorship §6](sponsorship.md) |

### Shadow economy — any faction

| Order | Payload | Doc |
|---|---|---|
| `PIR_BLACKMARKET_BUY` | `{ marketId, resource, units }` | [shadow-economy §1](shadow-economy.md) |
| `PIR_BLACKMARKET_SELL` | `{ marketId, resource, units }` | [shadow-economy §1](shadow-economy.md) |
| `PIR_BUY_INTEL` | `{ organizationId, product }` | [shadow-economy §3](shadow-economy.md) |
| `PIR_BUY_LANE` | `{ baseId }` | [bases §5](bases.md) |

### Pirate player

| Order | Payload | Doc |
|---|---|---|
| `PIR_ASSIGN_RAID` | `{ fleetIds, targetRouteId?, targetSystemId?, raidType }` | [operations §2](operations.md) |
| `PIR_SET_POSTURE` | `{ routeId, posture }` | [operations §4.1](operations.md) |
| `PIR_ESTABLISH_BASE` | `{ kind, systemId, planetId? }` | [bases §3](bases.md) |
| `PIR_SET_RACKET` | `{ payerId, scope, feePerTick, exclusiveDefence }` | [operations §5](operations.md) |
| `PIR_SPLIT_LOOT` | `{ crewShare }` | [metrics §5](metrics.md) |
| `PIR_ACCEPT_MARQUE` / `PIR_REFUSE_MARQUE` | `{ sponsorshipId }` | [sponsorship §4](sponsorship.md) |
| `PIR_LEGITIMIZE` | `{}` | [organizations §8](organizations.md) |

### Reused, not duplicated

`ECON_ASSIGN_ESCORTS` (convoys) · `ESP_LAUNCH_OP` domain `shadowEconomy` (network detection) · `ESP_INFILTRATE_NETWORK` retargeted at an organization · `MIL_MOVE_FLEET` + patrol (navy) · `PRESS_*` (exposure) · `DIP_*` (consequences) · `POW_DISPOSE` (pattern for `PIR_DISPOSE_CREW`).

---

## 2. New types

| Type | File | Doc |
|---|---|---|
| `PirateOrganization` | `lib/piracy/piracy-types.ts` | [organizations §1](organizations.md) |
| `PirateStage`, `PirateDoctrine`, `PirateOrigin` | same | [organizations §1–2](organizations.md), [emergence §2](emergence.md) |
| `PirateInternalFaction` | same | [organizations §4](organizations.md) |
| `PirateLeader` | same | [organizations §3](organizations.md) |
| `PirateRelation`, `PirateAgreementKind` | same | [organizations §5](organizations.md) |
| `PirateBase`, `PirateBaseKind` | same | [bases §1](bases.md) |
| `ProtectionContract` | same | [operations §5](operations.md) |
| `BlackMarket` | same | [shadow-economy §1](shadow-economy.md) |
| `Sponsorship` | same | [sponsorship §1](sponsorship.md) |
| `PirateBounty` | same | [counter-piracy §6](counter-piracy.md) |
| `EmergenceRecord` | same | [emergence §5](emergence.md) |
| `PiracyWorldState` | same | [systems §1](systems.md) |

Reused as-is: `AttributionState`, `AttributionRecord`, `IntelReport`, `ShadowEconomyNode` (`lib/espionage/espionage-types.ts`); `PiracyFleet`, `TradeRoute`, `Resource`, `Market` (`lib/trade-system/`); `Fleet`, `SystemNode`, `Corridor`, `InfraAction` (`lib/movement/types.ts`).

---

## 3. Fields added to existing types

| Type | File | Field |
|---|---|---|
| `SystemNode` | `lib/movement/types.ts` | `piracyOpportunity?: number` |
| `SystemNode` | same | `pirateInfluence?: Record<string, number>` |
| `Corridor` | same | `pirateControlByOrg?: Record<string, number>`, `restrictedToOrgId?: string` |
| `Fleet` | same | `organizationId?: string` |
| `TradeRoute` | `lib/trade-system/types.ts` | `protectedByOrgId?: string` |
| `Faction` | same | `infamy?: number` |
| `PiracyFleet` | `lib/trade-system/piracy-service.ts` | `organizationId`, `posture` |

All optional; no Prisma migration.

---

## 4. Metrics

| Metric | Scale | Owner | Primary consumers |
|---|---|---|---|
| `infamy` | 0–100 | organization | recruitment, stage gates, leverage, heat |
| `heat` / `heatByFaction` | 0–100 | organization | patrol allocation, bounties, discovery, recruitment |
| `networkControl` | 0–100 | organization + per corridor | tolls, access gating, Stage V, legitimization |
| `blackMarketLiquidity` | credits/tick | organization | loot conversion, wages, bribes, survival |
| `crewLoyalty` | 0–100 | organization | fracture, succession, desertion, sponsorship sloppiness |
| `Faction.infamy` | 0–100 | faction | `pathway-logic.ts` shadow ranks, diplomatic reaction |
| `piracyOpportunity` (POI) | 0–100 | system | emergence, AI targeting, UI heat map |

---

## 5. Stage gates

| Stage | Requires |
|---|---|
| I — Gang | — |
| II — Fleet | fleets ≥ 3, infamy ≥ 15, a leader |
| III — Corsair Network | bases ≥ 3, infamy ≥ 35, ≥ 1 non-hostile relation |
| IV — Confederacy | fleets ≥ 8, bases ≥ 6, networkControl ≥ 40, crewLoyalty ≥ 50, internal vote |
| V — Pirate State | networkControl ≥ 65, infamy ≥ 70, 2 systems where pirateInfluence > owner, ≥ 1 recognition treaty |

Demotion: three consecutive ticks below the previous gate.

---

## 6. Tags and ids

| Id / tag | Kind | Status |
|---|---|---|
| `faction-pirates` | faction id | exists — the umbrella faction all pirate fleets fly under |
| `corsair_den` | `ArchetypeTag` | exists — a *condition* (`lawlessness ≥ 100`) |
| `pirate_station` | system tag | exists — becomes an *owned asset* in Phase 3 |
| `porg-*` | organization id prefix | new |
| `pbase-*` | base id prefix | new |
| `pmkt-*` | black-market id prefix | new |
| `pspon-*` | sponsorship id prefix | new |
| `pcon-*` | protection-contract id prefix | new |

---

## 7. Tick steps

| Step | Does | Replaces |
|---|---|---|
| inside `step6_trade` | interdiction + loot settlement | unchanged (`tickPiracy`) |
| `step11a_piracyMetrics` | decay, drift, wages, upkeep | new |
| `step11b_piracyOpportunity` | POI + lawlessness ratchet | part of `step13_pirateSafeHavens` |
| `step11c_piracyEmergence` | seeded spawn, absorption, founding | `step11_pirateSpawning` |
| `step11d_piracyBases` | upkeep, concealment, discovery, repair | part of `step13_pirateSafeHavens` |
| `step11e_pirateTacticalAI` | fleet orders | `step12_pirateTacticalAI` |
| `step11f_pirateEconomy` | loot → storage → market → treasury | new |
| `step11g_pirateContracts` | fees, tribute, sponsor funds, bounties | new |
| `step11h_pirateExposure` | evidence, attribution transitions | new |
| `step11i_pirateInternal` | pressure, succession, fracture, stages | new |

Each wrapped in its own `try/catch` — a throw in this block once froze the game clock.

---

## 8. Files

**New:** `lib/piracy/piracy-types.ts`, `piracy-service.ts`, `organization-service.ts`, `base-service.ts`, `protection-service.ts`, `black-market-service.ts`, `sponsorship-service.ts`, `opportunity-index.ts`, `lib/ai/pirate-org-ai.ts`.

**Modified:** `lib/time/tick-processor.ts` (steps 11–13) · `scripts/game-loop.ts` (`PIR_*` orders) · `lib/trade-system/piracy-service.ts` (derived cache, posture) · `lib/trade-system/trade-network-service.ts` (`tickPiracy` derivation) · `lib/ai/pirate-ai-service.ts` (org-aware, seeded) · `lib/movement/types.ts`, `lib/trade-system/types.ts` (added fields) · `lib/movement/movement-service.ts` (`openShadowHub`, `establishSmugglersLane`) · `lib/espionage/espionage-service.ts` (attribute `piracyRisk` to an org) · `lib/economy/corporate/corporate-ai.ts` (protection-vs-escort) · `lib/persistence/save-service.ts` (Map rehydration) · `lib/game-world-state-singleton.ts` (init) · `lib/mechanics/pathway-logic.ts` (wire or delete) · `app/api/game/sync` (visibility filter) · `lib/store/ui-store.ts`, `types/ui-state.ts`.

---

## 9. Design brief → document map

Where each section of the original 31-section brief landed.

| Brief § | Topic | Document |
|---|---|---|
| 1 | Core philosophy | [README](README.md) |
| 2 | How piracy emerges | [emergence §1](emergence.md) |
| 3 | Pirate emergence | [emergence §2–3](emergence.md) |
| 4 | Progression I–V | [organizations §2](organizations.md) |
| 5 | Bases | [bases](bases.md) |
| 6 | Raiding | [operations §1–3](operations.md) |
| 7 | Trade route warfare | [operations §4](operations.md) |
| 8 | Chokepoints | [emergence §1.2, §4](emergence.md) |
| 9 | Protection rackets | [operations §5](operations.md) |
| 10 | Pirate-controlled trade | [operations §6](operations.md) |
| 11 | Black market | [shadow-economy §1](shadow-economy.md) |
| 12 | Smuggling | [shadow-economy §2](shadow-economy.md) |
| 13 | Pirate intelligence | [shadow-economy §3](shadow-economy.md) |
| 14 | Player-sponsored piracy | [sponsorship §1–2](sponsorship.md) |
| 15 | Operation intensities | [operations §7](operations.md) |
| 16 | Exposure mechanic | [sponsorship §3](sponsorship.md) |
| 17 | Privateering | [sponsorship §4](sponsorship.md) |
| 18 | Pirate diplomacy | [sponsorship §5](sponsorship.md) |
| 19 | Corporations & pirates | [shadow-economy §4](shadow-economy.md) |
| 20 | Pirate states | [organizations §2](organizations.md) |
| 21 | Empire without territory | [metrics §6](metrics.md) |
| 22 | Power metrics | [metrics §1–5](metrics.md) |
| 23 | Government response | [counter-piracy §1–6](counter-piracy.md) |
| 24 | Anti-piracy choices | [counter-piracy §7](counter-piracy.md) |
| 25 | Capture & recruitment | [counter-piracy §8](counter-piracy.md) |
| 26 | Internal politics | [organizations §4](organizations.md) |
| 27 | Pirate civil wars | [organizations §6](organizations.md) |
| 28 | Collapse | [organizations §7](organizations.md) |
| 29 | Legitimization | [organizations §8](organizations.md) |
| 30 | Victory / endgame | [metrics §7](metrics.md) |
| 31 | Emergent gameplay loop | [README](README.md), [systems §10](systems.md) |
