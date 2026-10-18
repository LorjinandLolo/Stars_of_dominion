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
//     "asteroids": ["props/asteroid-1.glb", "props/asteroid-2.glb"]
//   }
//
// Each model is merged into ONE geometry so it can be instanced, turned from
// glTF's Y-up to the renderer's Z-up, and normalised to its slot's footprint,
// so the artist's scale never matters. Only the first material's texture maps
// are carried over; per-part materials would break instancing.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShipClassId, SquadronType } from '../types';
import { SHIP_CLASSES } from '../ship-defs';
import { addHeightShade } from './placeholder-hulls';

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
}

export interface ModelSet {
    ships: Map<ShipClassId, HullModel>;
    /** factionId → class → hull, only for the factions in this battle. */
    factionShips: Map<string, Map<ShipClassId, HullModel>>;
    craft: Map<SquadronType, HullModel>;
    torpedo: HullModel | null;
    asteroids: HullModel[];
}

interface Manifest {
    ships?: Partial<Record<string, string>>;
    factions?: Record<string, Partial<Record<string, string>>>;
    craft?: Partial<Record<string, string>>;
    torpedo?: string | null;
    asteroids?: string[];
}

const CLASS_IDS = new Set<string>(['corvette', 'destroyer', 'cruiser', 'battleship', 'carrier']);
const CRAFT_TYPES = new Set<string>(['interceptor', 'bomber']);

/** Where a model's length along X has to land (must match the placeholders). */
type Fit =
    | { kind: 'length'; length: number; xMin: number; shade: number | null }
    | { kind: 'radius'; radius: number };

function hullFit(id: ShipClassId): Fit {
    const r = SHIP_CLASSES[id].radius;
    return { kind: 'length', length: 2.5 * r, xMin: -r, shade: 0.6 };
}
const CRAFT_FIT: Fit = { kind: 'length', length: 4.2, xMin: -1.8, shade: 0.6 };
const TORPEDO_FIT: Fit = { kind: 'length', length: 7, xMin: -3.5, shade: null };
const ROCK_FIT: Fit = { kind: 'radius', radius: 1 };

export function emptyModelSet(): ModelSet {
    return { ships: new Map(), factionShips: new Map(), craft: new Map(), torpedo: null, asteroids: [] };
}

export async function loadModelSet(factionIds: Array<string | undefined>): Promise<ModelSet> {
    const out = emptyModelSet();
    const res = await fetch(`${MODEL_BASE}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return out;
    const manifest = (await res.json()) as Manifest;
    const loader = new GLTFLoader();

    const load = async (file: string | undefined | null, fit: Fit, label: string): Promise<HullModel | null> => {
        if (!file) return null;
        try {
            const gltf = await loader.loadAsync(`${MODEL_BASE}/${file}`);
            return toModel(gltf.scene, fit);
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
    await Promise.all(jobs);
    out.asteroids = rocks.filter((m): m is HullModel => !!m);
    return out;
}

function toModel(root: THREE.Object3D, fit: Fit): HullModel | null {
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
    } else {
        const centre = new THREE.Vector3();
        bb.getCenter(centre);
        geometry.translate(-centre.x, -centre.y, -centre.z);
        geometry.computeBoundingSphere();
        const s = fit.radius / (geometry.boundingSphere!.radius || 1);
        geometry.scale(s, s, s);
    }
    geometry.computeVertexNormals();
    if (fit.kind === 'length' && fit.shade !== null) addHeightShade(geometry, fit.shade);
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
    return { geometry, maps };
}
