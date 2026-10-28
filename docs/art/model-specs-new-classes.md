# Model specs — the new ship classes

Briefs for every hull added after the first five (corvette, destroyer, cruiser,
battleship, carrier). **Section 1 of [model-specs.md](model-specs.md) applies to every
model here**: orientation (bow along +X, deck +Z, port +Y), pivot at 40% from the stern,
one material, faceted hard surface, emissive kept small and white (the game tints it per
side), `.glb` export settings, and the subsystem object names (`engines`, `shields`,
`weapons`, `sensors`, `hull`) for anything marked "capital subsystems".

Each brief gives: what the ship does, the **one shape that must read from above**,
proportions, a bow-to-stern part list, lights, length in battle units, and budget. Length
is what the loader stretches the model to, so model the proportions, not the size.

The rule that matters most: **at 20 to 80 pixels every class must be told apart by its
silhouette from above.** The signature line in each brief is the thing to protect.

Where the finished files go: `public/models/ships/<class>.glb`, registered in
`public/models/manifest.json` under `ships.<class>` (see `public/models/README.md`).
Every warship class has its own battle slot: drop the `.glb` in, add the manifest line, and it
shows. Until then the class draws as the placeholder of its base shape (the "placeholder"
column), at its own size.

### Size ladder at a glance

| class | id | length | yard | placeholder |
| --- | --- | --- | --- | --- |
| Patrol Craft | `patrol` | 14 | Fleet Drydock | corvette |
| Scout | `scout` | 18 | Fleet Drydock | corvette |
| Corvette | `corvette` | 20 | Fleet Drydock | has one |
| Torpedo Boat | `torpedo_boat` | 22 | Reinforced Drydock | destroyer |
| Stealth Raider | `raider` | 22 | Assault Drydock | corvette |
| Commando Ship | `commando` | 22 | Assault Drydock | corvette |
| Frigate | `frigate` | 24 | Reinforced Drydock | destroyer |
| Minelayer | `minelayer` | 26 | Reinforced Drydock | destroyer |
| Electronic Warfare Ship | `ewar` | 28 | Assault Drydock | destroyer |
| Assault Ship | `assault` | 30 | Assault Drydock | destroyer |
| Destroyer | `destroyer` | 30 | Spaceyard | has one |
| Tender | `tender` | 36 | Reinforced Drydock | cruiser |
| Supply Ship | `supply_ship` | 40 | Reinforced Drydock | cruiser |
| Cruiser | `cruiser` | 42 | Advanced Spaceyard | has one |
| Interdictor | `interdictor` | 44 | Advanced Spaceyard | cruiser |
| Heavy Cruiser | `heavy_cruiser` | 50 | Advanced Spaceyard | cruiser |
| Troop Transport | `troop_transport` | 52 | Advanced Spaceyard | carrier |
| Carrier | `carrier` | 55 | Capital Spaceyard | has one |
| Command Ship | `command_ship` | 56 | Capital Spaceyard | battleship |
| Siege Ship | `siege_ship` | 58 | Advanced Spaceyard | battleship |
| Battleship | `battleship` | 60 | Capital Spaceyard | has one |
| Mobile Shipyard | `mobile_yard` | 75 | Capital Spaceyard | carrier |
| Dreadnought | `dreadnought` | 80 | Capital Spaceyard | battleship |
| World Breaker | `world_breaker` | 110 | (planet-ruin project) | battleship |
| Colony Ark | `colony_ark` | 70 | civilian, any yard | — |
| Mining Barge | `mining_barge` | 40 | civilian, any yard | — |
| Armed Merchant | `armed_merchant` | 38 | civilian, any yard | — |
| Hospital / Prison Ship | `hulk` | 46 | civilian, any yard | — |

Silhouette families, so the fleet reads as one navy:
- **Light line (drydock hulls):** slim, exposed structure, visible tanks and frames,
  engines large for the body. Built fast and cheap.
- **Heavy line (spaceyard hulls):** closed, armoured, wedge and slab masses, engines
  buried in a stern block.
