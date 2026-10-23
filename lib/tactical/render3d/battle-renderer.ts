// lib/tactical/render3d/battle-renderer.ts
// Stars of Dominion — 2.5D WebGL renderer for the tactical battle.
//
// Draws the WORLD under the view's 2D overlay canvas: backdrop, starfield,
// hazards, hulls, strike craft, torpedoes, beams, engine glow and explosions.
// Everything UI-ish (grid, weapon arcs, shields, hull bars, selection,
// reticles, drag previews) stays on the 2D canvas above, so the two layers
// have to agree on where world (x, y) lands on screen. They do because the
// camera is ORTHOGRAPHIC and pitched by VIEW_PITCH (view.ts): an orthographic
// view of the z = 0 plane is affine, so it maps exactly onto the ViewState the
// 2D overlay draws with (scale, ox, oy, tilt). Height above the plane shows as
// screen-up offset, so you see the hulls' flanks and superstructure: the 2.5D.
//
// Three-space: world (x, y) → (x, -y, 0); +Z is toward the camera. A ship's
// heading θ (world, 0 = +x, clockwise on screen) is a rotation of -θ about Z.
//
// No React, no DOM beyond the canvas. Everything allocated here is released
// by dispose(); the battle view calls it on unmount so an always-open game
// tab never keeps a dead WebGL context around.

import * as THREE from 'three';
import type { BattleState, BattleStation, Hazard, ShipClassId, TacticalShip, TacticalSide } from '../types';
import { SHIP_CLASSES, SQUADRON_DEFS } from '../ship-defs';
import { buildPlaceholderHull, buildRock, buildStation, buildStrikeCraft } from './placeholder-hulls';
import { loadModelSet, SUBSYSTEM_IDS, type HullModel, type ModelSet, type SubsystemEmitters } from './hull-models';
import type { ViewLike } from './view';
import { fallbackHardpoints, mountsFromPoints, type HardpointLayout } from './hardpoints';
import { SkyBackdrop } from './sky';
import type { SquadronType } from '../types';

export type { ViewLike } from './view';

const TAU = Math.PI * 2;
const CAMERA_DISTANCE = 4000;     // orthographic, so only the depth range depends on it
const MAX_PIXEL_RATIO = 1.5;
const BEAM_FADE_SECONDS = 0.12;   // mirrors beam expiry in lib/tactical/sim.ts
const FX_Z = 1;                   // glow plane; depth test is off, so it always draws on top
const DAMAGE_FX_BUDGET = 1500;     // damage smoke/fire/spark sprites per frame; keeps a wrecked 200-ship battle cheap
const CLASS_IDS: ShipClassId[] = ['corvette', 'destroyer', 'cruiser', 'battleship', 'carrier'];
const SIDES: TacticalSide[] = ['player', 'enemy'];
const CRAFT_TYPES: SquadronType[] = ['interceptor', 'bomber'];

