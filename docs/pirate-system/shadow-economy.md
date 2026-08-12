# The shadow economy — black markets, smuggling, information, and respectable clients

Piracy only becomes an economy when the loot has somewhere to go. This file covers the four channels that turn stolen cargo into power: black markets, smuggling, the intelligence marketplace, and the corporations that quietly make all three work.

The engine already has the anchor: `ShadowEconomyNode` (`lib/espionage/espionage-types.ts`) with `piracyChancePerHour`, `smugglingCapacity` and `insuranceCostInflation`, plus the `openShadowHub` and `establishSmugglersLane` infra actions in `lib/movement/types.ts`. This design connects those to organizations instead of leaving them as espionage side effects.

---

## 1. Black markets

A black market is a `Market` variant hosted by an `underground_market` or `smuggler_port` base, keyed by region rather than theatre.

```ts
export interface BlackMarket {
  id: string;
  organizationId: string;
  hostBaseId: string;
  regionId: string;
  /** Per-resource stock, fed by raid loot and smuggled goods. */
  stock: Record<string, number>;         // Resource → units
  /** Discount vs the legal market price for the same resource. 0.2–0.6. */
  discount: number;
  /** Credits of throughput per tick this market can clear. */
  liquidity: number;
  /** 0–1: chance per purchase that the buyer is identified. */
  traceability: number;
  knownToFactionIds: string[];
}
```

