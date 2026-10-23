// lib/tactical/render3d/hardpoints.ts
// Where a capital ship's targetable subsystems sit on its hull, for the
// Empire-at-War style hardpoint markers the battle overlay draws on enemy ships.
//
// Kept free of three.js like view.ts, so the 2D overlay can lay out and hit-test
// markers without pulling WebGL into the main bundle. The renderer fills these in
// from the loaded models (tagged parts where a model names them, the per-class
// fallback layout where it does not); without WebGL the overlay uses the same
// fallback built from the class radius.

import type { HardpointId, SubsystemId, TacticalShip, WeaponDef } from '../types';
import { isOmniMount } from '../ship-defs';
import type { ViewLike } from './view';

/** A point in a hull's model space, battle units: +x forward, +y port, +z up. */
export interface HardpointAnchor {
    x: number;
    y: number;
    z: number;
}

/**
 * Per subsystem, plus one anchor per weapon mount (parallel to the class
 * weapons). `weapons` is where the guns are as a whole: smoke for the
 * renderer, never a marker.
 */
export interface HardpointLayout extends Record<SubsystemId, HardpointAnchor> {
    mounts: HardpointAnchor[];
}

/** A hardpoint's anchor in a layout. */
export function hardpointAnchor(layout: HardpointLayout, hp: HardpointId): HardpointAnchor {
    return typeof hp === 'number' ? layout.mounts[hp] ?? layout.weapons : layout[hp];
}

/** A hull's model-space bounds, the only thing the fallback layout needs. */
export interface HullBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
}

/**
 * The layout for a hull whose model does not name its parts (placeholders, and
 * the faction hulls until they are tagged): engines at the stern, weapons
 * amidships, shields and sensors spread along the deck on opposite flanks so
 * the markers never stack. Each weapon mount sits on the hull edge its
 * mountAngle points at (broadsides on the flanks, a spinal gun at the bow, a
 * rear turret aft); omnidirectional point defence rides the dorsal spine.
 */
export function fallbackHardpoints(box: HullBox, weapons: readonly WeaponDef[]): HardpointLayout {
    const len = box.maxX - box.minX;
    const wid = box.maxY - box.minY;
    const midY = (box.minY + box.maxY) / 2;
    const at = (t: number) => box.minX + len * t;
    const deck = (h: number) => box.minZ + (box.maxZ - box.minZ) * h;
    let omni = 0;
    const mounts = weapons.map(w => {
        if (isOmniMount(w)) return { x: at(0.64 + 0.1 * omni++), y: midY, z: deck(1) };
        // mountAngle +π/2 is starboard, which is model -y.
        return {
            x: at(0.5) + Math.cos(w.mountAngle) * len * 0.36,
            y: midY - Math.sin(w.mountAngle) * wid * 0.4,
            z: deck(0.8),
        };
    });
    return {
        engines: { x: at(0.08), y: midY, z: deck(0.5) },
        shields: { x: at(0.34), y: midY + wid * 0.28, z: deck(0.75) },
        weapons: { x: at(0.55), y: midY, z: deck(0.85) },
        sensors: { x: at(0.8), y: midY - wid * 0.24, z: deck(0.8) },
        mounts,
    };
}

/**
 * Mount anchors from a model's tagged weapon parts: each directional mount
 * takes the tagged point furthest along its mountAngle (the port battery the
 * port-most cluster), lifted to the top of the guns; omni mounts take the
 * guns' middle. With fewer than two points there is no flank to tell apart,
 * so directional mounts keep the fallback spot.
 */
export function mountsFromPoints(points: readonly HardpointAnchor[], weapons: readonly WeaponDef[], fallback: HardpointAnchor[]): HardpointAnchor[] {
    if (!points.length) return fallback;
    let cx = 0, cy = 0, top = -Infinity;
    for (const p of points) { cx += p.x; cy += p.y; top = Math.max(top, p.z); }
    cx /= points.length;
    cy /= points.length;
    return weapons.map((w, i) => {
        if (isOmniMount(w)) return { x: cx, y: cy, z: top };
        if (points.length < 2) return fallback[i];
        const dx = Math.cos(w.mountAngle), dy = -Math.sin(w.mountAngle);
        let best = points[0], bestDot = -Infinity;
        for (const p of points) {
            const d = (p.x - cx) * dx + (p.y - cy) * dy;
            if (d > bestDot) { bestDot = d; best = p; }
        }
        return { x: best.x, y: best.y, z: top };
    });
}

/** A flat hull of the class radius, for the 2D-only view (no models, no height). */
export function radiusBox(radius: number): HullBox {
    return { minX: -radius, maxX: radius, minY: -radius * 0.5, maxY: radius * 0.5, minZ: 0, maxZ: 0 };
}

/**
 * A model-space anchor on a ship → overlay screen px (CSS pixels). The ground
 * point maps through the view's affine transform (view.ts); height above the
 * plane shows as screen-up offset of scale * sin(pitch) per unit.
 */
export function projectHardpoint(sh: TacticalShip, a: HardpointAnchor, v: ViewLike, out: { x: number; y: number }): { x: number; y: number } {
    const c = Math.cos(sh.heading), s = Math.sin(sh.heading);
    // Same rotation the renderer applies (battle-renderer.ts place()), in world coordinates.
    const wx = sh.x + a.x * c + a.y * s;
    const wy = sh.y + a.x * s - a.y * c;
    const tilt = v.tilt;
    out.x = v.ox + wx * v.scale;
    out.y = v.oy + wy * v.scale * tilt - a.z * v.scale * Math.sqrt(Math.max(0, 1 - tilt * tilt));
    return out;
}
