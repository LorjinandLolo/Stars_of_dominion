# Counter-piracy — seven answers, none of them free

There is no anti-pirate button. Every response works, in a different currency, with a different consequence, and the choice between them is the gameplay.

---

## 1. The seven levers at a glance

| Lever | Costs | Kills | Consequence |
|---|---|---|---|
| **Navy** | fleets, permanently | fleets and bases | those fleets are not on a front |
| **Convoys** | credits per route, fleets tied down | nothing — prevents | protects trade, cannot end an organization |
| **Intelligence** | intel points, agent capacity, time | networks | slow; the org relocates if you strike early |
| **Economic** | margin, infrastructure spend | the *reason* | the only permanent fix; invisible to voters |
| **Diplomacy** | credits per tick, legitimacy | the hostility | legitimizes them; other orgs raise their prices |
| **Infiltration** | agents, time, risk of exposure | the org from inside | the best outcome and the slowest |
| **Bounties** | credits | fleets | arms a third party inside your space |
| **Amnesty** | political capital, legitimacy | the organization by absorbing it | you now have ex-pirates in your government |

(Eight rows, seven levers — bounties and amnesty are two ways of outsourcing.)

---

## 2. Navy

Patrol fleets. Direct, reliable, expensive.

- A non-pirate fleet parked in a system applies `suppression`, decaying `lawlessness` and raising the local `exposure` term against raids launched from there.
- Combat resolves through the existing tactical/fleet systems. Pirate fleets retreat below `doctrine.retreatThreshold` toward the nearest base, so a patrol that cannot pursue does not kill anything — it *displaces*.
- Killing fleets does not reduce `networkControl` or `blackMarketLiquidity`. A confederacy with bases and money rebuilds a fleet in a few ticks. Naval pressure alone converts a Stage IV organization into a Stage IV organization with fewer ships.
- **Real cost:** opportunity. Every hull on patrol is a hull absent from a border, and rivals can read patrol dispositions. Sustained anti-piracy operations are a strategic tell.

**The trap:** naval success raises `heat`, and high heat pushes an organization toward the smuggler and merchant wings — it stops raiding and starts *taxing*, which reads as victory on the raid counter and is not one.

---

## 3. Convoys

Escorting valuable traffic. Uses the order that already exists: `ECON_ASSIGN_ESCORTS` (`route.escortLevel`, 0–8).

- Raises `defenceStrength` in raid resolution and lowers the `exposure` factor of every system on the route's path — convoys reduce *emergence*, not just losses.
- Cost is per-route per-tick, and each escort level ties up hulls.
- Pure defence: it never finds a base and never ends an organization. An empire that only convoys pays forever.
- Stage II+ organizations unlock convoy attacks specifically to make high escort levels insufficient rather than impossible, so escalation is a real arms race and not a threshold.

**Best used** on the two or three routes carrying resources with a high `tradeDependencyIndex`, not spread evenly. Spreading escorts thin is the most common wrong answer and the game should let players make it.

---

## 4. Intelligence

Finding the network. Everything here uses the espionage system as it stands.

| Operation | Mechanism | Yields |
|---|---|---|
| `ESP_LAUNCH_OP` (`shadowEconomy` domain, targeted region) | existing op flow | region-level base presence, an `IntelReport` |
| `ESP_INFILTRATE_NETWORK` retargeted at an organization | existing order | exact base locations, contents, and a `compromisedByFactionId` flag |
| Counter-intel investment (`regionalCounterIntel`) | existing field | raises evidence accumulation against *sponsors* (see [sponsorship.md §3](sponsorship.md)) |
| Interrogation | from captured crews (§8) | 1–3 base locations, possibly stale |
| Trade forensics | tracking stolen cargo through markets | finds the market base — the revenue node, not the fleets |

Intelligence is what converts naval force from displacement into destruction, because it produces the base list that a rollup needs ([bases.md §7](bases.md)). It is also the only lever that can identify a *sponsor*, and therefore the only one that turns a piracy problem into a diplomatic weapon.

**Cost:** intel points, agent capacity, and time measured in seasons. Striking on partial information warns the organization and it disperses.

---

## 5. Economic

Remove the conditions that make piracy profitable. The only permanent answer, and the one no dashboard rewards.

