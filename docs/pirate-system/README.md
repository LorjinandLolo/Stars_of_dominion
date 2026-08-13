# Stars of Dominion — The Pirate System

This directory is the complete design for piracy as a **non-territorial power system**: an emergent economic, military, criminal and political force that the galaxy's own conditions generate, that players can destroy, fund, trade with, hire, legitimize, or become.

Start here. Use [index.md](index.md) to look up any order, state field, id, or tag. Read [systems.md](systems.md) before touching the engine — it holds the state shape, tick order, persistence rules and the phased migration plan against the code that already runs.

---

## Design philosophy

**Piracy is an alternative form of power.** A conventional empire converts territory into population into production into taxation into military. A pirate power converts ships into raiding into loot into black markets into protection into political influence. Neither ladder is a subset of the other. The question a pirate player asks is not "how many planets do I own" but "how much of the galaxy depends on me".

**The galaxy grows its own pirates.** No pirate spawns because a timer fired. Every organization is downstream of a measurable condition — a fat trade route with no escort, a chokepoint nobody garrisons, a border province whose owner is fighting a civil war two regions away, a sanctioned corridor where the only way to move cargo is illegal. The Piracy Opportunity Index in [emergence.md](emergence.md) reads those conditions off state the engine already tracks. Players create their own pirates, and the log tells them which of their decisions did it.

**Organizations, not spawns.** The unit of the system is the `PirateOrganization`, not the raider fleet. Fleets are what an organization spends; bases are what it hides in; infamy, heat, network control, black-market liquidity and crew loyalty are what it *is*. Killing a fleet costs an organization an asset. Killing an organization means dismantling a network — and the network is designed to survive the loss of any single node.

**Every stage changes the verb.** A Stage I gang raids. A Stage III corsair network *taxes*, because it has worked out that destroying commerce pays worse than protecting it. A Stage V pirate state signs treaties. The progression in [organizations.md](organizations.md) is not a stat ramp; each stage unlocks a different way of extracting value, and the late ones make "pirate" and "government" deliberately hard to tell apart.

**Deniability is a resource.** Sponsoring an organization is cheaper than a war and reversible in a way a war is not — until the evidence lands. Sponsorship rides the espionage system's existing `AttributionState` ladder (`invisible` → `suspected` → `exposed`), so the counter-play is the counter-intelligence the game already has, and the consequence is delivered by the press and diplomacy systems that already run. See [sponsorship.md](sponsorship.md).

**There is no anti-pirate button.** Navy, convoys, intelligence, economics, diplomacy, infiltration, bounties, amnesty — seven answers in [counter-piracy.md](counter-piracy.md), each cheap in a different currency and each with a consequence the others do not have. Amnesty converts an enemy into a constituency. Bounties outsource the problem to someone who now has a fleet in your space. Negotiation works and legitimizes them. Choosing is the gameplay.

**Pirates end somewhere.** Collapse back into gangs, fracture into a civil war between the raider wing and the merchant wing, or succeed so completely they are recognized as a state and their captains become governors. All three are in [organizations.md](organizations.md). The galaxy is supposed to cycle: the wreckage of one confederacy is the opportunity index of the next.

---

## What already exists in the code

The repo has piracy today — twice, in two layers that do not know about each other. The design absorbs both rather than replacing them.

**Layer A — abstract interdiction** (`lib/trade-system/piracy-service.ts`, driven by `tickPiracy` in `lib/trade-system/trade-network-service.ts`):
- `PiracyFleet` records in `world.economy.piracyFleets`, capped at 4, spawned at 2%/tick in systems with `security < 30`.
- `tickPiracyInterdiction` siphons 5–40% of flow from any `TradeRoute` whose `path` includes the camp system, ratchets `route.piracyRisk` by +0.02 per hit, and accumulates `lootAccumulated`.
- Suppressed by any fleet parked on top with `strength >= 0.4`; the suppressor's faction pockets half the loot as bounty.

**Layer B — physical raiders** (`lib/ai/pirate-ai-service.ts`, steps 11–13 in `lib/time/tick-processor.ts`):
- Real `Fleet` records under `factionId: 'faction-pirates'` in `world.movement.fleets`, capped at 15.
- `processPirateTurn` — repair at a `corsair_den`, retreat when outgunned, blockade systems with `tradeValue > 30`, otherwise move to the highest-value system in the galaxy.
- `step13_pirateSafeHavens` accrues `sys.lawlessness += 5` on low-security border systems of empires with 8+ systems; at 100 the system gains the `corsair_den` and `pirate_station` tags and repairs pirate fleets parked there.