- **Civilians:** boxy, modular, containers and rings, almost no armour, lots of windows.

---

## Light line

### Patrol Craft (`patrol`) — length 14, 1,500 tris, 512 texture

**Does.** The cheapest hull: pickets, pirate hunting, customs stops. Fast, fragile, one
small gun. Spots blockade runners and raiders.

**Signature from above.** A short, fat arrowhead with **one** big engine on the centre
line. Where the corvette is a needle between two nacelles, the patrol craft is a
single-engine wedge.

**Proportions.** Length 1, width 0.45, height 0.2. Plan: a broad delta, blunt nose.

**Bow to stern.**
- 0–20%: blunt nose with a wide sensor window band (emissive strip).
- 20–45%: raised cockpit bubble, offset slightly forward of the middle.
- 35–55%: one small single-barrel turret on top, behind the cockpit.
- 45–75%: two short stub wings with a searchlight pod at each tip (customs boat feel).
- 70–100%: one round engine bell, wider than the hull at the stern.

**Lights.** Engine mouth, window band, two searchlight tips.
**Don't.** Don't give it two engines; that reads as a corvette.

### Scout (`scout`) — length 18, 2,000 tris, 1k texture

**Does.** Long-range eyes: big sensor reach, sees through fog, spots cloaked ships. Lightly
armed.

**Signature from above.** A thin spine with a **large flat dish or sensor ring** in the
front third, wider than the rest of the ship. Reads as "a dish on a stick".

**Proportions.** Length 1, width 0.5 at the dish, 0.12 at the spine, height 0.18.

**Bow to stern.**
- 0–10%: needle probe/antenna tip.
- 10–40%: the sensor dish, round, tilted 15° up, on a short mast (object `sensors`).
- 40–60%: small crew pod under the spine.
- 55–70%: two folded antenna booms swept back along the flanks.
- 75–100%: twin small engines close together.

**Lights.** Dish centre glow, engine mouths, crew pod windows.
**Don't.** No turrets you can see from above; a scout that looks armed reads as a frigate.

### Torpedo Boat (`torpedo_boat`) — length 22, 2,500 tris, 1k texture

**Does.** Glass cannon: one huge torpedo alpha strike, then mostly spent. Thin armour.

**Signature from above.** **Four long torpedo tubes** side by side running the full front
half, like a bundle of pipes, with a small engine block behind. Reads as "a rack of
tubes with an engine".

**Proportions.** Length 1, width 0.4, height 0.15.

**Bow to stern.**
- 0–50%: four tube barrels (two each side of the centre line), open mouths at the bow
  (object `weapons`).
- 35–55%: low armoured bridge between the inner tubes.
- 50–70%: reload magazine, a boxy block with hatches.
- 70–100%: two engines splayed slightly outward.

**Lights.** Tube mouths (small rings), engines, bridge strip.
**Don't.** No turrets; its only weapon is forward.

### Frigate (`frigate`) — length 24, 3,000 tris, 1k texture

**Does.** Escort with point defence: shoots down bombers and torpedoes, shields the hull
next to it.

**Signature from above.** A slim hull with a **ring of small turrets** around a raised
central disc: a point-defence "crown" in the middle of the ship.

**Proportions.** Length 1, width 0.35, height 0.22.

**Bow to stern.**
- 0–25%: pointed armoured prow.
- 25–40%: bridge.
- 40–65%: raised round PD platform with six tiny turrets around its rim
  (object `weapons`).
- 55–75%: two small dorsal shield emitter fins (object `shields`).
- 75–100%: two engines side by side.

**Lights.** Muzzle tips on the PD ring (tiny), engines, bridge.
**Don't.** No large main gun; that is the destroyer.

### Minelayer (`minelayer`) — length 26, 3,000 tris, 1k texture

**Does.** Lays minefields on lanes and chokepoints; also sweeps enemy mines.

**Signature from above.** A long flat hull with **an open stern deck and mine rails**,
two parallel tracks running back to a wide open stern. The **sweep booms** fold along
the bow, and in battle they swing out like a V.

