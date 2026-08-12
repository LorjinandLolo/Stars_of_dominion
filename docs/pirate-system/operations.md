# Operations — raiding, trade-route warfare, and the protection economy

The pirate gameplay loop, from a single freighter to a corridor that answers to somebody who does not own it.

---

## 1. Target selection

Each tick, every organization scores available targets and assigns fleets. Targets are drawn from state that already exists:

| Target class | Source | Typical value | Risk |
|---|---|---|---|
| Merchant flow | `TradeRoute` whose `path` includes a system the org can reach | routePriority × price | `escortLevel` |
| Resource shipment | `TradeAgreement` in `RARES` / `CAPACOLA` / `SACRED_FLORA` | highest | usually escorted |
| Convoy | route with `escortLevel ≥ 3` | high | requires Stage II |
| Corporate transport | charter-company routes (`lib/economy/corporate/`) | high, and the victim may prefer to *pay* | low political risk — corporations rarely retaliate militarily |
| Military logistics | supply flow to a fleet with low `supplyLevel`, or to a besieged system | low credits, high strategic effect | very high |
| Isolated colony | low-population planet, no garrison, far from capital | moderate, one-off | low, but it makes enemies permanently |
| Mining vessel / outpost | frontier extraction | low | negligible |

Scoring: `expectedValue × successProbability − heatCost × heatWeight`, where `heatWeight` rises with current `heat` and falls with raider-wing pressure. A raider-dominated organization discounts heat and takes fights it should not; a merchant-dominated one refuses profitable raids because the client relationship is worth more.

---

## 2. Raid types

The organization chooses *how* aggressive to be, and the choice is a real trade-off between profit, heat, infamy and the victim's response. Each raid resolves against escort strength and produces a different outcome set.

| Type | Takes | Profit | Heat | Infamy | Victim response |
|---|---|---|---|---|---|
| **Robbery** | cargo only; ship and crew released | ●● | ● | ● | insurance-equivalent cost, price rise |
| **Capture** | the ship itself — converts to a pirate fleet or is sold | ●●● | ●● | ●● | permanent loss of hull; the victim's own ship now flies against them |
| **Sabotage** | nothing; damages the vessel/segment | — | ● | ● | `TradeSegment.integrity` falls, throughput degrades for many ticks |
| **Hostage-taking** | personnel — a governor, a leader, a corporate officer | ●●● (ransom) | ●●● | ●●● | a negotiation, not a battle — see §2.1 |
| **Destruction** | nothing; the target is annihilated | — | ●●●● | ●●●● | war-grade political response; terror effect on the whole corridor |
| **Economic raid** | one specific `Resource` the victim's economy depends on | ●● | ●●● | ●● | shortage cascades into production and stability |

**Destruction** is deliberately unprofitable. It exists because it is the only raid that produces *fear* at scale: it applies a corridor-wide `terror` modifier that suppresses voluntary traffic (routes reduce `routePriority`) without any further raiding. A raider-wing confederacy that leans on destruction gets a quiet, poor corridor and a galaxy-wide coalition; a smart one uses it once, publicly, and then sells protection.

**Economic raid** is the strategic weapon. Targeting a single resource that the victim's `Faction.metrics.tradeDependencyIndex` says they cannot substitute converts piracy into siege warfare without a siege.

### 2.1 Hostages

A hostage creates a `PirateAgreementKind: 'hostageDeal'` negotiation with the victim faction: pay a ransom, trade a captured pirate captain back, concede a route, or refuse. Refusing costs the victim's government approval (the press system covers it) and kills the hostage, permanently raising that organization's infamy and that faction's `standing` toward them to blood-feud levels. Hostage-taking is how a Stage III organization forces a great power to *talk to it*, which is the first step to everything in [sponsorship.md §5](sponsorship.md).

---

## 3. Raid resolution

