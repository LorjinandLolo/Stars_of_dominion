# Ship and space-feature image prompts

Concept images for the five tactical hulls (`lib/tactical/ship-defs.ts`) plus battlefield
dressing, written for an image generator whose output will be fed to an image-to-3D tool
(Meshy, Tripo, Rodin, Hunyuan3D) and then into the 2.5D three.js battle renderer.

## Why the prompts look the way they do

The battle camera is top-down with a fixed pitch. The top surface and silhouette carry
almost all the readability, so every ship prompt asks for a high three-quarter view and a
separate top-down view. Image-to-3D tools fail on busy backgrounds, lens flares, stars,
motion blur and cropped hulls, so every prompt forbids those. Faction identity is applied at
runtime as a material tint and emissive colour, so hulls are generated faction-neutral:
dark grey plating with a single accent-light colour that the pipeline remaps.

Generate each ship as a set:

1. Hero: three-quarter front view, slightly above (the prompt below).
2. Top-down orthographic view, same prompt with the view line swapped.
3. Side profile, same prompt with the view line swapped.

Feed all three to the 3D tool when it accepts multi-view input. Keep the seed fixed within a
set when the generator allows it.

## Shared style block

Paste this at the end of every ship prompt (about 280 characters, fits tools with a
short prompt limit).

```
Hard-surface military sci-fi starship, gunmetal grey plating, panel lines, greebles, cyan
running lights only. No markings, no text. Single object centred, fully in frame, plain
flat dark grey background, no stars, no flare, no blur. Soft studio lighting,
photorealistic PBR, sharp.
```

Negative prompt. Only some tools have a separate box for things to avoid (Meshy, Tripo,
Stable Diffusion UIs); Midjourney takes it inline as `--no ...`; Higgsfield and most video
tools have none, skip it there:

```
background scenery, stars, space, nebula, planet, lens flare, bloom, motion blur, text,
logo, watermark, multiple ships, cropped, out of frame, cartoon, anime, low poly,
wireframe, blurry, duplicate, deformed, symmetrical mirror artefact
```

## The five hulls

Scale note for the 3D tool: corvette radius 8, destroyer 12, cruiser 17, carrier 22,
battleship 24 in sim units. Model length ratio roughly 1 : 1.6 : 2.4 : 3.2 : 3.4. Keep the
cruiser as the reference size.

### Corvette (fast flanker, one light turret, afterburner)

```
Three-quarter front view from slightly above of a small fast military corvette starship.
Narrow dart-shaped hull, long and thin, with a single compact gun turret on the dorsal
spine. Oversized twin engine nacelles at the rear, large exhaust nozzles glowing cyan,
making the ship look like it is mostly engine. Thin swept stabiliser fins. Minimal
armour, lightweight frame, a few exposed fuel tanks and pipes. Reads as quick and
fragile.
```

### Destroyer (forward guns, torpedo tubes, torpedo salvo)

```
Three-quarter front view from slightly above of a military destroyer starship. Wedge-shaped
aggressive hull with a sharp prow. Two heavy fixed forward cannons mounted either side of
the bow, barrels pointing straight ahead. A row of four torpedo tube hatches set into the
chin under the bow. Angular armour plates stacked toward the front, lighter and more
skeletal toward the rear. Two main engines with cyan exhaust. Reads as a knife aimed
forward.
```

### Cruiser (port and starboard batteries, point defence, overcharged shields)

```
Three-quarter front view from slightly above of a military cruiser starship, the workhorse
line ship. Long rectangular hull with a flat broad dorsal deck. Three heavy gun turrets
along each flank, port and starboard, in armoured broadside batteries. Small point-defence
turrets scattered along the spine. A raised command tower amidships with sensor arrays.
Four shield emitter pylons, two per side, slightly glowing cyan. Balanced proportions,
heavy but not slow looking. Three engine nozzles at the stern.
```

### Battleship (spinal lance, broadsides, rear turret, heavy frontal armour)

