# Ship design

A design is a hull plus a fit of modules. Recruiting a ship names a design; the
finished ship carries the design's combat power and its damage/defense
signature into the fleet, and the combat engine reads both. Standard patterns
(one per hull) are code, so the AI and a player who never opens the designer
still field fitted ships.

Landed 2026-09-11. Replaced a designer panel that saved to an in-memory mock
and was consumed by nothing.

## Files

| File | Role |
|---|---|
| `lib/combat/ship-types.ts` | Vocabulary: `ShipClassId`, `HullDefinition`, `ComponentDefinition`, `ShipDesign`, `DesignProfile`, `DesignSummary`. |
| `lib/combat/ship-registry.ts` | Hulls, modules, `DEFAULT_DESIGNS`, `summarizeDesign` (power/cost/time/energy/profile/issues), `designProfileModifier`, `normalizeComposition`. Client-safe. |
| `lib/combat/ship-design-service.ts` | Worker rules: `saveDesign`, `deleteDesign`, `resolveRecruitSpec`. Pure over the world object. |
| `lib/combat/recruitment-service.ts` | Jobs carry `designId`, `classKey`, `unitPower`, `unitProfile`; completion adds them to the fleet. |
| `lib/combat/combat-engine.ts` | Counter lookup is case-insensitive; `calculateDesignModifier` adds the signature RPS. |
| `lib/combat/combat-manager.ts` | Merges fleet `designProfile`s into the combatant; corvettes screen, battleships are capitals. |
| `components/panels/ShipDesignerPanel.tsx` | The designer. Renders `summarizeDesign` output, files via `SHIP_DESIGN_SAVE`. |
| `components/units/ShipDesignPicker.tsx` | Shared recruit control (ReviewPanel, MilitaryPanel): own designs + standard patterns per hull. |
| `lib/combat/ship-design-tests.ts` | `npx tsx lib/combat/ship-design-tests.ts` |

## Invariants

- **Composition keys are lowercase ship classes** (`corvette`, `destroyer`,
  `cruiser`, `battleship`, plus `carrier`, `interceptor`, `bomber` for wings).
  The combat counter grid, the tactical adapter, the AI and every test speak
  lowercase; the config file `data/combat/ground-units.json` and the icon set
  speak UPPERCASE. Player fleets were stored UPPERCASE, so the orbital
  rock-paper-scissors grid never matched anything a player built.
  `normalizeComposition` folds keys on shard inject (server and client), on
  recruit completion, on merge and split, and inside the counter lookup itself.
  Readers must tolerate either case; writers must write lowercase.
- **Designs live in the owner's shard.** `extractFactionShard` carries
  `shipDesigns`; `cleanWorldForSave` clears them from the shared snapshot;
  `projectPublicShard` is an allow-list so rivals never receive them.
  `world.shipDesigns` is a `Map<designId, ShipDesign>`; standard patterns
  (`factionId: '*'`) are never stored.
- **One pricing function.** `summarizeDesign` is what the designer displays
  and what `resolveRecruitSpec` charges. Do not price ships anywhere else.
- **Every recruit goes through `resolveRecruitSpec`.** It refuses unknown
  unit types (they used to cost `{}` and recruit free), ship hulls in ground
  orders, ground units in fleet orders, and designs the faction does not own.
  `MIL_RECRUIT_FORMATION_UNIT` also checks the formation belongs to the
  issuer.
- **Standard patterns use no tech-gated module** and must validate against an
  empty tech set (tested). They are what a bare hull name resolves to.