**Proportions.** Length 1, width 0.42, height 0.16.

**Bow to stern.**
- 0–20%: blunt bow with two folded sweep booms angled forward.
- 20–40%: bridge tower, offset to port (one of the few asymmetric ships).
- 40–100%: flat deck with two rails, a row of spherical mines on each rail
  (10–12 spheres).
- Engines: two, low and wide, either side of the open stern.

**Lights.** A warning light on each boom tip, engines, a row of small lights along the rails.
**Don't.** Don't close the stern; the open rail end is the read.

### Stealth Raider (`raider`) — length 22, 2,500 tris, 1k texture

**Does.** Hidden until it fires. Raids commerce, hunts supply lines.

**Signature from above.** A **flat faceted flying wing** with no protrusions: a stealth
kite shape, all angles, no round parts.

**Proportions.** Length 1, width 0.8 (wingspan), height 0.08. The flattest ship in the
game.

**Bow to stern.**
- The whole plan is one faceted chevron; the leading edges sweep back about 50°.
- Cockpit: a flush faceted canopy, no bump.
- Weapons: two flush gun slots in the leading edge, no turrets.
- Engines: slit exhausts across the trailing edge, recessed.

**Material.** Darker base colour than the rest of the navy (near black, matte). Keep it
one material; do it with the texture.
**Lights.** Almost none: the thin exhaust slits and two tiny wingtip points.
**Don't.** No antennas, turrets or round shapes.

### Commando Ship (`commando`) — length 22, 2,500 tris, 1k texture

**Does.** Lands agents and commando teams without a full landing; boards stations.

**Signature from above.** A compact armoured hull with a **forward boarding claw**,
two mandible arms reaching ahead of the bow.

**Proportions.** Length 1, width 0.4, height 0.22.

**Bow to stern.**
- 0–25%: two claw arms, slightly open, with a docking collar between them.
- 25–55%: armoured troop compartment, with side hatches outlined in the normal map.
- 40–55%: one small turret on top.
- 55–75%: two drop pods clamped to the flanks.
- 75–100%: one big engine plus two small manoeuvring thrusters.

**Lights.** Collar ring, engines, a hatch light each side.
**Don't.** Don't make it bigger-looking than the assault ship; this is the knife, that is
the hammer.

### Electronic Warfare Ship (`ewar`) — length 28, 3,500 tris, 1k texture

**Does.** Jams enemy sensors and accuracy, hides its fleet's composition.

**Signature from above.** **A forest of masts and fins**: a slim hull covered in tall
antenna blades and two large flat jammer panels standing up like sails.

**Proportions.** Length 1, width 0.35, height 0.4 (tallest for its size; the masts).

**Bow to stern.**
- 0–20%: pointed sensor nose.
- 20–70%: six to eight thin antenna blades of different heights along the spine, plus two
  big flat jammer "sails" angled outward (object `sensors`).
- 40–60%: small crew block under the sails.
- 75–100%: twin engines.

**Lights.** Blinking tips on the tallest masts (small), engines.
**Don't.** No guns visible.

### Assault Ship (`assault`) — length 30, 4,000 tris, 2k texture

**Does.** Armoured troop carrier that lands armies under fire and boards stations.

**Signature from above.** A **blunt brick with a drop ramp**: square bow, wide boxy hull,
the ramp outlined on the bow, and four drop-ship bays as squares on the deck.

**Proportions.** Length 1, width 0.45, height 0.3.

**Bow to stern.**
- 0–15%: flat armoured bow with a hinged ramp outline.
- 15–70%: troop deck; four square hangar hatches on top in a 2×2 grid.
- 30–45%: two light turrets, port and starboard of the deck.
- 60–75%: bridge block on top, aft.
- 75–100%: heavy engine block, four nozzles in a row.

**Armour.** Thick, slab plates, rivet lines in the normal map.
**Lights.** Ramp edge strip, hatch corners, engines.

---

## Support