```
Three-quarter front view from slightly above of a massive military battleship starship, the
fleet centrepiece. Extremely long heavy hull built around one enormous spinal cannon
running the full length of the ship, its muzzle opening at the bow glowing cyan. Thick
layered frontal armour, blunt reinforced prow, armour thinning toward a lightly protected
stern. Two tiers of heavy broadside turrets on each flank. A single large rear turret on
the stern deck. Point-defence turrets everywhere. Tall bridge superstructure set well back.
Massive engine block with six nozzles. Reads as slow, brutal and almost impossible to
kill from the front.
```

### Carrier (hangar bays, point defence only, launches interceptors and bombers)

```
Three-quarter front view from slightly above of a military carrier starship. Wide flat hull
like an oblong slab, dominated by two long open hangar bays running along each flank with
visible launch rails and interior lights glowing cyan. Flight deck markings on top. No
heavy guns at all, only small point-defence turrets along the edges. Large sensor and
communications arrays on a low tower at the rear. Four engines. A few tiny strike craft
parked on the deck for scale. Reads as a floating airbase that needs escorts.
```

### Strike craft (one shared model for interceptor and bomber, tinted per type)

```
Three-quarter front view from slightly above of a tiny single-seat military space fighter.
Compact arrowhead body, one cockpit canopy, two small wing stubs with weapon pods, single
engine with cyan exhaust. Simple silhouette readable at very small size.
```

## Space features

### Asteroids (generate three, different seeds)

```
Three-quarter view of a single large irregular rocky asteroid. Cratered grey-brown stone
surface with fractured edges, pits and mineral veins, no ice. Fully in frame, centred.
Plain flat dark charcoal background, no stars, no other rocks. Even studio lighting with
soft key light from the upper left. Photorealistic PBR rock material, 8k, sharp focus.
```

Variant lines for the second and third: "elongated potato shape with one flat sheared
face" and "roughly spherical with a deep impact crater on one side".

### Space station (optional orbital dressing, one model)

```
Three-quarter view from slightly above of a modular military space station. Central
cylindrical hub with a rotating ring, four docking arms with gantries, solar panel wings,
antenna masts, cyan window lights. Same hard-surface gunmetal style as the ships. Single
object, centred, plain flat dark charcoal background, no planet, no stars.
```

### Nebula backdrop (a texture, not a model)

Rendered as a flat image plane under the ships, so this is a square texture.

```
Top-down view of a soft diffuse purple and magenta space nebula cloud, wispy and
translucent, fading to transparent black at the edges, no stars, no bright core, no lens
flare, square composition, painterly volumetric gas, subtle, low contrast, suitable as a
semi-transparent overlay.
```

### Starfield backdrop

```
Deep space star field seen straight on, dense scattering of tiny white and pale blue stars
on near-black, no nebula, no planets, no large bright stars, no lens flare, evenly
distributed, tileable square texture.
```

### Planet (background disc under the field, optional)

```
Full disc of a terrestrial planet seen from orbit, centred on a plain black background,
blue oceans, green-brown continents, scattered white cloud bands, thin bright atmosphere
rim on the lit edge, terminator line on the right third, no stars, no text.
```

## After generation

- Reject any image where part of the hull leaves the frame or the background is not flat.
- Reject images with mirrored-duplicate artefacts (two bridges, two prows).
- Run the three-view set through the 3D tool, export glTF.
- Decimate to budget: corvette 3k tris, destroyer 5k, cruiser 8k, carrier 10k, battleship
  12k. One 2k albedo plus normal and metallic-roughness texture per hull.
- Mark the accent-light areas in a separate emissive mask so the renderer can tint them
  per faction.
- Orient every model with the bow along +X and the dorsal side along +Y before export; the
  sim heading is 0 along +X.

## Prompts for the 3D tools (Meshy, Tripo, Rodin, Hunyuan3D)

Two routes. Image-to-3D with the three-view set above gives the most control and is the
one to use for the hulls. Text-to-3D is a fallback when a view set will not converge; the
tools want short shape-first prompts, so these are compressed versions of the image
prompts with the lighting and background language stripped.

Settings that matter, whichever tool:

- Mode: image-to-3D, multi-view where offered (Meshy "multi-image", Tripo "multiview").
  Upload hero, top-down and side views in that order.