const SIDE_COLOUR: Record<TacticalSide, { tint: THREE.Color; emissive: THREE.Color; glow: THREE.Color; stroke: THREE.Color }> = {
    player: {
        tint: new THREE.Color(0.9, 0.92, 1.0),
        emissive: new THREE.Color(0x4f46e5),
        glow: new THREE.Color(0x22d3ee),
        stroke: new THREE.Color(0x818cf8),
    },
    enemy: {
        tint: new THREE.Color(1.0, 0.88, 0.86),
        emissive: new THREE.Color(0xb91c1c),
        glow: new THREE.Color(0xfb923c),
        stroke: new THREE.Color(0xf87171),
    },
};
const OUTLINE_SCALE = 1.1;
const RETREAT_TINT = new THREE.Color(1.0, 0.85, 0.45);
const ARRIVING_DIM = 0.3;
const STATION_SPIN_RATE = 0.06;   // rad per battle second: one turn in under two minutes

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashStr(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Radial white→transparent disc, shared by glows, nebulae and explosions. */
function makeSoftDiscTexture(): THREE.Texture {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** Horizontal line with soft edges across V, bright core in the middle. */
function makeBeamTexture(): THREE.Texture {
    const w = 4, h = 32;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/**
 * InstancedMesh that grows. Per frame: begin(), push instances, end(). Growing
 * swaps the mesh in the scene; geometry and material are owned by the caller.
 */
class InstancePool {
    mesh: InstancedMesh;
    private used = 0;
    /** Hull pools only: per-ship damage the hull shader reads (see addHullDamage). */
    private damage: { sys: THREE.InstancedBufferAttribute; hull: THREE.InstancedBufferAttribute } | null = null;
    constructor(
        private readonly scene: THREE.Scene,
        public geometry: THREE.BufferGeometry,
        public material: THREE.Material,
        capacity: number,
        private readonly opts: { depthTest?: boolean; renderOrder?: number; damage?: boolean } = {},
    ) {
        this.mesh = this.make(Math.max(1, capacity));
    }

    private make(capacity: number): InstancedMesh {
        const geometry = this.opts.damage ? this.wrap(capacity) : this.geometry;
        const mesh = new THREE.InstancedMesh(geometry, this.material, capacity) as InstancedMesh;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Allocate instanceColor up front so per-instance tinting is always on.
        mesh.setColorAt(0, new THREE.Color(1, 1, 1));
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        if (this.opts.renderOrder !== undefined) mesh.renderOrder = this.opts.renderOrder;
        this.scene.add(mesh);
        return mesh;
    }

    /**
     * A damage pool's mesh geometry: every vertex attribute is SHARED with the
     * caller's geometry (which the outline and the other side's pool also draw),
     * plus this pool's own instanced damage attributes. Values carry over from
     * the previous wrapper, so growing or swapping a model keeps them.
     */
    private wrap(capacity: number): THREE.BufferGeometry {
        const g = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(this.geometry.attributes)) g.setAttribute(name, attr);
        g.setIndex(this.geometry.index);
        const sys = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4).fill(1), 4);
        const hull = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2).fill(1), 2);
        if (this.damage) {
            (sys.array as Float32Array).set(this.damage.sys.array.subarray(0, capacity * 4));
            (hull.array as Float32Array).set(this.damage.hull.array.subarray(0, capacity * 2));
        }
        sys.setUsage(THREE.DynamicDrawUsage);
        hull.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('dmgSys', sys);
        g.setAttribute('dmgHull', hull);
        this.damage = { sys, hull };
        return g;
    }

    /** Free a wrapper's own buffers. The shared ones are detached first, or dispose would free them too. */
    private unwrap(g: THREE.BufferGeometry): void {
        for (const name of Object.keys(g.attributes)) {
            if (name !== 'dmgSys' && name !== 'dmgHull') g.deleteAttribute(name);
        }
        g.setIndex(null);
        g.dispose();
    }

    setGeometry(geometry: THREE.BufferGeometry): void {
        this.geometry = geometry;
        if (!this.opts.damage) {
            this.mesh.geometry = geometry;
            return;
        }
        const old = this.mesh.geometry;
        this.mesh.geometry = this.wrap(this.mesh.instanceMatrix.count);
        this.unwrap(old);
    }

    begin(): void {
        this.used = 0;
    }

    push(x: number, y: number, z: number, angle: number, sx: number, sy: number, sz: number, colour: THREE.Color): void {
        if (this.used >= this.mesh.instanceMatrix.count) {
            const old = this.mesh;
            const next = this.make(old.instanceMatrix.count * 2);
            (next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array);
            (next.instanceColor!.array as Float32Array).set(old.instanceColor!.array);
            this.scene.remove(old);
            old.dispose();
            if (this.opts.damage) this.unwrap(old.geometry);
            this.mesh = next;
        }
        // Scale, then rotate about Z, then translate, written straight into the
        // column-major instance matrix: damage effects push thousands of
        // sprites a frame, and compose() + setMatrixAt() cost several times this.
        const c = angle ? Math.cos(angle) : 1;
        const s = angle ? Math.sin(angle) : 0;
        const e = this.mesh.instanceMatrix.array as Float32Array;
        const o = this.used * 16;
        e[o] = c * sx; e[o + 1] = s * sx; e[o + 2] = 0; e[o + 3] = 0;
        e[o + 4] = -s * sy; e[o + 5] = c * sy; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = sz; e[o + 11] = 0;
        e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
        const ca = this.mesh.instanceColor!.array as Float32Array;
        ca[this.used * 3] = colour.r;
        ca[this.used * 3 + 1] = colour.g;
        ca[this.used * 3 + 2] = colour.b;
        this.used++;
    }

    /** Damage for the instance just pushed: subsystem integrity 0..1, hull fraction, stable seed. */
    setDamage(engines: number, shields: number, weapons: number, sensors: number, hull: number, seed: number): void {
        const i = this.used - 1;
        this.damage!.sys.setXYZW(i, engines, shields, weapons, sensors);
        this.damage!.hull.setXY(i, hull, seed);
    }

    end(): void {
        this.mesh.count = this.used;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor!.needsUpdate = true;
        if (this.damage) {
            this.damage.sys.needsUpdate = true;
            this.damage.hull.needsUpdate = true;
        }
    }

    dispose(): void {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
        if (this.opts.damage) this.unwrap(this.mesh.geometry);
    }
}

type InstancedMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;

// ── Hull damage shader ──
//
// Vertex attribute `subsystem` (hull-models.ts) says which part a vertex is;
// instanced `dmgSys` holds that ship's engines/shields/weapons/sensors
// integrity and `dmgHull` its hull fraction plus a stable per-ship seed. A
// failing part blackens with char spreading across it, glows with ember
// cracks once it is badly hit, and its lights flicker and then die at 0.
// Lost hull adds scorch patches over the whole ship. All in the one hull draw
// call per pool; nothing per ship but six floats.

const DAMAGE_VERT_HEAD = /* glsl */ `
attribute float subsystem;
attribute vec4 dmgSys;
attribute vec2 dmgHull;
varying vec3 vDmgPos;
varying float vDmgSys;
varying vec2 vDmgHull;
`;
const DAMAGE_VERT_BODY = /* glsl */ `
vDmgSys = subsystem < 0.5 ? 1.0 : subsystem < 1.5 ? dmgSys.x : subsystem < 2.5 ? dmgSys.y : subsystem < 3.5 ? dmgSys.z : dmgSys.w;
vDmgHull = dmgHull;
vDmgPos = transformed;
`;
const DAMAGE_FRAG_HEAD = /* glsl */ `
uniform float uDmgTime;
varying vec3 vDmgPos;
varying float vDmgSys;
varying vec2 vDmgHull;
float dmgHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dmgNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(dmgHash(i), dmgHash(i + vec3(1, 0, 0)), f.x), mix(dmgHash(i + vec3(0, 1, 0)), dmgHash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(dmgHash(i + vec3(0, 0, 1)), dmgHash(i + vec3(1, 0, 1)), f.x), mix(dmgHash(i + vec3(0, 1, 1)), dmgHash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
}
`;
const DAMAGE_FRAG_COLOUR = /* glsl */ `
float dmgSysLoss = 1.0 - clamp(vDmgSys, 0.0, 1.0);
float dmgHullLoss = 1.0 - clamp(vDmgHull.x, 0.0, 1.0);
vec3 dmgP = vDmgPos + vDmgHull.y * 97.0;
float dmgN = dmgNoise(dmgP * 0.55) * 0.65 + dmgNoise(dmgP * 1.7) * 0.35;
float dmgChar = (1.0 - smoothstep(dmgSysLoss - 0.12, dmgSysLoss + 0.04, dmgN)) * step(0.01, dmgSysLoss);
float dmgTone = mix(1.0, 0.16, dmgSysLoss) * mix(1.0, 0.3, dmgChar);
float dmgCover = dmgHullLoss * 0.85;
float dmgScorch = (1.0 - smoothstep(dmgCover - 0.1, dmgCover + 0.02, dmgNoise(dmgP * 0.21 + 13.0))) * step(0.01, dmgHullLoss);
dmgTone *= mix(1.0, 0.28, dmgScorch);
float dmgEmber = smoothstep(0.022, 0.0, abs(dmgN - 0.52)) * smoothstep(0.5, 1.0, dmgSysLoss);
diffuseColor.rgb *= dmgTone;
`;
const DAMAGE_FRAG_EMISSIVE = /* glsl */ `
float dmgFlick = step(0.3, fract(sin(floor(uDmgTime * 11.0) * 12.9898 + vDmgHull.y * 78.233 + floor(vDmgPos.x * 0.3) * 3.1) * 43758.5453));
float dmgLights = clamp(vDmgSys * 2.5, 0.0, 1.0) * (vDmgSys < 0.5 ? dmgFlick : 1.0);
dmgLights *= vDmgHull.x < 0.25 ? mix(1.0, dmgFlick, 0.6) : 1.0;
totalEmissiveRadiance *= dmgLights * mix(1.0, 0.35, dmgScorch);
totalEmissiveRadiance += vec3(1.0, 0.38, 0.08) * dmgEmber * (0.55 + 0.45 * sin(uDmgTime * 7.0 + vDmgHull.y * 40.0));
`;

