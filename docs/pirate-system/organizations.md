# Organizations — the pirate entity, its stages, and its ends

The unit of the pirate system is the organization, not the raider. This file defines the entity, the five-stage progression, the internal factions that pull it apart, and the three ways it ends: collapse, fracture, or legitimacy.

---

## 1. The entity

```ts
export type PirateStage = 1 | 2 | 3 | 4 | 5;

export type PirateDoctrine =
  | 'raider'          // expansion through violence
  | 'smuggler'        // stable illegal trade
  | 'corsair'         // government contracts
  | 'merchant'        // legitimate commerce
  | 'traditionalist'; // independence above all

export type PirateOrigin =
  | 'frontier_desperation' | 'war_refugee' | 'mutiny'
  | 'secession_remnant' | 'smuggler_syndicate' | 'sponsored' | 'corporate_deniable';

export interface PirateOrganization {
  id: string;                       // 'porg-crimson-corsairs'
  name: string;
  stage: PirateStage;
  origin: PirateOrigin;
  /** Sim clock in unix seconds, per the ForwardBase.establishedAtSeconds convention. */
  foundedAtSeconds: number;

  /** Where the organization considers its own water. Drives AI targeting. */
  homeSystemId: string;
  baseIds: string[];                // → PirateBase, see bases.md
  fleetIds: string[];               // → Fleet under factionId 'faction-pirates'

  // ─ Power metrics (metrics.md) ─
  infamy: number;                   // 0–100
  heat: number;                     // 0–100
  networkControl: number;           // 0–100
  blackMarketLiquidity: number;     // credits of underground throughput per tick
  crewLoyalty: number;              // 0–100
  treasury: number;                 // credits

  // ─ Internal politics (§4) ─
  factions: PirateInternalFaction[];
  doctrine: PirateDoctrine;         // = dominant internal faction
  leader: PirateLeader | null;

  // ─ External relations ─
  relations: Record<string, PirateRelation>;  // factionId → standing + contracts
  sponsorships: Sponsorship[];                // sponsorship.md
  protectionContracts: ProtectionContract[];  // operations.md §5

  // ─ Running counters: metrics, and the tech web's History Ledger ─
  raidsLanded: number;
  lootTaken: number;
  fleetsLost: number;
  /** Sim clock of the last landed raid. Decides how fast heat cools. */
  lastRaidAtSeconds: number;
  /** Consecutive ticks below the current stage's gate. 3 = demotion. */
  stageStress: number;

  /** Set when the organization has become a recognized state (§8). */
  legitimizedAsFactionId?: string;
  /** Set when dissolved; kept for one season so intel reports can still name it. */
  dissolvedAtSeconds?: number;
}
```

`sponsorships` and `protectionContracts` arrive with Phases 7 and 5; everything else is live as of Phase 1 in `lib/piracy/piracy-types.ts`.

`PiracyWorldState` holds `organizations: Map<string, PirateOrganization>` — see [systems.md §1](systems.md). Every `faction-pirates` fleet carries an `organizationId`; unowned raiders are not permitted after the migration.

---

## 2. The five stages

Each stage changes the *verb*, not the numbers. Advancement is checked once per tick and is not automatic — the organization must also want it (§4.3), and Stage IV and V require an internal vote that the raider wing can lose or block.

### Stage I — Pirate Gang

**Requires:** existence.
**Has:** 1–3 fleets, one hideout, no permanent presence.
**Can:** raid isolated targets (freighters, mining vessels, supply ships, undefended colonies), ambush, hide, sell loot at a heavy discount through someone else's market.
**Cannot:** hold a system, coordinate two fleets, negotiate, or survive an organized military response — a single real fleet ends a gang.
**Economics:** loot goes straight into ships and crew. No liquidity, no contracts.

### Stage II — Pirate Fleet

**Requires:** `fleets ≥ 3`, `infamy ≥ 15`, a leader.
**Unlocks:** coordinated multi-fleet raids, convoy attacks (previously suicidal against `escortLevel ≥ 2`), fleet ambushes at chokepoints, mobile bases (a fleet that functions as a repair node), larger target classes.
**Economics:** the treasury becomes real; the organization can buy rather than only take.
**Political weight:** none. Empires still treat it as a policing problem.

### Stage III — Corsair Network

**Requires:** `bases ≥ 3`, `infamy ≥ 35`, at least one non-hostile `relations` entry (a merchant, a corporation, a government official).
**Unlocks:** **protection rackets** — the shift from destroying commerce to taxing it ([operations.md §5](operations.md)); black-market participation as a seller of record; smuggling routes; an intelligence network it can *sell from* ([shadow-economy.md §3](shadow-economy.md)); secret contracts with real factions.
**This is the hinge of the whole system.** Below Stage III pirates are a cost. At Stage III they become an *institution other actors use*, and killing them starts to have a price that is not only military.

