# Model specs

A brief for rebuilding every model the tactical battle uses: the five hulls, the two
strike craft, the torpedo, the asteroids and the station. Each spec says what the model is for in
the game, what must read at a glance, its proportions, a bow-to-stern part list, where
weapons go and which way they face, lights, budget, and what the current Blender
version gets wrong.

Where to put the finished files and how to register them: `public/models/README.md`.
Image and Meshy/Tripo prompts: `docs/art/ship-image-prompts.md`.

---

## 1. Rules for every model

### How the battle sees your model

- **Camera:** orthographic, looking down at 36 degrees from vertical. Players see the top
  deck and whichever flank, bow or stern faces the bottom of the screen. Ships turn
  constantly, so every side gets seen. The belly almost never does.
- **On-screen size:** the whole 1600 by 1000 battlefield fits the window, at roughly 0.85
  to 1.2 pixels per battle unit on a laptop or 1080p screen. Players can zoom in, but
  most of a battle is watched zoomed out.

| model | length in battle units | on screen, zoomed out |
| --- | --- | --- |
| corvette | 20 | 17 to 24 px |
| destroyer | 30 | 26 to 36 px |
| cruiser | 42 | 36 to 51 px |
| carrier | 55 | 47 to 66 px |
| battleship | 60 | 51 to 72 px |
| strike craft | 4 | 3 to 5 px |
| torpedo | 7 | 6 to 8 px |
| asteroid | 3 to 12 across | 3 to 14 px |
| station | 70 across | 60 to 84 px |

So the order of importance is: **silhouette from above first, big masses second, mid
detail third, greebles last.** A hull that reads only through its greebles will turn to
mush at 40 pixels.

- **Each class needs one signature shape** that tells it apart from above at a glance.
  The specs below name it. Protect it over everything else.

### Orientation, pivot and scale

- In Blender (Z up): bow along **+X**, top deck along **+Z**, port (left side) along **+Y**.
- Scale is free. The loader stretches the model so its length along X matches the class
  length above. Width and height scale with it, so **the proportions you model are the
  proportions players get**.
- The pivot, where the ship "is" for movement, clicks and its shield ring, sits **40% of
  the way from the stern**. The loader puts it there for you. So 60% of the length is
  ahead of the pivot. Put the visual weight a little forward, or the ship will look like
  it rotates around its nose.
- Centre it left to right, and keep it roughly centred top to bottom. The ground plane
  (where the shield ring, hull bar and selection circle are drawn) cuts through the
  vertical middle of the hull.

### Mesh

- One material, closed, no floating parts. Every mesh gets merged into one so all ships
  of a class draw in a single batch. Capital hulls should still be split into the named
  subsystem objects (see Capital subsystems below) before export; escorts may be one
  object.
- Mirror-symmetric left to right, unless the class spec says otherwise.
- Hard-surface: flat faces, bevelled edges. The loader recomputes normals as faceted, so
  avoid relying on smooth shading.
- Triangle budget per model is in each spec. Under budget is fine; the current hulls use
  under half.

### Materials and textures

- One PBR material: base colour, normal, roughness, metallic, emissive. Other maps are
  ignored.
- Texture size per spec, usually 2k. One UV layout per model; trim sheets work well.
- Panel lines, rivets, vents and hatch outlines belong in the **normal map**, not the
  mesh. They read as texture at 40 px and cost no triangles.
- **Base colour:** generic hulls stay faction-neutral: gunmetal greys with slight warm
  and cool variation per plate, a little wear on edges. Faction hulls carry their
  faction's paint (section 7).
- **Emissive map:** running lights, windows, engine mouths, weapon muzzles, emitters. Keep
  it white or light grey. The game recolours emissive per side of the battle, indigo for
  the player and red for the enemy, so you never pick the light colour yourself.
- Keep emissive areas small and bright. A large glowing area turns the whole ship into a
  coloured blob when zoomed out.

### Export

File, Export, glTF 2.0. Format "glTF Binary (.glb)". "+Y Up" on. "Apply Modifiers" on.
Compression off. Textures embedded.

### Capital subsystems

