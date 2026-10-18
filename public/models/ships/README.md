# Ship models

Drop-in glTF hulls for the tactical battle renderer (`lib/tactical/render3d/`).
Until a class has a model here it is drawn with a procedural placeholder.

## How to add one

1. Export the hull as a single `.glb` (binary glTF, textures embedded). Plain glTF only:
   no Draco or meshopt compression, the loader ships without decoders.
2. Name it after the class: `corvette.glb`, `destroyer.glb`, `cruiser.glb`,
   `battleship.glb`, `carrier.glb`.
3. List it in `manifest.json`:

   ```json
   { "ships": { "cruiser": "cruiser.glb" } }
   ```

   Classes missing from the manifest keep their placeholder. A missing manifest means
   all placeholders.

## Orientation and scale

- In Blender (Z up): bow along **+X**, dorsal (top deck) along **+Z**, port along **+Y**.
  Export with the glTF exporter's default "+Y Up" on. In the exported file that is bow
  +X, dorsal +Y, port -Z. Only matters for asymmetric hulls.
- Scale does not matter. The loader scales the model so its length along X matches the
  class footprint used by the sim and the click code, and centres it on the hull.
- Keep the origin roughly at the hull centre; the loader recentres anyway.

## Budget

| class | triangles | texture |
| --- | --- | --- |
| corvette | 3k | 1k |
| destroyer | 5k | 2k |
| cruiser | 8k | 2k |
| carrier | 10k | 2k |
| battleship | 12k | 2k |

One material per model. The loader merges every mesh into one geometry so the ship can
be instanced, and carries over only the first material's albedo, normal, roughness,
metalness and emissive maps. Faction colour is applied at runtime as a per-side
emissive tint, so bake running lights into the emissive map and keep the albedo
faction-neutral.

Prompts for generating the concept art live in `docs/art/ship-image-prompts.md`.

## Procedural hulls

`scripts/models/build_hulls.py` builds hulls in headless Blender and writes the `.glb`
here (`npm run models:build -- cruiser --preview <dir>` also renders a top-down and a
three-quarter preview). Lights use a 4x4 black/white emission texture: faces whose UVs
sit on the white half glow in the side's colour. A model from Meshy or Tripo can replace
any of them: overwrite the file, keep the manifest entry.