### Tender (`tender`) — length 36, 5,000 tris, 2k texture

**Does.** Mobile drydock: repairs and refits the fleet away from home.

**Signature from above.** **An open U-shaped cradle**, two long arms with a gap between
them big enough to hold a corvette, joined at the stern. It is the drydock in orbit, made
mobile.

**Proportions.** Length 1, width 0.5, height 0.2.

**Bow to stern.**
- 0–65%: two parallel arms with gantry cranes on their inner edges (4 cranes) and
  floodlights pointing into the gap.
- 65–85%: the joining block: workshops, cargo hatches, the bridge on top.
- 85–100%: two engines either side.
- Optional: a half-finished corvette frame held in the gap (separate object named `hull`).

**Lights.** Floodlights on the arms (pointing inward), welding sparks as tiny emissive
dots, engines.
**Don't.** Don't close the U; the gap is the read.

### Supply Ship (`supply_ship`) — length 40, 4,500 tris, 2k texture

**Does.** Keeps a fleet or a siege supplied far from home.

**Signature from above.** A long spine carrying **rows of cargo containers**, a grid of
coloured boxes from bow to stern, with a small bridge at the front.

**Proportions.** Length 1, width 0.35, height 0.25.

**Bow to stern.**
- 0–15%: bridge and crew module, rounded.
- 15–80%: open truss spine with containers clamped in 3 rows × 6, a few slots empty.
- 40–55%: two fuel spheres on the flanks.
- 80–100%: engine block, two big nozzles.

**Texture.** Containers in muted colours (rust, ochre, teal) so the grid reads.
**Lights.** Bridge windows, engines, one light per container row end.

---

## Heavy line

### Interdictor (`interdictor`) — length 44, 7,000 tris, 2k texture, capital subsystems

**Does.** Pins enemy fleets in the system so they cannot retreat or jump.

**Signature from above.** **Two large gravity-well projector domes** on outriggers either
side of the hull, wider than anything else on it. Reads as "a hull carrying two giant
spheres".

**Proportions.** Length 1, width 0.7 (with domes), height 0.3.