Cruisers, battleships and carriers have four targetable subsystems: **engines, shields,
weapons, sensors**. Players pick one when they order a called shot. Each must have a
clearly visible home on the model, so a player can look at a ship and see what they
are shooting at:

- engines: the stern engine block
- shields: emitter pylons, domes or rings
- weapons: the main turrets or the spinal mount
- sensors: a mast, dish or dome cluster

Keep these four in different places on the hull.

**Name them, and the game shows their damage.** Split the model into up to five objects
before export: `engines`, `shields`, `weapons`, `sensors`, and `hull` for everything
else. The loader tags each vertex from its object (or mesh, or parent) name, so any name
containing `engine`, `shield`, `weapon` or `sensor` counts: `Engines`, `engine_block`
and `weapons.001` all work. During a battle a damaged subsystem darkens and chars toward
black, its lights flicker and then go out when it is knocked out, and it smokes, burns
and sparks from where its parts are. Hull damage scorches the whole ship. You don't
model any of this; the code does it from the names. Broken-part variants are not needed.

A model without these names still works, but it only gets hull-wide damage: scorching
as it loses hull, and no part going dark. Keep the objects separate in the export (all
on the one shared material); the loader merges them for drawing after tagging.

---

## 2. Corvette

**Role in battle.** The fast flanker and the cheapest ship (1 deployment point). Top speed
120, turns at 3.0 rad/s, the most agile hull by far. 60 hull, 40 shields, almost no
armour (10% fore, 8% sides, 5% aft). One light turret that fires all round at 180 range
and can shoot strike craft. Ability: **Afterburner**, plus 80% speed for 5 seconds. Dies
in about four seconds of focused fire. Players use corvettes to screen, chase bombers and
flank.

**Signature from above.** A thin dart with two big engines. It should look like it is
mostly engine.

**Proportions.** Length 1. Width about 0.55 including fins, 0.15 for the hull body.
Height about 0.18. Plan shape: a narrow needle hull with two fat nacelles spread either
side of the rear half, and short swept fins outboard of those.

**Bow to stern** (percent of length from the bow):

- **0 to 35%, nose.** Long tapered needle, almost a point. A small sensor tip or bow
  light at the very front.
- **25 to 40%, cockpit.** Low, narrow, wedge-shaped bridge on top, slightly forward of
  the turret, with a window strip across its front.
- **35 to 55%, turret.** One compact twin-barrel turret on the dorsal spine, barrels
  forward when idle. It turns all the way round in battle, so give it a clean round
  base.
- **30 to 60%, tanks.** Two exposed cylindrical fuel tanks along the hull flanks, plus
  a few pipes. This is a light, fragile ship; let the structure show.
- **45 to 100%, nacelles.** Two oversized engine nacelles on short pylons, each about as
  long as half the ship and three times the hull's width. Pointed intakes at the front,
  big flared nozzles at the back. They define the silhouette.
- **55 to 85%, fins.** Thin swept fins outboard of the nacelles, raked back, with a light
  at each tip.

**Armour.** Barely any. Thin plates, open frames, nothing that looks heavy.

**Lights (emissive).** Two engine mouths (largest), bow tip, cockpit strip, fin tips.

**Ability hook.** Afterburner: the nozzles should be deep enough that a brighter, longer
glow sprite reads as coming out of them.

**Budget.** 3,000 triangles, 1k texture.

**Don't.** Don't add a second turret or heavy armour; that is the destroyer. Don't make
the nacelles small; at 20 px they are the only thing anyone sees.

**Current Blender version.** Reads right but the nacelles are plain cylinders and the
needle hull is a bare box. Push the intake shapes, nozzle flares and the fin rake.

---

## 3. Destroyer

**Role in battle.** The aggressive forward hitter and anti-capital torpedo boat (3
deployment points). Speed 90, turns at 2.0. 130 hull, 80 shields. Armour is front-heavy:
18% fore, 10% sides, 6% aft. Its two ship weapons **both point forward**, plus one
small turret for strike craft:

