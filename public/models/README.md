# Models

Every 3D model the tactical battle uses, where to put your own, and what else could get
one later. The renderer is `lib/tactical/render3d/`. Concept-art and Meshy/Tripo prompts
are in `docs/art/ship-image-prompts.md`.

## Adding your own model

1. Export a single `.glb` (binary glTF, textures embedded, no Draco or meshopt
   compression).
2. Put it in the folder for its slot (table below).
3. Point the slot at it in [`manifest.json`](manifest.json). Paths are relative to this
   folder.
4. Reload `/test/tactical` (or open a battle in the game). A slot whose file is missing or
   broken keeps its placeholder and prints a warning in the browser console.

You never need to match a size. The loader scales each model to its slot's footprint and
recentres it, so the sim, clicks and rings keep working.

## Folder layout

```
public/models/
  manifest.json            which slot uses which file
  ships/                   the five generic hulls (Blender-built, replace freely)
  factions/<faction>/      a faction's own hulls, override the generic ones
  craft/                   strike craft
  props/                   torpedo, asteroids
```

## Manifest

```json
{
  "ships": {
    "corvette": "ships/corvette.glb",
    "destroyer": "ships/destroyer.glb",
    "cruiser": "ships/cruiser.glb",
    "battleship": "ships/battleship.glb",
    "carrier": "ships/carrier.glb"
  },
  "factions": {
    "faction-aurelian": {
      "cruiser": "factions/aurelian/cruiser.glb",
      "battleship": "factions/aurelian/battleship.glb"
    }
  },
  "craft": {
    "interceptor": "craft/interceptor.glb",
    "bomber": "craft/bomber.glb"
  },
  "torpedo": "props/torpedo.glb",
  "asteroids": ["props/asteroid-1.glb", "props/asteroid-2.glb", "props/asteroid-3.glb"]
}
```

Leave a slot out, empty or `null` to keep the placeholder. A faction only needs the hulls
it wants to change; the rest fall back to `ships`.

## Slots that work today

| slot | manifest key | used for | fits to | triangles | texture |
| --- | --- | --- | --- | --- | --- |
| corvette | `ships.corvette` | fast flanker | length 20 | 3k | 1k |
| destroyer | `ships.destroyer` | torpedo boat | length 30 | 5k | 2k |
| cruiser | `ships.cruiser` | line ship, the reference size | length 42 | 8k | 2k |
| battleship | `ships.battleship` | fleet centrepiece | length 60 | 12k | 2k |
| carrier | `ships.carrier` | launches squadrons | length 55 | 10k | 2k |
| faction hull | `factions.<id>.<class>` | that faction's ships, either side of the battle | same as the class | same | same |
| interceptor | `craft.interceptor` | anti-craft squadrons, 6 per squadron | length 4 | 600 | 512 |
| bomber | `craft.bomber` | anti-ship squadrons | length 4 | 600 | 512 |
| torpedo | `torpedo` | destroyer and battleship torpedoes | length 7 | 300 | none |
| asteroids | `asteroids[]` | rocks in asteroid-field hazards, cycled per field, random scale and spin | radius 1 | 400 | 1k |

"Fits to" is in battle units; you do not have to model at that size. The torpedo is
drawn unlit in a bright side colour, so its textures are ignored.

## Faction ids

Use these exact keys under `factions`:

| faction | id |
| --- | --- |
| Aurelians | `faction-aurelian` |
| Vektori | `faction-vektori` |
| Covenant | `faction-covenant` |
| Null Syndicate | `faction-null-syndicate` |
| Rhimetals | `faction-rhimetals` |
| Gabagoonians | `faction-gabagoonians` |
| Infernoids | `faction-infernoids` |
| Movanites | `faction-movanites` |
| Leopantheri | `faction-leopantheri` |
| Buthari | `faction-buthari` |
| Sarrak | `faction-sarrak` |
| Kaerruun | `faction-kaerruun` |
| Nexulan Convergence | `nexulan_convergence` |
| Banking Clan | `banking_clan` |
| Pirates | `faction-pirates` |

