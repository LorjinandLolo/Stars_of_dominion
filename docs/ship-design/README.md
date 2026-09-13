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
- Energy: hull `baseEnergy` + cores (negative `energy`) must cover module
  draw. Standard patterns fit under a Fission Core; a battleship with four
  Spinal Lances needs a Singularity Core.
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
- `SHIP_DESIGN_DELETE { designId }` — own designs only. In-flight jobs keep
  their snapshot; existing ships are unaffected.
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
  ceiling). Reinforcements join the roster; hp stays as created.
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
  round (`fortificationAttackPerPower` = 0.4 per point, about a dozen
  corvettes for a Defense Network). The defender's incoming volley is split
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
## Not done / next

- Reinforcements arriving mid-battle join the roster but not the side's hp.
- A lone hostile fleet over an armed world is not engaged by the defenses (no fleet battle, no fortification).
- The tactical sim still fields each class's fixed loadout; designs tune it (shields, armour, speed, damage, mix) rather than replacing the weapons.
- Refit: existing ships keep the fit they were built with. A refit order would
  be a per-fleet job that rewrites `designProfile`/`designCounts`.
- Espionage could reveal a rival's designs through intel reports.