- **Forward guns:** fixed, 70-degree cone straight ahead, 260 range. Ships only.
- **Torpedo launcher:** 40-degree cone straight ahead, 420 range, 45 damage per torpedo,
  every 9 seconds.
- **Point defence:** one small turret that turns all the way round, 130 range. It shoots
  strike craft only, never ships.

Ability: **Torpedo Salvo**, three torpedoes at once. Destroyers have to point at their
target to fight, and they show their weak stern when they turn away.

**Signature from above.** A knife aimed forward: a sharp wedge with two long guns
sticking out ahead of the bow.

**Proportions.** Length 1. Width about 0.22. Height about 0.17. Plan shape: a long
triangle that is widest a third of the way back, then a narrow, skeletal rear.

**Bow to stern:**

- **0 to 10%, gun muzzles.** Two heavy fixed cannons, one each side of the bow, their
  muzzles level with or slightly ahead of the prow tip. Muzzle brakes on the ends,
  lit muzzle bores.
- **0 to 45%, wedge.** The main hull, a sharp wedge with a pointed prow, sloping down to
  the tip.
- **10 to 40%, stacked armour.** Three or four stepped armour plates stacked on the bow,
  each smaller than the one below, all angled to the front. This is the heaviest part of
  the ship.
- **10 to 25%, torpedo tubes.** Four tube mouths in a row under the chin, facing forward,
  lit inside. Mostly hidden from above; they show when the destroyer faces the camera.
- **15 to 45%, gun housings.** The cannons sit in long armoured housings along the bow
  flanks.
- **40 to 55%, bridge.** A small armoured bridge right behind the stacked plates, with a
  window strip and one antenna.
- **50 to 60%, point defence.** One small single-barrel turret on the spine with a clean
  round base, since it turns all the way round. It is a weapon hardpoint in battle, so
  it should read as a turret from above.
- **55 to 85%, skeletal rear.** A narrow spine with exposed ribs and side rails, a raked
  dorsal fin. Visibly lighter and more fragile than the front.
- **85 to 100%, engines.** A compact engine block and two big engines side by side.

**Armour.** Thick and layered at the front, thin and open at the back. The 18% to 6% gap
should be visible.

**Lights.** Two engine mouths, two cannon bores, four torpedo tube mouths, bridge strip,
bow light.

**Ability hook.** Torpedo Salvo: the four tubes are where three torpedoes appear. Give
them a clear dark frame so a muzzle flash reads.

**Budget.** 5,000 triangles, 2k texture.

**Don't.** No broadside turrets; all its ship firepower points forward, and the point
defence turret stays small. Don't make the guns so
long that the hull shrinks: the loader scales the whole model by its total length,
barrels included.

**Current Blender version.** Good knife silhouette. The rear skeleton is very thin and the
bridge is a plain box. Add more frame detail to the rear and an angular bridge.

---

## 4. Cruiser

**Role in battle.** The flexible line ship and the reference size for every other hull (4
deployment points). Speed 70, turns at 1.4. 210 hull, 150 shields. Armour 22% fore, 16%
sides, 10% aft. Has targetable subsystems. Weapons:

- **Port battery:** 100-degree arc centred on the left beam, 300 range.
- **Starboard battery:** 100-degree arc centred on the right beam, 300 range.
- **Point defence:** fires all round at 140 range, shoots strike craft.

Ability: **Overcharge Shields**, 60% less damage taken for 8 seconds while its weapons go
offline. Cruisers fight broadside-on: they turn their side to the enemy.

**Signature from above.** A rectangle with three turrets down each side.

**Proportions.** Length 1. Width about 0.4 including the sponsons. Height about 0.3 to the
top of the tower. Plan shape: a long rectangular hull with a pointed bow, a broad flat
deck, and battery sponsons running down both flanks.

**Bow to stern:**

- **0 to 15%, prow.** A short pointed wedge, lower than the deck, with a bow light.
- **10 to 25%, fore deck.** A raised forward deck with two point-defence turrets on the
  centreline.
- **15 to 75%, broadside batteries.** The signature. A sponson down each flank, each
  carrying **three twin-gun turrets** evenly spaced, barrels pointing out to the side
  and slightly forward when idle. Armour plates step down the outside of each sponson.
