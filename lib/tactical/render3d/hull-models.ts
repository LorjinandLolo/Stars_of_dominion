// lib/tactical/render3d/hull-models.ts
// Drop-in glTF models for the battle renderer.
//
// public/models/manifest.json says which slots have a real model (paths are
// relative to /models/). Every slot is optional; anything missing keeps its
// procedural placeholder. See public/models/README.md for the slot list.
//
//   {
//     "ships":     { "cruiser": "ships/cruiser.glb", ... },
//     "factions":  { "faction-aurelian": { "cruiser": "factions/aurelian/cruiser.glb" } },
//     "craft":     { "interceptor": "craft/interceptor.glb", "bomber": "craft/bomber.glb" },
//     "torpedo":   "props/torpedo.glb",
//     "asteroids": ["props/asteroid-1.glb", "props/asteroid-2.glb"],
//     "station":   "props/station.glb"
//   }
//
// Each model is merged into ONE geometry so it can be instanced, turned from
// glTF's Y-up to the renderer's Z-up, and normalised to its slot's footprint,
// so the artist's scale never matters. Only the first material's texture maps
// are carried over; per-part materials would break instancing.
//
// Before the merge every vertex is tagged with the subsystem its part belongs
// to, read from the glTF node/mesh name (or any ancestor's): a name containing
// "engine", "shield", "weapon" or "sensor" tags that subsystem, anything else
// is plain hull. The tag rides along as the `subsystem` vertex attribute, so
// the renderer can darken one part of an instanced hull per ship. Untagged
// models simply get hull-wide damage.
//
// The station is tagged the same way but with one word: any part whose name
// (or an ancestor's) contains "ring" gets `spin` = 1 and turns slowly in the
// battle; the rest stands still.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShipClassId, SquadronType, SubsystemId } from '../types';
import { SHIP_CLASSES } from '../ship-defs';
import { addHeightShade, STATION_SPAN } from './placeholder-hulls';

export const MODEL_BASE = '/models';

export interface ModelMaps {
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    emissiveMap?: THREE.Texture;
}

export interface HullModel {
    geometry: THREE.BufferGeometry;
    maps: ModelMaps;
    /** Where smoke and fire come from on each tagged subsystem, in model space. */
    emitters: SubsystemEmitters;
}

/** `subsystem` vertex attribute value per subsystem; 0 is plain hull. */
export const SUBSYSTEM_TAG: Record<SubsystemId, number> = { engines: 1, shields: 2, weapons: 3, sensors: 4 };
export const SUBSYSTEM_IDS: SubsystemId[] = ['engines', 'shields', 'weapons', 'sensors'];
const TAG_WORDS: Array<[string, number]> = [['engine', 1], ['shield', 2], ['weapon', 3], ['sensor', 4]];
/** Station parts that turn: vertex attribute `spin`. */
const SPIN_WORDS: Array<[string, number]> = [['ring', 1]];

/** How a model's parts are tagged: which name words, into which vertex attribute. */
interface Tagging {
    words: Array<[string, number]>;
    attribute: string;
}
const SUBSYSTEM_TAGGING: Tagging = { words: TAG_WORDS, attribute: 'subsystem' };
const SPIN_TAGGING: Tagging = { words: SPIN_WORDS, attribute: 'spin' };

/** Up to four anchor points per tagged subsystem, model space (Z-up). */
export type SubsystemEmitters = Partial<Record<SubsystemId, THREE.Vector3[]>>;

/** Tag for a glTF object: the first of it and its ancestors whose name says one. */
function tagFor(obj: THREE.Object3D | null, words: Array<[string, number]>): number {
    for (let o = obj; o; o = o.parent) {
        const n = o.name.toLowerCase();
        for (const [word, tag] of words) if (n.includes(word)) return tag;
    }
    return 0;
}

/** Give every vertex of a part one tag. */
export function setVertexTag(g: THREE.BufferGeometry, attribute: string, tag: number): void {
    const n = g.getAttribute('position').count;
    g.setAttribute(attribute, new THREE.BufferAttribute(new Float32Array(n).fill(tag), 1));
}

/** Give every vertex of a part one subsystem tag. */
export function setSubsystemTag(g: THREE.BufferGeometry, tag: number): void {
    setVertexTag(g, 'subsystem', tag);
}