- **Every FLEET recruit passes the shipyard gate** (`checkShipyardGate` in
  `lib/combat/shipyard-gate.ts`) at ORDER time, anchored on the fleet's
  current system (MIL_RECRUIT_FORMATION_UNIT) or the planet's system
  (MIL_BUILD_FLEET; the payload's systemId is no longer trusted). Worker,
  AI capital spawns (`ai-expansion`, `belt-ambush-ai` via `systemYardFor`) and
  the recruit picker call the same function. The table is
  `HULL_MIN_YARD_TIER`: corvette 1, destroyer 1, cruiser 2, battleship 3.
  Yard tier per planet = max(orbital `shipyard_tier` effect, surface
  `orbital_shipyard` = 1 / `fleet_drydock` = 2); every seeded capital is
  tier 1 from its first cycle. Completion is never gated. Exempt by design:
  pirate raiders/prizes, the Genthouli vanguard, debug spawns, air-sortie
  wing recovery. A refused MIL_BUILD_FLEET refunds its shell fee, and an
  unaffordable chained hull is refused BEFORE the fleet exists (no paid empty
  shells). The legacy `shipType` payload from the SPACE CONSTRUCTION tab maps
  a hull class onto `recruitUnitType`; non-combat types are refused with a
  refund. A ruined surface yard is repairable: players via
  `PLANET_REPAIR_BUILDING` (was a log-only stub), AI factions automatically
  at their capital each expansion tick (`repairRuinedYards`).
- **Profiles are totals.** `fleet.designProfile` is the sum of per-ship
  profiles; it adds on merge and scales by ship ratio on split. Losses reduce
  `strength`, not composition, so totals stay consistent. Fleets without a
  profile (legacy, AI-spawned) get a modifier of 0, never "bare".

## Math

- Power per ship = hull power × (1 + Σ module `powerMult`). Hull power, cost
  and build time come from `ground-units.json`; modules add flat cost and
  seconds.
- Energy: hull `baseEnergy` + cores (negative `energy`) feed module draw.
  Standard patterns fit under a Fission Core. **Brownout** (2026-09-19): a
  reactor can be pushed up to 25% past its output (`BROWNOUT_MAX_OVERDRAW`),
  and every 1% over costs 1% combat power (`brownoutPenaltyFor`, floored, and
  always at least one point). Past 125% the design is refused as before. The
  penalty lives inside `summarizeDesign` (`power` is net, `ratedPower` is the
  rating, plus `overdraw`, `overdrawRatio`, `maxEnergyDraw`,
  `brownoutPenalty`, `warnings`), so it reaches recruits through
  `unitPower` with no other code involved; cost, build time, signature and
  lane speed are not reduced. Linear on purpose: a brute force over every
  hull × core × fit (in `ship-design-tests.ts`) shows no overdrawn fit
  out-rates the best legal one, where a gentler curve did. Four Spinal Lances
  on a Fusion Core: 183 power instead of 193, against refused before.
- Signature RPS (`designProfileModifier`, cap `maxDesignBonusCap` = 0.15 in
  `combat-config.json`): attack mix (energy/kinetic/explosive, normalised)
  against defense mix (shield/armor/evasion/bare, normalised by ship count).
  Energy +1 vs shield, −1 vs armor; kinetic the reverse; explosive +1 vs bare,
  −1 vs evasion; energy and kinetic +0.5 vs bare. A side with no weapon
  modules gets 0. Applied inside the engine's ±40% clamp next to the
  composition grid.
- Orbital counter grid now covers all four hulls: bombers beat capitals,
  corvettes beat bombers, destroyers beat corvettes, cruisers beat destroyers,
  battleships beat cruisers, bombers beat battleships.

## Tech gates

| Module | Tech |
|---|---|
| Gauss Railgun | `mil_t1_5` Basic Targeting Systems |
| Hardened Shields | `mil_t1_8` Defensive Grid Networks |
| Plasma Torpedo | `mil_t2_pre_2` Weak-Point Targeting |
| Afterburners | `mil_t2_pre_4` Tactical Mobility Systems |
| Reactive Armor | `mil_t2_adp_3` Reactive Defense Systems |
| Fusion Reactor | `inf_t2_ind_4` High-Capacity Energy Systems |
| Spinal Lance | `mil_t3_4` Fortification Breakers |
| Singularity Core | `eco_t3_1` War Economy Mobilization |

## Orders

- `SHIP_DESIGN_SAVE { design: { id?, name, hullId, components } }` — validated
  server-side; payload `factionId` ignored; standard ids refused; cap 24 per
  faction. Client picks the id so the optimistic copy reconciles on sync.
- `SHIP_DESIGN_DELETE { designId }` — own designs only, and refused while
  any ship carries the pattern (see Refit).
- `MIL_REFIT_FLEET { fleetId, fromDesignId | null, toDesignId, count }` — see
  Refit below.
- `MIL_RECRUIT_FORMATION_UNIT { formationId, isFleet, unitType, designId?, count }`
  and `MIL_BUILD_FLEET { ..., recruitUnitType?, recruitDesignId? }` — a hull
  name without a design builds the standard pattern.

## Orbital yard pricing

`ORBITAL_CONSTRUCT` charges the structure's catalog cost from faction
reserves (`orbitalStructureCharge` in `lib/orbital/orbital-service.ts`:
credits/metals/chemicals/food/energy/rares; manpower has no pool and is not
charged, matching surface buildings). Eligibility is checked before the
charge; a failed start rolls it back; `ORBITAL_CANCEL` refunds exactly what
the order recorded in `paid`. The orbital tab locks unaffordable structures
with the same reason string.

The ladder is priced against the starting kit (rebalanced 2026-09-13). A
fresh faction holds 3,000 metals / 1,500 chemicals / 50,000 credits and its
capital already has a surface Orbital Shipyard (tier 1), so the orbital
Spaceyard buys production speed, repair and the path upward, not the tier.
Station + Spaceyard must fit in under a third of the opening metals so a
starter squadron (three standard corvettes = 1,440 metals) or a colony
(1,000 metals) is still affordable; each rung is ~2.5× the last and the
Capital Spaceyard stays cheaper than a battleship (3,580 metals).
`scripts/test-orbital.ts` asserts the budget.

| Structure | Yard tier | Credits | Metals | Chemicals |
|---|---|---|---|---|
| Space Station | — | 700 | 450 | 150 |
| Spaceyard | 1 | 700 | 500 | 150 |
| Advanced Spaceyard | 2 | 1,800 | 1,300 | 500 |
| Capital Spaceyard | 3 | 4,000 | 2,800 | 1,000 |

Surface rungs for comparison: Orbital Shipyard 800/400/200 (tier 1), Fleet
Drydock 2,000/1,000/500 (tier 2). Infrastructure levels 3 and 4 gate the
upper orbital rungs on top of these prices.

## Engagement rules (2026-09-13)

`lib/combat/combat-manager.ts` runs the engine; the rules it applies around
it are pure functions in `lib/combat/engagement-rules.ts` (tests:
`npx tsx lib/combat/engagement-rules-tests.ts`; the manager itself is driven
end to end by `npx tsx lib/combat/combat-manager-tests.ts`).

- **The later arrival attacks.** `Fleet.arrivedAtSeconds` is stamped on
  arrival and at spawn; `pickRoles` makes the newest side the attacker. Ties
  and unstamped (legacy) fleets fall to the system owner defending. Faction A
  used to attack purely by Map iteration order.
- **Rosters follow strength.** Damage lands on `fleet.strength`, never on
  `composition`, so `snapshotForce` scales every fleet's composition and
  design profile by its strength, and `refreshCombatant` re-reads both at the
  top of every round (strike craft keep the engine's air-phase attrition as a
  ceiling). Reinforcements join the roster, and since 2026-09-19 the pool too.
- **Every hull fights.** The engine's attack table counted destroyers as the
  only screens and cruisers/carriers as the only capitals: a corvette wing or
  a battleship line dealt zero damage. Corvettes now screen, battleships stand
  in the line.
- **Battles end.** A fleet whose strength falls to its doctrine's
  `retreatThreshold` (0.15–0.55 by doctrine type; written since forever, read
  by nothing) breaks off at the end of the round and runs for where it came
  from, else the nearest owned system, else the capital (`withdrawFleetHome`).
  A side that fought the round under the `withdraw` stance breaks entirely. A
  fleet ordered out (`destinationSystemId` set) stops fighting that same
  cycle. The battle closes when a side has nothing standing, when the
  engine's annihilation roll fires (`checkAnnihilation`, wired for the first
  time), or after the last round; `CombatState.outcome` records the winner
  and the reason (`rounds | rout | destroyed | annihilation | withdrawal`),
  the state lingers one pass for the UI, and `sweepStaleCombats` closes
  battles whose sides are no longer both present (they used to leak forever).