/** Hull material → damage-aware hull material. Every hull pool's geometry must carry the damage attributes. */
function addHullDamage(mat: THREE.MeshStandardMaterial, time: { value: number }): void {
    mat.onBeforeCompile = shader => {
        shader.uniforms.uDmgTime = time;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${DAMAGE_VERT_HEAD}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${DAMAGE_VERT_BODY}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${DAMAGE_FRAG_HEAD}`)
            .replace('#include <color_fragment>', `#include <color_fragment>\n${DAMAGE_FRAG_COLOUR}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${DAMAGE_FRAG_EMISSIVE}`);
    };
    mat.customProgramCacheKey = () => 'hull-damage';
}

// ── Station spin shader ──
//
// Vertex attribute `spin` (hull-models.ts: parts named "ring"; the placeholder
// tags its ring and spokes) turns about the station's Z axis by uSpin radians,
// normals too so the lit side travels with the ring. One mesh, one draw call;
// nothing per frame but the uniform.

const SPIN_VERT_HEAD = /* glsl */ `
attribute float spin;
uniform float uSpin;
mat2 spinRot() { float c = cos(uSpin), s = sin(uSpin); return mat2(c, s, -s, c); }
`;
const SPIN_VERT_NORMAL = /* glsl */ `
if (spin > 0.5) objectNormal.xy = spinRot() * objectNormal.xy;
`;
const SPIN_VERT_BODY = /* glsl */ `
if (spin > 0.5) transformed.xy = spinRot() * transformed.xy;
`;

function addStationSpin(mat: THREE.MeshStandardMaterial, spin: { value: number }): void {
    mat.onBeforeCompile = shader => {
        shader.uniforms.uSpin = spin;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${SPIN_VERT_HEAD}`)
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${SPIN_VERT_NORMAL}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SPIN_VERT_BODY}`);
    };
    mat.customProgramCacheKey = () => 'station-spin';
}

/** Deterministic 0..1 from a number (the JS twin of the shader's sin hash). */
function hash01(n: number): number {
    const x = Math.sin(n) * 43758.5453;
    return x - Math.floor(x);
}

/** Where general hull fires burn: two points along the deck. */
function hullAnchors(g: THREE.BufferGeometry): THREE.Vector3[] {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    const z = min.z + (max.z - min.z) * 0.7;
    return [0.35, 0.62].map(t => new THREE.Vector3(min.x + (max.x - min.x) * t, 0, z));
}

/**
 * Hardpoint marker anchors: a tagged subsystem's emitter points averaged and
 * lifted to the top of the part, so the marker sits where the eye finds it;
 * the per-class fallback layout for any subsystem the model does not name.
 * Weapon mounts pick their flank out of the tagged weapon points.
 */
function hardpointLayout(classId: ShipClassId, g: THREE.BufferGeometry, emit: SubsystemEmitters): HardpointLayout {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    const weapons = SHIP_CLASSES[classId].weapons;
    const out = fallbackHardpoints({ minX: min.x, maxX: max.x, minY: min.y, maxY: max.y, minZ: min.z, maxZ: max.z }, weapons);
    for (const id of SUBSYSTEM_IDS) {
        const pts = emit[id];
        if (!pts?.length) continue;
        let x = 0, y = 0, z = -Infinity;
        for (const p of pts) { x += p.x; y += p.y; z = Math.max(z, p.z); }
        out[id] = { x: x / pts.length, y: y / pts.length, z };
    }
    if (emit.weapons?.length) out.mounts = mountsFromPoints(emit.weapons, weapons, out.mounts);
    return out;
}

/**
 * Smoke and fire anchors for every subsystem: the model's tagged emitters, and
 * the hardpoint marker's spot for any part it does not name, so an untagged
 * hull burns where its marker sits. Built with the layout, never per frame.
 */
function damageEmitters(layout: HardpointLayout, emit: SubsystemEmitters): SubsystemEmitters {
    const out: SubsystemEmitters = {};
    for (const id of SUBSYSTEM_IDS) {
        const pts = emit[id];
        const a = layout[id];
        out[id] = pts?.length ? pts : [new THREE.Vector3(a.x, a.y, a.z)];
    }
    return out;
}