| Action | Effect on POI |
|---|---|
| Raise `security` on frontier systems | cuts `exposure` |
| Fix owner cohesion, replace corrupt governors | cuts `instability`, closes `frontier_port` placement |
| Shorten or reroute long lanes | cuts `exposure` (`reachPenalty`) |
| Stop shipping the high-value resource through the corridor | cuts `value` — the strongest single lever |
| Lift sanctions | removes the smuggling premium ([shadow-economy.md §2](shadow-economy.md)) |
| Buy the black market out | raise the legal price until the discount stops mattering; drains `blackMarketLiquidity` |
| Develop the frontier economy | reduces recruitment: crews come from somewhere |

The last one is the deep version. Recruitment scales with regional poverty and unrest, so an empire that develops its frontier is removing the organization's *labour supply*. Slow, expensive, and it works when nothing else does.

---

## 6. Diplomacy, bounties, amnesty

**Diplomacy** — negotiate. Cheapest immediate relief; see [sponsorship.md §5](sponsorship.md). Buying non-aggression from the region's largest organization is often correct and always has a second-order cost: the organization's `networkControl` rises (it now demonstrably controls whether you get raided), and rival organizations read the payment as a price list.

**Bounties** — `PIR_POST_BOUNTY` places credits on an organization, a leader, or a specific base. Any faction, corporation, or *other organization* can claim it.
- Outsources the fleet cost entirely.
- The claimant operates in your space with your consent, sees your dispositions, and may be worse than what it replaces.
- Pirate-on-pirate bounty claiming is legal and common: paying the Crimson Corsairs to hunt the Ashfall Gang is efficient and consolidates the region under one organization you have now funded.
- Bounty on a *leader* is the highest-leverage version, because it triggers the succession crisis in [organizations.md §3](organizations.md).

**Amnesty** — `PIR_OFFER_AMNESTY` offers legitimacy in exchange for surrender. Accepted by wings, not by organizations: the merchant and smuggler wings accept readily, corsairs accept if their sponsor has abandoned them, raiders and traditionalists almost never.
- A partial amnesty **fractures** the organization deliberately — the accepting wings leave and the remainder is smaller, poorer, and angrier.
- Accepting crews become population, ships become your ships, and captains become candidates for your leadership pool (§8).
- Cost is political capital and legitimacy: the government system will make you pay for pardoning the people who burned a convoy, especially if the press ran the story.

---

## 7. The AI's decision

Non-player factions choose with an explicit comparison, and the same numbers should be visible to the player:

```
suppressionCost   = patrolHulls×hullValue + convoyFees + intelSpend
piracyLoss        = Σ route volume lost + price inflation + unrest cost
negotiationCost   = protection/tribute fees + legitimacy cost
```

- `piracyLoss < negotiationCost < suppressionCost` → tolerate and pay. This is why great powers host pirates.
- A faction at war weights suppression *down* (hulls are needed elsewhere) and negotiation *up*, so wars reliably grow pirates — feeding straight back into [emergence.md](emergence.md).
- A faction whose rival is being raided weights everything toward *doing nothing*, and may quietly become a sponsor.

---

## 8. Captured crews and captains

Defeated pirates do not evaporate. Disposal mirrors the existing `POW_DISPOSE` order, and each choice is a different resource.

| Choice | Gain | Cost |
|---|---|---|
| **Execute** | deterrence: regional `lawlessness` decay bonus for a season | the organization's `standing` toward you collapses; future hostages are killed |
| **Imprison** | leverage — a bargaining chip in a hostage deal | upkeep; a rescue raid is a valid pirate operation |
| **Recruit** | crews become population or ship crews; ships become fleets | unrest if the local population remembers them |
| **Amnesty** | as §6; the wing that accepts leaves the organization | political capital, legitimacy |
| **Conscript** | forced military service — cheap manpower | morale penalty; desertion risk that seeds new gangs |
| **Turn informant** | permanent intel feed on that organization: base locations as they change | discovery collapses the feed and gets the informant killed |

**A captain's arc** is the point. A `PirateLeader` with high `competence` who is captured, turned, and rewarded can end as:

```
Pirate → Prisoner → Informant → Admiral
```

or, via a wing-level amnesty:

```
Pirate → Amnesty → Governor
```

Both routes place a real character with a real history into the leadership system (`lib/leadership/`), carrying a permanent trait that other factions can read and that a domestic opposition can campaign against. Defeating pirates is therefore not the end of their content — it is a source of it.
