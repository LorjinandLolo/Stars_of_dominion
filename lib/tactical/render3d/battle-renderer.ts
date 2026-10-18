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
import type { BattleState, Hazard, ShipClassId, TacticalShip, TacticalSide } from '../types';
import { SHIP_CLASSES, SQUADRON_DEFS } from '../ship-defs';
import { buildPlaceholderHull, buildRock, buildStrikeCraft } from './placeholder-hulls';
import { loadModelSet, type HullModel, type ModelSet } from './hull-models';
import type { ViewLike } from './view';
import type { SquadronType } from '../types';

export type { ViewLike } from './view';

const TAU = Math.PI * 2;
const CAMERA_DISTANCE = 4000;     // orthographic, so only the depth range depends on it
const MAX_PIXEL_RATIO = 1.5;
const BEAM_FADE_SECONDS = 0.12;   // mirrors beam expiry in lib/tactical/sim.ts
const FX_Z = 1;                   // glow plane; depth test is off, so it always draws on top
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
    private readonly m = new THREE.Matrix4();
    private readonly p = new THREE.Vector3();
    private readonly q = new THREE.Quaternion();
    private readonly s = new THREE.Vector3();
    private static readonly Z = new THREE.Vector3(0, 0, 1);

    constructor(
        private readonly scene: THREE.Scene,
        public geometry: THREE.BufferGeometry,
        public material: THREE.Material,
        capacity: number,
        private readonly opts: { depthTest?: boolean; renderOrder?: number } = {},
    ) {
        this.mesh = this.make(Math.max(1, capacity));
    }

    private make(capacity: number): InstancedMesh {
        const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity) as InstancedMesh;
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

    setGeometry(geometry: THREE.BufferGeometry): void {
        this.geometry = geometry;
        this.mesh.geometry = geometry;
    }

    begin(): void {
        this.used = 0;
    }

    push(x: number, y: number, z: number, angle: number, sx: number, sy: number, sz: number, colour: THREE.Color): void {
        if (this.used >= this.mesh.instanceMatrix.count) {
            const old = this.mesh;
            const next = this.make(old.instanceMatrix.count * 2);
            for (let i = 0; i < this.used; i++) {
                old.getMatrixAt(i, this.m);
                next.setMatrixAt(i, this.m);
                next.instanceColor!.setXYZ(i, old.instanceColor!.getX(i), old.instanceColor!.getY(i), old.instanceColor!.getZ(i));
            }
            this.scene.remove(old);
            old.dispose();
            this.mesh = next;
        }
        this.p.set(x, y, z);
        this.q.setFromAxisAngle(InstancePool.Z, angle);
        this.s.set(sx, sy, sz);
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(this.used, this.m);
        this.mesh.setColorAt(this.used, colour);
        this.used++;
    }

    end(): void {
        this.mesh.count = this.used;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor!.needsUpdate = true;
    }

    dispose(): void {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
    }
}

type InstancedMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;

export class BattleRenderer {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_DISTANCE * 2);
    private readonly discTexture = makeSoftDiscTexture();
    private readonly beamTexture = makeBeamTexture();
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
    private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
    private readonly ownedMaterials: THREE.Material[] = [];
    private readonly ownedTextures: THREE.Texture[] = [];
    private readonly colour = new THREE.Color();
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
        this.renderer.setClearColor(0x020617, 1);
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

        this.buildBackdrop(state);
        this.buildHazards(state.hazards);

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
                this.hullMaterial.set(`${id}:${side}`, mat);
                this.ownedMaterials.push(mat);
                this.hulls.set(`${id}:${side}`, new InstancePool(this.scene, geo, mat, 8));
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
        const field = new THREE.PlaneGeometry(state.width, state.height);
        const fieldMat = new THREE.MeshBasicMaterial({ color: 0x050b1e });
        this.ownedGeometries.add(field);
        this.ownedMaterials.push(fieldMat);
        const plane = new THREE.Mesh(field, fieldMat);
        plane.position.set(state.width / 2, -state.height / 2, -4);
        this.scene.add(plane);

        // Starfield: seeded so it never shimmers between mounts.
        const rand = mulberry32(0x5eed5);
        const n = 420;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = rand() * state.width;
            pos[i * 3 + 1] = -rand() * state.height;
            pos[i * 3 + 2] = -3;
            const a = 0.25 + rand() * 0.6;
            const warm = rand() < 0.2;
            col[i * 3] = a * (warm ? 1 : 0.8);
            col[i * 3 + 1] = a * 0.85;
            col[i * 3 + 2] = a * (warm ? 0.7 : 1);
        }
        const stars = new THREE.BufferGeometry();
        stars.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        stars.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true });
        this.ownedGeometries.add(stars);
        this.ownedMaterials.push(starMat);
        this.scene.add(new THREE.Points(stars, starMat));
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

        for (const pool of this.hulls.values()) pool.begin();
        for (const pool of this.outlines.values()) pool.begin();
        for (const pool of this.craft.values()) pool.begin();
        this.torpedoes.player.begin();
        this.torpedoes.enemy.begin();
        this.sprites.begin();
        this.beams.begin();

        for (const sh of state.ships) {
            if (sh.status === 'destroyed' || sh.status === 'withdrawn') continue;
            this.pushShip(sh);
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

        this.renderer.render(this.scene, this.camera);
    }

    private pushShip(sh: TacticalShip): void {
        const def = SHIP_CLASSES[sh.classId];
        const r = def.radius;
        const arriving = sh.status === 'arriving';
        const pool = this.hulls.get(`${sh.classId}:${sh.side}`)!;

        this.colour.copy(sh.status === 'retreating' ? RETREAT_TINT : SIDE_COLOUR[sh.side].tint);
        if (arriving) this.colour.multiplyScalar(ARRIVING_DIM);
        pool.push(sh.x, -sh.y, 0, -sh.heading, 1, 1, 1, this.colour);
        this.colour.set(sh.status === 'retreating' ? 0xfbbf24 : 0xffffff);
        if (arriving) this.colour.multiplyScalar(ARRIVING_DIM);
        this.outlines.get(`${sh.classId}:${sh.side}`)!
            .push(sh.x, -sh.y, 0, -sh.heading, OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE, this.colour);

        if (!arriving && sh.speed > 8) {
            const p = Math.min(1, sh.speed / def.maxSpeed);
            const glowR = r * (0.6 + p);
            const gx = sh.x - Math.cos(sh.heading) * r * 1.05;
            const gy = sh.y - Math.sin(sh.heading) * r * 1.05;
            this.colour.copy(SIDE_COLOUR[sh.side].glow).multiplyScalar(0.06 + 0.24 * p);
            this.sprites.push(gx, -gy, FX_Z, 0, glowR * 1.5, glowR * 1.5, 1, this.colour);
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
        for (const g of this.ownedGeometries) g.dispose();
        for (const m of this.ownedMaterials) m.dispose();
        for (const t of this.ownedTextures) t.dispose();
        this.scene.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
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
    for (const m of all) {
        m.geometry.dispose();
        for (const t of Object.values(m.maps)) t?.dispose();
    }
}