- **15 to 80%, main deck.** A broad flat deck covering the hull, wider than the hull
  itself because it carries the batteries. Hatches, vents and deck equipment as
  texture.
- **20 and 75%, shield emitters.** Four emitter pylons, two per side, standing up off
  the deck between the batteries and the centreline, each topped with a glowing
  emitter cap. This is the shields subsystem.
- **40 to 55%, command tower.** A stepped tower amidships, two or three tiers, a wide
  bridge on top with a window strip, a sensor mast and a dish behind it. This is the
  sensors subsystem.
- **75 to 85%, aft point defence.** Two rear-facing point-defence turrets on the
  centreline.
- **80 to 100%, engines.** A wide engine block and three engines: one large in the
  centre, two smaller either side.

**Armour.** Even and solid, slightly thicker at the bow. A workhorse, not a brick.

**Lights.** Three engine mouths, four emitter caps, bridge strip, sponson tip running
lights, bow light.

**Ability hook.** Overcharge Shields: the four emitter caps are where a shield-flare
effect would start.

**Budget.** 8,000 triangles, 2k texture.

**Don't.** Don't put the main guns on the centreline; the cruiser's identity is two
broadsides. Don't let the tower dominate the battleship's look; keep it compact.

**Current Blender version.** The best of the five. Turrets are simple, the deck is flat
and empty apart from boxes. Add deck texture, better turret housings and a clearer
emitter shape.

---

## 5. Battleship

**Role in battle.** The slow, devastating fleet centrepiece (7 deployment points). Speed
50, turns at 0.8, the slowest-turning gun ship. 400 hull, 240 shields. Armour is
extremely front-heavy: **45% fore, 25% sides, 10% aft**. Has targetable subsystems.
Weapons:

- **Spinal lance:** a 14-degree cone straight ahead, 500 range, 65 damage every 7
  seconds. The longest-range, hardest-hitting weapon in the game. The whole ship has to
  turn to aim it.
- **Port and starboard batteries:** 100-degree arcs on each beam, 320 range.
- **Rear turret:** 90-degree arc straight back, 220 range, shoots strike craft.
- **Point defence net:** all round, 130 range, shoots strike craft.

Ability: **Emergency Repairs**, restore 20% hull over 8 seconds at half speed. Its stern
is its weak spot; enemies try to get behind it.

**Signature from above.** A long, heavy hull with a massive gun barrel running down the
middle and out of the bow.

**Proportions.** Length 1. Width about 0.35 including sponsons. Height about 0.25 to the
bridge roof, 0.33 to the mast tip. Plan shape: long, heavy, blunt-nosed, with a wide
stern engine block.

**Bow to stern:**

- **0 to 5%, lance muzzle.** The spinal lance's muzzle sticks out ahead of the prow: a
  heavy barrel with a muzzle ring and a large glowing bore. The single brightest light
  on the ship.
- **3 to 15%, armoured prow.** A blunt, thick, layered prow, three or more armour
  plates stacked and angled forward, much heavier than anything else on the ship.
- **5 to 90%, lance housing.** The lance runs along the centreline on top of the hull,
  in a raised armoured housing with **coil rings** spaced along it. This is the weapons
  subsystem. It is also the signature, so it must stay visible from above end to end.
- **15 to 80%, two tiers of broadsides.** A lower tier of three twin turrets on
  sponsons down each flank, and an upper tier of three larger triple turrets on the
  deck edges, both pointing out to the sides. Heavy armour plates step down the outer
  hull.
- **20 and 80%, point defence.** Small single turrets scattered on all four corners of
  the deck.
- **55 to 70%, bridge tower.** Tall, set well back behind the guns: two tapered tiers,
  wide bridge wings with a window strip, a tall mast with a crossbar and a dish. This is
  the sensors subsystem.
- **70 to 80%, rear turret.** One large triple turret on the stern deck, facing aft.
- **Shield emitters.** Add two to four shield projector domes or rings on the deck
  between the upper turrets. The current version has four small domes there; they can
  be bigger and more distinctive.
