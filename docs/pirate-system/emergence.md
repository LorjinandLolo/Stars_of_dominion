# Emergence — where piracy comes from

Piracy is not spawned. It is *precipitated* out of conditions the galaxy already produces. This file defines the measurement (the Piracy Opportunity Index), the seeding rule that turns a high reading into an actual band of raiders, and the growth path from three ships to an organization.

The governing relationship:

> **high-value commerce × weak security × instability = pirate opportunity**

Multiplicative, not additive. A rich, well-defended lane produces nothing. An empty, lawless void produces nothing. Piracy needs something worth stealing *and* the ability to steal it.

---

## 1. The Piracy Opportunity Index

`POI(system)` is a 0–100 score computed per system, per tick, from state the engine already carries. It is stored on `SystemNode` as `piracyOpportunity` so the UI and the AI can both read it, and so a player can be shown *why* their frontier is producing corsairs.

### 1.1 The three factors

```
POI = 100 × value(sys) × exposure(sys) × instability(sys)
```

Each factor is 0–1. All three near 1 gives a system that will grow a confederacy; any one near 0 gives nothing.

**value — is there anything worth taking?**

| Input | Source | Contribution |
|---|---|---|
| Trade throughput | `sys.tradeValue` (0–100), plus `Σ route.routePriority` for every `TradeRoute` whose `path` includes this system | primary term |
| Cargo quality | share of transiting `TradeAgreement.resource` in `RARES`, `CAPACOLA`, `SACRED_FLORA`, `AMMO` | ×1.0 → ×1.6 multiplier |
| Corridor load | `sys.tradeSegmentIds.length` and the `throughput` of each | secondary term |
| Corporate traffic | charter-company routes passing through (`lib/economy/corporate/`) | secondary term |

```
value = clamp01( (tradeValue/100 × 0.5 + routeLoad × 0.5) × cargoQualityMultiplier )
```

**exposure — can it be taken safely?**

| Input | Source | Direction |
|---|---|---|
| Local security | `sys.security` (0–100) | inverse |
| Escort cover | mean `route.escortLevel` of transiting routes (0–8) | inverse |
| Naval presence | Σ `strength` of non-pirate fleets parked here or one hop away | inverse |
| Ownership | `sys.ownerFactionId` unset, or set but contested (`sys.isContested`) | raises |
| Distance from power | hops to `owner.capitalSystemId` on the hyperlane graph | raises, saturating at 6 hops |
| Route length | length of the longest transiting `route.path` | raises — long lanes cannot be covered end to end |

```
exposure = clamp01( 1 − securityCover ) × ( 0.6 + 0.4 × reachPenalty )
securityCover = 0.5×(security/100) + 0.3×(escortLevel/8) + 0.2×navalPresenceTerm
reachPenalty  = min(1, hopsFromCapital / 6) blended with min(1, routeLength / 10)
```

**instability — is anyone paying attention?**

| Input | Source |
|---|---|
| System unrest | `sys.instability` (0–100), `sys.escalationLevel` (0–10) |
| Existing lawlessness | `sys.lawlessness` (0–100) — self-reinforcing, see §1.3 |
| Owner cohesion | owner's cohesion/stability from `lib/government/cohesion-service.ts` (inverse) |
| Owner at war | active wars in `world.diplomacy`; war pulls escorts to fronts |
| Owner in collapse | any `CollapseState` / defiance / secession / civil war touching this region |
| Corruption | owning governor's corruption (`lib/government/`, cabinet & governor state) |
| Shadow nodes | an active `ShadowEconomyNode` here — an enemy has *deliberately* invested in this |
| Sanctions | this system's owner appears in another faction's `PolicyState.sanctions` or `embargoes` — legal trade suppressed, illegal trade rewarded |

```
instability = clamp01( 0.30×unrest + 0.20×(1−ownerCohesion) + 0.15×warStrain
                     + 0.15×collapseStage + 0.10×corruption + 0.10×shadowNodeTerm )
```

### 1.2 Chokepoint amplification

A system flagged as a chokepoint multiplies its own POI, because everything must pass through it and the pirate does not have to search:

