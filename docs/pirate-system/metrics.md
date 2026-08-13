# Metrics — how pirate power is measured, and what winning looks like

Conventional factions are measured in territory, population and production. None of those describe a pirate power. This file defines the five metrics that do, plus the six endgame objectives they support.

---

## 1. Infamy

**How famous and feared the organization is.** 0–100, stored on `PirateOrganization.infamy`.

```
infamy += raidWeight(type) × targetProminence × publicity
infamy -= decayPerTick        // the galaxy forgets
```

| Input | Effect |
|---|---|
| Raid type | destruction ≫ hostage > capture > economic raid > robbery > sabotage |
| Target prominence | a great power's flagship convoy is worth ten frontier freighters |
| Publicity | a raid the press system reports (`pushWorldStory`) counts double; a quiet skim barely registers |
| Leader reputation | `PirateLeader.reputation` contributes directly |
| Victories over navies | beating a real fleet is the largest single jump |

**Consumers:**
- **Recruitment** — high infamy draws crews; recruitment rate scales with `infamy × regionalPoverty`.
- **Intimidation** — raises `p(success)` against merchants who surrender rather than run, and lets an organization extract protection fees without demonstrating.
- **Negotiating leverage** — see [sponsorship.md §5](sponsorship.md).
- **Stage gates** — 15 / 35 / 70 at Stages II / III / V.
- **Heat** — directly feeds heat growth (§2). Fame is the tax on fame.

**The tension is the design.** Infamy is required for every good thing an organization wants and it is the primary driver of the thing that kills it. A quiet, rich, low-infamy smuggling syndicate is safe and cannot become a state; a famous confederacy has leverage and a bounty on every captain.

### 1.1 Faction infamy is a different number

`lib/mechanics/pathway-logic.ts` gates its `shadow` pathway on an `infamy` metric belonging to a normal **faction** — how deep into the underworld an empire has gone. Keep both:

| | `PirateOrganization.infamy` | `Faction.infamy` |
|---|---|---|
| Measures | how feared the organization is | how compromised the empire is |
| Raised by | raids, victories, publicity | black-market purchases, sponsorships (even unexposed), smuggling, bounty-hunting deals, tolerated havens |
| Consumed by | recruitment, stages, leverage, heat | the `shadow` pathway ranks, and the diplomatic reaction of high-legitimacy factions |

A faction's infamy is mostly *private* until an exposure event, which is what makes the shadow pathway playable for an ostensibly respectable empire.

---

## 2. Heat

**How aggressively governments are hunting them.** 0–100, per organization, with a per-faction breakdown.

```ts
heat: number;                              // aggregate
heatByFaction: Record<string, number>;     // who specifically wants them dead
```

```
heat += raidsCommitted × victimResponseWeight + infamy×k + exposureEvents
heat -= coolingPerTick × (1 + concealmentTerm) × (1 − activityTerm)
```

**Raised by:** landing raids (weighted by victim power), destruction-type raids, killing named characters, high infamy, a public exposure, and *being the largest organization in a region* — great powers hunt the leader.

**Lowered by:** lying low (no raids for consecutive ticks), high base concealment, bribes (spend treasury to reduce a specific faction's heat via a corrupt governor), and a signed non-aggression agreement (that faction's heat decays fast).

**Consumers:**

| Consumer | Effect |
|---|---|
| Patrol AI | victim factions allocate patrol hulls proportional to `heatByFaction` |
| Bounty spawn | bounty size scales with heat; above 70, third parties post bounties unprompted |
| Espionage | counter-piracy operations targeting the organization scale with heat |
| Base discovery | discovery rolls get a heat bonus — everyone is looking |
| Internal politics | high heat angers smugglers and merchants, pleases nobody |
| Recruitment | very high heat *reduces* recruitment — crews prefer a future |

Heat is the organization's clock. Everything profitable raises it, and the skill is spending it deliberately: raid hard for a season, then vanish into the protection business while it cools.

---

## 3. Network control

**How much of the criminal economy they control.** 0–100, plus a per-corridor breakdown that competes with the nominal owner.

```
networkControl = f( protectionCoverage, tributeSystems, baseSpread,
                    hiddenLanes, blackMarketShare, rivalSuppression )
```

| Input | Meaning |
|---|---|
| Protection coverage | share of regional route volume under contract |
| Tribute systems | systems paying to be left alone |
| Base spread | number of distinct systems with bases — reach, not count |
| Hidden lanes | routes only they can use |
| Black-market share | share of regional grey trade clearing through their markets |
| Rival suppression | share of regional pirate activity they own rather than compete with |

