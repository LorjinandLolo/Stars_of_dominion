# Bases — the network you actually have to dismantle

Pirates need somewhere to operate from. Bases are what turn a raiding party into an organization: they provide **repair, resupply, recruitment, storage, intelligence and concealment**, and no single base provides all six. An organization with several bases is not merely tougher — it is structurally hard to kill, because destroying one base removes some capabilities and not others.

---

## 1. The entity

```ts
export type PirateBaseKind =
  | 'hideout'          // an asteroid, a debris field, a dead moon
  | 'derelict_station' // an abandoned station reactivated
  | 'frontier_port'    // a real settlement that looks the other way
  | 'secret_shipyard'
  | 'smuggler_port'
  | 'underground_market'
  | 'safe_house'       // planet-side, inside someone else's territory
  | 'hidden_lane';     // not a place — a route only they know

export interface PirateBase {
  id: string;
  organizationId: string;
  kind: PirateBaseKind;
  systemId: string;
  /** Set for safe_house / underground_market — which planet it hides on. */
  planetId?: string;
  /** For hidden_lane: the two endpoints it connects. */
  laneEndpoints?: [string, string];

  /** 0–1. How hard it is to find. Decays with use, rebuilt by lying low. */
  concealment: number;
  /** 0–1. Structural health. Bombardment and raids reduce it. */
  integrity: number;
  /** Fleets this base can repair and support. Sets part of org maxFleets. */
  berths: number;
  /** Stored loot awaiting sale. Lost if the base falls. */
  storedLoot: Record<string, number>;   // Resource → units

  /** Faction ids that have discovered this base (they may not have acted). */
  knownToFactionIds: string[];
  /** Set when a faction has infiltrated rather than destroyed it. */
  compromisedByFactionId?: string;
  establishedAtTick: number;
}
```

Bases live in `PiracyWorldState.bases: Map<string, PirateBase>`. A `pirate_station` tag on a `SystemNode` is the *public* face of a base whose concealment has fallen to zero — the tag and the entity are related but not the same thing, which is why [emergence.md §1.3](emergence.md) separates `corsair_den` (a condition) from `pirate_station` (an asset).

---

## 2. What each kind provides

| Kind | Repair | Resupply | Recruit | Storage | Intel | Conceal | Notes |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Hideout | ○ | ● | — | ● | — | ●●● | Cheapest. 1 berth. Where every organization starts. |
| Derelict station | ●● | ●● | ○ | ●● | ○ | ●● | 3 berths. Needs a system with a ruin/station tag. |
| Frontier port | ●● | ●●● | ●●● | ●● | ●● | ○ | Sits in an *owned* system whose governor is corrupt or absent. Cheap crew. Fragile: fixable by governance. |
| Secret shipyard | ●●● | ● | — | ● | — | ● | Builds new fleets instead of only repairing. Expensive. The highest-value target an organization owns. |
| Smuggler port | ● | ●●● | ○ | ●●● | ● | ●● | Doubles `blackMarketLiquidity` throughput. Required for large-scale smuggling. |
| Underground market | — | ● | ○ | ●● | ●● | ●● | Planet-side. Converts loot to credits at the best rate. Feeds [shadow-economy.md](shadow-economy.md). |
| Safe house | — | ○ | ● | ○ | ●●● | ●●● | Inside a real faction's population centre. Primary intel source; the reason pirates know fleet movements. |
| Hidden lane | — | — | — | — | ○ | ●●● | Not a location. Grants a movement edge only this organization can use (see §5). |

`●●●` strong, `●●` moderate, `●` weak, `○` marginal, `—` none.

**Design consequence:** a network of one shipyard, two hideouts and a safe house behaves completely differently from a network of three smuggler ports and an underground market. The first is a raiding organization that can replace losses; the second is a trading organization that cannot fight but is very hard to starve. Counter-piracy has to identify *which* before it can plan (see [counter-piracy.md §3](counter-piracy.md)).

---

## 3. Establishing a base

**Cost** is paid from `treasury` plus a build time in ticks, both scaling with kind. **Placement** is constrained:

| Kind | Placement requirement |
|---|---|
| Hideout | any system with `lawlessness ≥ 20` or no owner |
| Derelict station | system carries a ruin/station/abandoned tag |
| Frontier port | owned system with `security < 35` **or** a governor with `corruption ≥ 60` |
| Secret shipyard | `lawlessness ≥ 60`, and the organization must already hold 2 other bases |
| Smuggler port | within 2 hops of an active `TradeRoute` path |
| Underground market | a planet with population; higher population = higher throughput and lower concealment |
| Safe house | inside a real faction's system, requires Stage III and an existing `relations` contact there |
| Hidden lane | requires a surveyed deep-space or unowned adjacency the owner has not mapped |

Establishing a base in an owned system is an act the owner *can* prevent — by security investment, by replacing a corrupt governor, by garrisoning. The system deliberately rewards the boring administrative fixes that empires otherwise ignore.