- **80 to 100%, engine block.** A massive square block with **six engines** in two
  rows of three. Lightly armoured: the back of the block is the ship's weak point.

**Armour.** Visibly thickest of any ship at the bow, heavy on the flanks, thin at the
stern. Players should be able to see that shooting it from behind is the plan.

**Lights.** Lance bore (largest), six engine mouths, bridge strip, sponson running lights,
shield emitter domes.

**Ability hook.** Emergency Repairs: an open hull section or crane rig near the bridge
where repair sparks could show.

**Budget.** 12,000 triangles, 2k texture.

**Don't.** Don't hide the lance under the deck or the towers; from above it must run the
whole length. Don't put a turret forward of the bridge on the centreline; that space
belongs to the lance.

**Current Blender version.** Strong silhouette, but the shield emitters are small plain
domes, the coil rings are plain cylinders and the engine block is a bare box. Better
emitters, coils and engine block detail.

---

## 6. Carrier

**Role in battle.** The floating airbase (6 deployment points). Speed 45, turns at 0.7,
the slowest and least agile hull. 300 hull, 180 shields, even 15% armour front and
sides, 10% aft. Has targetable subsystems. Its only gun is a **point defence grid** that
fires all round at 160 range. It fields one interceptor and one bomber squadron, six
craft each, and rebuilds a lost squadron after 25 seconds. Ability: **Rapid Relaunch**,
rebuild and launch every lost squadron at once. It stays far behind the line and depends
on escorts.

**Signature from above.** A wide flat slab with two long glowing hangar trenches down its
sides and a runway down the middle.

**Proportions.** Length 1. Width about 0.42. Height about 0.15 to the deck, 0.2 to the
tower. Plan shape: a wide, flat rectangle with a short pointed bow under the deck.

**Bow to stern:**

- **0 to 12%, bow.** A low, blunt wedge under the front of the flight deck.
- **5 to 90%, flight deck.** The central deck runs almost the whole length, the
  flattest and widest single surface in the game. A dashed line of runway lights down
  the centreline. Deck markings (arrows, numbers, hazard stripes) go in the texture.
- **10 to 80%, hangar trenches.** The signature. An open trench down each flank between
  the deck and an outer wall. Inside: a floor with launch rails and two lit strips, and
  roof ribs across the top every so often. The lit strips are what reads from above, so
  they must run the full trench length.
- **10 to 80%, outer walls.** A tall armoured wall closing each trench on the outside,
  with three small point-defence turrets on top, facing out. This is the weapons
  subsystem.
- **15 to 35%, parked craft.** Four strike craft parked on the forward deck, for scale.
  Make them the same shape as the craft model.
- **60 to 75%, island.** A low sensor tower set to one side (the current version uses
  starboard, the right side), with a window strip, a mast and a dish. This is the
  sensors subsystem, and the one allowed asymmetry.
- **Shield emitters.** Two shield domes on the outer walls or the deck corners. The
  current version has a small one on each outer wall.
- **85 to 100%, engine block.** A wide block with **four engines** in a row.

**Armour.** Even and moderate. Thin enough that it looks like it should not be at the
front.

**Lights.** Hangar strips (largest area, but thin), runway lights, four engine mouths,
island strip, wall running lights.

**Ability hook.** Rapid Relaunch: the trench mouths at the bow end are where craft
launch from. Give them clear openings.

**Budget.** 10,000 triangles, 2k texture.

**Don't.** No heavy guns. Don't light the whole trench floor; thin strips only, or the
carrier becomes a coloured slab.

**Current Blender version.** Clear silhouette but very plain: flat deck, empty walls,
token shield domes. The most room to improve of the five.

---

## 7. Faction hulls

Each faction can replace any of the five hulls with its own (slot `factions.<id>.<class>`
in the manifest). The rules:

- **Keep the class signature** and the gameplay layout: the destroyer still points all
  its guns forward, the cruiser still has two broadsides, the battleship still has a
  centreline lance, the carrier still has two hangar trenches, the corvette is still
  mostly engine.
- **Keep the proportions** within about 20% of the class spec, so the ship sits in its
  shield ring and clicks land on it.