- `sys.id ∈ corridor.chokepointIds` for any `Corridor`, or
- the system carries the `throat` / `canal` / `strait` / `gate` archetype tag (`types/index.ts` `ArchetypeTag`), or
- `GraphEdge.isChokepointEdge` is true for an incident edge, or
- betweenness: the fraction of all active `TradeRoute.path` arrays that include this system exceeds 0.15 — but only once the galaxy carries at least 7 live routes. Below that, "share of all routes" says nothing (with a single agreement, every system on its path carries 100% of the traffic), and chokepoint status has to come from geography instead.

```
POI *= 1 + 0.6 × chokepointScore     // chokepointScore 0–1
```

This is the mechanical reason a militarily worthless system can be the most contested place in a region. See §4.

### 1.3 The ratchet

Piracy is self-reinforcing but not runaway. Each tick:

```
lawlessness += k_growth × (POI/100) − k_decay × suppression
```

- `k_growth` scales with successful raids *actually landed here* this tick, not with POI alone — opportunity that nobody exploits does not compound.
- `suppression` comes from parked non-pirate fleet strength, garrison presence, and any active counter-piracy operation (see [counter-piracy.md](counter-piracy.md)).
- At `lawlessness >= 100` the system gains the `corsair_den` tag, and — if an organization actually establishes infrastructure here — `pirate_station`. This preserves current behaviour in `step13_pirateSafeHavens` but decouples the two tags: `corsair_den` is a *condition*, `pirate_station` is a *built asset* belonging to a specific organization (see [bases.md](bases.md)).
- `lawlessness` decays toward zero when POI is low, so pacified frontiers heal instead of staying permanently marked.

### 1.4 Replacing the current spawn rule

`step11_pirateSpawning` today rolls `0.02 + max(0,(40−security)/100)` per system per tick against `Math.random()`, capped at 15 raider fleets galaxy-wide. That produces pirates in empty systems, ignores trade entirely, and is not reproducible.

The replacement:

- Roll only in the top-N systems by POI (N scales with galaxy size), using a seeded `RNG` keyed on `(tickIndex, systemId)`.
- Spawn chance is `basePirateSpawn × (POI/100)^1.5` — superlinear, so mediocre opportunity produces nothing and genuine opportunity produces a lot.
- The cap is per-organization and per-region rather than one global constant on fleet count; see §3.

---

## 2. Seeding — the first three ships

When the roll succeeds, the engine does **not** create a free-floating raider. It creates a *raiding party*, which is either absorbed into an existing organization or becomes the seed of a new one.

**Absorption test.** If an existing `PirateOrganization` has a base within 3 hops, the party joins it: the org gains a fleet, `+1 infamy`, and the region's activity is attributed to a name the victim can eventually learn. Organizations therefore grow toward opportunity instead of the galaxy accumulating unrelated gangs.

**New organization.** Otherwise a Stage I organization is founded with a generated name, 1–3 fleets of `strength 0.2–0.6`, one hideout-grade base (see [bases.md](bases.md)), `infamy 0`, `heat 0`, `crewLoyalty 70`, and a dominant internal faction drawn from its **origin**, which is recorded permanently on the org and shapes its whole life:

| Origin | Trigger condition | Starting doctrine | Character |
|---|---|---|---|
| `frontier_desperation` | high POI from low security + poor local economy | `traditionalist` | Hard to bribe, hard to grow. Wants to be left alone. |
| `war_refugee` | spawned in or beside an active war zone | `raider` | Violent, fast-growing, brittle. |
| `mutiny` | a faction's fleet lost with low supply/morale, or a failed coup (`lib/government/`) | `raider` | Starts with a real warship and a grudge. |
| `secession_remnant` | a `FractureOutcome.PIRATE_HAVEN` or a defeated civil-war faction | `corsair` | Starts Stage II, holds territory, wants recognition. |
| `smuggler_syndicate` | spawned under sanctions/embargo pressure with no violence | `smuggler` | Starts with black-market liquidity, almost no fleet. |
| `sponsored` | created directly by `PIR_SPONSOR_ORG` (see [sponsorship.md](sponsorship.md)) | `corsair` | Well-armed, low loyalty, and someone owns it. |
| `corporate_deniable` | founded by a charter company | `merchant` | Raids competitors only. Books it as logistics. |

Origin is the seed of identity the same way a tech route is: two organizations with identical stats but different origins negotiate differently, fracture along different lines, and want different endings.

---

## 3. From party to organization