### Stage IV — Pirate Confederacy

**Requires:** `fleets ≥ 8`, `bases ≥ 6`, `networkControl ≥ 40`, `crewLoyalty ≥ 50`, and a successful internal vote.
**Unlocks:** shared bases between formerly separate organizations (absorption/merger, §6), large-scale trade disruption (blockade-grade operations against a whole corridor), political negotiation as a recognized counterparty, privateering contracts it can *accept* from multiple sponsors at once, organized tribute from systems rather than from individual routes, and territorial influence — `Corridor` and `SystemNode` gain a `pirateInfluence` term that competes with the owner's control without transferring ownership.
**Economics:** protection revenue exceeds raid revenue. The confederacy now loses money when a war disrupts trade, which makes it, for the first time, a *stakeholder in stability*.

### Stage V — Pirate State

**Requires:** `stage 4`, `networkControl ≥ 65`, `infamy ≥ 70`, at least two systems where `pirateInfluence` exceeds the nominal owner's control, and formal recognition by at least one real faction (a treaty via [sponsorship.md §5](sponsorship.md)).
**Unlocks:** control of ports (setting `PolicyRule` on chokepoints it holds — `ALLOW`/`DENY`/`TAX`), tribute collection as a standing revenue line, maintained territory, treaties, employed fleets (it can hire *out* its navy), issuing its own letters of marque to smaller gangs, and formal control of trade routes.
**At Stage V the distinction between pirate, criminal organization and government is deliberately gone.** The entity has an economy, a foreign policy, and internal politics; what it lacks is a claim anyone recognizes as legitimate — and [§8](#8-legitimization) is about buying exactly that.

### Stage table

| Stage | Name | Gate | New verb | Threat class |
|---|---|---|---|---|
| I | Pirate Gang | — | steal | policing |
| II | Pirate Fleet | 3 fleets, infamy 15 | besiege commerce | military |
| III | Corsair Network | 3 bases, infamy 35, 1 contact | **tax** | economic |
| IV | Pirate Confederacy | 8 fleets, 6 bases, control 40 | negotiate, blockade | strategic |
| V | Pirate State | control 65, infamy 70, recognition | govern | political |

**Demotion** is symmetrical and immediate: an organization that falls below the previous stage's gate for three consecutive ticks drops a stage and *loses the unlocked verbs*, which is how a confederacy collapses into gangs (§7). Contracts signed at a higher stage do not survive the demotion — clients notice.

### Reconciling `pathway-logic.ts`

`lib/mechanics/pathway-logic.ts` already declares a four-rank `shadow` pathway gated on `infamy`. It is dead code — `evaluatePathwayProgression` has no callers. Map it onto this system rather than maintaining two ladders:

| Pathway rank | infamyMin | Maps to | Mechanic |
|---|---|---|---|
| Smugglers | 20 | pirate **relations** available to any faction | `black_market_access` → [shadow-economy.md](shadow-economy.md) |
| Privateers | 50 | letters of marque | `covert_raiding` → [sponsorship.md §4](sponsorship.md) |
| Shadow State | 80 | Stage IV sponsor relationship | `shadow_hub` → the existing `openShadowHub` InfraAction |
| Pirate King | 95 | Stage V, or a player faction that *is* one | `instigate_pirate_surge` → [operations.md §7](operations.md) |

Note the axis change: `pathway-logic` measures the **empire's** infamy (how deep into the underworld a normal faction has gone), while `PirateOrganization.infamy` measures the **organization's**. Both are needed and they are different numbers — see [metrics.md §1](metrics.md).

---

## 3. Leadership

```ts
export interface PirateLeader {
  id: string;
  name: string;
  doctrine: PirateDoctrine;     // biases the org's own doctrine toward their wing
  competence: number;           // 0–100 — raid success, negotiation strength
  ruthlessness: number;         // 0–100 — loyalty via fear vs via profit
  reputation: number;           // 0–100 — feeds org infamy
  boundToSponsorId?: string;    // a leader who is somebody's creature
  capturedByFactionId?: string; // alive, in someone's custody — counter-piracy.md §8
}
```

A leader is worth roughly a stage. Losing one (killed in a raid, captured, assassinated by an espionage op, or dead of old age) triggers **succession**, which is the most dangerous moment in an organization's life:

1. Each internal faction nominates a candidate weighted by its own `pressure`.
2. If one faction holds `pressure ≥ 50`, its candidate takes over uncontested; `crewLoyalty −5`.
3. Otherwise the two strongest contest: `crewLoyalty −20`, the organization is locked out of Stage IV/V verbs for the contest window, and if `crewLoyalty` falls below 30 during it, the contest becomes a civil war (§6).

Sponsors can intervene — see [sponsorship.md §6](sponsorship.md). Putting your own man on the throne of a confederacy is the cheapest strategic asset in the game and the easiest to expose.

---

## 4. Internal factions

Every organization above Stage I carries five internal factions, each with a `pressure` share summing to 100:

```ts
export interface PirateInternalFaction {
  doctrine: PirateDoctrine;
  pressure: number;      // 0–100, shares sum to 100
  satisfaction: number;  // 0–100
}
```

| Faction | Wants | Satisfied by | Angered by |
|---|---|---|---|
| **Raiders** | constant violent expansion | successful raids, captured ships, high infamy | quiet ticks, protection contracts, treaties |
| **Smugglers** | stable illegal trade | black-market liquidity, working lanes, low heat | high heat, blockades, open war |
| **Corsairs** | government contracts | active sponsorships, letters of marque, tribute | exposure of a sponsor, sponsor abandonment |
| **Merchants** | legitimate commerce | protection revenue, corporate clients, low heat | raids on their own clients, amnesty refusals |
| **Traditionalists** | independence | autonomy, secrecy, small size | sponsors, mergers, recognition, legitimization |

### 4.1 Pressure drift

Pressure follows outcomes, not intent. Each tick, a faction's pressure moves toward its share of the organization's *actual revenue mix and activity*:

```
targetPressure(raider)        ∝ raidRevenue + capturedShips
targetPressure(smuggler)      ∝ blackMarketLiquidity
targetPressure(corsair)       ∝ sponsorshipIncome + marqueContracts
targetPressure(merchant)      ∝ protectionRevenue + corporateClientCount
targetPressure(traditionalist)∝ concealment (Σ base.concealment) + inverse of externalTies

pressure += (targetPressure − pressure) × driftRate
```

The consequence: **an organization becomes what it earns from.** A confederacy that discovers protection rackets pay better than raiding will, over a season, be run by people who do not want to raid — and the raider wing will notice. This is the engine of §6, and it is deliberately the same shape as `tickBlocDrift` in the empire politics system so both read the same way.

### 4.2 Satisfaction

`satisfaction` moves on events, not averages: a landed raid pleases raiders and worries smugglers; a signed protection contract pleases merchants and insults traditionalists; an exposed sponsor humiliates corsairs and vindicates traditionalists. Low satisfaction in a *high-pressure* faction is what actually breaks an organization — a furious minority is noise, a furious plurality is a civil war.

### 4.3 Doctrine and the stage vote

`org.doctrine` is the highest-pressure faction. Stage IV and V advancement requires a vote weighted by pressure, where each faction votes:

| Faction | Stage IV (confederacy) | Stage V (state) |
|---|---|---|
| Raiders | yes (bigger raids) | no (states have obligations) |
| Smugglers | yes | yes |
| Corsairs | yes | yes |
| Merchants | yes | yes |
| Traditionalists | **no** | **no** |

A traditionalist-dominated organization is permanently capped at Stage III unless its leadership changes — which is exactly the fight §3 and §6 are about.

---

## 5. Relations

```ts
export interface PirateRelation {
  factionId: string;
  standing: number;              // −100 (blood feud) … +100 (patron)
  agreements: PirateAgreementKind[];
  tributePerTick?: number;
  lastContactTick: number;
  /** Hidden from other factions until intel or exposure reveals it. */
  secret: boolean;
}

export type PirateAgreementKind =
  | 'nonAggression' | 'protection' | 'trade' | 'secretContract'
  | 'privateering' | 'intelExchange' | 'hostageDeal' | 'tribute';
```

Pirates are not permanently hostile to everyone; hostility is a *relation*, and relations are purchasable. Full negotiation rules are in [sponsorship.md §5](sponsorship.md). The important structural fact: an empire that has bought a non-aggression agreement is not safe from *other* organizations, and buying protection from one confederacy makes you a more attractive target for its rival — a protection market has competition in it.

---

## 6. Fracture and civil war

Pirate civil wars fire when internal politics can no longer be contained:

**Trigger** — all of:
- `crewLoyalty < 30`, and
- two internal factions each hold `pressure ≥ 25`, and
- the top faction's `satisfaction < 35` **or** a contested succession is unresolved.

**Resolution** — the organization splits into 2–3 successor organizations, one per contesting faction:
- Fleets divide by the pressure share of the faction each fleet's crew favours (seeded RNG, deterministic).
- Bases divide by proximity to each successor's strongest fleet; contested bases are *destroyed*, not shared.
- `infamy` is split: each successor takes `parent.infamy × pressureShare`, so a fracture destroys reputation in aggregate.
- `networkControl` collapses to `parent × pressureShare × 0.6` — clients do not follow a broken organization.
- Contracts, sponsorships and protection agreements are **voided**. Every counterparty gets an event and must re-sign with a successor, and sponsors discover their asset is now two assets, one of which hates them.
- Successors inherit `relations` at halved magnitude and start at war with each other.

The successors then compete for the same POI. A fractured region usually produces *more* raiding for a season and less taxation — the merchant wing is gone and the raider wing has something to prove.

**Merger** is the inverse and requires Stage IV: two organizations with compatible doctrines, a shared border, and `standing ≥ 40` toward each other can combine, summing fleets and bases, taking the higher `infamy`, and averaging `crewLoyalty` weighted by size. Mergers are how a region's pirate population consolidates into a single confederacy after a period of gang warfare.

---

## 7. Collapse

Organizations die by attrition, not by a kill switch. Nine pressures, each of which just moves numbers:

| Cause | Mechanism |
|---|---|
| Excessive heat | patrols, bounty hunters and espionage ops all scale with `heat`; sustained high heat outpaces recruitment |
| Military defeat | fleets destroyed faster than the treasury can replace them |
| Loss of trade | targets rerouted or protected; raid revenue falls below upkeep |
| Internal betrayal | an infiltrated network (`ESP_INFILTRATE_NETWORK`) leaks base locations |
| Leadership disputes | unresolved succession draining `crewLoyalty` |
| Economic collapse | treasury below zero; fleets go unpaid, `crewLoyalty` falls 5/tick |
| Loss of bases | `maxFleets` falls below current fleet count; no repair; strength decays |
| Government infiltration | counter-piracy operations converting crews (see [counter-piracy.md §8](counter-piracy.md)) |
| Rival organizations | another org taking the same protection contracts and the same routes |

**Demotion cascade.** Falling below a stage gate revokes that stage's verbs, which removes the revenue that stage supported, which drops it below the next gate:

```
Confederacy → Fleets → Gangs → dissolved
```

A dissolved organization leaves behind elevated `lawlessness`, abandoned bases (discoverable, lootable, or re-occupiable), and unemployed crews that raise the region's POI. **The galaxy is meant to cycle.** Killing the Crimson Corsairs does not fix the corridor that grew them.

---

## 8. Legitimization

The other ending. A sufficiently successful organization can stop being a criminal problem and become a state — which is not a reward, it is a *transformation with a bill attached*.

**Requires:** Stage V, `networkControl ≥ 65`, recognition treaties from at least two real factions, `merchant + corsair + smuggler` combined pressure `≥ 60`, and either (a) an amnesty accepted from a major power, or (b) sustained territorial control over two or more systems for a full season.

**On legitimization:**
- A real `Faction` is created (`legitimizedAsFactionId`), with reserves seeded from the treasury, systems transferred where `pirateInfluence` exceeded the nominal owner, and an `ideologyId` derived from the dominant doctrine.
- The government scaffolding comes up: an `EmpirePosture` (usually `Mercantile`), blocs seeded from the internal factions (raiders become a military bloc, merchants a trade bloc, smugglers a frontier bloc), and a legitimacy score that starts *low* — everyone remembers.
- Former captains become leaders in the normal leadership system: governors, admirals, ministers. A `PirateLeader` with high `competence` and high `ruthlessness` becomes an admiral; high competence and low ruthlessness becomes a governor.
- **The traditionalist wing secedes.** Its pressure share leaves as a new Stage I–II organization with the origin `secession_remnant`, taking a proportional slice of fleets and the most concealed bases, and it considers the new state a traitor. Yesterday's pirates become tomorrow's government, and yesterday's pirates' friends become tomorrow's pirates.
- All protection contracts convert to **tariffs** and all tribute to **taxation** — the same credits, now legal, now visible, now taxable by treaty and blockadeable by war. Legitimacy costs the organization its deniability and its immunity to conventional strategy, which is the trade the whole ending is about.

**Recognition without legitimization** is the cheaper middle path: a real faction signs a treaty with a Stage V organization, which keeps its criminal structure and gains a legal counterparty. That is how a great power ends up defending a pirate state's ports in a war — and how it explains that to its own parliament is the government system's problem.
