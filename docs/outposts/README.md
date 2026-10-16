# Outposts

An outpost is the first step of a world: a handful of colonists in pressure
domes on a small grid, kept alive through crises, given a job by the empire,
and grown until it is big enough to become a real colony with a 64-district
surface like the capital.

Code: `lib/outposts/` (pure catalog, map, simulation and crises; the worker
service applies world effects), orders `OUTPOST_*` in `scripts/game-loop.ts`,
screen `components/outpost/OutpostView.tsx`, test `scripts/test-outposts.ts`.

## Founding

A builder ship spends itself on an empty surveyed world (`CIV_FOUND_OUTPOST`,
2,000 Cr). The world is claimed with the `outpost` tag and gets
`planet.outpost`: a 5×5 grid generated from the planet id (deterministic),
a Landing Hub in the centre, 3 colonists and 12 food. Dead worlds can take an
outpost; no colony could.

## The grid

Cells have terrain: flat, ore, ice, vent, rock (must be cleared), ruin (one at
most, excavated by a lab). Tier 1 opens the centre 3×3; tier 2 the whole 5×5.

Modules (cost, build time in shifts, workers, flows) live in
`outpost-catalog.ts`. Every module needs power and some need workers; colonists
staff modules in priority order (life support, power, food, then the rest in
build order). A module switched off frees its workers and power.

## A shift

One shift is 5 real minutes. Each shift:

- **Power**: generation vs draw. A deficit shuts modules down from the bottom
  of the priority list.
- **Air**: life support vs one unit per 4 colonists. A deficit drains the air
  reserve; with no air, colonists die.
- **Food**: hydroponics and supply drops vs one unit per 4 colonists. Empty
  stores cost morale, then lives.
- **Morale** drifts to a target set by commons, crowding, deficits and crises.
  Under 25 colonists start leaving.
- **Growth**: with room, food and morale ≥ 40, a colonist arrives (two with a
  dock).
- **Output**: mines put their terrain's resource in the warehouse (no
  warehouse, nowhere to put it). The warehouse ships to the empire's reserves
  every strategic cycle.
- **Crises** roll (see below).

## Crises

The heart of it. A crisis has two or three answers, each with a price, and a
deadline of two shifts. Unanswered, the outpost's steward picks: with a
governor on the world the sensible answer, without one the passive one.
Catalog in `crises.ts`: dust storm, meteor shower, air leak, sickness, reactor
fault, supply delay, miners' strike, prison riot, lab accident, rich vein,
ruins, homesickness, raiders.

## Charter

The job the empire gives the outpost (`OUTPOST_SET_CHARTER`): settlement,
mining, prison, research, listening post, depot. Its function runs at +50%
and crises lean toward it.

## Functions

- **Specialty output**: mines + a warehouse; ore gives metals (and rares on
  rare worlds), ice chemicals, vents energy.
- **Prison**: cell blocks hold prisoner groups moved there from the prisoner
  ledger (`OUTPOST_TRANSFER_PRISONERS`, needs a dock). Kept prisoners stay
  ransomable. Prison labour puts them in the mines: metals, riots, and anger
  in their homeland.
- **Research testing**: a staffed test lab runs an experiment
  (`OUTPOST_RUN_EXPERIMENT`): progress on the empire's current research, with
  accident risk. Prisoners as test subjects double the gain at a moral price.
- **Listening post**: a sensor mast shows fleets in its system and one jump
  out (two under the listening charter).
- **Depot**: a fuel depot resupplies and slowly repairs own fleets parked in
  the system.
- **Bunker**: shelter; meteors and raiders hit nothing that is sheltered.

## Growth

- Outpost → Settlement: 10 colonists, morale 50, a habitat, life support and
  hydroponics; 3,000 Cr. Opens the full grid.
- Settlement → Colony: 30 colonists, morale 60, a dock and a warehouse;
  10,000 Cr. The world becomes a colony (dead worlds become domed colonies)
  with a normal surface and build panel. The outpost's functions keep running
  in the colony; its crises end.

## War

An outpost is a planet like any other: an enemy can bombard it, besiege it
and take it.

- **Bombardment** (`outpostBombarded`, from `MIL_BOMBARD_PLANET`): up to two
  modules knocked out for 3 shifts (40% chance each is wrecked), a tenth of
  the colonists plus one killed, morale −10. With a bunker: one module
  knocked out, nobody dies, nothing wrecked.
- **Siege** (`outpostBesieged`: an enemy army on the ground): no arrivals,
  no supply drops, morale target −15, and the outpost cannot grow.
- **Bunkers** add 2 each to `fortificationLevelFor`, which deepens the
  defenders' entrenchment caps. Depth, not men: nothing is added to the
  siege's troop pools, which are rebuilt from formations every cycle.
- **Capture** (`outpostCaptured`, from `capturePlanet`): open crises end,
  prison labour stops, the charter resets to settlement, 30% of the
  colonists flee and morale drops to at most 30. Prisoners held there who
  belong to the conqueror go free (`resolved: 'freed'`); anyone else's
  change keepers. Both sides are told.

The Outposts tab (Economy) lists every outpost, worst news first; outpost
notifications open the outpost's screen.