/**
 * Smoke and fire anchors per subsystem: its vertices split into fore/aft and
 * port/starboard quarters around their own centroid, and each quarter holding
 * a real share of them gives one point. A broadside's damage then shows on
 * both flanks instead of on the keel between them.
 */
export function subsystemEmitters(g: THREE.BufferGeometry): SubsystemEmitters {
    const pos = g.getAttribute('position');
    const tag = g.getAttribute('subsystem');
    const out: SubsystemEmitters = {};
    if (!tag) return out;
    for (const id of SUBSYSTEM_IDS) {
        const want = SUBSYSTEM_TAG[id];
        const c = new THREE.Vector3();
        let n = 0;
        for (let i = 0; i < pos.count; i++) {
            if (tag.getX(i) !== want) continue;
            c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i);
            n++;
        }
        if (!n) continue;
        c.divideScalar(n);
        const quarters = Array.from({ length: 4 }, () => ({ p: new THREE.Vector3(), n: 0 }));
        for (let i = 0; i < pos.count; i++) {
            if (tag.getX(i) !== want) continue;
            const q = quarters[(pos.getX(i) >= c.x ? 1 : 0) + (pos.getY(i) >= c.y ? 2 : 0)];
            q.p.x += pos.getX(i); q.p.y += pos.getY(i); q.p.z += pos.getZ(i);
            q.n++;
        }
        const pts = quarters.filter(q => q.n >= n * 0.12).map(q => q.p.divideScalar(q.n));
        out[id] = pts.length ? pts : [c];
    }
    return out;
}

export interface ModelSet {
    ships: Map<ShipClassId, HullModel>;
    /** factionId → class → hull, only for the factions in this battle. */
    factionShips: Map<string, Map<ShipClassId, HullModel>>;
    craft: Map<SquadronType, HullModel>;
    torpedo: HullModel | null;
    asteroids: HullModel[];
    /** The system's station; its `spin` attribute marks the turning ring. */
    station: HullModel | null;
}

interface Manifest {
    ships?: Partial<Record<string, string>>;
    factions?: Record<string, Partial<Record<string, string>>>;
    craft?: Partial<Record<string, string>>;
    torpedo?: string | null;
    asteroids?: string[];
    station?: string | null;
}

const CLASS_IDS = new Set<string>(['corvette', 'destroyer', 'cruiser', 'battleship', 'carrier']);
const CRAFT_TYPES = new Set<string>(['interceptor', 'bomber']);

/** Where a model's length along X has to land (must match the placeholders). */
type Fit =
    | { kind: 'length'; length: number; xMin: number; shade: number | null }
    | { kind: 'radius'; radius: number }
    /** Widest ground-plane extent (X or Y) scaled to `span`, centred on all axes. */
    | { kind: 'span'; span: number; shade: number };

function hullFit(id: ShipClassId): Fit {
    const r = SHIP_CLASSES[id].radius;
    return { kind: 'length', length: 2.5 * r, xMin: -r, shade: 0.6 };
}
const CRAFT_FIT: Fit = { kind: 'length', length: 4.2, xMin: -1.8, shade: 0.6 };
const TORPEDO_FIT: Fit = { kind: 'length', length: 7, xMin: -3.5, shade: null };
const ROCK_FIT: Fit = { kind: 'radius', radius: 1 };
const STATION_FIT: Fit = { kind: 'span', span: STATION_SPAN, shade: 0.6 };

export function emptyModelSet(): ModelSet {
    return { ships: new Map(), factionShips: new Map(), craft: new Map(), torpedo: null, asteroids: [], station: null };
}

