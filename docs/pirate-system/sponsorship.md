# Sponsorship — proxy war, privateering, exposure, and pirate diplomacy

Instead of declaring war, finance somebody else's. This is the strongest single mechanic in the pirate system, because it converts an NPC-shaped entity into an instrument of statecraft and puts the whole thing on the espionage system's existing suspicion ladder.

---

## 1. The relationship

```ts
export interface Sponsorship {
  id: string;
  organizationId: string;
  sponsorFactionId: string;
  /** Set when a specific victim is named. Null = general retainer. */
  targetFactionId: string | null;
  intensity: 'harassment' | 'economicDisruption' | 'blockade';
  /** Credits per tick. Also accepts materiel: AMMO, ships, intel. */
  fundingPerTick: number;
  supplies: { ammo?: number; hulls?: number; intelReports?: number };
  /** Open sponsorship = a letter of marque (§4). Secret = deniable (§3). */
  covert: boolean;
  startedAtTick: number;
  /** 0–1 accumulated evidence against the sponsor. Drives the ladder in §3. */
  evidence: number;
  attributionState: AttributionState;   // reuses espionage-types.ts
}
```

**What the sponsor gets:** economic damage to a rival without a war declaration, rival fleets pinned on escort duty, a shortage timed to a negotiation, and plausible deniability. Cheap naval warfare with somebody else's crews.