export class BattleRenderer {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);
    private readonly discTexture = makeSoftDiscTexture();
    private readonly beamTexture = makeBeamTexture();
    /** Nebula, stars and planet behind the battle, drawn first each frame. */
    private sky: SkyBackdrop | null = null;
    private readonly hullGeometry = new Map<ShipClassId, THREE.BufferGeometry>();
    private readonly hullMaterial = new Map<string, THREE.MeshStandardMaterial>();
    private readonly hulls = new Map<string, InstancePool>();
    /** Back-face silhouette in the side's colour: the 2D view's coloured stroke, in 3D. */
    private readonly outlines = new Map<string, InstancePool>();
    /** side:type → pool, so interceptors and bombers can carry different models. */
    private readonly craft = new Map<string, InstancePool>();
    private readonly craftMaterial = new Map<string, THREE.MeshStandardMaterial>();
    private readonly torpedoes: Record<TacticalSide, InstancePool>;
    private readonly sprites: InstancePool;
    private readonly beams: InstancePool;
    private readonly rocks: InstancePool[] = [];
    private readonly rockMaterials: THREE.MeshStandardMaterial[] = [];
    /** The system's station: one static mesh whose tagged ring turns by stationSpin. */
    private station: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } | null = null;
    private readonly stationSpin = { value: 0 };
    private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
    private readonly ownedMaterials: THREE.Material[] = [];
    private readonly ownedTextures: THREE.Texture[] = [];
    /** class:side → smoke/fire anchors per subsystem (tagged parts, else the hardpoint spot), and along the deck for hull fires. */
    private readonly emitters = new Map<string, SubsystemEmitters>();
    private readonly anchors = new Map<string, THREE.Vector3[]>();
    /** class:side → where each subsystem's hardpoint marker goes, model space. */
    private readonly hardpointLayouts = new Map<string, HardpointLayout>();
    /** Shader clock for flicker and embers: battle time, so a paused battle holds still. */
    private readonly damageTime = { value: 0 };
    private readonly shipSeeds = new Map<string, number>();
    private readonly colour = new THREE.Color();
    private readonly fxPos = new THREE.Vector3();
    private fxLeft = 0;
    private disposed = false;
    /** True once at least one real glTF model replaced its placeholder. */
    modelsLoaded = false;

    constructor(
        canvas: HTMLCanvasElement,
        state: BattleState,
        private readonly factions: Partial<Record<TacticalSide, string>> = {},
    ) {
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        this.renderer.setClearColor(0x02030a, 1);
        // Two passes per frame (sky, then battle), so clearing is manual.
        this.renderer.autoClear = false;
        this.renderer.shadowMap.enabled = false;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.ownedTextures.push(this.discTexture, this.beamTexture);

        this.camera.up.set(0, 1, 0);

        // Lights: one key, one hemisphere fill. No shadows anywhere. The key
        // sits on the camera's side (low three-Y) and to the left, so the flanks
        // the tilted camera sees are lit and the decks still read as stepped.
        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(-0.8, -0.9, 1.1);
        this.scene.add(key);
        this.scene.add(new THREE.HemisphereLight(0x9bb0ff, 0x1a2236, 0.45));
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.06));

        this.sky = new SkyBackdrop(skySeed(state), state, this.discTexture);
        this.buildBackdrop(state);
        this.buildHazards(state.hazards);
        if (state.station) this.buildStation(state.station);

        // Hull pools: one per (class, side) so each side keeps its own emissive.
        for (const id of CLASS_IDS) {
            const geo = buildPlaceholderHull(id);
            this.hullGeometry.set(id, geo);
            this.ownedGeometries.add(geo);
            for (const side of SIDES) {
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x8a93a1,
                    metalness: 0.5,
                    roughness: 0.55,
                    emissive: SIDE_COLOUR[side].emissive,
                    emissiveIntensity: 0.1,
                    flatShading: true,
                    vertexColors: true,
                });
                addHullDamage(mat, this.damageTime);
                this.hullMaterial.set(`${id}:${side}`, mat);
                this.ownedMaterials.push(mat);
                this.hulls.set(`${id}:${side}`, new InstancePool(this.scene, geo, mat, 8, { damage: true }));
                const layout = hardpointLayout(id, geo, {});
                this.emitters.set(`${id}:${side}`, damageEmitters(layout, {}));
                this.anchors.set(`${id}:${side}`, hullAnchors(geo));
                this.hardpointLayouts.set(`${id}:${side}`, layout);
                const outlineMat = new THREE.MeshBasicMaterial({
                    color: SIDE_COLOUR[side].stroke,
                    side: THREE.BackSide,
                });
                this.ownedMaterials.push(outlineMat);
                this.outlines.set(`${id}:${side}`, new InstancePool(this.scene, geo, outlineMat, 8));
            }
        }

        const craftGeo = buildStrikeCraft();
        this.ownedGeometries.add(craftGeo);
        const craftMat = (side: TacticalSide) => {
            const m = new THREE.MeshStandardMaterial({
                color: 0xc8ccd6,
                metalness: 0.4,
                roughness: 0.6,
                emissive: SIDE_COLOUR[side].emissive,
                emissiveIntensity: 0.5,
                flatShading: true,
            });
            this.ownedMaterials.push(m);
            return m;
        };
        for (const side of SIDES) {
            for (const type of CRAFT_TYPES) {
                const m = craftMat(side);
                this.craftMaterial.set(`${side}:${type}`, m);
                this.craft.set(`${side}:${type}`, new InstancePool(this.scene, craftGeo, m, 32));
            }
        }

        const torpGeo = new THREE.ConeGeometry(1.8, 7, 6);
        torpGeo.rotateZ(-Math.PI / 2);
        this.ownedGeometries.add(torpGeo);
        const torpMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.ownedMaterials.push(torpMat);
        this.torpedoes = {
            player: new InstancePool(this.scene, torpGeo, torpMat, 16),
            enemy: new InstancePool(this.scene, torpGeo, torpMat, 16),
        };

        const quad = new THREE.PlaneGeometry(1, 1);
        this.ownedGeometries.add(quad);
        const spriteMat = new THREE.MeshBasicMaterial({
            map: this.discTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });
        const beamMat = new THREE.MeshBasicMaterial({
            map: this.beamTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });
        this.ownedMaterials.push(spriteMat, beamMat);
        this.sprites = new InstancePool(this.scene, quad, spriteMat, 64, { renderOrder: 10 });
        this.beams = new InstancePool(this.scene, quad, beamMat, 32, { renderOrder: 11 });

        void this.installModels();
    }

    // ── Static scenery ──

    private buildBackdrop(state: BattleState): void {
        // The sky (sky.ts) is the backdrop now. The battlefield itself is only
        // a faint dark veil, so its bounds read without hiding the space behind.
        const field = new THREE.PlaneGeometry(state.width, state.height);
        const fieldMat = new THREE.MeshBasicMaterial({
            color: 0x050b1e, transparent: true, opacity: 0.22, depthWrite: false,
        });
        this.ownedGeometries.add(field);
        this.ownedMaterials.push(fieldMat);
        const plane = new THREE.Mesh(field, fieldMat);
        plane.position.set(state.width / 2, -state.height / 2, -4);
        plane.renderOrder = -1;
        this.scene.add(plane);
    }

    private buildHazards(hazards: Hazard[]): void {
        const discGeo = new THREE.PlaneGeometry(1, 1);
        this.ownedGeometries.add(discGeo);
        hazards.forEach((h, i) => {
            if (h.kind === 'asteroid') {
                // Dim disc under the rocks, then a rock pool seeded from the position.
                const shade = new THREE.MeshBasicMaterial({
                    map: this.discTexture, color: 0x1e293b, transparent: true, opacity: 0.75, depthWrite: false,
                });
                this.ownedMaterials.push(shade);
                const disc = new THREE.Mesh(discGeo, shade);
                disc.position.set(h.x, -h.y, -2.5);
                disc.scale.set(h.r * 2.3, h.r * 2.3, 1);
                this.scene.add(disc);

                const seed = (Math.round(h.x * 31 + h.y * 17 + h.r * 7) >>> 0) || 1;
                const rand = mulberry32(seed);
                const rockGeo = buildRock(seed + i);
                this.ownedGeometries.add(rockGeo);
                const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95, metalness: 0.05, flatShading: true });
                this.ownedMaterials.push(rockMat);
                this.rockMaterials.push(rockMat);
                const count = Math.max(18, Math.min(60, Math.round((h.r * h.r) / 350)));
                const pool = new InstancePool(this.scene, rockGeo, rockMat, count);
                pool.begin();
                const grey = new THREE.Color();
                for (let k = 0; k < count; k++) {
                    const rr = h.r * Math.sqrt(rand()) * 0.92;
                    const a = rand() * TAU;
                    const size = 1.6 + rand() * 4.4;
                    grey.setScalar(0.7 + rand() * 0.5);
                    pool.push(h.x + Math.cos(a) * rr, -(h.y + Math.sin(a) * rr), -1 + rand() * 2, rand() * TAU, size, size * (0.7 + rand() * 0.5), size, grey);
                }
                pool.end();
                this.rocks.push(pool);
            } else {
                // Two soft blobs, purple and pink, offset like the 2D version.
                const blob = (ox: number, oy: number, r: number, colour: number, opacity: number) => {
                    const m = new THREE.MeshBasicMaterial({
                        map: this.discTexture, color: colour, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
                    });
                    this.ownedMaterials.push(m);
                    const mesh = new THREE.Mesh(discGeo, m);
                    mesh.position.set(h.x + ox, -(h.y + oy), -2.5);
                    mesh.scale.set(r * 2, r * 2, 1);
                    this.scene.add(mesh);
                };
                blob(-h.r * 0.22, -h.r * 0.12, h.r * 0.9, 0xa855f7, 0.28);
                blob(h.r * 0.2, h.r * 0.14, h.r * 0.85, 0xec4899, 0.22);
            }
        });
    }

    /**
     * The station: lit like a hull, emissive in its owner's colour so the
     * windows in its emissive map read as that side's lights, ring turning in
     * the vertex shader. Placeholder until the manifest's station model lands.
     */
    private buildStation(st: BattleStation): void {
        const geo = buildStation(st.kind);
        this.ownedGeometries.add(geo);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8a93a1,
            metalness: 0.5,
            roughness: 0.55,
            emissive: SIDE_COLOUR[st.side].emissive,
            emissiveIntensity: 0.18,
            flatShading: true,
            vertexColors: true,
        });
        addStationSpin(mat, this.stationSpin);
        this.ownedMaterials.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(st.x, -st.y, 0);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.station = { mesh, material: mat };
    }

    // ── glTF drop-ins ──

    private async installModels(): Promise<void> {
        let set: ModelSet;
        try {
            set = await loadModelSet([this.factions.player, this.factions.enemy]);
        } catch {
            return;
        }
        if (this.disposed) {
            disposeModelSet(set);
            return;
        }
        const adopt = (model: HullModel) => {
            this.ownedGeometries.add(model.geometry);
            for (const t of Object.values(model.maps)) if (t && !this.ownedTextures.includes(t)) this.ownedTextures.push(t);
            this.modelsLoaded = true;
        };

        // Hulls: a faction's own hull beats the generic one, per side.
        for (const id of CLASS_IDS) {
            for (const side of SIDES) {
                const faction = this.factions[side];
                const model = (faction && set.factionShips.get(faction)?.get(id)) || set.ships.get(id);
                if (!model) continue;
                adopt(model);
                this.hulls.get(`${id}:${side}`)!.setGeometry(model.geometry);
                this.outlines.get(`${id}:${side}`)!.setGeometry(model.geometry);
                applyMaps(this.hullMaterial.get(`${id}:${side}`)!, model);
                const layout = hardpointLayout(id, model.geometry, model.emitters);
                this.emitters.set(`${id}:${side}`, damageEmitters(layout, model.emitters));
                this.anchors.set(`${id}:${side}`, hullAnchors(model.geometry));
                this.hardpointLayouts.set(`${id}:${side}`, layout);
            }
        }

        for (const type of CRAFT_TYPES) {
            const model = set.craft.get(type);
            if (!model) continue;
            adopt(model);
            for (const side of SIDES) {
                this.craft.get(`${side}:${type}`)!.setGeometry(model.geometry);
                applyMaps(this.craftMaterial.get(`${side}:${type}`)!, model);
            }
        }

        if (set.torpedo) {
            adopt(set.torpedo);
            for (const side of SIDES) this.torpedoes[side].setGeometry(set.torpedo.geometry);
        }

        if (set.asteroids.length) {
            this.rocks.forEach((pool, i) => {
                const model = set.asteroids[i % set.asteroids.length];
                adopt(model);
                pool.setGeometry(model.geometry);
                applyMaps(this.rockMaterials[i], model);
            });
        }

        if (set.station) {
            if (this.station) {
                adopt(set.station);
                this.station.mesh.geometry = set.station.geometry;
                applyMaps(this.station.material, set.station);
            } else {
                // No station in this battle: nothing to show it on.
                set.station.geometry.dispose();
                for (const t of Object.values(set.station.maps)) t?.dispose();
            }
        }
    }

    /** Subsystem marker anchors for a class and side, model space in battle units (the overlay projects them). */
    hardpoints(classId: ShipClassId, side: TacticalSide): HardpointLayout | undefined {
        return this.hardpointLayouts.get(`${classId}:${side}`);
    }

    // ── Per frame ──

    resize(view: ViewLike): void {
        this.renderer.setSize(Math.max(1, view.cw), Math.max(1, view.ch), false);
    }

    private placeCamera(view: ViewLike): void {
        // The ground point under the screen centre, from the 2D transform:
        //   screenX = ox + scale * x,  screenY = oy + scale * tilt * y.
        // An orthographic camera pitched by acos(tilt) and looking at that point
        // reproduces exactly that map for z = 0, at scale px per world unit.
        const s = view.scale;
        const tilt = Math.min(1, Math.max(0.05, view.tilt ?? 1));
        const pitch = Math.acos(tilt);
        const cx = (view.cw / 2 - view.ox) / s;
        const cy = (view.ch / 2 - view.oy) / (s * tilt);
        const cam = this.camera;
        cam.left = -view.cw / (2 * s);
        cam.right = view.cw / (2 * s);
        cam.top = view.ch / (2 * s);
        cam.bottom = -view.ch / (2 * s);
        cam.near = 1;
        cam.far = CAMERA_DISTANCE * 2;
        // The camera sits "south" of the target (lower three-Y, further down the
        // screen) and looks north and down, so +Z height reads as screen-up.
        cam.position.set(cx, -cy - CAMERA_DISTANCE * Math.sin(pitch), CAMERA_DISTANCE * Math.cos(pitch));
        cam.up.set(0, 1, 0);
        cam.lookAt(cx, -cy, 0);
        cam.updateProjectionMatrix();
    }

    render(state: BattleState, view: ViewLike): void {
        if (this.disposed) return;
        this.placeCamera(view);
        this.damageTime.value = state.time;
        this.stationSpin.value = state.time * STATION_SPIN_RATE;

        for (const pool of this.hulls.values()) pool.begin();
        for (const pool of this.outlines.values()) pool.begin();
        for (const pool of this.craft.values()) pool.begin();
        this.torpedoes.player.begin();
        this.torpedoes.enemy.begin();
        this.sprites.begin();
        this.fxLeft = DAMAGE_FX_BUDGET;
        this.beams.begin();

        for (const sh of state.ships) {
            if (sh.status === 'destroyed' || sh.status === 'withdrawn') continue;
            this.pushShip(sh, state.time);
        }

        for (const sq of state.squadrons) {
            if (sq.craft <= 0) continue;
            const full = SQUADRON_DEFS[sq.type].craft;
            const rand = mulberry32(hashStr(sq.id));
            const pool = this.craft.get(`${sq.side}:${sq.type}`)!;
            this.colour.copy(SIDE_COLOUR[sq.side].tint);
            for (let i = 0; i < full; i++) {
                const jx = (rand() - 0.5) * 18;
                const jy = (rand() - 0.5) * 18;
                const ja = rand() * TAU;
                if (i >= sq.craft) continue; // dead slot — keep the jitter stream aligned
                pool.push(sq.x + jx, -(sq.y + jy), 2, -ja, 1, 1, 1, this.colour);
            }
        }

        for (const torp of state.torpedoes) {
            const target = state.ships.find(s2 => s2.id === torp.targetId);
            let ang = 0;
            if (target) ang = Math.atan2(target.y - torp.y, target.x - torp.x);
            const c = torp.side === 'player' ? 0xa5f3fc : 0xfde047;
            this.colour.set(c);
            this.torpedoes[torp.side].push(torp.x, -torp.y, 3, -ang, 1, 1, 1, this.colour);
            this.colour.set(c).multiplyScalar(0.18);
            this.sprites.push(torp.x, -torp.y, FX_Z, 0, 10, 10, 1, this.colour);
        }

        for (const b of state.beams) {
            const a = Math.max(0, Math.min(1, (b.expiresAt - state.time) / BEAM_FADE_SECONDS));
            if (a <= 0) continue;
            const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
            const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
            this.colour.set(b.side === 'player' ? 0x818cf8 : 0xf87171).multiplyScalar(a);
            this.beams.push((b.x1 + b.x2) / 2, -(b.y1 + b.y2) / 2, FX_Z, -ang, len, 3.2, 1, this.colour);
        }

        for (const ex of state.explosions) {
            const rem = Math.max(0, ex.expiresAt - state.time);
            const t01 = 1 - Math.min(1, rem / 0.7);
            const rr = ex.radius * (0.4 + 0.9 * t01);
            const a = Math.max(0, 1 - t01);
            this.colour.setRGB(1.0, 0.72, 0.3).multiplyScalar(a * 1.4);
            this.sprites.push(ex.x, -ex.y, FX_Z, 0, rr * 2.2, rr * 2.2, 1, this.colour);
            this.colour.setRGB(1.0, 0.95, 0.6).multiplyScalar(a * 0.9);
            this.sprites.push(ex.x, -ex.y, FX_Z, 0, rr * 1.1, rr * 1.1, 1, this.colour);
        }

        for (const pool of this.hulls.values()) pool.end();
        for (const pool of this.outlines.values()) pool.end();
        for (const pool of this.craft.values()) pool.end();
        this.torpedoes.player.end();
        this.torpedoes.enemy.end();
        this.sprites.end();
        this.beams.end();

        this.renderer.clear();
        if (this.sky) {
            const s = view.scale;
            const tilt = Math.min(1, Math.max(0.05, view.tilt ?? 1));
            this.sky.render(this.renderer, {
                cw: view.cw,
                ch: view.ch,
                cx: (view.cw / 2 - view.ox) / s,
                cy: (view.ch / 2 - view.oy) / (s * tilt),
                zoom: view.zoom ?? 1,
                baseScale: view.baseScale ?? s,
            }, state.time);
            this.renderer.clearDepth();
        }
        this.renderer.render(this.scene, this.camera);
    }

    private shipSeed(id: string): number {
        let s = this.shipSeeds.get(id);
        if (s === undefined) {
            s = hashStr(id) / 4294967296;
            this.shipSeeds.set(id, s);
        }
        return s;
    }

    private pushShip(sh: TacticalShip, t: number): void {
        const def = SHIP_CLASSES[sh.classId];
        const r = def.radius;
        const arriving = sh.status === 'arriving';
        const key = `${sh.classId}:${sh.side}`;
        const pool = this.hulls.get(key)!;
        const sub = sh.subsystems;
        const hullFrac = Math.max(0, Math.min(1, sh.hull / def.maxHull));
        const seed = this.shipSeed(sh.id);

        this.colour.copy(sh.status === 'retreating' ? RETREAT_TINT : SIDE_COLOUR[sh.side].tint);
        if (arriving) this.colour.multiplyScalar(ARRIVING_DIM);
        pool.push(sh.x, -sh.y, 0, -sh.heading, 1, 1, 1, this.colour);
        pool.setDamage(sub?.engines ?? 1, sub?.shields ?? 1, sub?.weapons ?? 1, sub?.sensors ?? 1, hullFrac, seed);
        this.colour.set(sh.status === 'retreating' ? 0xfbbf24 : 0xffffff);
        if (arriving) this.colour.multiplyScalar(ARRIVING_DIM);
        this.outlines.get(`${sh.classId}:${sh.side}`)!
            .push(sh.x, -sh.y, 0, -sh.heading, OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE, this.colour);

        if (arriving) return;

        // Engine glow. Damaged engines stutter; dead ones only cough out the
        // odd burst, moving or not.
        const engines = sub?.engines ?? 1;
        let thrust = 1;
        let p = Math.min(1, sh.speed / def.maxSpeed);
        if (engines <= 0) {
            const beat = t * 8 + seed * 50;
            const burst = hash01(Math.floor(beat) * 1.37 + seed * 91) < 0.22;
            thrust = burst ? 0.9 * (1 - (beat - Math.floor(beat))) : 0;
            p = Math.max(p, 0.35);
        } else if (engines < 0.6) {
            const stutter = hash01(Math.floor(t * 14 + seed * 100) * 2.11) < 0.35 ? 0.2 : 1;
            thrust = 1 + (stutter - 1) * (0.6 - engines) / 0.6;
        }
        if (thrust > 0 && (sh.speed > 8 || engines <= 0)) {
            const glowR = r * (0.6 + p);
            const gx = sh.x - Math.cos(sh.heading) * r * 1.05;
            const gy = sh.y - Math.sin(sh.heading) * r * 1.05;
            this.colour.copy(SIDE_COLOUR[sh.side].glow).multiplyScalar((0.06 + 0.24 * p) * thrust);
            this.sprites.push(gx, -gy, FX_Z, 0, glowR * 1.5, glowR * 1.5, 1, this.colour);
        }

        // Smoke, fire and sparks where the damage is: on the tagged part, or at
        // the hardpoint marker on a model that does not name it.
        const emit = this.emitters.get(key)!;
        if (sub) {
            for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
                const id = SUBSYSTEM_IDS[i];
                const loss = 1 - sub[id];
                if (loss >= 0.25) this.burn(sh, emit[id]!, loss, seed * 1000 + i * 17, r, t);
            }
        }
        if (hullFrac < 0.5) this.burn(sh, this.anchors.get(key)!, (0.5 - hullFrac) * 1.6, seed * 1000 + 101, r, t);
    }

    /** Model-space point on a ship → three-space, into fxPos. */
    private place(sh: TacticalShip, p: THREE.Vector3): THREE.Vector3 {
        const c = Math.cos(sh.heading), s = Math.sin(sh.heading);
        // Rotation by -heading about Z: (x, y) → (x c + y s, -x s + y c).
        return this.fxPos.set(sh.x + p.x * c + p.y * s, -sh.y - p.x * s + p.y * c, p.z);
    }

    /**
     * Stateless damage effects: every puff loops on its own phase from battle
     * time, so nothing is stored per ship and the cost is a few sprites each.
     * loss 0..1 sets how many puffs, how dense, and whether it burns and sparks.
     */
    private burn(sh: TacticalShip, pts: THREE.Vector3[], loss: number, seed: number, r: number, t: number): void {
        if (this.fxLeft <= 0) return;
        this.fxLeft -= 9; // upper bound of what one call pushes
        loss = Math.min(1, loss);
        // Smoke drifts aft and up the screen, widening as it thins.
        const ax = -Math.cos(sh.heading), ay = Math.sin(sh.heading);
        const puffs = 1 + Math.round(loss * 3);
        for (let k = 0; k < puffs; k++) {
            const h = hash01(seed + k * 7.31);
            const life = 1.4 + h * 0.9;
            const ph = (t / life + h) % 1;
            const o = this.place(sh, pts[k % pts.length]);
            const drift = ph * r * 0.8;
            const x = o.x + ax * drift * 0.7 + (h - 0.5) * r * 0.25;
            const y = o.y + ay * drift * 0.7 + drift * 0.45;
            const a = Math.sin(Math.PI * ph) * (0.07 + 0.16 * loss);
            this.colour.setRGB(0.62, 0.58, 0.55).multiplyScalar(a);
            const s = r * (0.22 + 0.55 * ph) * (0.75 + 0.5 * loss);
            this.sprites.push(x, y, o.z + 1, 0, s, s, 1, this.colour);
        }
        if (loss >= 0.6) {
            // Fire: a flickering flame and a hot core on up to two anchors.
            const heat = 0.35 + (loss - 0.6) * 1.6;
            for (let k = 0; k < Math.min(2, pts.length); k++) {
                const o = this.place(sh, pts[k]);
                const flick = 0.7 + 0.3 * Math.sin(t * 19 + seed + k * 2.3) * Math.sin(t * 7.3 + k);
                this.colour.setRGB(1.0, 0.42, 0.1).multiplyScalar(heat * flick);
                this.sprites.push(o.x, o.y, o.z + 1, 0, r * 0.32 * flick, r * 0.32 * flick, 1, this.colour);
                this.colour.setRGB(1.0, 0.85, 0.5).multiplyScalar(heat * 0.7 * flick);
                this.sprites.push(o.x, o.y, o.z + 1, 0, r * 0.12, r * 0.12, 1, this.colour);
            }
        }
        if (loss >= 0.3) {
            // Sparks: short bright pops at random spots near an anchor.
            const beat = t * 6 + seed * 0.13;
            const slot = Math.floor(beat);
            if (hash01(slot * 3.7 + seed) < loss * 0.55) {
                const o = this.place(sh, pts[slot % pts.length]);
                const jx = (hash01(slot * 1.3 + seed) - 0.5) * r * 0.3;
                const jy = (hash01(slot * 2.9 + seed) - 0.5) * r * 0.3;
                const fade = 1 - (beat - slot);
                this.colour.setRGB(1.0, 0.92, 0.65).multiplyScalar(1.3 * fade);
                this.sprites.push(o.x + jx, o.y + jy, o.z + 1, 0, r * 0.1, r * 0.1, 1, this.colour);
            }
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const pool of this.hulls.values()) pool.dispose();
        for (const pool of this.outlines.values()) pool.dispose();
        for (const pool of this.craft.values()) pool.dispose();
        this.torpedoes.player.dispose();
        this.torpedoes.enemy.dispose();
        this.sprites.dispose();
        this.beams.dispose();
        for (const pool of this.rocks) pool.dispose();
        this.sky?.dispose();
        this.sky = null;
        for (const g of this.ownedGeometries) g.dispose();
        for (const m of this.ownedMaterials) m.dispose();
        for (const t of this.ownedTextures) t.dispose();
        this.scene.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
}