- **Directives are real.** `MIL_COMBAT_DIRECTIVE` wrote `selectedStance`, so
  choosing a directive silently changed the stance. It now sets
  `selectedDirective`; `applyPostBattleDirective` runs at the end and its
  supply/morale deltas are carried onto surviving fleets' doctrine
  (`supplyLevel`, `moraleDrift`). `pursue` costs each breaking enemy fleet a
  further 5% strength on the way out. `MIL_COMBAT_RETREAT` read
  `combat.location` (no such field) and moved nothing; it now withdraws via
  the same helper and the battle closes on the next pass.
- **Repair follows the yard.** `lib/combat/fleet-repair.ts`: a fleet holding
  in a friendly system regains 0.01 strength per fast cycle plus the best
  orbital `fleet_repair_rate` among its faction's planets there (Spaceyard
  0.03, Advanced 0.05, Capital 0.07), times `mil_repair_rate_mult`. The
  strategic-tick repair adds the same yard bonus. The rating was summed into
  `OrbitalRatings` and read by nobody.
## Planets fight, battles are reported (2026-09-14)

- **Orbital defenses join the defender.** `fortificationFor` sums
  `orbital_defense_power` over the planets the defending faction holds in the
  battle system. Their mass joins the defender's hp (`fortificationHpPerPower`
  = 10, so a Defense Network weighs like a 160-power fleet) and they fire each
  round from that mass (`fortificationFirepowerRatio`, see Power-vs-power
  damage below). The defender's incoming volley is split
  between fleets and structures by remaining mass (`splitDamage`) and the
  structure share goes through `applyOrbitalDamage`, the bombardment path, so
  shields soak, integrity drops and a slot can be destroyed; wrecked
  structures stop shooting (`refreshFortification`). Only the defender gets
  it, and only while a fleet battle is on: a lone hostile fleet parked over an
  armed world is still handled by blockade/bombardment, not by this.