**What the organization gets:** funding, supplies, protection (the sponsor's space becomes a place it can be), and intelligence — a sponsored organization gets the sponsor's fleet-movement data on the target, which is worth more than the money.

**What the organization pays:** its independence. Sponsorship raises corsair-wing pressure, lowers `crewLoyalty` (crews know who is paying), and hands the sponsor influence over succession. A long-sponsored organization is functionally a proxy fleet, and its traditionalist wing is building a case.

---

## 2. Orders

| Order | Effect |
|---|---|
| `PIR_SPONSOR_ORG` | open or amend a sponsorship: funding, supplies, covert flag |
| `PIR_SET_OPERATION` | set `intensity` and `targetFactionId` |
| `PIR_CUT_SPONSORSHIP` | end it; the organization keeps what it has and remembers |
| `PIR_ISSUE_MARQUE` | convert to an open privateering commission (§4) |
| `PIR_SEED_ORGANIZATION` | create a new organization outright, in a chosen region — expensive, slow, and it starts loyal |

The sponsor **cannot** order individual raids. It buys intensity and a target; the organization chooses how, according to its own doctrine. A raider-wing confederacy paid for "harassment" will overreach, and the sponsor owns the consequences of that too.

---

## 3. Exposure

The heart of the mechanic. Sponsorship is safe until it is not, and the transition is gradual and investigable.

```
Suspicion → Evidence → Attribution → Public Exposure
```

Implemented on the existing `AttributionState` union (`'invisible' | 'suspected' | 'exposed'`), with `evidence` (0–1) as the continuous driver and public exposure as the terminal event.

### 3.1 Evidence accumulation

```
evidence += (intensityWeight × opsThisTick × (1 − sponsorTradecraft))
          × (1 + victimCounterIntel) × (1 + pirateSloppiness)
evidence -= decayPerTick        // cold trails go cold
```

| Input | Source |
|---|---|
| `intensityWeight` | harassment 0.2, economicDisruption 0.5, blockade 1.0 |
| `sponsorTradecraft` | sponsor's `counterIntelStrength` and `internalSecurity` (`FactionIntelState`) |
| `victimCounterIntel` | victim's `regionalCounterIntel` in the affected region, plus active investigations |
| `pirateSloppiness` | inverse of org `crewLoyalty` and base `concealment` — an unhappy, exposed organization leaks |

**Leak events** add step changes rather than drift: a captured pirate captain interrogated (`counter-piracy.md §8`), a compromised base (`bases.md §6`), a fractured organization whose losing wing talks, a traced black-market payment, or a sponsor's own domestic press investigation (`PRESS_*` orders already exist for both sides of that).

### 3.2 The ladder

| Stage | `evidence` | Victim sees | Sponsor may |
|---|---|---|---|
| **Invisible** | < 0.25 | pirate attacks, no pattern | continue freely |
| **Suspected** | 0.25–0.55 | a probability indicator naming candidate sponsors, possibly the wrong one | deny; raise tradecraft; cut funding to let it cool |
| **Attributed** | 0.55–0.85 | private certainty — an `IntelReport` with high `confidence` | negotiate quietly; buy silence; pre-empt with a counter-story |
| **Exposed** | ≥ 0.85 | public proof | damage control only |

Note that `suspected` can name the **wrong** faction. The `IntelReport.accurate` flag already models this, and a third party can deliberately manufacture suspicion against a rival — plant evidence, sponsor an organization *through* a cutout, or sell the victim a convincing lie. Framing is a first-class play.

### 3.3 Consequences of public exposure

All of these run through systems that already exist:

| Consequence | System |
|---|---|
| Diplomatic relations deteriorate | `lib/diplomacy/pressure-service.ts` — rivalry/tension jump |
| Credibility loss | reputation system; future treaties priced worse |
| Third-party condemnation | AI diplomatic reaction (`runDiplomaticAI`), coalition formation |
| Victim gains leverage | a `casus belli`, or a `DIP_DEMAND_TRIBUTE` the sponsor must weigh |
| Justified retaliation | war declaration without the usual reputation cost for the victim |
| Alliances weaken | allied AI `standing` drops; treaty partners may invoke exit clauses |
| Domestic political cost | press trust falls, bloc satisfaction moves, `tickParliament` may table a motion; a fragile government can fall |

The last row is the one that makes the mechanic matter: an exposed sponsorship is not merely a diplomatic penalty, it is a *domestic* crisis in a government system that already models parliaments, coups and cohesion.

### 3.4 The organization's view

An exposed organization has its own problem. Its corsair wing is humiliated, its traditionalist wing is vindicated (`pressure` shifts sharply), every faction now knows whose creature it is, and its protection clients re-price. Exposure frequently triggers the fracture check in [organizations.md §6](organizations.md). **Both sides of a sponsorship are damaged by exposure**, which is why an intelligent sponsor cuts funding at `suspected` and lets the asset cool — and why an organization that has been dropped twice stops taking sponsors.

---

## 4. Privateering

The legal daylight version. A **letter of marque** is an open commission: the sponsor publicly authorizes the organization to attack a named enemy.

```
Pirate → Privateer → Proxy Fleet
```

| | Covert sponsorship | Letter of marque |
|---|---|---|
| Deniability | yes, until exposed | none — that is the point |
| Requires | nothing | a declared war, or an accepted casus belli |
| Organization gains | money, supplies, intel | money, supplies, intel, **legal port access** and repair in sponsor space |
| Sponsor gains | plausible deniability | cheap naval warfare, no exposure risk |
| Third-party view | nothing, or suspicion | a normal (if disreputable) act of war |
| Effect on the org | corsair wing up, loyalty down | corsair wing up sharply; a step toward legitimization |

Marques matter structurally because they are the **road to legitimacy**: an organization that has fought a real war under a real flag has a claim to recognition afterward, and `PIR_ISSUE_MARQUE` is therefore how an empire deliberately manufactures a client state out of a criminal one. It is also how an empire loses control of one — a privateer with port rights and a war record is a Stage IV confederacy with a legal address.

**Breaking a marque** (peace signed, sponsor withdraws) leaves an armed, organized, well-supplied fleet with no income and a habit of raiding. Historically this is exactly how the worst pirate outbreaks started, and the engine should reproduce it: an organization whose marque is revoked gets a large raider-wing pressure spike and keeps its port knowledge.

---

## 5. Pirate diplomacy

Organizations are counterparties, not monsters. Any faction can open negotiations with any organization it has contact with (contact requires: shared border, a prior raid, an intel report, or a broker).

| Agreement | Organization gives | Faction gives | Notes |
|---|---|---|---|
| **Non-aggression** | stops raiding this faction | credits per tick, or a safe port | cheapest option; does not bind other organizations |
| **Protection** | active defence of named routes | fee | see [operations.md §5](operations.md) |
| **Trade** | black-market access, discounted goods | legal cover, or supplies | makes the faction a shadow-economy participant |
| **Secret contract** | one specific act (a hostage, a sabotage, a single ship) | one-off payment | deniable; small evidence contribution |
| **Privateering** | war service | marque, ports, supplies | §4 |
| **Intel exchange** | reports | reports, or counter-intel blind spots | mutual; both sides may lie |
| **Hostage deal** | a person back | ransom, or a captured captain | [operations.md §2.1](operations.md) |
| **Tribute** | leaves a system alone entirely | per-tick payment | Stage IV+; the system is functionally taxed by two governments |
| **Recognition** | acknowledges the faction's authority | acknowledges the organization as a state | Stage V only; the gateway to [organizations.md §8](organizations.md) |

**Negotiation strength** is `infamy` (they fear you) plus `networkControl` (they need you) minus `heat` (you are about to be somebody's trophy). A high-infamy, high-heat organization negotiates from a *weak* position, because everyone can see the fleet coming — which gives counter-piracy a diplomatic use for military pressure.

**An empire may rationally tolerate pirates.** If `annualRaidLoss < suppressionCost`, negotiating is correct, and the AI evaluates exactly that. The cost of the correct answer is legitimization: every treaty signed makes the organization more of a state and less of a problem that can be solved by force later.

---

## 6. Sponsor interference in internal politics

At `standing ≥ 60` a sponsor unlocks the deepest and most dangerous play: influencing what the organization *is*.

| Action | Effect | Risk |
|---|---|---|
| Back a successor | the sponsor's preferred candidate wins a contested succession | discovery converts the org's traditionalist wing into a permanent enemy |
| Fund a wing | pushes internal `pressure` toward corsair or merchant | slow, quiet, expensive |
| Broker a merger | two client organizations combine under a leader you chose | creates something big enough to stop obeying you |
| Force legitimization | push a Stage V org to accept recognition and become a client state | it is now a faction with its own foreign policy |
| Trigger a fracture | fund a minority wing until it splits | you now have two organizations and one of them blames you |

This is where the mechanic pays off completely: a great power that has spent a decade cultivating a confederacy ends up with an ally it invented, a rival it created, or a war it started with somebody else's ships — and if the evidence lands, a parliament at home that wants to know why.
