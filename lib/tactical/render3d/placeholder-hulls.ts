// lib/tactical/render3d/placeholder-hulls.ts
// Procedural low-poly stand-ins for the five hull classes, used by the 3D
// battle renderer until a real glTF model exists for the class
// (public/models/manifest.json — see public/models/README.md).
//
// Model space convention (shared with the glTF drop-ins after import):
//   +X = bow, +Y = port, +Z = dorsal (up, toward the camera).
// Every hull spans x ∈ [-r, 1.5r], the footprint the 2D polygon used, so the
// click grab radii in the view keep working unchanged.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShipClassId } from '../types';
import { SHIP_CLASSES } from '../ship-defs';

type Part = THREE.BufferGeometry;

function box(l: number, w: number, h: number, x = 0, y = 0, z = 0, rz = 0): Part {
    const g = new THREE.BoxGeometry(l, w, h);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
}

/** Cylinder along +X (a barrel / nacelle). */
function barrel(len: number, radius: number, x = 0, y = 0, z = 0, segments = 8): Part {
    const g = new THREE.CylinderGeometry(radius, radius, len, segments);
    g.rotateZ(-Math.PI / 2);
    g.translate(x, y, z);
    return g;
}

/** Cone pointing +X (a prow). */
function prow(len: number, radius: number, x = 0, y = 0, z = 0, segments = 6): Part {
    const g = new THREE.ConeGeometry(radius, len, segments);
    g.rotateZ(-Math.PI / 2);
    g.translate(x + len / 2, y, z);
    return g;
}

/** Turret: squat cylinder with a short barrel. */
function turret(radius: number, x: number, y: number, z: number, aim = 0): Part {
    const base = new THREE.CylinderGeometry(radius, radius * 1.1, radius * 0.8, 8);
    base.rotateX(Math.PI / 2);
    base.translate(x, y, z);
    const gun = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, radius * 2.2, 6);
    gun.rotateZ(-Math.PI / 2);
    gun.translate(radius * 1.1, 0, radius * 0.1);
    gun.rotateZ(aim);
    gun.translate(x, y, z);
    return mergeGeometries([base, gun], false)!;
}

/**
 * Fake ambient occlusion for a camera that looks straight down: shade each
 * vertex by its height so stacked decks read as stacked, and lower hull
 * darkens under the superstructure. Written as a `color` attribute, so hull
 * materials run with vertexColors on; glTF drop-ins get the same treatment.
 */