- **Change the styling:** hull language, materials, paint. Paint goes in the base colour
  map. Lights stay white in the emissive map, because the game tints them by side.

Style starting points, taken from each civilisation's lore:

| faction | id | hull language |
| --- | --- | --- |
| Aurelian Hegemony | `faction-aurelian` | Clean, wealthy, cooperative: ivory and gold plate, smooth curves, many windows. |
| Vektori Technocracy | `faction-vektori` | Martial houses: angular heraldic armour, house banners as paint, rows of guns. |
| Nullward Syndicate | `faction-null-syndicate` | Guild money: bolted-on cargo pods, mismatched paint, ornate trade markings. |
| Altaris Covenant | `faction-covenant` | Energy beings and faith: thin frames around glowing cores, spires, halo rings. |
| Rhimetals | `faction-rhimetals` | Floating spires above a storm world: tall vertical fins, wing shapes, crowned prows. |
| Gabagoonians | `faction-gabagoonians` | Food-court culture: chunky rounded hulls, warm colours, signage, a little absurd. |
| Infernoids | `faction-infernoids` | Forged in volcanoes: black iron, spikes, glowing seams, furnace stacks. |
| Movanites | `faction-movanites` | Crushing gravity: low, squat, very thick hulls, buttresses, bureaucratic stencils. |
| Leopantheri | `faction-leopantheri` | Stone citadels and prayer wheels: carved stone-look plating, gold, ring motifs. |
| Buthari | `faction-buthari` | Mist cliffs: layered terraced hulls, soft muted colours, carved-cliff look. |
| Sarrak | `faction-sarrak` | Swamp legions: bone ornaments, Roman-style shields as plating, bioluminescent veins. |
| Kaer'Ruun | `faction-kaerruun` | Apex hunters: claw-like prows, dark matte hulls, trophy racks, predator shapes. |
| Nexulan Convergence | `nexulan_convergence` | A star-enclosing laboratory: perfect geometry, white panels, lattices, no clutter. |
| Banking Clan | `banking_clan` | Merchant republic: Venetian-galley lines, polished brass, crests, sterncastles. |
| Pirates | `faction-pirates` | Stolen and patched: mismatched plates from other factions, scrap, warning paint. |

The three hulls that show most in a battle are the cruiser, battleship and carrier.
Start a faction with those.

---

## 8. Strike craft

Two slots, `craft.interceptor` and `craft.bomber`. Each squadron is six craft flying in a
loose cluster about 18 units across. On screen each craft is **3 to 5 pixels long**, so
this is a pure silhouette job.

### Interceptor

**Role.** Fast anti-craft fighter: speed 165, short range (90), strong against other
squadrons, weak against ships, 10 hit points per craft.

**Shape.** A slim arrowhead or forward-swept dart. Length 1, width about 0.7, height
about 0.15. Pointed nose, single cockpit bubble two-thirds forward, two thin wings set
back, one engine. Small wing-tip guns.

**Lights.** Engine mouth only.

**Budget.** 600 triangles, 512 px texture.

### Bomber

**Role.** Heavy anti-ship attacker: speed 125, 80 range, strong against ships, punches 40%
of its damage through shields, weak against craft, 12 hit points per craft.

**Shape.** Visibly bulkier than the interceptor at the same length. Length 1, width about
0.8, height about 0.25. A blunt, wide body with a belly ordnance pod or two underwing
torpedoes, short stubby wings, two engines.

**Lights.** Two engine mouths.

**Budget.** 600 triangles, 512 px texture.

**The one rule for both.** They must look different from each other as tiny shapes:
interceptor thin and pointed, bomber fat and blunt. Make the parked craft on the
carrier deck match.

---

## 9. Torpedo

**Role.** Fired by destroyers (one every 9 seconds, three in a salvo) at 130 units per
second, 45 damage each. Homes on its target and self-destructs if it misses.

**Shape.** Length 1, width and height about 0.2. A pointed warhead, a cylindrical body,
four small tail fins, a nozzle at the back. Point it along +X.

