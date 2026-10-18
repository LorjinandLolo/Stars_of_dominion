"""
scripts/models/build_hulls.py
Procedural hard-surface hulls for the tactical battle renderer, built in Blender.

    blender --background --factory-startup --python scripts/models/build_hulls.py -- \
        cruiser [destroyer ...] [--out public/models/ships] [--preview DIR]

or `npm run models:build -- cruiser` (see package.json).

Conventions, matching lib/tactical/render3d/hull-models.ts:
  * Blender axes: bow +X, dorsal +Z, port +Y. The glTF exporter turns this Y-up.
  * Scale is free. The loader rescales every hull by its length along X.
  * One material, "Hull". Lights come from a 4x4 emission texture: unlit faces
    put their UVs on the black half, lit faces on the white half. The renderer
    multiplies that mask by the side's colour, so lights are faction-tinted.
  * Deterministic: each class has a fixed seed, so a rebuild gives the same mesh.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

UV_DARK = (0.25, 0.5)
UV_LIT = (0.75, 0.5)
DIRS = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0), '-y': (0, -1, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}

# Triangle budgets from public/models/ships/README.md.
BUDGET = {'corvette': 3000, 'destroyer': 5000, 'cruiser': 8000, 'carrier': 10000, 'battleship': 12000}


# ── Kit: primitives that land in world space with identity transforms ─────────

class Kit:
    def __init__(self, seed):
        self.parts = []
        self.rng = random.Random(seed)

    def _take(self, lit, bevel):
        o = bpy.context.active_object
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o['lit'] = lit
        if bevel > 0:
            m = o.modifiers.new('bevel', 'BEVEL')
            m.width = bevel
            m.segments = 1
            m.limit_method = 'ANGLE'
        self.parts.append(o)
        return o

    def box(self, size, loc, lit='none', bevel=0.0, rz=0.0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, rz))
        bpy.context.active_object.scale = size
        return self._take(lit, bevel)

    def cyl(self, r, depth, loc, axis='z', verts=8, r2=None, lit='none', bevel=0.0, rz=0.0):
        rot = {'z': (0, 0, rz), 'x': (0, math.pi / 2, rz), 'y': (math.pi / 2, 0, rz)}[axis]
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
        else:
            # Cone: radius r at the -axis end, r2 at the +axis end.
            bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
        return self._take(lit, bevel)

    def sphere(self, r, loc, lit='none'):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc)
        return self._take(lit, 0.0)

    def mirror(self, fn):
        """Call fn(side) for side in (+1, -1): port and starboard copies."""
        for side in (1, -1):
            fn(side)

    # ── Composite parts ──

    def turret(self, x, y, z, r, aim, barrels=2, blen=2.2):
        """Gun turret: ring base, wedge housing, barrels along local +X, turned by `aim`."""
        start = len(self.parts)
        self.cyl(r, r * 0.5, (0, 0, r * 0.25), verts=10)
        h = self.box((r * 1.5, r * 1.15, r * 0.5), (r * 0.1, 0, r * 0.75))
        taper(h, '+x', 0.7, 0.75)
        offs = [0.0] if barrels == 1 else [(i - (barrels - 1) / 2) * r * 0.42 for i in range(barrels)]
        for oy in offs:
            self.cyl(r * 0.1, r * blen, (r * 0.55 + r * blen / 2, oy, r * 0.78), axis='x', verts=6)
        m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(aim, 4, 'Z')
        for p in self.parts[start:]:
            p.data.transform(m)

    def engine(self, x, y, z, r, length, nose=0.0):
        """Engine pod along X with a flared nozzle; the nozzle mouth (facing -X) is lit.
        nose > 0 caps the front with a cone of that length (free-standing nacelles)."""
        self.cyl(r, length, (x + length / 2, y, z), axis='x', verts=12)
        if nose > 0:
            self.cyl(r, nose, (x + length + nose / 2, y, z), axis='x', verts=12, r2=r * 0.35)
        self.cyl(r * 1.2, r * 0.9, (x - r * 0.45, y, z), axis='x', verts=12, r2=r * 0.95)
        self.cyl(r * 0.9, 0.02, (x - r * 0.9, y, z), axis='x', verts=12, lit='face:-x')

    def greebles(self, n, x0, x1, y0, y1, z, smin=0.08, smax=0.3, hmin=0.04, hmax=0.14, keep_out=()):
        """Scatter small boxes on a deck. keep_out: (x, y, radius) circles to leave clear."""
        placed = 0
        tries = 0
        while placed < n and tries < n * 20:
            tries += 1
            x = self.rng.uniform(x0, x1)
            y = self.rng.uniform(y0, y1)
            if any((x - kx) ** 2 + (y - ky) ** 2 < kr * kr for kx, ky, kr in keep_out):
                continue
            sx = self.rng.uniform(smin, smax)
            sy = self.rng.uniform(smin, smax)
            h = self.rng.uniform(hmin, hmax)
            self.box((sx, sy, h), (x, y, z + h / 2))
            # Mirror across the keel so the deck stays symmetric.
            if abs(y) > 0.05:
                self.box((sx, sy, h), (x, -y, z + h / 2))
            placed += 1


def taper(o, end, a=1.0, b=1.0):
    """Scale the vertices on one end of a part toward that end's centre.
    end '+x' scales y by a and z by b; '+z' scales x by a and y by b; and so on."""
    vs = o.data.vertices
    axis = 'xyz'.index(end[1])
    sign = 1 if end[0] == '+' else -1
    vals = [v.co[axis] for v in vs]
    ext = max(vals) if sign > 0 else min(vals)
    others = [i for i in range(3) if i != axis]
    centre = [(max(v.co[i] for v in vs) + min(v.co[i] for v in vs)) / 2 for i in others]
    for v in vs:
        if abs(v.co[axis] - ext) < 1e-4:
            v.co[others[0]] = centre[0] + (v.co[others[0]] - centre[0]) * a
            v.co[others[1]] = centre[1] + (v.co[others[1]] - centre[1]) * b
    return o


def shift(o, end, d=(0, 0, 0)):
    """Move the vertices on one end of a part (e.g. drop a prow's top edge)."""
    vs = o.data.vertices
    axis = 'xyz'.index(end[1])
    vals = [v.co[axis] for v in vs]
    ext = max(vals) if end[0] == '+' else min(vals)
    for v in vs:
        if abs(v.co[axis] - ext) < 1e-4:
            v.co += Vector(d)
    return o


# ── Hulls ─────────────────────────────────────────────────────────────────────

def build_cruiser(k):
    """Workhorse line ship: broad flat deck, three-turret broadside batteries per
    flank, point defence on the spine, command tower amidships, four shield
    emitter pylons, three stern engines."""
    # Main hull and keel, tapering into the bow.
    hull = k.box((8.4, 2.3, 1.0), (0.4, 0, 0), bevel=0.06)
    taper(hull, '+x', 0.55, 0.7)
    keel = k.box((7.0, 1.5, 0.5), (0.2, 0, -0.65), bevel=0.04)
    taper(keel, '+x', 0.4, 0.6)
    prow = k.box((1.4, 1.25, 0.62), (5.25, 0, 0.0), bevel=0.03)
    taper(prow, '+x', 0.18, 0.45)
    shift(prow, '+x', (0, 0, -0.08))

    # Broad dorsal deck, wider than the hull: it carries the batteries.
    deck = k.box((6.6, 3.1, 0.2), (0.15, 0, 0.6), bevel=0.04)
    taper(deck, '+x', 0.62, 1.0)
    taper(deck, '-x', 0.86, 1.0)
    fore = k.box((1.6, 1.3, 0.16), (3.9, 0, 0.55), bevel=0.03)
    taper(fore, '+x', 0.55, 1.0)

    # Broadside sponsons and their turrets, aimed slightly forward of beam.
    def battery(side):
        sp = k.box((5.2, 0.62, 0.56), (0.3, side * 1.42, 0.26), bevel=0.04)
        taper(sp, '+x', 0.7, 0.7)
        taper(sp, '-x', 0.8, 0.8)
        for x in (2.15, 0.4, -1.35):
            k.box((0.85, 0.7, 0.08), (x, side * 1.42, 0.74))
            k.turret(x, side * 1.42, 0.78, 0.34, side * math.radians(78), barrels=2, blen=2.3)
        # Armour plates stepping down the flank.
        for i, x in enumerate((2.6, 1.2, -0.2, -1.6)):
            k.box((1.25, 0.08, 0.42), (x, side * 1.76, 0.18 - i * 0.02), bevel=0.02)
        # Running lights at the sponson tips.
        k.box((0.12, 0.12, 0.08), (2.95, side * 1.55, 0.58), lit='all')
        k.box((0.12, 0.12, 0.08), (-2.3, side * 1.55, 0.58), lit='all')
    k.mirror(battery)

    # Point defence along the spine.
    for x in (3.55, 2.75):
        k.turret(x, 0, 0.64, 0.17, 0, barrels=1, blen=1.8)
    for x in (-2.45, -3.1):
        k.turret(x, 0, 0.7, 0.17, math.pi, barrels=1, blen=1.8)

    # Command tower amidships: stepped block, bridge with lit windows, mast, dish.
    t1 = k.box((1.5, 1.05, 0.55), (-0.6, 0, 0.98), bevel=0.04)
    taper(t1, '+z', 0.85, 0.85)
    t2 = k.box((1.0, 0.8, 0.45), (-0.7, 0, 1.45), bevel=0.03)
    taper(t2, '+z', 0.85, 0.85)
    bridge = k.box((0.55, 1.5, 0.22), (-0.55, 0, 1.78), bevel=0.02)
    taper(bridge, '+x', 1.0, 0.7)
    k.box((0.04, 1.2, 0.07), (-0.27, 0, 1.79), lit='all')
    k.cyl(0.035, 0.9, (-0.85, 0, 2.3))
    k.box((0.06, 0.7, 0.04), (-0.85, 0, 2.45))
    k.cyl(0.26, 0.05, (-1.15, 0.0, 2.0), axis='z', verts=12, rz=0)
    k.box((0.3, 0.3, 0.12), (-1.15, 0, 1.9))

    # Shield emitter pylons, two per side, glowing caps.
    def pylons(side):
        for x in (3.05, -2.7):
            p = k.box((0.26, 0.12, 0.75), (x, side * 1.18, 1.0))
            taper(p, '+z', 0.6, 0.8)
            k.sphere(0.12, (x, side * 1.18, 1.42), lit='all')
    k.mirror(pylons)

    # Stern engine block and three engines.
    eb = k.box((1.0, 2.6, 0.95), (-3.95, 0, 0.0), bevel=0.05)
    taper(eb, '-x', 0.9, 0.9)
    k.engine(-5.6, 0, 0, 0.44, 1.3)
    k.engine(-5.4, 0.9, 0, 0.34, 1.1)
    k.engine(-5.4, -0.9, 0, 0.34, 1.1)

    # Bow running light.
    k.box((0.1, 0.1, 0.08), (5.95, 0, 0.02), lit='all')

    # Deck detail, kept off the turrets, tower and pylons.
    keep = [(x, s * 1.42, 0.6) for x in (2.15, 0.4, -1.35) for s in (1, -1)]
    keep += [(-0.6, 0, 1.0), (3.55, 0, 0.3), (2.75, 0, 0.3), (-2.45, 0, 0.3), (-3.1, 0, 0.3)]
    keep += [(x, s * 1.18, 0.25) for x in (3.05, -2.7) for s in (1, -1)]
    k.greebles(26, -3.2, 3.2, 0.1, 1.05, 0.7, keep_out=keep)


def build_corvette(k):
    """Fast flanker: narrow dart hull, one dorsal turret, oversized twin
    nacelles, swept fins, exposed tanks. Mostly engine."""
    hull = k.box((3.4, 0.72, 0.55), (0.5, 0, 0), bevel=0.04)
    taper(hull, '+x', 0.22, 0.45)
    taper(hull, '-x', 0.9, 0.9)
    spine = k.box((2.6, 0.32, 0.22), (0.2, 0, 0.36), bevel=0.02)
    taper(spine, '+x', 0.5, 0.6)
    cockpit = k.box((0.7, 0.42, 0.24), (1.05, 0, 0.32), bevel=0.02)
    taper(cockpit, '+x', 0.6, 0.5)
    k.box((0.05, 0.34, 0.06), (1.38, 0, 0.36), lit='all')
    k.turret(-0.1, 0, 0.47, 0.2, 0, barrels=2, blen=2.2)

    def side(s):
        # Nacelle pylon, nacelle, fuel tank, swept fin with a tip light.
        k.box((0.9, 0.5, 0.12), (-1.15, s * 0.42, 0), bevel=0.02)
        k.engine(-2.75, s * 0.66, 0, 0.25, 1.75, nose=0.45)
        k.cyl(0.12, 1.1, (0.15, s * 0.42, 0.16), axis='x', verts=8)
        fin = k.box((1.1, 0.9, 0.06), (-1.6, s * 1.25, -0.02))
        shift(fin, '+y' if s > 0 else '-y', (-0.55, 0, 0))
        taper(fin, '+y' if s > 0 else '-y', 0.35, 1.0)
        k.box((0.1, 0.08, 0.08), (-2.0, s * 1.68, -0.02), lit='all')
    k.mirror(side)
    k.box((0.08, 0.08, 0.06), (2.25, 0, 0.02), lit='all')
    k.greebles(6, -1.2, 0.8, 0.08, 0.28, 0.27, smin=0.06, smax=0.16, hmin=0.03, hmax=0.08,
               keep_out=[(-0.1, 0, 0.35), (1.05, 0, 0.4)])


def build_destroyer(k):
    """Knife aimed forward: wedge hull, two fixed heavy bow cannons, torpedo
    tubes under the chin, armour stacked forward, skeletal rear, twin engines."""
    hull = k.box((6.2, 2.0, 0.9), (1.0, 0, 0), bevel=0.05)
    taper(hull, '+x', 0.22, 0.5)
    taper(hull, '-x', 0.75, 0.85)
    # Armour stacked toward the bow.
    a1 = k.box((2.6, 1.6, 0.2), (1.5, 0, 0.53), bevel=0.03)
    taper(a1, '+x', 0.35, 1.0)
    a2 = k.box((1.8, 1.15, 0.18), (1.25, 0, 0.71), bevel=0.03)
    taper(a2, '+x', 0.35, 1.0)
    a3 = k.box((1.0, 0.7, 0.16), (1.0, 0, 0.87), bevel=0.02)
    taper(a3, '+x', 0.4, 1.0)

    def cannon(s):
        h = k.box((1.8, 0.5, 0.46), (1.6, s * 0.92, 0.12), bevel=0.04)
        taper(h, '+x', 0.75, 0.8)
        k.cyl(0.13, 1.9, (3.4, s * 0.92, 0.14), axis='x', verts=8)
        k.cyl(0.18, 0.3, (4.4, s * 0.92, 0.14), axis='x', verts=8)
        k.cyl(0.08, 0.02, (4.56, s * 0.92, 0.14), axis='x', verts=8, lit='face:+x')
        # Side plating.
        for i, x in enumerate((1.6, 0.4)):
            k.box((1.1, 0.07, 0.4), (x, s * 1.02, -0.05), bevel=0.02)
    k.mirror(cannon)

    # Torpedo tubes under the chin, mouths lit.
    for y in (-0.42, -0.14, 0.14, 0.42):
        k.cyl(0.1, 0.7, (2.3, y, -0.38), axis='x', verts=8)
        k.cyl(0.07, 0.02, (2.66, y, -0.38), axis='x', verts=8, lit='face:+x')

    # Bridge set behind the armour.
    br = k.box((0.9, 0.75, 0.4), (-0.35, 0, 0.62), bevel=0.03)
    taper(br, '+z', 0.8, 0.85)
    k.box((0.04, 0.55, 0.06), (0.06, 0, 0.7), lit='all')
    k.cyl(0.03, 0.6, (-0.55, 0, 1.05))

    # Skeletal rear: spine, ribs, rails.
    k.box((2.8, 0.55, 0.42), (-2.6, 0, 0.1), bevel=0.03)
    for x in (-1.7, -2.45, -3.2):
        k.box((0.16, 1.85, 0.16), (x, 0, 0.12))
    k.mirror(lambda s: k.box((2.6, 0.12, 0.12), (-2.5, s * 0.86, 0.12)))
    fin = k.box((1.1, 0.08, 0.6), (-3.1, 0, 0.6))
    taper(fin, '+z', 0.4, 1.0)
    shift(fin, '+z', (-0.3, 0, 0))
    k.turret(-1.25, 0, 0.32, 0.16, math.pi, barrels=1, blen=1.8)

    # Engine block and two engines.
    k.box((0.8, 1.9, 0.8), (-4.1, 0, 0.1), bevel=0.04)
    k.engine(-5.9, 0.55, 0.1, 0.42, 1.6)
    k.engine(-5.9, -0.55, 0.1, 0.42, 1.6)
    k.box((0.08, 0.08, 0.06), (4.1, 0, 0.12), lit='all')
    k.greebles(12, -0.9, 2.4, 0.08, 0.75, 0.45, smin=0.07, smax=0.2,
               keep_out=[(-0.35, 0, 0.6), (1.25, 0, 0.7), (1.0, 0, 0.5)])


def build_battleship(k):
    """Fleet centrepiece: long heavy hull around a spinal lance, blunt layered
    prow, two tiers of broadside turrets, rear turret, point defence everywhere,
    tall bridge set back, six-nozzle engine block."""
    core = k.box((11.0, 3.0, 1.4), (0, 0, 0), bevel=0.07)
    taper(core, '-x', 0.8, 0.85)
    deck = k.box((8.4, 3.7, 0.3), (-0.5, 0, 0.85), bevel=0.05)
    taper(deck, '+x', 0.85, 1.0)
    keel = k.box((9.0, 2.0, 0.6), (0.3, 0, -0.9), bevel=0.05)
    taper(keel, '+x', 0.7, 0.6)

    # Blunt, layered frontal armour.
    prow = k.box((1.8, 3.4, 1.9), (6.2, 0, 0.1), bevel=0.08)
    taper(prow, '+x', 0.72, 0.68)
    for i, (w, z) in enumerate(((3.7, 1.05), (3.2, 1.3), (2.6, 1.52))):
        p = k.box((1.3 - i * 0.15, w, 0.24), (5.0 + i * 0.25, 0, z), bevel=0.03)
        taper(p, '+x', 0.82, 1.0)

    # Spinal lance: housing the length of the ship, coils, glowing muzzle.
    k.box((11.2, 1.05, 0.7), (0.6, 0, 1.3), bevel=0.05)
    k.cyl(0.42, 2.2, (7.5, 0, 1.3), axis='x', verts=12)
    k.cyl(0.55, 0.35, (8.5, 0, 1.3), axis='x', verts=12)
    k.cyl(0.36, 0.02, (8.69, 0, 1.3), axis='x', verts=12, lit='face:+x')
    for x in (-3.2, -1.6, 0.0, 1.6, 3.2):
        k.cyl(0.62, 0.22, (x, 0, 1.3), axis='x', verts=12)

    def broadsides(s):
        # Lower tier on sponsons, upper tier on the deck edge.
        sp = k.box((7.6, 0.75, 0.7), (-0.2, s * 1.95, 0.2), bevel=0.05)
        taper(sp, '+x', 0.75, 0.8)
        for x in (2.6, 0.2, -2.2):
            k.turret(x, s * 2.0, 0.55, 0.38, s * math.radians(88), barrels=2, blen=2.2)
        for x in (1.5, -1.0, -3.3):
            k.box((1.0, 0.85, 0.1), (x, s * 1.35, 1.05))
            k.turret(x, s * 1.35, 1.1, 0.46, s * math.radians(76), barrels=3, blen=2.4)
        for i, x in enumerate((3.3, 1.6, -0.1, -1.8, -3.5)):
            k.box((1.55, 0.09, 0.55), (x, s * 2.36, 0.12), bevel=0.02)
        for x in (4.2, -4.4):
            k.turret(x, s * 1.6, 1.0, 0.16, s * math.pi / 2, barrels=1, blen=1.8)
        k.box((0.14, 0.14, 0.1), (3.9, s * 2.4, 0.6), lit='all')
        k.box((0.14, 0.14, 0.1), (-3.9, s * 2.4, 0.6), lit='all')
    k.mirror(broadsides)

    # Rear turret on the stern deck.
    k.box((1.2, 1.2, 0.12), (-4.4, 0, 1.06))
    k.turret(-4.4, 0, 1.12, 0.5, math.pi, barrels=3, blen=2.2)

    # Tall bridge set well back.
    t1 = k.box((1.7, 1.3, 0.9), (-2.4, 0, 2.1), bevel=0.05)
    taper(t1, '+z', 0.8, 0.85)
    t2 = k.box((1.1, 0.95, 0.7), (-2.5, 0, 2.85), bevel=0.04)
    taper(t2, '+z', 0.85, 0.85)
    wings = k.box((0.65, 2.2, 0.3), (-2.3, 0, 3.32), bevel=0.03)
    taper(wings, '+x', 1.0, 0.7)
    k.box((0.04, 1.8, 0.08), (-1.96, 0, 3.34), lit='all')
    k.cyl(0.05, 1.3, (-2.7, 0, 4.1))
    k.box((0.08, 1.0, 0.05), (-2.7, 0, 4.4))
    k.cyl(0.32, 0.06, (-3.1, 0, 3.6), verts=12)

    # Engine block, six nozzles.
    eb = k.box((1.6, 3.6, 1.9), (-6.3, 0, 0.1), bevel=0.07)
    taper(eb, '-x', 0.92, 0.92)
    for y in (-1.1, 0.0, 1.1):
        for z in (-0.42, 0.55):
            k.engine(-8.4, y, z, 0.42, 1.4)

    k.greebles(30, -5.0, 4.4, 0.65, 1.0, 1.0, smin=0.1, smax=0.3,
               keep_out=[(x, 1.35, 0.7) for x in (1.5, -1.0, -3.3)] + [(-2.4, 0, 1.2), (-4.4, 0, 0.9)])


def build_carrier(k):
    """Floating airbase: wide flat slab, a long open hangar trench down each
    flank with launch rails and lit strips, runway lights on the deck, point
    defence only, low sensor tower aft, four engines, craft parked on deck."""
    core = k.box((9.2, 2.2, 1.0), (0, 0, 0), bevel=0.06)
    taper(core, '-x', 0.85, 0.9)
    bow = k.box((1.8, 2.4, 0.8), (5.3, 0, -0.05), bevel=0.05)
    taper(bow, '+x', 0.45, 0.6)
    deck = k.box((10.4, 2.5, 0.22), (0.3, 0, 0.62), bevel=0.04)
    taper(deck, '+x', 0.7, 1.0)
    keel = k.box((8.0, 4.6, 0.3), (0, 0, -0.55), bevel=0.05)
    taper(keel, '+x', 0.6, 1.0)

    def bay(s):
        y = s * 1.85
        k.box((8.4, 0.24, 0.95), (0.2, s * 2.42, 0.1), bevel=0.04)   # outer wall
        k.box((8.0, 1.1, 0.08), (0.2, y, -0.36))                     # floor
        for oy in (-0.3, 0.3):
            k.box((7.6, 0.07, 0.05), (0.2, y + oy, -0.29), lit='all')  # lit strips
        k.box((7.6, 0.12, 0.08), (0.2, y, -0.28))                     # launch rail
        for x in (-3.4, -2.0, -0.6, 0.8, 2.2, 3.6):
            k.box((0.12, 1.3, 0.1), (x, y, 0.55))                     # roof ribs
        for x in (3.0, 0.0, -3.0):
            k.turret(x, s * 2.42, 0.58, 0.17, s * math.pi / 2, barrels=1, blen=1.8)
        k.box((0.14, 0.14, 0.1), (4.4, s * 2.42, 0.6), lit='all')
        k.box((0.14, 0.14, 0.1), (-4.0, s * 2.42, 0.6), lit='all')
    k.mirror(bay)

    # Runway lights down the deck centreline.
    x = -2.6
    while x < 4.8:
        k.box((0.32, 0.05, 0.03), (x, 0, 0.745), lit='all')
        x += 0.75
    # Parked strike craft.
    for cx, cy in ((3.4, 0.6), (2.6, 0.6), (3.4, -0.6), (2.6, -0.6)):
        c = k.box((0.42, 0.34, 0.07), (cx, cy, 0.77))
        taper(c, '+x', 0.1, 0.7)

    # Low sensor tower aft, offset to starboard like an island.
    t = k.box((1.1, 0.75, 0.55), (-3.2, -0.7, 1.0), bevel=0.03)
    taper(t, '+z', 0.85, 0.85)
    k.box((0.04, 0.6, 0.06), (-2.66, -0.7, 1.05), lit='all')
    k.cyl(0.035, 0.8, (-3.4, -0.7, 1.6))
    k.cyl(0.3, 0.05, (-3.6, -0.4, 1.35), verts=12)

    # Engine block, four engines.
    eb = k.box((1.0, 4.4, 0.95), (-5.0, 0, 0.0), bevel=0.05)
    taper(eb, '-x', 0.92, 0.92)
    for y in (-1.6, -0.55, 0.55, 1.6):
        k.engine(-6.7, y, 0, 0.36, 1.3)


BUILDERS = {
    'corvette': build_corvette,
    'destroyer': build_destroyer,
    'cruiser': build_cruiser,
    'battleship': build_battleship,
    'carrier': build_carrier,
}
SEEDS = {'corvette': 11, 'destroyer': 23, 'cruiser': 37, 'battleship': 41, 'carrier': 53}


# ── Pipeline ──────────────────────────────────────────────────────────────────

def hull_material(scratch):
    img = bpy.data.images.new('lights', 4, 4, alpha=False)
    px = []
    for _row in range(4):
        for col in range(4):
            v = 1.0 if col >= 2 else 0.0
            px += [v, v, v, 1.0]
    img.pixels = px
    img.filepath_raw = os.path.join(scratch, 'lights.png')
    img.file_format = 'PNG'
    img.save()
    img.pack()

    mat = bpy.data.materials.new('Hull')
    if mat.node_tree is None:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.42, 0.45, 0.5, 1)
    bsdf.inputs['Metallic'].default_value = 0.6
    bsdf.inputs['Roughness'].default_value = 0.5
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def set_uvs(o):
    lit = o.get('lit', 'none')
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers[0].data
    want = Vector(DIRS[lit[5:]]) if lit.startswith('face:') else None
    for poly in me.polygons:
        on = lit == 'all' or (want is not None and poly.normal.dot(want) > 0.8)
        for li in poly.loop_indices:
            uv[li].uv = UV_LIT if on else UV_DARK