---

## 4. Concealment and discovery

`concealment` is the base's real armour. It falls with use and rises with quiet:

```
concealment −= useDecay × (raidsLaunchedFromHere + lootMovedThrough)/scale
concealment += restRecovery         when the base is idle for a tick
concealment −= counterIntelPressure(system, faction)
```

**Discovery channels** (each adds a `factionId` to `knownToFactionIds`, and each gives *partial* information first):

| Channel | Mechanism | Reliability |
|---|---|---|
| Sensors | a fleet/outpost in range with `detectionStrength` beating `concealment` | exact location |
| Espionage | `ESP_LAUNCH_OP` in the `shadowEconomy` domain targeted at the region | region-level, then exact |
| Infiltration | `ESP_INFILTRATE_NETWORK` against the organization | exact, plus base contents |
| Interrogation | a captured crew or captain ([counter-piracy.md §8](counter-piracy.md)) | 1–3 bases, possibly stale |
| Betrayal | an internal faction with `satisfaction < 20` leaks during a fracture | exact, free, and unpredictable |
| Trade forensics | tracking stolen cargo back through markets | the *market* base, not the fleet bases |
| Purchase | buying the location from a rival organization | exact, costly, and the seller may warn them |

Discovery is intentionally not the same as destruction. A known base can be watched, raided for intel, blockaded, or left alone as bait — and `IntelReport.accurate` applies, so an empire can confidently bombard an asteroid that has nothing in it.

---

## 5. Hidden lanes

`hidden_lane` bases are the strangest asset and the most characteristically piratical: they add a movement edge to the graph that only the owning organization (and anyone it sells the route to) may traverse.

- Implemented as a `GraphEdge` with `type: DEEP_SPACE` plus an access list, or as a `Corridor` restricted to the organization — see [systems.md §3](systems.md).
- Lets pirates appear one jump from a lane they should have been six jumps from, which is why hunting them with conventional patrol geometry fails.
- **Sellable.** A hidden lane is the single most valuable thing an organization can sell to a real faction: a strategic surprise, a sanctions bypass, or an invasion route. The buyer's use of it degrades its concealment, and the pirates know when it has been used.
- Discovered lanes can be **taken**: a faction that finds one and holds both endpoints converts it into a normal (or its own restricted) edge, permanently removing the asset. This is the only base type whose loss is irreversible.

---

## 6. Losing a base

| Outcome | Trigger | Effect |
|---|---|---|
| **Raided** | hostile fleet in-system beats defending strength | `storedLoot` seized by the attacker; `integrity −0.4`; `concealment → 0` |
| **Destroyed** | `integrity ≤ 0`, or orbital bombardment of the host planet | base removed; `crewLoyalty −8`; `maxFleets` falls |
| **Compromised** | successful infiltration | base survives but `compromisedByFactionId` set: the infiltrator sees every raid launched from it one tick early, and can trigger a **rollup** (§7) |
| **Abandoned** | organization cannot pay upkeep, or concealment 0 with a hostile fleet inbound | loot moved if a route exists, otherwise lost; base becomes a discoverable ruin |
| **Seized** | a rival organization takes it | transfers wholesale, including stored loot; the loser's `infamy −5` |

Losing a base never kills an organization directly. It removes *specific* capabilities: lose the shipyard and losses become permanent; lose the underground market and loot stops converting to credits; lose the safe house and the intelligence advantage disappears; lose every hideout and there is nowhere to hide but a `frontier_port` that a governor can close.

---

## 7. Dismantling a network

This is the intended counter-piracy campaign, and it is meant to take a season rather than a battle:

1. **Detect** — an operation or a patrol finds *one* base. Partial knowledge: kind and region, not contents.
2. **Map** — infiltration, interrogation and trade forensics convert one known node into a picture of the network. Each new node makes the next cheaper (the organization's own logistics connect them).
3. **Choose the cut** — the shipyard stops replacement; the market stops revenue; the safe house stops foreknowledge; the smuggler port stops liquidity. Taking the wrong one first warns them and they relocate.
4. **Rollup** — with `≥ 60%` of an organization's bases either known or compromised, a faction may execute a coordinated strike: all known bases hit in the same tick, before the organization can disperse. Anything less than a rollup gives them time, and a dispersing organization rebuilds at ~40% of its former size in a *different* region — where it starts from a fresh POI and nobody's map is any good.
5. **Deny the ground** — none of the above works permanently unless the POI that produced them falls ([emergence.md §6](emergence.md)). A perfectly executed rollup on a corridor that is still fat and unescorted produces a new organization within a season, and the new one has learned from the last one's mistakes: successors founded in a region where a rollup occurred get a `+0.15` starting concealment bonus.

That last rule is the whole design principle in one number. Military success against pirates is real, and it is temporary unless it is paired with an economic or political fix.