**How it is drawn.** Unlit and solid bright in the side's colour, with a soft glow
around it. Textures are ignored, so only the outline matters.

**Budget.** 300 triangles, no texture.

---

## 10. Asteroids

**Role.** Rocks inside asteroid-field hazards. A field holds 18 to 60 of them, each drawn
at a random size (1.6 to 6 units radius), squash and spin. Ships inside a field slow to
55% speed, and beam weapons cannot fire through one (torpedoes and strike craft can).
So the rocks must look solid and in the way.

**How many.** Make three to six. The game cycles them across fields, so variety beats
detail.

**Shapes.**

1. **Lumpy:** roughly round, heavily cratered.
2. **Elongated:** potato-shaped, with one flat sheared face where it split off something
   larger.
3. **Shattered:** sharp angular facets, a fresh fracture.
4. Optional: **metallic**, darker with shiny exposed ore veins.
5. Optional: **icy**, pale and cracked.
6. Optional: **two-lobed**, two rocks fused together.

**Size.** Any. The loader scales each to the same bounding radius, then the game varies
the size.

**Look.** Grey-brown stone, craters and pits in the normal map, sharper edges than a
pebble. No glow.

**Budget.** 400 triangles each, 1k texture. One shared texture across all of them is
fine.

---

## 11. Station

**Role.** The system's station or shipyard, standing behind the defender's deployment
line near their edge of the field, off the lanes the ships use. It is scenery for now:
nothing collides with it, it has no hull and no guns. It tells the player where they
are fighting and whose ground it is. One model serves both kinds.

**Signature.** A ring. From the 36-degree camera it reads as a wide ellipse with a hub
in the middle, which nothing else on the field looks like.

**Orientation.** Ring flat in the **XY plane, Z up** in Blender, hub at the origin. The
loader centres the model on all three axes and scales it so its widest extent in X or
Y is 70 battle units; Z scales with it. Keep the height well under the width, say a
fifth, or the spire will poke out of the ellipse too far.

**Parts, inside out.**

1. **Hub:** a short cylinder or drum, about a sixth of the ring diameter, the station's
   core.
2. **Spokes:** three or four, hub to ring. Thin.
3. **Ring:** the habitat ring, tube thickness about a tenth of its radius, with a few
   blocks or modules sitting on it so the turn is visible.
4. **Spire or mast:** above the hub along +Z, antennae and a dish below.
5. **Docking arms:** one or two open gantries out past the ring along +X or -X, long
   enough that a cruiser (42 units) could sit in one. These make it a yard at a glance.

**Name the moving parts `ring`.** The loader tags every vertex of any object, mesh or
parent whose name contains `ring`, and the renderer turns those about the station's
vertical axis, one turn in about two minutes. Put the ring, its spokes and the modules
on it under one parent called `ring`; leave the hub, spire and docking arms out of it.
Nothing else needs a name.

**Lights.** Windows along the ring and the hub, a row of landing lights down each
docking arm, in the emissive map, white or grey. The renderer colours them by the
owner's side like a hull's running lights.

**Look.** Grey-white hull plating like the ships, a little lighter so it reads as
civilian or industrial. No faction colours in the base map.

**Budget.** 6k triangles, 2k texture, one material.

---

## 12. Checklist before you drop a model in

- [ ] Bow along +X, top along +Z, port along +Y in Blender (station: ring in XY, Z up).
- [ ] One material, no floating parts.
- [ ] Capital hulls split into objects named `engines`, `shields`, `weapons`, `sensors`
      and `hull` (untagged models only get hull-wide damage).
- [ ] The class signature reads in a 40-pixel top-down render.
- [ ] Weapons face where the spec says.
- [ ] Capital hulls show engines, shields, weapons and sensors in four separate places.
- [ ] Lights are in the emissive map, white, small.
- [ ] Under the triangle budget.
- [ ] Exported as .glb, +Y Up, modifiers applied, no compression.
- [ ] Registered in `public/models/manifest.json`, checked at `/test/tactical`.

To check the 40-pixel rule in Blender: set an orthographic top camera, render at 64 by
64 pixels, and look at it at actual size.