**Bow to stern.**
- 0–30%: armoured wedge bow with two forward turrets (`weapons`).
- 30–60%: the outriggers: one half-sphere projector dome each side on a thick strut
  (`shields`; they are the ship's special system).
- 45–60%: bridge tower with a sensor mast (`sensors`).
- 75–100%: engine block (`engines`).

**Lights.** A ring line around each dome base (emissive), engines, bridge.

### Heavy Cruiser (`heavy_cruiser`) — length 50, 9,000 tris, 2k texture, capital subsystems

**Does.** Fast, hard-hitting, thin-skinned hunter between the cruiser and the battleship.

**Signature from above.** **A long knife**: narrow, very long hull, two big turrets in
a row on the front half, and the engines stretched out at the back. It is the cruiser
pulled longer and slimmer.

**Proportions.** Length 1, width 0.22, height 0.18.

**Bow to stern.**
- 0–20%: long, sharp prow.
- 20–50%: two triple turrets in a line on the centre line (`weapons`).
- 45–60%: low bridge with a sensor spike (`sensors`).
- 55–70%: shield emitter fins, swept back (`shields`).
- 70–100%: three engines in a line, long nozzles (`engines`).

**Armour.** Thinner than the battleship; plates with gaps.

### Siege Ship (`siege_ship`) — length 58, 10,000 tris, 2k texture, capital subsystems

**Does.** Slow, short-ranged; enormous bombardment against planets and stations.

**Signature from above.** **One giant downward gun**, a huge barrel or mortar running
along the centre line that is longer than half the ship, on a squat, wide armoured hull.
It looks like a floating artillery piece.

**Proportions.** Length 1, width 0.45, height 0.35.

**Bow to stern.**
- 0–60%: the main gun barrel, thick, with a muzzle brake, angled 10° down
  (`weapons`).
- 40–70%: the gun's breech housing, a huge box with cooling fins.
- 55–75%: bridge on a raised armoured tower (`sensors`).
- Flanks: heavy armour skirts hanging below the hull line.
- 75–100%: four engines in a square (`engines`).
- Shield emitters: two squat domes at the rear corners (`shields`).

**Lights.** Muzzle glow, cooling fin glow strips (small), engines.
**Don't.** No secondary turrets on top; the single gun is the read.

### Troop Transport (`troop_transport`) — length 52, 8,000 tris, 2k texture, capital subsystems

**Does.** Carries whole armies; the assault ship's big cousin, built for landings in
force.

**Signature from above.** **A row of drop-ship cradles down both flanks**: a long hull
with 6 to 8 landing craft docked side by side along each side, like teeth on a comb.

**Proportions.** Length 1, width 0.5 (with docked craft), height 0.3.

**Bow to stern.**
- 0–15%: rounded armoured bow.
- 15–75%: central hull with docking cradles on both flanks, each holding a small
  wedge-shaped dropship (6–8 per side).
- 30–45%: two point-defence turrets on top (`weapons`).
- 60–75%: command tower (`sensors`).
- Shield emitter strip along the dorsal spine (`shields`).
- 75–100%: engine block (`engines`).

**Lights.** Each dropship gets a tiny engine dot, cradle lights, engines.

### Command Ship (`command_ship`) — length 56, 10,000 tris, 2k texture, capital subsystems

**Does.** A smaller flagship than the dreadnought: command bonuses to the fleet, no
one-per-fleet limit.

**Signature from above.** **A tall command tower with a wide flat array on top**, set on
a sleek wedge hull. Reads as "a wedge with a tall bridge tower in the middle".

**Proportions.** Length 1, width 0.4, height 0.5 (the tower).

**Bow to stern.**
- 0–35%: smooth armoured wedge bow.
- 35–55%: the tower: three stepped decks, rows of windows, topped by a wide flat
  T-shaped communications array (`sensors`).
- 25–40%: two turrets forward of the tower (`weapons`).
- Two shield domes flanking the tower base (`shields`).
- 70–100%: engine block (`engines`).

**Lights.** Rows of tower windows (strips), array tips, engines.

### Mobile Shipyard (`mobile_yard`) — length 75, 12,000 tris, 2k texture, capital subsystems

**Does.** Builds light hulls wherever it parks. A deep-campaign enabler.

**Signature from above.** **An open rectangular frame** with a small ship inside it,
mounted on a heavy keel, so it looks like a slipway that flies. Two long parallel gantry
beams run the full length.

**Proportions.** Length 1, width 0.5, height 0.3.

**Bow to stern.**
- Full length: two gantry beams joined by cross-trusses every 15%.
- 10–60%: a half-built hull in the frame (frames and some plates).
- Travelling cranes on the beams (3).
- 60–80%: the foundry block under the frame, with smoke vents.
- Shields: two emitter towers at the frame corners (`shields`).
- Sensors: a mast at the bow end (`sensors`).
- Weapons: point-defence turrets on the four corners (`weapons`).
- 85–100%: engine block (`engines`).

**Lights.** Floodlights along the beams, welding sparks, engines.

### Dreadnought (`dreadnought`) — length 80, 15,000 tris, 2k texture, capital subsystems

**Does.** The flagship: one per fleet, an aura on the fleet, the most powerful ship.

**Signature from above.** **A long arrowhead with a spinal ridge and stepped turret
terraces**: the battleship's wedge made longer and broader, with three tiers of turrets
rising toward a tall central citadel.

**Proportions.** Length 1, width 0.4, height 0.3.

**Bow to stern.**
- 0–20%: armoured ram bow with a spinal gun muzzle at the tip (`weapons`).
- 15–55%: six turrets in three stepped pairs, each pair higher than the one before
  (`weapons`).
- 50–65%: the citadel, a tall bridge with a crown of sensor spires (`sensors`).
- 55–80%: four shield generator domes in a square around the citadel's rear
  (`shields`).
- 80–100%: a massive engine block with six nozzles in two rows (`engines`).

**Lights.** Citadel windows, spire tips, the spinal muzzle, engines.
**Don't.** Don't let it read as a battleship; length and the terraces are the difference.

### World Breaker (`world_breaker`) — length 110, 15,000 tris, 2k texture, capital subsystems

**Does.** The planet-ruin superweapon project (glassing and breaking worlds).

**Signature from above.** **A ring**: a huge open circular emitter at the bow with
the hull trailing behind it, like a magnifying glass with a handle.

**Proportions.** Length 1 (ring included), ring diameter 0.45 of the length, hull width
0.18, height 0.3.

**Bow to stern.**
- 0–40%: the emitter ring, thick, with focusing prongs pointing inward (`weapons`).
- 40–55%: struts joining the ring to the hull.
- 50–75%: reactor spine with glowing coolant channels.
- 55–70%: command tower (`sensors`).
- Shields: emitters along the struts (`shields`).
- 75–100%: engines (`engines`).

**Lights.** The ring's inner edge (a thin strip), coolant channels, engines. Keep the
glow thin; this one is allowed to be brighter, but not a blob.

---

## Civilians (models only for now; their game behaviour is not built yet)

### Colony Ark (`colony_ark`) — length 70, 8,000 tris, 2k texture

**Does.** Settles a world with a large starting population.

**Signature from above.** **Rotating habitat rings**: two or three big wheels strung
along a central spine. Reads instantly as "people live here".

**Proportions.** Length 1, ring diameter 0.4, height 0.4.

**Bow to stern.** A command module at the bow; three habitat rings on spokes along the
spine (name each ring object with the word `ring` so it can turn like the station's);
a long cargo section; engines.

**Lights.** Lots of small window dots on the rings (texture emissive), engines.

### Mining Barge (`mining_barge`) — length 40, 5,000 tris, 2k texture

**Does.** Harvests asteroid belts and gas giants in place.

**Signature from above.** **A huge grabbing arm or drill at the front and an open ore
hopper**: an industrial digger in space.

**Proportions.** Length 1, width 0.45, height 0.3.

**Bow to stern.** A forward drill head on an articulated arm; an open hopper with ore
chunks inside; refinery towers with smokestacks; a small bridge; two engines. Use a
hazard-stripe texture on the arm.

**Lights.** Work floods on the arm, refinery glow, engines.

### Armed Merchant (`armed_merchant`) — length 38, 4,500 tris, 2k texture

**Does.** A charter-company trader that can defend itself.

**Signature from above.** **A cargo hull with a big company emblem on the deck** and two
turrets bolted on, clearly a civilian ship that got guns.

**Proportions.** Length 1, width 0.35, height 0.25.

**Bow to stern.** A rounded bow with a bridge; a long cargo body with large hatches;
two turrets added on raised mounts (fore and aft); twin engines. Leave a flat square on
the deck for the company emblem decal.

**Lights.** Running lights along the hull, engines.

### Hospital / Prison Ship (`hulk`) — length 46, 5,000 tris, 2k texture

**Does.** Holds prisoners of war or survivors.

**Signature from above.** **A stack of identical blocks**: a long ship made of repeated
modules (cell or ward blocks) with a single central corridor, like a train of boxes.

**Proportions.** Length 1, width 0.3, height 0.3.

**Bow to stern.** A command block; 6 identical module blocks with window rows; a
docking ring for shuttles at mid-ship; engines. One texture can serve both uses: white
with a red band for hospital, grey with a yellow band for prison (texture variant, same
mesh).

**Lights.** Window rows, docking ring, engines.

---

## Checklist

Use section 12 of [model-specs.md](model-specs.md). In addition:
- Hold each class's top view next to its neighbours in the size table and make sure no
  two read the same at 40 px.
- Capital-subsystem classes: five named objects (`engines`, `shields`, `weapons`,
  `sensors`, `hull`) on one material.
- Name the file after the class id (`heavy_cruiser.glb`) and put it in
  `public/models/ships/`.