**This is the metric that makes a pirate a power.** It is what gives the Stage V gates their meaning, what determines the toll and access rights in [operations.md §6](operations.md), and what a great power inherits if it legitimizes the organization instead of destroying it.

**It is also the metric that survives military defeat.** An organization can lose every fleet and keep its contracts, markets and lanes — and rebuild in a season. Counter-piracy that only counts destroyed hulls never touches this number, which is the intended lesson.

---

## 4. Black-market liquidity

**How much underground commerce they can facilitate**, in credits of throughput per tick. Covered in [shadow-economy.md §5](shadow-economy.md); summarized here as a metric:

- Grown by `underground_market` and `smuggler_port` bases, corporate clients, and regional demand (sanctions raise it sharply).
- Reduced by base loss, price competition from a rival organization, and legal-market interventions that erase the discount.
- Converts loot to credits, pays crews, buys bribes and intel, and funds bases.
- **The survival stat.** An organization with liquidity and no fleets is dormant, not dead.

---

## 5. Crew loyalty

**How likely the organization is to remain united.** 0–100.

```
crewLoyalty += lootSharePerCrew + recentVictories + leaderCharisma
crewLoyalty -= unpaidTicks + defeats + overExtension + sponsorInterference
             + internalDissatisfaction
```

| Input | Notes |
|---|---|
| Loot share | the organization chooses a split each tick: crew share vs treasury. High crew share buys loyalty and starves expansion |
| Over-extension | fleets beyond `Σ base.berths` drain loyalty rather than being forbidden |
| Sponsor interference | crews resent being somebody's asset — see [sponsorship.md §1](sponsorship.md) |
| Leader | `competence` raises it; `ruthlessness` holds it up short-term and depresses its ceiling |
| Internal dissatisfaction | the pressure-weighted mean of `PirateInternalFaction.satisfaction` |

**Consumers:** the fracture check ([organizations.md §6](organizations.md)), succession stability, `pirateSloppiness` in the sponsorship evidence formula, and desertion — below 20, fleets leave and become new Stage I organizations with the `mutiny` origin.

Loyalty is the pirate equivalent of legitimacy, and it is bought with the same loot that buys expansion. That trade-off is the whole internal game.

---

## 6. Why these five

They are chosen so that the pirate power is **not** a re-skinned empire:

| Empire asks | Pirate asks |
|---|---|
| How much do I own? | How much depends on me? (`networkControl`) |
| How strong is my army? | How feared am I? (`infamy`) |
| How stable is my population? | Will my own crews stay? (`crewLoyalty`) |
| How large is my economy? | How much can I move that nobody can see? (`liquidity`) |
| Who are my enemies? | Who is actively hunting me right now? (`heat`) |

A pirate faction's UI should show these five and *not* show a territory count, because the territory count is a lie about what the entity is.

**Worked example — the Crimson Corsair Confederacy:**

```
Systems controlled:      2
Hidden bases:           17
Protection coverage:    40% of the Vell Reach corridor
Corporate clients:       3
Secret sponsors:         2  (neither aware of the other)
Fleets:                 11
Infamy:                 74     Heat: 41
Network control:        68     Liquidity: 18,400/tick
Crew loyalty:           58     Doctrine: merchant (raiders at 27% and rising)
```

On the political map: negligible. On the economic map: the largest single actor in the region. And the internal line is the one that matters — a merchant-run confederacy with a growing raider minority is one bad season from [organizations.md §6](organizations.md).

---

## 7. Endgame objectives

A pirate power does not win by conquest. Six objectives, each measured on a metric above, any of which can be a victory condition in `lib/victory/`:

| Objective | Condition | Character |
|---|---|---|
| **Wealth** | cumulative loot + fees exceed a threshold scaled to galactic GDP | the successful criminal — retire rich |
| **Infamy** | highest `infamy` in the galaxy, sustained for a full season | the legend — everyone knows the name |
| **Shadow empire** | `networkControl ≥ 80` across two or more regions while controlling ≤ 3 systems | the defining pirate victory: control without ownership |
| **Legitimization** | complete [organizations.md §8](organizations.md) and survive one season as a recognized state | yesterday's pirates are tomorrow's government |
| **Criminal empire** | ≥ 60% of galactic black-market liquidity | own the underground economy outright |
| **Privateer dominion** | active marques from ≥ 3 great powers simultaneously, none exposed | become indispensable to everyone; the only power nobody can afford to destroy |

Note what is absent: there is no "conquer the galaxy" pirate victory. If an organization wants that, it must first legitimize — at which point it is playing the other game, with the other victory conditions, and with the traditionalist wing that walked out now raiding *its* trade routes.