/** One sky per battlefield layout: seeded from the hazards, so a rematch on the same field looks the same. */
function skySeed(state: BattleState): number {
    let h = 2166136261 >>> 0;
    for (const z of state.hazards) {
        for (const n of [z.x, z.y, z.r, z.kind === 'asteroid' ? 1 : 2]) {
            h ^= Math.round(n) & 0xffff;
            h = Math.imul(h, 16777619);
        }
    }
    return h >>> 0;
}

function applyMaps(mat: THREE.MeshStandardMaterial, model: HullModel): void {
    const m = model.maps;
    if (m.map) { mat.map = m.map; mat.color.set(0xffffff); }
    if (m.normalMap) mat.normalMap = m.normalMap;
    if (m.roughnessMap) mat.roughnessMap = m.roughnessMap;
    if (m.metalnessMap) mat.metalnessMap = m.metalnessMap;
    if (m.emissiveMap) { mat.emissiveMap = m.emissiveMap; mat.emissiveIntensity = 1; }
    mat.flatShading = false;
    mat.needsUpdate = true;
}

function disposeModelSet(set: ModelSet): void {
    const all: HullModel[] = [...set.ships.values(), ...set.craft.values(), ...set.asteroids];
    for (const byClass of set.factionShips.values()) all.push(...byClass.values());
    if (set.torpedo) all.push(set.torpedo);
    if (set.station) all.push(set.station);
    for (const m of all) {
        m.geometry.dispose();
        for (const t of Object.values(m.maps)) t?.dispose();
    }
}
