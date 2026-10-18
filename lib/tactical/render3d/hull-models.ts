// lib/tactical/render3d/hull-models.ts
// Drop-in glTF hulls for the battle renderer.
//
// public/models/ships/manifest.json lists which classes have a real model:
//   { "ships": { "cruiser": "cruiser.glb", "battleship": "battleship.glb" } }
// Classes missing from the manifest (or a missing manifest) keep their
// procedural placeholder. Each model is merged into ONE geometry so it can be
// instanced, converted from glTF's Y-up to the renderer's Z-up, and scaled so
// its length matches the class footprint (x ∈ [-r, 1.5r]) — click grab radii
// and the 2D overlay rings therefore never depend on how big the artist made
// the mesh. Only the first material's texture maps are carried over; per-part
// materials would break instancing.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShipClassId } from '../types';
import { SHIP_CLASSES } from '../ship-defs';
import { addHeightShade } from './placeholder-hulls';

export const MODEL_BASE = '/models/ships';

export interface HullModel {
    geometry: THREE.BufferGeometry;
    maps: {
        map?: THREE.Texture;
        normalMap?: THREE.Texture;
        roughnessMap?: THREE.Texture;
        metalnessMap?: THREE.Texture;
        emissiveMap?: THREE.Texture;
    };
}

interface Manifest {
    ships?: Partial<Record<ShipClassId, string>>;
}

const CLASS_IDS = new Set<string>(['corvette', 'destroyer', 'cruiser', 'battleship', 'carrier']);

export async function loadHullModels(): Promise<Map<ShipClassId, HullModel>> {
    const out = new Map<ShipClassId, HullModel>();
    const res = await fetch(`${MODEL_BASE}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return out;
    const manifest = (await res.json()) as Manifest;
    const entries = Object.entries(manifest.ships ?? {}).filter(([id, file]) => CLASS_IDS.has(id) && !!file);
    if (!entries.length) return out;

    const loader = new GLTFLoader();
    await Promise.all(entries.map(async ([id, file]) => {
        try {
            const gltf = await loader.loadAsync(`${MODEL_BASE}/${file}`);
            const model = toHullModel(gltf.scene, id as ShipClassId);
            if (model) out.set(id as ShipClassId, model);
        } catch (err) {
            console.warn(`[battle-renderer] hull model ${id} failed to load, keeping placeholder`, err);
        }
    }));
    return out;
}

function toHullModel(root: THREE.Object3D, classId: ShipClassId): HullModel | null {
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

    // glTF is Y-up with the bow along +X (see public/models/ships/README.md);
    // the renderer wants Z-up.
    geometry.rotateX(Math.PI / 2);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const length = bb.max.x - bb.min.x || 1;
    const r = SHIP_CLASSES[classId].radius;
    const scale = (2.5 * r) / length;
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    const b2 = geometry.boundingBox!;
    geometry.translate(-b2.min.x - r, -(b2.min.y + b2.max.y) / 2, -(b2.min.z + b2.max.z) / 2);
    geometry.computeVertexNormals();
    addHeightShade(geometry, 0.6);
    geometry.computeBoundingSphere();

    const maps: HullModel['maps'] = {};
    const m = firstMaterial as THREE.MeshStandardMaterial | null;
    if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        if (m.map) maps.map = m.map;
        if (m.normalMap) maps.normalMap = m.normalMap;
        if (m.roughnessMap) maps.roughnessMap = m.roughnessMap;
        if (m.metalnessMap) maps.metalnessMap = m.metalnessMap;
        if (m.emissiveMap) maps.emissiveMap = m.emissiveMap;
    }
    return { geometry, maps };
}