- **Battle report.** `finishBattle` files one `battle_resolved` chronicle event
  per battle with `theatre: 'space'` (the template writer renders it as a
  fleet action, not a ground siege), losses per side from `CombatState.tally`,
  and `importanceOverride: 20` for a standoff nobody bled for. Each side gets
  one notification (VICTORY / DEFEAT / STANDOFF AT <system>; defeats are
  urgent). Space battles left nothing but console lines before.
- **Worker supervisor.** `npm run worker:forever` (`scripts/worker-forever.js`)
  restarts the worker whenever it exits; the hang watchdog exits on purpose
  and nothing restarted it on a dev machine.
## Designs move fleets and reach the tactical sim (2026-09-14)

- **Lane speed follows the fleet** (`lib/combat/fleet-speed.ts`, tests
  `npx tsx lib/combat/fleet-speed-tests.ts`). The slowest hull aboard sets
  the pace (`HULL_SPEED_FACTORS`: corvette 1.2, destroyer 1.05, cruiser 0.9,
  carrier 0.8, battleship 0.75) and the designs add to it: Thrusters
  `speedMult` 0.10, Afterburners 0.20, summed by `summarizeDesign` into
  `DesignSummary.speedMult`, carried by `resolveRecruitSpec` as
  `unitSpeedMult`, and kept on the fleet as a ship-weighted average
  `designSpeedBonus` (recruitment completion, merge; split copies it).
  `effectiveEdgeCost` multiplies the layer speed by `fleetSpeedFactor`.
  Fleets from before the stamp get the hull factor and a bonus of 0.
  Every fleet used to cross a lane in the same time.