```
attackStrength  = Σ fleet.strength × fleet.basePower × doctrineBonus(Raider) × leaderCompetence
defenceStrength = escortLevel × escortPower + parkedFleetStrength + garrisonTerm + convoyBonus
p(success)      = logistic(attackStrength − defenceStrength) × ambushBonus(chokepoint, hiddenLane)
```

- `ambushBonus` applies when the raid launches from a `hidden_lane` or at a chokepoint — this is why geography matters more than fleet count.
- On success: loot is computed from the flow (see §4), moved to the nearest base with storage, and the route's `piracyRisk` ratchets.
- On failure: the raiding fleet takes damage, `heat` rises anyway (an attempted raid is still evidence), and the defender may pursue.
- All rolls come from a seeded `RNG` keyed on `(tick, organizationId, routeId)`, replacing today's `Math.random()`.

---

## 4. Trade-route warfare

This is where piracy stops being a nuisance. Pirates do not attack planets; they attack the **connections between** planets, and the existing economy propagates the damage on its own:

```
raid lands → route volume falls → importer's stockpile falls → production falls
          → market price rises → consumer unrest rises → stability falls
          → escorts pulled from elsewhere → POI rises elsewhere
```

Every arrow is an existing system:

| Step | Existing mechanism |
|---|---|
| Volume lost | `tickPiracyInterdiction` result → `settleTradeFlows` in `lib/trade-system/trade-network-service.ts` |
| Stockpile fall | planet stock keys in the economy tick |
| Production fall | input-constrained production in `lib/economy/` |
| Price rise | `Market.currentPrice` from supply/demand in `lib/trade-system/markets.ts` |
| Unrest | `step7_socialState`, planetary stability |
| Cohesion | `tickCohesion` — sustained shortage is a cohesion driver |
| Escort reallocation | player/AI decision, or `ECON_ASSIGN_ESCORTS` |

**The design requirement is that a pirate organization can measurably hurt an empire that it never attacks directly.** A confederacy sitting on the one lane that carries an empire's `RARES` is doing more damage than a border war, and the empire's own metrics (`tradeDependencyIndex`, `chokepointDependencyScore`, `reserveStressIndex`) already exist to tell it so.

### 4.1 Interdiction intensity

Rather than a fixed 5–40% siphon, the fraction taken is a *choice* with consequences:

| Posture | Siphon | Effect |
|---|---|---|
| Skim | 5–10% | victim may not react; route stays profitable; near-invisible to the owner's dashboards |
| Prey | 15–30% | visible; escorts get assigned; heat climbs |
| Strangle | 40–70% | route becomes unprofitable and may be abandoned — the pirates kill their own income |

The skim is the sophisticated play and the game should reward understanding it: a Stage IV confederacy that never takes more than 8% from any single lane can operate for years inside a great power's economy without ever provoking a response large enough to threaten it. Sponsored operations override the posture, which is exactly why sponsors get organizations killed (§7).

---

## 5. Protection rackets

At Stage III an organization can work out that **destroying commerce is less profitable than taxing it**.

```ts
export interface ProtectionContract {
  id: string;
  organizationId: string;
  /** Who pays: a faction, a charter company, or a specific route's owner. */
  payerId: string;
  payerKind: 'faction' | 'company' | 'route';
  scope: { routeIds?: string[]; systemIds?: string[]; corridorId?: string };
  feePerTick: number;
  /** Set when the pirate has also promised to keep OTHER pirates off. */
  exclusiveDefence: boolean;
  signedAtTick: number;
  expiresAtTick: number;
  secret: boolean;
}
```

**The merchant's decision** is a straight comparison the AI and the player both make:

```
protectionFee   vs   escortCost + expectedLoss(piracyRisk) + insuranceInflation
```

Where `escortCost` is the real cost of `ECON_ASSIGN_ESCORTS` at the level needed, and `insuranceInflation` reuses `ShadowEconomyNode.insuranceCostInflation`. When the pirate fee is cheaper — and a competent organization prices it just below — **merchants cooperate with the pirates**, and the empire discovers its own corporations are funding the organization it is fighting.