export function addHeightShade(g: THREE.BufferGeometry, low = 0.45): void {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    const span = Math.max(1e-6, max.z - min.z);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const t = (pos.getZ(i) - min.z) / span;
        const v = low + (1 - low) * Math.pow(t, 0.7);
        col[i * 3] = v;
        col[i * 3 + 1] = v;
        col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function finish(parts: Part[]): THREE.BufferGeometry {
    const merged = mergeGeometries(parts, false)!;
    for (const p of parts) p.dispose();
    merged.computeVertexNormals();
    addHeightShade(merged);
    merged.computeBoundingSphere();
    return merged;
}

function corvette(r: number): THREE.BufferGeometry {
    const h = r * 0.5;
    return finish([
        box(r * 1.6, r * 0.6, h, r * 0.1, 0, 0),
        prow(r * 0.6, r * 0.32, r * 0.9, 0, 0),
        barrel(r * 1.2, r * 0.22, -r * 0.45, r * 0.5, 0),
        barrel(r * 1.2, r * 0.22, -r * 0.45, -r * 0.5, 0),
        box(r * 0.6, r * 1.7, h * 0.12, -r * 0.5, 0, 0),
        turret(r * 0.16, r * 0.3, 0, h * 0.55),
    ]);
}

function destroyer(r: number): THREE.BufferGeometry {
    const h = r * 0.55;
    return finish([
        box(r * 1.9, r * 1.0, h, -r * 0.05, 0, 0),
        prow(r * 0.6, r * 0.5, r * 0.9, 0, 0, 4),
        barrel(r * 1.1, r * 0.12, r * 0.9, r * 0.32, h * 0.25),
        barrel(r * 1.1, r * 0.12, r * 0.9, -r * 0.32, h * 0.25),
        box(r * 0.5, r * 0.7, h * 0.5, -r * 0.3, 0, h * 0.6),
        barrel(r * 0.5, r * 0.26, -r * 1.0, r * 0.35, 0),
        barrel(r * 0.5, r * 0.26, -r * 1.0, -r * 0.35, 0),
        box(r * 0.8, r * 1.5, h * 0.12, -r * 0.6, 0, -h * 0.2),
    ]);
}

function cruiser(r: number): THREE.BufferGeometry {
    const h = r * 0.5;
    const parts: Part[] = [
        box(r * 2.1, r * 1.0, h, 0.05 * r, 0, 0),
        box(r * 1.8, r * 1.4, h * 0.3, 0, 0, h * 0.4),
        prow(r * 0.5, r * 0.5, r * 1.0, 0, 0, 4),
        box(r * 0.5, r * 0.45, h * 0.9, -r * 0.1, 0, h * 0.8),
        barrel(r * 0.5, r * 0.3, -r * 1.05, 0, 0),
        barrel(r * 0.5, r * 0.22, -r * 1.05, r * 0.42, 0),
        barrel(r * 0.5, r * 0.22, -r * 1.05, -r * 0.42, 0),
    ];
    for (const side of [1, -1]) {
        for (const x of [0.6, 0.15, -0.45]) {
            parts.push(turret(r * 0.14, r * x, side * r * 0.62, h * 0.62, side * Math.PI / 2));
        }
    }
    return finish(parts);
}

function battleship(r: number): THREE.BufferGeometry {
    const h = r * 0.55;
    const parts: Part[] = [
        box(r * 2.2, r * 1.1, h, 0, 0, 0),
        box(r * 1.6, r * 1.5, h * 0.45, -r * 0.2, 0, h * 0.35),
        box(r * 0.5, r * 1.3, h * 1.2, r * 0.9, 0, 0),
        barrel(r * 2.6, r * 0.16, r * 0.2, 0, h * 0.55),
        prow(r * 0.3, r * 0.2, r * 1.4, 0, h * 0.55),
        box(r * 0.45, r * 0.4, h * 1.2, -r * 0.45, 0, h * 1.0),
        box(r * 0.2, r * 0.9, h * 0.1, -r * 0.45, 0, h * 1.7),
        box(r * 0.8, r * 1.4, h * 0.9, -r * 0.95, 0, 0),
    ];
    for (const side of [1, -1]) {
        for (const x of [0.55, 0.05, -0.5]) {
            parts.push(turret(r * 0.16, r * x, side * r * 0.72, h * 0.6, side * Math.PI / 2));
        }
    }
    parts.push(turret(r * 0.2, -r * 0.95, 0, h * 0.5, Math.PI));
    for (const y of [-0.35, 0.35]) {
        parts.push(barrel(r * 0.4, r * 0.2, -r * 1.25, r * y, h * 0.2));
        parts.push(barrel(r * 0.4, r * 0.2, -r * 1.25, r * y, -h * 0.2));
    }
    return finish(parts);
}

function carrier(r: number): THREE.BufferGeometry {
    const h = r * 0.4;
    return finish([
        box(r * 2.2, r * 1.0, h, 0, 0, 0),
        box(r * 1.9, r * 1.9, h * 0.25, -r * 0.05, 0, h * 0.3),
        box(r * 1.5, r * 0.3, h * 0.6, 0, r * 0.95, 0),
        box(r * 1.5, r * 0.3, h * 0.6, 0, -r * 0.95, 0),
        prow(r * 0.4, r * 0.45, r * 1.1, 0, 0, 4),
        box(r * 0.4, r * 0.4, h * 1.0, -r * 0.7, 0, h * 0.8),
        barrel(r * 0.4, r * 0.22, -r * 1.1, r * 0.3, 0),
        barrel(r * 0.4, r * 0.22, -r * 1.1, -r * 0.3, 0),
        barrel(r * 0.4, r * 0.22, -r * 1.1, r * 0.7, 0),
        barrel(r * 0.4, r * 0.22, -r * 1.1, -r * 0.7, 0),
        turret(r * 0.1, r * 0.7, r * 0.5, h * 0.55, Math.PI / 2),
        turret(r * 0.1, r * 0.7, -r * 0.5, h * 0.55, -Math.PI / 2),
    ]);
}

const BUILDERS: Record<ShipClassId, (r: number) => THREE.BufferGeometry> = {
    corvette,
    destroyer,
    cruiser,
    battleship,
    carrier,
};

export function buildPlaceholderHull(classId: ShipClassId): THREE.BufferGeometry {
    return BUILDERS[classId](SHIP_CLASSES[classId].radius);
}

/** Tiny arrowhead for strike craft, ~5 units long. */
export function buildStrikeCraft(): THREE.BufferGeometry {
    return finish([
        prow(4.2, 1.6, -1.8, 0, 0, 3),
        box(1.6, 3.2, 0.25, -1.4, 0, 0),
    ]);
}

/** Lumpy icosahedron rock, unit radius; scaled per instance. */
export function buildRock(seed: number): THREE.BufferGeometry {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let s = seed >>> 0 || 1;
    const rand = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Displace along the normal per unique vertex position so shared corners stay welded.
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
        let k = seen.get(key);
        if (k === undefined) {
            k = 0.7 + rand() * 0.6;
            seen.set(key, k);
        }
        pos.setXYZ(i, x * k, y * k, z * k);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
}