def finalize(k, name, mat):
    bpy.ops.object.select_all(action='DESELECT')
    for o in k.parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = k.parts[0]
    bpy.ops.object.convert(target='MESH')  # applies the bevels
    for o in k.parts:
        if o.data.uv_layers and o.data.uv_layers[0].name != 'UVMap':
            o.data.uv_layers[0].name = 'UVMap'
        set_uvs(o)
        o.data.materials.clear()
        o.data.materials.append(mat)
    bpy.ops.object.join()
    hull = bpy.context.active_object
    hull.name = name
    hull.data.name = name
    tris = sum(len(p.vertices) - 2 for p in hull.data.polygons)
    return hull, tris


def preview(hull, prefix):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    sh = scn.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'SINGLE'
    sh.single_color = (0.55, 0.58, 0.64)
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = True
    if scn.world is None:
        scn.world = bpy.data.worlds.new('World')
    scn.world.color = (0.02, 0.03, 0.07)
    scn.render.resolution_x = 1000
    scn.render.resolution_y = 600

    bb = [hull.matrix_world @ Vector(c) for c in hull.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    centre = (lo + hi) / 2
    length = hi.x - lo.x

    cam_data = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam

    # Top-down orthographic, bow to the right: what the battle camera sees.
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = length * 1.1
    cam.location = (centre.x, centre.y, hi.z + 20)
    cam.rotation_euler = (0, 0, 0)
    scn.render.filepath = prefix + '-top.png'
    bpy.ops.render.render(write_still=True)

    # Three-quarter hero view from front-left, above.
    cam_data.type = 'PERSP'
    cam_data.lens = 50
    target = bpy.data.objects.new('target', None)
    scn.collection.objects.link(target)
    target.location = centre
    con = cam.constraints.new('TRACK_TO')
    con.target = target
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'
    d = length * 1.15
    cam.location = (centre.x + d * 0.75, centre.y + d * 0.85, centre.z + d * 0.6)
    scn.render.filepath = prefix + '-hero.png'
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = 'public/models/ships'
    preview_dir = None
    classes = []
    i = 0
    while i < len(argv):
        if argv[i] == '--out':
            out_dir = argv[i + 1]
            i += 2
        elif argv[i] == '--preview':
            preview_dir = argv[i + 1]
            i += 2
        else:
            classes.append(argv[i])
            i += 1
    classes = classes or list(BUILDERS)
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    scratch = os.path.abspath(preview_dir or out_dir)
    os.makedirs(scratch, exist_ok=True)

    report = {}
    for name in classes:
        if name not in BUILDERS:
            raise SystemExit(f'no builder for {name!r}; have {sorted(BUILDERS)}')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        k = Kit(SEEDS[name])
        BUILDERS[name](k)
        mat = hull_material(scratch)
        hull, tris = finalize(k, name, mat)
        bpy.ops.object.select_all(action='DESELECT')
        hull.select_set(True)
        bpy.context.view_layer.objects.active = hull
        path = os.path.join(out_dir, f'{name}.glb')
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_materials='EXPORT',
        )
        dims = hull.dimensions
        report[name] = {
            'tris': tris,
            'budget': BUDGET[name],
            'dims': [round(dims.x, 2), round(dims.y, 2), round(dims.z, 2)],
            'bytes': os.path.getsize(path),
        }
        if preview_dir:
            preview(hull, os.path.join(scratch, name))
        print(f'[build_hulls] {name}: {report[name]}')
    print('[build_hulls] done', report)


main()