- Symmetry: on (every hull is mirror-symmetric about its length).
- Topology: triangles, target face count per the budget table below.
- Texture: PBR on, 2k; ask for emissive or "lights" map if offered.
- Art style: realistic / hard surface. Never "cartoon", "low poly" or "stylised".
- Remesh and retopology: on if offered. Tripo's "smart low poly" is fine for the corvette
  and destroyer only.
- Export: glb, embedded textures, no Draco.

| class | target faces |
| --- | --- |
| corvette | 3000 |
| destroyer | 5000 |
| cruiser | 8000 |
| carrier | 10000 |
| battleship | 12000 |
| strike craft | 600 |
| asteroid | 400 |

Negative prompt for tools that take one:

```
cartoon, low poly, stylized, hollow, floating parts, disconnected pieces, text, logo,
flat, 2d, mirrored duplicate bridge, double prow, base, stand, pedestal
```

### Text-to-3D prompts

Corvette:

```
hard surface sci-fi military corvette starship, narrow dart hull, single dorsal gun
turret, two oversized engine nacelles at the rear, thin swept fins, exposed fuel tanks
and pipes, gunmetal grey armour plates with panel lines, cyan running lights, solid
single mesh, symmetric
```

Destroyer:

```
hard surface sci-fi military destroyer starship, wedge hull with sharp prow, two fixed
heavy forward cannons flanking the bow, four torpedo tube hatches under the chin, angular
stacked armour at the front, skeletal rear, twin engines, gunmetal grey with panel lines,
cyan running lights, solid single mesh, symmetric
```

Cruiser:

```
hard surface sci-fi military cruiser starship, long rectangular hull with broad flat
dorsal deck, three heavy gun turrets per flank in armoured broadside batteries, small
point defence turrets along the spine, raised command tower amidships with sensor arrays,
four shield emitter pylons, three stern engines, gunmetal grey with panel lines, cyan
running lights, solid single mesh, symmetric
```

Battleship:

```
hard surface sci-fi military battleship starship, very long heavy hull built around one
enormous spinal cannon with the muzzle at the bow, thick layered frontal armour and blunt
prow, two tiers of broadside turrets per flank, one large rear turret, tall bridge
superstructure set back, massive six nozzle engine block, gunmetal grey with panel lines,
cyan running lights, solid single mesh, symmetric
```

Carrier:

```
hard surface sci-fi military carrier starship, wide flat slab hull, two long open hangar
bays along each flank with launch rails, flight deck markings on top, small point defence
turrets only, low sensor tower at the rear, four engines, gunmetal grey with panel lines,
cyan running lights, solid single mesh, symmetric
```

Strike craft:

```
tiny hard surface sci-fi single seat space fighter, compact arrowhead body, one cockpit
canopy, two short wing stubs with weapon pods, single engine, gunmetal grey, cyan engine
glow, solid single mesh, symmetric, very simple silhouette
```

Asteroid (run three times):

```
single irregular rocky asteroid, cratered grey brown stone, fractured edges, pits,
mineral veins, no ice, solid mesh, realistic rock texture
```

## Full model list

What the battle renderer draws, and what it still draws procedurally today:

| asset | count | used for | drop-in path |
| --- | --- | --- | --- |
| hull: corvette, destroyer, cruiser, battleship, carrier | 5 | every ship in a battle | `public/models/ships/<class>.glb` + manifest (supported now) |
| strike craft | 1 | interceptor and bomber squadrons, tinted per type | not yet wired, placeholder arrowhead |
| asteroid rock | 3 | asteroid-field hazards, instanced with random scale and spin | not yet wired, placeholder lumpy icosahedron |
| nebula texture | 1 | nebula hazards, two tinted soft discs | not yet wired, procedural radial gradient |
| starfield texture | 1 | backdrop | not yet wired, procedural points |
| space station | 1 | optional dressing for battles in orbit | no render path yet |
| planet disc | 1 | optional backdrop for battles in orbit | no render path yet |

Nine models in total for the battle (five hulls, one strike craft, three rocks). The
civilian ships (explorer, freighter, spy, builder) and orbital structures never enter the
tactical sim, and the galaxy map and system views are 2D, so nothing else needs a mesh
yet. Faction variation is a runtime tint, not extra models.