**Goods traded:** stolen resources, weapons, contraband (goods under an active `embargo`), illegal technology (blueprints — the tech web's diffusion object), intelligence, captured goods, and smuggled materials.

**Why anyone buys:** the discount is real. `illegal resource = cheaper resource`, and for a faction under sanctions it may be the *only* resource. A player buying `RARES` at 40% off during a war is making a correct decision with a hidden bill attached.

**The bill:**

```
discovery → diplomatic consequences → sanctions → espionage consequences
```

Each purchase rolls against `traceability`, modified by the buyer's `counterIntelStrength` and the seller's concealment. A traced purchase creates an `AttributionRecord` against the buyer in exactly the same shape sponsorship uses — see [sponsorship.md §3](sponsorship.md) — and the press system will run it (`pushWorldStory`). Repeated purchases compound: the second is more likely to be traced than the first, because investigators are looking.

**Pricing.** The black-market price is the legal market price minus `discount`, but liquidity is finite: buying more than `liquidity` per tick moves the price up sharply and raises traceability, because a large illegal purchase is a large illegal purchase. This makes the black market a *supplement*, not a replacement, for a real economy — which keeps it from trivializing sanctions.

**Selling into it.** Factions can also sell — dumping embargoed goods for credits, or laundering seized cargo. A faction that captures a pirate hoard and sells it back into the same market is doing something the press system should find interesting.

---

## 2. Smuggling

Smuggling is the movement half of the shadow economy: cargo that cannot legally move, moving.

```
Empire A bans export of X → pirate network moves X through a hidden lane
  → pirate station → black market → foreign buyer
```

**Mechanics:**
- A `SmugglingRun` is a flow along a path that includes at least one `hidden_lane` or `smuggler_port`, evading the normal `PolicyState` checks (`sanctions`, `embargoes`, `chokepointRules`).
- Capacity is `Σ base.smugglingCapacity`, reusing the existing `ShadowEconomyNode.smugglingCapacity` field.
- The organization charges a **freight premium** proportional to the legal barrier — the tighter the embargo, the richer the smuggler. Sanctioning a faction *creates* pirate income, which is the mechanic that makes economic warfare have a downside.
- Interception: a faction can attempt customs enforcement at chokepoints it controls (`PolicyRule` on `chokepointRules`), rolling its `surveillanceStrength` against the run's concealment. Success seizes the cargo and produces an `AttributionRecord` naming the *shipper*, not the pirate.

**Strategic consequence:** sanctions and embargoes stop being binary. An embargo against a faction with a friendly Stage III+ organization leaks; the leak has a price; and the price is paid in credits to an organization that is now invested in the embargo continuing. Sanctions regimes therefore grow their own constituency for their own permanence, which is both historically correct and mechanically nasty.

**Existing hook:** `establishSmugglersLane` and `openShadowHub` are already `InfraActionType` members handled in `lib/movement/movement-service.ts:762`. The migration wires those to create pirate-owned assets rather than anonymous effects — see [systems.md §7](systems.md).

---

## 3. The intelligence marketplace

Pirates live in the information economy. They see merchant routes because they hunt them, fleet movements because they hide from them, and shortages because they cause them.

**What an organization knows** (derived, not stored redundantly):

| Product | Derived from | Buyer |
|---|---|---|
| Merchant routes & schedules | routes transiting its territory | rival pirates, competitors |
| Fleet movements | `safe_house` bases + sensor contacts | any faction at war |
| Weakly defended systems | its own POI table | invaders |
| Economic shortages | black-market price pressure | traders, speculators |
| Political instability | safe-house intel | coup-plotters, sponsors |
| Black-market prices | its own markets | everyone |
| Corporate activity | contract counterparties | rival corporations |

**Selling** produces an `IntelReport` for the buyer with `confidence` set by the organization's network quality — and, crucially, the existing `accurate` hidden flag applies. A pirate organization with low `standing` toward the buyer may sell **deliberately false intelligence**, which is a use of the espionage system's existing lie machinery that no other actor currently exercises.

**Buying from pirates has a specific tell:** the pirate now knows what you wanted to know. An organization that has sold three factions intelligence about the same system knows something none of them do, and can sell *that*.

The intelligence marketplace is the cheapest way for a weak faction to compete with a strong one's `surveillanceStrength`, and the reason a great power might tolerate an organization it could destroy.

---

## 4. Corporations and pirates

This is where the shadow economy becomes respectable. The charter-corporation system (`lib/economy/corporate/`) already has companies with fleets, routes, shareholders and their own AI (`corporate-ai.ts` already reduces `piracyRisk` on its worst route). Corporations relate to organizations in five ways:

| Relationship | What the corporation gets | What it risks |
|---|---|---|
| **Buy smuggled goods** | inputs below market, or inputs at all under embargo | traceability; a shareholder scandal |
| **Hire protection** | delivered cargo, cheaper than escorts | funding an enemy of its own charter government |
| **Finance the organization** | a raiding capability aimed at competitors | full sponsorship exposure ([sponsorship.md](sponsorship.md)) |
| **Break an embargo** | access to a closed market | sanctions applied to the *company*, charter revocation |
| **Buy safe passage / intel** | route security, competitor schedules | a pirate who knows its shipping plan |

**A corporation does not care whether the cargo is technically legal. It cares whether it gets delivered.** The corporate AI should therefore evaluate protection contracts on pure cost, with a `legalRisk` term weighted by how strong its charter government's enforcement actually is — a weak or distracted government makes piracy the *rational* corporate choice, and that is the intended emergent outcome.

**Consequences for the charter government:** a corporation caught funding piracy is a domestic political crisis, not just a fine. It hits the government's press trust, hands the opposition a weapon in parliament, and can force a charter revocation the government may not be able to afford (the company's routes are load-bearing). The triangle Corporations ↔ Pirates ↔ Governments is intended to have no clean corner.

---

## 5. Liquidity as a power metric

`blackMarketLiquidity` measures how much underground commerce an organization can facilitate per tick — and it is the metric that makes a *non-violent* pirate powerful.

- It converts loot to credits without a fence's discount.
- It is what lets an organization *pay* rather than fight: bribes to governors, purchases of intel, wages that hold `crewLoyalty`.
- It is the survival stat under high heat: an organization that has lost its fleets but kept its markets is still an organization, and rebuilds.
- It is what a great power actually wants when it decides to legitimize a confederacy rather than destroy it — a functioning grey market is an asset you inherit.

An organization with `blackMarketLiquidity` high and `infamy` low is a *bank* with a bad reputation, and it is close to invisible to a military-first counter-piracy doctrine. See [counter-piracy.md §5](counter-piracy.md) for the economic answer that actually finds it.
