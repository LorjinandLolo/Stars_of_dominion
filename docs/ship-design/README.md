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

## Not done / next

- Fleet movement speed ignores design (thrusters affect the signature only).
- The tactical sim (`lib/tactical/ship-defs.ts`) has its own per-class weapon
  loadouts; designs do not yet feed it.
- Refit: existing ships keep the fit they were built with. A refit order would
  be a per-fleet job that rewrites `designProfile`/`designCounts`.
- Espionage could reveal a rival's designs through intel reports.