export async function loadModelSet(factionIds: Array<string | undefined>): Promise<ModelSet> {
    const out = emptyModelSet();
    const res = await fetch(`${MODEL_BASE}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return out;
    const manifest = (await res.json()) as Manifest;
    const loader = new GLTFLoader();

    const load = async (file: string | undefined | null, fit: Fit, label: string, tagging = SUBSYSTEM_TAGGING): Promise<HullModel | null> => {
        if (!file) return null;
        try {
            const gltf = await loader.loadAsync(`${MODEL_BASE}/${file}`);
            return toModel(gltf.scene, fit, tagging);
        } catch (err) {
            console.warn(`[battle-renderer] model ${label} (${file}) failed to load, keeping placeholder`, err);
            return null;
        }
    };

    const jobs: Promise<void>[] = [];
    for (const [id, file] of Object.entries(manifest.ships ?? {})) {
        if (!CLASS_IDS.has(id)) continue;
        jobs.push(load(file, hullFit(id as ShipClassId), id).then(m => { if (m) out.ships.set(id as ShipClassId, m); }));
    }
    const wanted = new Set(factionIds.filter((f): f is string => !!f));
    for (const [factionId, hulls] of Object.entries(manifest.factions ?? {})) {
        if (!wanted.has(factionId)) continue;
        const byClass = new Map<ShipClassId, HullModel>();
        out.factionShips.set(factionId, byClass);
        for (const [id, file] of Object.entries(hulls ?? {})) {
            if (!CLASS_IDS.has(id)) continue;
            jobs.push(load(file, hullFit(id as ShipClassId), `${factionId}/${id}`)
                .then(m => { if (m) byClass.set(id as ShipClassId, m); }));
        }
    }
    for (const [type, file] of Object.entries(manifest.craft ?? {})) {
        if (!CRAFT_TYPES.has(type)) continue;
        jobs.push(load(file, CRAFT_FIT, type).then(m => { if (m) out.craft.set(type as SquadronType, m); }));
    }
    jobs.push(load(manifest.torpedo, TORPEDO_FIT, 'torpedo').then(m => { out.torpedo = m; }));
    const rocks: Array<HullModel | null> = [];
    (manifest.asteroids ?? []).forEach((file, i) => {
        jobs.push(load(file, ROCK_FIT, `asteroid ${i + 1}`).then(m => { rocks[i] = m; }));
    });
    jobs.push(load(manifest.station, STATION_FIT, 'station', SPIN_TAGGING).then(m => { out.station = m; }));
    await Promise.all(jobs);
    out.asteroids = rocks.filter((m): m is HullModel => !!m);
    return out;
}

function toModel(root: THREE.Object3D, fit: Fit, tagging: Tagging): HullModel | null {
    root.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    let firstMaterial: THREE.Material | null = null;
    root.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        // Keep only the attributes every part is guaranteed to share.
        for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        if (!g.getAttribute('uv')) {
            g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
        }
        setVertexTag(g, tagging.attribute, tagFor(mesh, tagging.words));
        g.morphAttributes = {};
        parts.push(g.index ? g.toNonIndexed() : g);
        if (!firstMaterial) firstMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    });
    if (!parts.length) return null;

    const geometry = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!geometry) return null;

    // glTF is Y-up (Blender's Z-up after export): the renderer wants Z-up.
    geometry.rotateX(Math.PI / 2);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    if (fit.kind === 'length') {
        const scale = fit.length / (bb.max.x - bb.min.x || 1);
        geometry.scale(scale, scale, scale);
        geometry.computeBoundingBox();
        const b2 = geometry.boundingBox!;
        geometry.translate(fit.xMin - b2.min.x, -(b2.min.y + b2.max.y) / 2, -(b2.min.z + b2.max.z) / 2);
    } else if (fit.kind === 'span') {
        const centre = new THREE.Vector3();
        bb.getCenter(centre);
        geometry.translate(-centre.x, -centre.y, -centre.z);
        const s = fit.span / (Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) || 1);
        geometry.scale(s, s, s);
    } else {
        const centre = new THREE.Vector3();
        bb.getCenter(centre);
        geometry.translate(-centre.x, -centre.y, -centre.z);
        geometry.computeBoundingSphere();
        const s = fit.radius / (geometry.boundingSphere!.radius || 1);
        geometry.scale(s, s, s);
    }
    geometry.computeVertexNormals();
    if (fit.kind !== 'radius' && fit.shade !== null) addHeightShade(geometry, fit.shade);
    geometry.computeBoundingSphere();

    const maps: ModelMaps = {};
    const m = firstMaterial as THREE.MeshStandardMaterial | null;
    if (m && m.isMeshStandardMaterial) {
        if (m.map) maps.map = m.map;
        if (m.normalMap) maps.normalMap = m.normalMap;
        if (m.roughnessMap) maps.roughnessMap = m.roughnessMap;
        if (m.metalnessMap) maps.metalnessMap = m.metalnessMap;
        if (m.emissiveMap) maps.emissiveMap = m.emissiveMap;
    }
    return { geometry, maps, emitters: tagging === SUBSYSTEM_TAGGING ? subsystemEmitters(geometry) : {} };
}