**Consequences of signing:**
- Raids on covered routes stop (a raid on a covered route is a contract breach: `crewLoyalty −10`, `standing` collapse, and every other client re-prices).
- With `exclusiveDefence`, the organization actually *fights rival pirates* on that route — pirate fleets defending trade against pirate fleets, which is the moment the entity stops being an enemy and starts being infrastructure.
- The payer's own government may treat the payment as collaboration: it is discoverable by espionage, and the press system will run it.
- Protection revenue shifts internal pressure toward the merchant wing ([organizations.md §4.1](organizations.md)) — a racket changes what the organization *becomes*.

**Tribute** (Stage IV+) is the same mechanic at system scale: a system pays per tick to not be raided at all, which the owner books as an expense and the pirate books as taxation. Stage V converts tribute into a formal revenue line.

---

## 6. Pirate-controlled trade

A mature organization controls a route without owning any of it. `networkControl` on a corridor (0–100) is derived from protection coverage, base presence, hidden lanes and fleet presence, and at high values the organization gets to decide:

| Control ≥ | Power |
|---|---|
| 25 | sets `piracyRisk` on the route at will — it can *guarantee safety* or withdraw it |
| 40 | gates access: can deny passage to a specific faction's cargo (an embargo it did not vote for) |
| 55 | sets a toll — a `PolicyRule.TAX`-equivalent applied to flows, paid to the organization |
| 70 | controls what *moves*: can force a resource substitution or block a category outright |
| 85 | controls information: transit data is the organization's to sell ([shadow-economy.md §3](shadow-economy.md)) |

The map therefore shows two different truths at once:

- **Empire A** — owns the system (`sys.ownerFactionId`).
- **The Confederacy** — controls the commerce (`corridor.pirateControl`).

The UI should render both, because the gap between them is the single most important strategic fact in a region and the thing a conventional strategy game never shows.

---

## 7. Operation intensities

A sponsor does not micromanage raids; it buys an *intensity* ([sponsorship.md](sponsorship.md) covers the funding side). Three settings, each with a detection profile:

| Intensity | What the organization does | Effect on victim | Exposure per tick |
|---|---|---|---|
| **Harassment** | frequent small raids, skim posture, spread across many routes | costs rise, fleets get pulled to escort duty, fear spreads | low |
| **Economic disruption** | concentrated economic raids on 1–2 dependency resources | shortages, price spikes, production loss, unrest | moderate |
| **Blockade** | sustained strangle posture on a critical corridor; convoy attacks | a corridor severed, planets isolated, cascading collapse | high |

Escalation is not free for the *pirates* either: blockade-grade operations raise `heat` fastest, pull the entire raider wing's pressure up, and make the organization dependent on sponsor money — which the sponsor can withdraw. An organization that has been run at blockade intensity for a season and is then abandoned usually fractures.

`instigate_pirate_surge` — the Pirate King rank in `pathway-logic.ts` — is the extreme case: a faction with `infamy ≥ 95` can trigger simultaneous blockade-intensity operations across every organization it has a `standing ≥ 60` relationship with. Galaxy-scale economic warfare, and it exposes every one of those relationships at once.

---

## 8. What the pirate player does

If a player *is* an organization (see [metrics.md §7](metrics.md)), their turn loop is:

1. **Read the board** — POI heat map, route values, escort levels, which empires are at war, which are sanctioned.
2. **Assign fleets** — raid targets, or defend a protection client, or escort a smuggling run.
3. **Set posture** — skim / prey / strangle, per route, per client relationship.
4. **Spend loot** — ships, bases, crew, liquidity, intel, or bribes to keep a governor looking away.
5. **Work the network** — sign protection, sell intel, negotiate non-aggression, take a sponsor's marque, price a hostage.
6. **Manage the crew** — split the loot (loyalty vs treasury), settle the wings' arguments, decide whether to be a confederacy at all.
7. **Choose an ending** — stay a ghost, become a state, or take an amnesty and hand the whole thing to an empire in exchange for a governorship.

Every one of those is a different resource, and none of them is territory.