**Surrounding hooks that already work:**
- `route.escortLevel` (order `ECON_ASSIGN_ESCORTS`, capped 0–8) and `route.piracyRisk`, both surfaced in `components/economy/EconomicTerminal.tsx`.
- Charter corporations suppress `piracyRisk` on their routes (`lib/economy/corporate/company-service.ts`, `PIRACY_SUPPRESSION_PER_FLEET`).
- The espionage `shadowEconomy` domain raises `route.piracyRisk` directly (`lib/espionage/espionage-service.ts:525`) and maintains `ShadowEconomyNode` records with `piracyChancePerHour`, `smugglingCapacity`, `insuranceCostInflation`.
- `AttributionRecord` / `AttributionState` already model the suspicion→exposure ladder for covert acts.
- `InfraActionType` already declares `openShadowHub` and `establishSmugglersLane`.
- `corsair_den` is a real `ArchetypeTag` with map visuals (`components/galaxy/starVisuals.ts`) and economy traits (`lib/economy/biosphere-traits.ts`).
- The tech web already forward-references this system: the `emg_` trigger in `docs/tech-web/systems.md:275` fires on `pirate.raidsSuffered >= 10` plus a `corsair_den`/`pirate_station` neighbour plus an active shadow-economy node.

**Three defects the design has to fix, not inherit:**
1. **Two competing truths.** An abstract `PiracyFleet` and a physical raider `Fleet` can occupy the same system and independently tax the same route. [systems.md §1](systems.md) makes physical fleets the single ground truth and demotes `PiracyFleet` to a derived per-system interdiction record.
2. **Non-deterministic spawning.** `step11_pirateSpawning` and `processPirateTurn` call `Math.random()` directly, so pirate history is unreproducible and diverges between worker restarts. Everything in this design draws from a seeded `RNG` (`lib/trade-system/rng.ts`) keyed on tick and organization id.
3. **Dead ladder.** `lib/mechanics/pathway-logic.ts` defines a four-rank `shadow` pathway (Smugglers → Privateers → Shadow State → Pirate King) gated on an `infamy` metric that nothing computes, and `evaluatePathwayProgression` is never called anywhere in the codebase. [metrics.md](metrics.md) defines the infamy it wants; [organizations.md](organizations.md) reconciles its four ranks with the five stages.

---

## Document map

- **[emergence.md](emergence.md)** — why piracy appears where it appears. The Piracy Opportunity Index and its eleven inputs, the seeding rule, chokepoint mathematics, and how a three-ship raiding party becomes an organization.
- **[organizations.md](organizations.md)** — the `PirateOrganization` entity. Stages I–V and what each unlocks, the five internal factions and their pressure model, succession, civil war, collapse, and legitimization into a recognized state.
- **[bases.md](bases.md)** — the eight infrastructure types, what each provides, concealment and discovery, why destroying one base does not kill a network, and how a network is actually dismantled.
- **[operations.md](operations.md)** — the raiding loop. Six raid types, trade-route warfare and its economic transmission, chokepoint strongholds, protection rackets, pirate-controlled trade, and the three sponsor-selectable operation intensities.
- **[shadow-economy.md](shadow-economy.md)** — black markets, smuggling around sanctions and embargoes, the intelligence marketplace, and the corporate relationships that make all of it respectable.
- **[sponsorship.md](sponsorship.md)** — secret funding, letters of marque, the four-step exposure ladder and its consequences, and pirate diplomacy as a first-class negotiation table.
- **[counter-piracy.md](counter-piracy.md)** — the seven government responses and their costs, plus what happens to captured crews and captains.
- **[metrics.md](metrics.md)** — infamy, heat, network control, black-market liquidity, crew loyalty: definitions, update rules, and every consumer. Plus the six pirate victory objectives.
- **[systems.md](systems.md)** — engine integration: state shape, tick placement, order catalog, AI, persistence, determinism, and the nine-phase migration plan.
- **[index.md](index.md)** — master tables. Every order id, state field, tag, config constant and file touched.

---

## Two galaxies, same rules

**The Warden Reach** garrisons its chokepoints, escorts its high-value lanes at level 4, and keeps border security above 40 by policy. Piracy still appears — on the frontier, small, and it stays Stage I because every gang that grows past three ships is worth a patrol's attention before it can buy a base. The Reach pays for this continuously in fleets that are never available for a war, and its rivals know exactly where those fleets are.

**The Vell Compact** did none of that, because its navy was busy annexing a neighbour. Its longest lane runs eleven jumps through two unowned systems. Four years later the Crimson Corsair Confederacy holds two systems on paper, seventeen bases in fact, protection contracts covering 40% of the traffic on that lane, three corporate clients who prefer the pirate fee to the insurance premium, and two secret government sponsors who each believe they are the only one. On the political map the Confederacy is a rounding error. On the economic map it is the Compact's largest creditor, and when the Compact finally sends a fleet, the Confederacy sells that fleet's departure date to the neighbour.

Same rules. One empire bought security and lost tempo; the other bought tempo and lost the space between its own planets.