Five hulls times fifteen factions is 75 possible custom hulls. Start with the cruiser and
battleship of the factions you play most; they are the biggest on screen.

## Orientation and export

- In Blender (Z up): bow along **+X**, top deck along **+Z**, port (left) along **+Y**.
- Export: File, Export, glTF 2.0, format "glTF Binary (.glb)", "+Y Up" on, "Apply
  Modifiers" on, compression off.
- One material per model. The loader merges every mesh into one so ships can be drawn
  in a single batch, and reads only the first material's base colour, normal,
  roughness, metallic and emissive maps.
- Running lights and engine glow go in the **emissive map**. The renderer recolours
  emissive light per side (indigo for the player, red for the enemy), so keep the
  emissive map white or grey. Keep the base colour faction-neutral unless it is a
  faction hull.
- The battle camera looks down at about 36 degrees. The top deck and the near flank
  are what players see; the belly almost never shows.

## Rebuilding the procedural hulls

`scripts/models/build_hulls.py` builds the five generic hulls in headless Blender:

```bash
npm run models:build -- cruiser --preview C:/temp/hulls
```

It overwrites `ships/<class>.glb` and, with `--preview`, renders a top-down and a
three-quarter image. If you replace a generic hull with your own, don't run the script
for that class again, or it will overwrite your file.

## Models that could come next

None of these have a slot yet; each needs renderer or game code first. They are grouped
by where they would appear, with the most visible first.

### In space battles

- **Wrecks:** two or three broken hull halves per class that drift after a kill instead of
  vanishing in an explosion.
- **Debris chunks:** small instanced plates and girders scattered by explosions.
- **Shield bubble:** a hex-panel shell shown when a facing takes a hit (mesh plus shader).
- **Bomber variants:** a heavier bomber silhouette, if bombers should read differently
  from interceptors at a glance (the slot already exists, this is just art).
- **Mines:** for a minefield hazard.
- **Derelict hulk:** a huge dead ship as cover terrain.
- **Comet and ice chunks:** for an ice-field hazard.
- **Gravity well or black hole:** a warped disc for a gravity hazard.
- **Warp-in gate or flash ring:** for reinforcements arriving.
- **Missile pods and spinal-lance beam head:** per-weapon projectiles beyond the torpedo.

### Battles at a defended world

- **Planet sphere:** large backdrop planet under the battlefield, one per archetype
  (continental, oceanic, volcanic, swamp, jungle, montane, gaia, arcology).
- **Moon.**
- **Orbital defence platform:** a gun station that fights in the battle.
- **Space station:** the system's station, as cover or objective.
- **Shipyard:** for battles at a yard system.
- **Orbital ring:** the charter company megastructure.
- **Surface guns:** the ground batteries that shoot at orbit (`lib/combat/surface-guns.ts`).
- **Planetary shield dome:** the strongpoint that blocks orbital fire.

### Ground war (if the siege map goes 3D)

- **Dropship / troop transport:** embark, disembark and reinforcement landings.
- **Fortress, barracks, shield generator, capital:** the strongpoints.
- **Infantry, armour and artillery formations:** one small model each, faction-tinted.
- **Commando team:** for raids on shields, guns and uplinks.

### Galaxy and system map (currently 2D)

- **Civilian ships:** explorer, freighter, spy ship, builder.
- **Fleet icon models:** one per hull class, for fleets moving between systems.
- **Pirate raider hulls:** a ragged, mismatched look for `faction-pirates`.
- **Outpost modules:** for the outposts minigame's 5x5 grid.
- **Star and system bodies:** star types, gas giants, asteroid belts.

### Menus and UI

- **Hangar view hulls:** high-detail versions of the five hulls for the ship designer,
  where they are seen up close (no triangle budget pressure there).
- **Faction emblems in 3D:** spinning crests for the faction picker.
- **Admiral and leader busts:** portraits for fleet commanders.
