# Ship classes and the two yard lines — plan

Status (2026-10-28): work packages 1 and 2 BUILT (uncommitted): nine classes,
the two-line yard gate, the drydock rungs, the starter Fleet Drydock, counters,
icons. Still open: 3 (class mechanics), 4 (AI using the new hulls beyond a
light starter fleet), 5 (own tactical classes and 3D hulls; the new light hulls
fight as corvette/destroyer models for now), drydock-rung drawings.

## Goal

More ship types, each unlocked by a yard upgrade, in two lines in the Orbital
tab:

- **Light line — the Fleet Drydock.** Every upgrade unlocks a new small hull:
  patrol craft, corvettes, frigates, assault ships. It also repairs and
  refits.
- **Heavy line — the Spaceyards.** The Spaceyard lays destroyers, the
  Advanced Spaceyard the bigger models, the Capital Spaceyard the capital
  ships: battleships, carriers, dreadnoughts.

## The roster (nine classes; four exist today)

| Class | Size | Line, tier | Role | New? |
|---|---|---|---|---|
| Patrol craft | S | Drydock 1 | Cheapest hull. Picket, pirate hunting, customs; sees blockade runners and cloaked raiders. Weak in a line fight. | new |
| Corvette | S | Drydock 1 | Fast escort, hunts strike craft. | exists |
| Frigate | S/M | Drydock 2 | Escort with point defence: shoots down bombers and torpedoes, shields the hull next to it. | new |
| Assault ship | M | Drydock 3 | Carries troops and lands them: boarding stations, landings under fire. Ties into the ground war (`canCrossOrbit`). | new |
| Destroyer | M | Spaceyard 1 | Line screen, kills light hulls. | exists |
| Cruiser | L | Advanced 2 | Backbone, multi-role. | exists |
| Battleship | XL | Capital 3 | Slow, ruinous, decisive. | exists |
| Carrier | XL | Capital 3 | Fields interceptor and bomber squadrons. Already a full tactical class (`lib/tactical/ship-defs.ts`, hangars in `sim.ts`); missing only on the strategic side. | half |
| Dreadnought | XXL | Capital 3, plus tech | Flagship: one per fleet, a morale and accuracy aura, huge price. | new |

Counters, the rock-paper-scissors in `combat-config.json` `unitCounters.orbital`:

- patrol: beats raiders and blockade runners; loses to destroyers;
- frigate: beats bombers and strike craft; loses to cruisers;
- assault: beats stations and boarding targets; loses to destroyers and corvettes;
- carrier: beats battleships at range; loses to frigates and corvettes in close;
- dreadnought: beats cruisers and battleships; loses to bombers.

## Yard ladder

Orbital structures, all in the Shipyard section:

- Light line: `fleet_drydock` (D1) → `reinforced_drydock` (D2, upgradesFrom) → `assault_drydock` (D3).
  - Each keeps the repair and refit effects and adds a new `light_yard_tier` effect.
- Heavy line: `spaceyard` (S1) → `advanced_spaceyard` (S2) → `capital_spaceyard` (S3).
  - The existing `shipyard_tier` effect stays and is now the heavy tier.

Gate change in `lib/combat/shipyard-gate.ts`:

- `HULL_MIN_YARD_TIER: number` becomes `HULL_YARD: { line: 'light' | 'heavy'; tier }`.
- `planetYardSource` returns both tiers.
- `planetYardTier` keeps meaning heavy, so planet-ruin, Doomsday, ping-cost and civilian ships stay as they are.
- Civilian ships (explorer, builder) take either line at tier 1.
- The picker, the worker and the AI still call the same functions.

## Work packages

1. **Data.** `ShipClassId` union and `SHIP_CLASS_IDS`. Hulls in `ship-registry.ts`: slots, energy, cost, build time multiplier. Default designs, `normalizeComposition`, fleet speed, and the screen and capital buckets in `engagement-rules.ts`. Tactical `SHIP_CLASSES` for patrol, frigate, assault and dreadnought (carrier exists), plus the `fleet-adapter` mapping and `combat-config` counters.
2. **Yards.** The two-line gate, the drydock upgrade structures, the Orbital tab cards ("unlocks: frigate"), OrbitLayer drawings for the drydock tiers, and the AI `yard-ladder-ai.ts`.
3. **Mechanics.** Specific to the new classes:
   - assault: troop capacity, plus embark and land through the existing siege seeding (`seedArrivals`);
   - frigate: point defence in tactical and a bomber counter in auto-resolve;
   - patrol: detection bonus against blockade runners and covert raiders;
   - carrier: hangar strength on the strategic side;
   - dreadnought: one per fleet and its aura.
4. **AI.** Compositions in `war-ai.ts` and `ai-fleet-orders.ts` use the new hulls by yard tier, and pickets become patrol craft.
5. **Visuals.** Procedural placeholder hulls for each new class (`placeholder-hulls.ts`, `hull-models.ts` `CLASS_IDS`), the faction hull manifest slots (fallback to placeholder), icons in the fleet UI, and ships parked at the drydock in OrbitLayer.
6. **Migration.**
   - Existing fleets keep their hulls.
   - Existing orbital `fleet_drydock` = D1.
   - Corvettes need drydock 1 OR spaceyard 1 for one season, so nobody loses corvette production.
7. **Probes.** Ship-design tests (gate per class), refit tests, a tactical sim run per class, the ai-parity probe, and a balance soak with the counter matrix.

Order: 1+2 together (the gate cannot change without the classes), then 5
(placeholders, so nothing is invisible), then 3 one class at a time, then 4.

## Decisions (2026-10-28)

- **Starter yard: a Fleet Drydock.** Capitals start with drydock 1 (patrol craft
  and corvettes); the Spaceyard is built later. Corvettes are light-line only.
  Civilian ships (explorer, builder) take either line at tier 1.
- **Dreadnought: its own class.** Capital Spaceyard plus a tech, one per fleet,
  aura on the fleet.
- **Assault ships carry troops.** Their troop capacity lets armies embark and
  land through the existing siege path, and they can land while the orbit is
  contested (where `canCrossOrbit` would otherwise refuse).