Growth is paid for out of raids, not granted by a timer. A raiding party that never lands a raid starves: fleets degrade with no base to repair at, crew loyalty falls, and the org dissolves back into the lawlessness pool.

The loop:

```
raid lands → loot → treasury → buy (ships | crew | a base | intel | a smuggling contract)
```

Each purchase changes what the organization can do next tick, and the purchase priority is set by the dominant internal faction ([organizations.md §4](organizations.md)):

| Dominant faction | Spends loot on |
|---|---|
| `raider` | more fleets, immediately |
| `smuggler` | smuggling capacity and black-market liquidity |
| `corsair` | intel networks and contacts (relations with real factions) |
| `merchant` | protection contracts, front companies |
| `traditionalist` | bases and concealment |

Caps are structural rather than numeric. An organization can only support fleets its bases can repair and its liquidity can pay: `maxFleets = Σ base.berths`, and exceeding supportable size drains `crewLoyalty` instead of being forbidden — an over-extended pirate fleet is not blocked, it is *unstable*, which is the more interesting failure.

---

## 4. Chokepoints

A chokepoint's life cycle is the clearest expression of the whole system:

```
Trade Hub → Pirate Hunting Ground → Pirate Stronghold
```

1. **Trade hub.** High betweenness. Everyone routes through it because the alternative is four extra jumps.
2. **Hunting ground.** POI amplification (§1.2) makes it the highest-value target in the region. Raids concentrate. `route.piracyRisk` ratchets on every route that includes it. Insurance-equivalent costs rise via `ShadowEconomyNode.insuranceCostInflation`.
3. **Stronghold.** An organization builds a base here and starts charging instead of stealing ([operations.md §5](operations.md)). At that point the system's owner still owns it on the political map, but the pirates set the terms of passage. `Corridor.controllingFactionId` and the pirate's `networkControl` disagree, and the disagreement is the point.

Rerouting away from a chokepoint is possible — `lib/trade-system/pathfinding.ts` will find another path — but it costs `baseCost` on longer edges, which raises delivered price, which is exactly what the pirates were charging for. Paying the toll and rerouting are two prices for the same thing, and the pirate sets both.

---

## 5. Player attribution — "you did this"

Every emergence event records its dominant input so the game can tell a player the truth about their own frontier:

```ts
interface EmergenceRecord {
  organizationId: string;
  systemId: string;
  tick: number;
  poi: number;
  dominantFactor: 'value' | 'exposure' | 'instability';
  dominantInput: string;      // e.g. 'escortLevel=0', 'ownerAtWar', 'sanctions'
  blamedFactionId?: string;   // whose neglect or whose deliberate act
}
```

Consumers:
- **Intel reports** — a counter-piracy investigation returns the record, imperfectly (`IntelReport.accurate` may be false).
- **Press** — `pushWorldStory` turns a cluster of records into a story about a lawless frontier, which costs the owning government public trust.
- **The tech web** — feeds `pirate.raidsSuffered` and the `corsair_den` adjacency condition of the emergent trigger in `docs/tech-web/systems.md:275`.
- **Blame** — when the dominant input is a `ShadowEconomyNode` or a sponsorship, `blamedFactionId` is the sponsor, and it becomes the first thread of the exposure ladder in [sponsorship.md](sponsorship.md).

---

## 6. Suppressing emergence

Emergence has counters that are not military, and they are cheaper:

| Lever | Mechanism | Cost |
|---|---|---|
| Raise `escortLevel` | cuts `exposure` | credits per tick, per route |
| Garrison the chokepoint | cuts `exposure`, adds suppression | a fleet that is now not elsewhere |
| Shorten routes | fewer hops = lower `reachPenalty` | worse prices, or infrastructure spend |
| Raise local security | cuts `exposure` and decays `lawlessness` | governance/policy investment |
| Fix cohesion | cuts `instability` | political capital |
| End the sanctions | removes the smuggling premium | a diplomatic concession |
| Buy the cargo legally | cuts `value` — nothing worth stealing moves | margin |

The last one matters: an empire that stops shipping `RARES` through a lawless corridor has removed the pirates' reason to exist there, and the organization must relocate, diversify, or shrink. Economic answers to piracy are real answers, and [counter-piracy.md](counter-piracy.md) prices them against the military ones.