- **Designs reach the tactical sim** (`lib/tactical/fleet-adapter.ts`
  `designTuningFor`, `DesignTuning` in `lib/tactical/types.ts`). Per side,
  the fleets' summed `designProfile` divided by hulls aboard becomes:
  shields ×(1 + 0.25·S), armour +0.08·A per aspect (cap +0.30), speed
  ×(1 + 0.08·E), weapon damage ×(1 + 0.05·W), and the attack mix swings
  shield damage vs hull damage by ±30% (energy vs kinetic) with explosive
  adding up to 0.25 shield pierce. Applied at spawn (`spawnShip`), in
  `effectiveMaxSpeed`, at every fire site and in `applyDamage`
  (`vsShield`/`vsHull` options, target side's `armorBonus`). No profile
  → identity, the same rule as the strategic engine. The battle the player
  watches used to ignore the designer entirely.
## AI yards, veterancy, admirals, design intel (2026-09-14)

- **AI climbs the yard ladder** (`lib/ai/yard-ladder-ai.ts`, called from
  `tickAIExpansion` each strategic tick; tests `npx tsx lib/ai/yard-ladder-ai-tests.ts`).
  At its capital: Space Station → Spaceyard → Advanced Spaceyard → Capital
  Spaceyard, one step a tick, through the same `canBuildOrbital` /
  `startOrbitalConstruction` / `orbitalStructureCharge` the player uses and
  with double the price in hand. When a rung needs more infrastructure the
  weakest track is raised first (credits from the treasury, materials from
  the planet stockpile, as `INFRA_UPGRADE_TRACK`). No AI faction ever fielded
  anything above a destroyer before.
- **Veterancy** (`lib/combat/veterancy.ts`, `Fleet.experience` 0..0.25). Every
  fleet that survives a battle gains 0.02, the winner 0.04; combat power is
  multiplied by 1 + experience in `createCombatant`; fresh hulls dilute it by
  power on recruit completion, merge averages by power, split copies. The
  fleet card shows the crew rank.
- **Admirals command** (`lib/combat/admiralty.ts`). The senior active Admiral
  on a side adds 2% combat power per level (cap 10%), opens the battle with
  one prediction point, and maps the `aggressive_tactician` trait onto the
  engine (offensiveDamage on attack, defensiveStrength on defence). An
  admiral earns 150 XP per battle and 150 more for a win. `Fleet.leaderId`
  had no combat effect at all before.
- **Espionage reads the yards** (`designIntelLine` in
  `lib/espionage/intel-reports.ts`). From the `embedded_network` stage on, a
  military intercept names up to three of the target's designs with hull and
  signature ("energy-heavy, shielded"); heavily distorted reports keep the
  names and garble the details. Rival designs are never sent any other way.
## Power-vs-power damage (2026-09-19)

Tests: `npx tsx lib/combat/damage-model-tests.ts` (formula, pacing),
`combat-manager-tests.ts` sections 9-13 (pool, cap, floor, parity, repair).

- **Why.** Round damage came from a ship-COUNT table (screens×4 +
  capitals×2 light, capitals×8 heavy, ...). A 12-power corvette dealt 6 a
  round and a 142-power battleship 10: per point of power a corvette swarm
  hit seven times harder than a battle line, and a design's power rating
  bought toughness only, never firepower. Pirate raiders (`{interceptor: 2}`)
  dealt zero. And the pool ran at power × 10 while fleets lost
  damage / basePower, so a fleet was dead when its pool had lost a tenth and
  every `hp / maxHp` comparison was noise; veterancy sat in hp and maxHp alike
  and cancelled.
- **One scale.** `basePower × strength` is the truth. A combatant's hp is a
  projection at `hpPerPower` (10) hp per point, re-derived from the standing
  fleets and fort every round (`syncPool`, before and after the volley).
  `maxHp` is what each fleet brought in (`CombatantState.committed`), so
  reinforcements join the pool and cannot fake a "kept more" win.
- **Formula** (`resolveEngagementRound`): `M` = effective power / hp, i.e.
  every multiplier as one number (RPS grid, design RPS, morale, supply, tech,
  admiral inside the ±40% clamp; stance, momentum, civ traits, prediction
  outside it). `damage = roundDamageFraction × M × (shipMass × torpedo +
  fortMass × fortificationFirepowerRatio) + bombers × bomberStrikeDamage × M`.
  `torpedo = 1 + torpedoBonus × screenPowerShare × (1 − enemy screening)`:
  screens earn up to +50% against capitals the enemy has not screened,
  nothing against a covered line. Momentum follows the damage SHARE
  (`momentumSwingScale`), organization the share of committed force lost.
- **Fleets.** `applyDamageToFleets` splits a volley by mass and takes
  damage / (fleet's full mass) off strength, veterancy included, so elite
  crews hit 1.25× harder and die 1.25× slower. No round takes more than
  `maxRoundStrengthLoss` (0.6) from a fleet, so a 50:1 stomp still leaves a
  rout check; at or under `fleetDestroyedStrength` (0.05) a fleet is gone,
  or two fleets that cannot rout would decay forever.
- **Forts: percent parity.** The fort's share of a volley is converted with
  `orbitalDamageScale` so losing x% of a planet's rated fort mass costs its
  standing structures x% hull (shields and hardening on top).
- **Fleet actions are orbital for all six rounds** (`TargetDetails.fleetAction`):
  rounds 4-6 looked ships up in the GROUND counter table, matched nothing,
  and silently switched the RPS grid and design signature off mid-battle.
- **Quiet yards.** `lib/combat/war-status.ts` `isSystemContested`: no dock
  repair (fast cycle or strategic tick) while an at-war fleet holds the
  system. Under this model a defender repairing between rounds out-heals an
  equal attacker.
- **Fleet shell.** A new task force rates `FLEET_SHELL_POWER` = 10, not 100:
  the shell was free toughness, and would have become free firepower at a
  fifth of a battleship's metal per point. Existing fleets keep theirs.
- **Pacing** (`roundDamageFraction` 0.08, neutral stances): equals keep 0.61
  after one battle and break in the third; 1.25:1 takes two battles; 2:1 ends
  inside one with the winner over 0.8; 5:1 in two rounds.

## Refit (2026-09-19)

`MIL_REFIT_FLEET` converts ships already in a fleet from one pattern to
another of the SAME hull, at a yard. Tests: `npx tsx lib/combat/refit-tests.ts`
(51 checks); the handler is worker-inline and was verified live.

- **Price** (`quoteRefit` in `ship-registry.ts`): both sides go through
  `summarizeDesign`, so there is still one pricing function. The player pays
  for the modules ADDED, compared as multisets (re-ordering slots is "the same
  fit" and refused); removed modules refund nothing, so A → B → A pays twice.
  Time is 10% of the hull's build time plus the added modules', per ship,
  serial. `fromDesignId: null` means **unregistered hulls**: ships no pattern
  accounts for (built before designs existed), rated as the bare hull, never
  as `basePower / ships` (fleet shells would poison that).
- **The books** (`lib/combat/fleet-roster.ts`): `rosterByHull` groups
  `designCounts` under `composition`, flags hulls whose counts over-claim
  (`inconsistent`) and ids whose pattern is gone (`orphanIds`); `refittable`
  is what the books hold less what open refit jobs already reserved;
  `applyRefit` rewrites exactly four fields (basePower, designProfile,
  designCounts, designSpeedBonus). `designCounts` used to be display-only and
  is load-bearing now.
- **Validation order** (every check precedes the charge): fleet exists, is
  yours, count 1-50, target resolves through `resolveRecruitSpec` (registry,
  tech, brownout cap), source pattern still on file, quote ok, system not
  contested (`isSystemContested`), `checkShipyardGate` for the target hull (a
  battleship refit needs a tier 3 yard), unregistered source refused when the
  books are unclear, count ≤ free ships, then `chargePerUnitCost`.
- **The job** rides `world.combat.recruitmentJobs` with `kind: 'refit'`,
  `refitFrom` (source snapshot) and `paidPerUnit`, so persistence, shards,
  sync and the merge retarget come free. Until it lands the ships fight with
  the old fit. Completion is never yard-gated (the fleet may sail). Ships no
  longer aboard by then are refunded at what was paid, and so is the whole
  job when the fleet is gone or has changed hands (civil war). The owner gets
  a REFIT COMPLETE notification.
- **In-service lock** (`shipsInService`): a pattern that ships carry, or are
  being built or refit to or from, keeps its FIT. `saveDesign` refuses a
  changed hull or modules (a rename is fine) and `deleteDesign` refuses
  outright. Without it: edit pattern X down to a bare hull, refit X → Y for
  the price of every module, and the ships gain modules they already had. The
  designer files such an edit as a new pattern instead.
- **Split follows the books** (`splitRoster`): each hull's ships come off
  that hull's own patterns by largest remainder, power moves by what those
  ships are rated, and the signature is the moved patterns' own. The old
  split moved all three by the overall ship ratio (two battleships out of ten
  corvettes and two battleships took a sixth of the power) and let
  designCounts drift off composition. A split is refused while a refit job
  targets the fleet.
- **UI**: `components/units/FleetRefitPanel.tsx`, shown under the commission
  picker in `ReviewPanel` for the selected fleet: one row per pattern aboard
  (and per hull with unregistered ships), a REFIT drawer with target, count and
  a live quote. `MilitaryPanel` carries it too but is not mounted anywhere.
- **Left out**: cross-hull conversion, scrap refunds, a cancel order, dry-dock
  immobilisation, AI use of refit, bulk upgrades, wings and carriers.

## Review fixes (2026-09-19)

An adversarial review of the three commits above (six lenses, each finding
re-checked by a skeptic) found that refit made `designCounts` load-bearing
while four writers still treated it as display-only. Every hole was the same
exploit by another door: make fitted ships look like bare hulls, then let
refit sell them their own modules again at about a third of build price.

- **Split never moves the books without ships.** `MIL_SPLIT_FLEET` with no
  ships named used to halve `designCounts` while every hull stayed put (ten
  battleships: 1420 to 1680 power per loop, unbounded). Now refused for a
  fleet that has ships; a shipless shell halves its power only, and one under
  2 power cannot split.
- **A tactical result is a merge.** `MIL_TACTICAL_RESULT` pools the absorbed
  fleets into the survivor the way `MIL_MERGE_FLEETS` does (`mergeBooks`,
  crews, lane speed, carried armies, open yard jobs), clamps the survivors to
  the ships that are actually there, and takes the losses off the books with
  `splitRoster`, so power falls by what the dead ships were rated.
- **Over-claiming books offer nothing** (`refittable` returns 0 for an
  inconsistent hull, from any source; it used to clamp each pattern on its
  own, so {A:5, B:5} on five hulls took ten refits). `reconcileBooks` shrinks
  such books to the hulls that exist (largest remainder, claims only go
  down); the refit order runs it first, and the panel shows the same view.
- **Design ids are attacker JSON.** A new pattern's id must match
  `design-[A-Za-z0-9_-]+` (no `constructor`, no `__proto__`), and an id that
  ships still carry cannot be re-filed (that let the owner choose, after the
  fact, what those ships are priced from). `isBookKey` guards every count
  map; `applyRefit` and `completeRefit` refuse non-finite counts.
- **One cap, one constant**: `REFIT_MAX_PER_ORDER` (50), used by the worker
  and the panel.
- **Combat.** The fort's share of a volley is capped per round like a
  fleet's and lands on ARMED structures only (`isArmedStructure`; yards,
  warehouses and labs are bombardment targets, not combatants): a 600-power
  fleet used to strip a home orbit to 10% in one round because a picket was
  parked there. The rout window: a fleet still above its `retreatThreshold`
  survives the volley just over the kill line and breaks at the end of the
  round (the 0.6 cap alone left it at 0.40, above the default 0.3, and the
  next volley killed it); one that cannot run dies to the next. A fleet
  action is never a one-round skirmish (two 22-power task forces fought eight
  "battles" with eight XP awards). `syncPool` raises a side's commitment when
  ships land in a fleet mid-battle (`committedRated`).
- **Client.** The store's `recruitmentJobs` was never written, so every
  reader saw `[]`; it is published now and a shard REPLACES its owner's jobs.
  The refit panel uses `dispatchOrder`, mirrors the under-fire rule, shows
  only the player's own fleets and disables patterns still syncing; the
  designer's retire button honours the in-service lock; split is disabled
  under an open refit; the optimistic split and merge carry the books.

## Not done / next

- `components/panels/MilitaryPanel.tsx` is imported by nothing (the dock opens
  WAR ROOM and SHIP DESIGNER). Fleet recruit and refit live in `ReviewPanel`.
- Default stances (shock v entrench) favour the attacker about 1.2:1 between equals.
- A side in two engagements in one system fires its full power in both.
- A lone hostile fleet over an armed world is not engaged by the defenses (no fleet battle, no fortification).
- The tactical sim still fields each class's fixed loadout; designs tune it (shields, armour, speed, damage, mix) rather than replacing the weapons.
