// lib/outposts/diorama/outpost-diorama.ts
// Stars of Dominion — the outpost as a snow globe.
//
// A small isometric three.js scene of the 5×5 grid: a tile per cell coloured
// by its ground, a procedural model per module (domes under glass, a drill,
// a mast, tanks, a reactor stack), colonists as capsules walking between the
// modules they staff, a beacon over a cell with an open crisis, dust when a
// storm is on, a sun that wheels over the plain. The 2D cards stay the
// decision surface; this is the window. Click a tile to select it.
//
// Same contract as the battle renderer (lib/tactical/render3d): orthographic
// camera, no shadows, everything allocated here is released by dispose(),
// and the canvas is created by the React mount inside its effect. Deliberately
// not a world: no free camera, no walking, no procedural city — a diorama
// that fits in a card, and reads at a glance.

import * as THREE from 'three';
import type { ModuleId, OutpostState, CellTerrain } from '../outpost-types';
import { GRID_SIZE, cellOpen, MODULES } from '../outpost-catalog';

export interface DioramaInput {
    state: OutpostState;
    /** Cells whose module runs this shift (computeBalance). */
    running: number[];
    idle: Map<number, 'workers' | 'power'>;
    selected: number | null;
    /** 0–1 through the current shift, for the sun. */
    shiftProgress: number;
}

const TILE = 1;
const TILE_H = 0.18;
const GAP = 0.08;
const MAX_WALKERS = 24;
const MAX_PIXEL_RATIO = 1.5;

const TERRAIN_COLOUR: Record<CellTerrain, number> = {
    flat: 0x6b5b45, ore: 0x7a5230, ice: 0x9fc5e8, vent: 0x5a3a3a, rock: 0x4a4a52, ruin: 0x8a7f66,
};
const CLOSED_COLOUR = 0x1e2430;

type Role = 'life' | 'food' | 'power' | 'industry' | 'civic' | 'security' | 'science' | 'logistics' | 'military';
const ROLE: Record<ModuleId, Role> = {
    hub: 'life', habitat: 'life', life_support: 'life', medbay: 'life', hydroponics: 'food',
    solar: 'power', reactor: 'power', geothermal: 'power',
    mine: 'industry', warehouse: 'industry', dock: 'logistics', fuel_depot: 'logistics',
    commons: 'civic', bunker: 'security', cell_block: 'security', test_lab: 'science', sensor_mast: 'science',
    barracks_module: 'military', drydock: 'military', battery: 'military', command_post: 'military',
};
const ROLE_COLOUR: Record<Role, number> = {
    life: 0x38bdf8, food: 0x4ade80, power: 0xfbbf24, industry: 0xfb923c, civic: 0xf472b6,
    security: 0xf87171, science: 0xa78bfa, logistics: 0x2dd4bf, military: 0xe11d48,
};

function cellXZ(i: number): [number, number] {
    const r = Math.floor(i / GRID_SIZE), c = i % GRID_SIZE;
    const off = (GRID_SIZE - 1) / 2;
    return [(c - off) * (TILE + GAP), (r - off) * (TILE + GAP)];
}

/** Shared geometry, built once. */
class Geo {
    readonly tile = new THREE.BoxGeometry(TILE, TILE_H, TILE);
    readonly dome = new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    readonly domeSmall = new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    readonly box = new THREE.BoxGeometry(0.6, 0.3, 0.6);
    readonly lowBox = new THREE.BoxGeometry(0.72, 0.18, 0.72);
    readonly slab = new THREE.BoxGeometry(0.76, 0.05, 0.76);
    readonly stack = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 14);
    readonly tank = new THREE.CylinderGeometry(0.14, 0.14, 0.4, 12);
    readonly mast = new THREE.CylinderGeometry(0.03, 0.05, 0.9, 8);
    readonly ball = new THREE.SphereGeometry(0.09, 10, 8);
    readonly drill = new THREE.ConeGeometry(0.22, 0.5, 10);
    readonly pad = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24);
    readonly ring = new THREE.TorusGeometry(0.34, 0.03, 8, 32);
    readonly barrel = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8);
    readonly frame = new THREE.BoxGeometry(0.8, 0.5, 0.12);
    readonly walker = new THREE.CapsuleGeometry(0.045, 0.09, 4, 8);
    readonly beacon = new THREE.SphereGeometry(0.07, 8, 6);
    readonly rock = new THREE.DodecahedronGeometry(0.14, 0);
    readonly select = new THREE.RingGeometry(0.42, 0.5, 32);
    readonly dust = new THREE.PlaneGeometry(GRID_SIZE * 1.6, GRID_SIZE * 1.6);
    all(): THREE.BufferGeometry[] { return Object.values(this) as THREE.BufferGeometry[]; }
}

interface ModuleNode {
    group: THREE.Group;
    id: ModuleId;
    glow: THREE.MeshStandardMaterial[];
    glass?: THREE.MeshPhysicalMaterial;
    spin?: THREE.Object3D;
}

interface Walker {
    mesh: THREE.Mesh;
    from: THREE.Vector3;
    to: THREE.Vector3;
    t: number;
    speed: number;
}

export class OutpostDiorama {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    /** Everything but the lights: the graduation pull-back shrinks and sinks it. */
    private readonly root = new THREE.Group();
    private pullback = 0;
    private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    private readonly geo = new Geo();
    private readonly tiles: THREE.Mesh[] = [];
    private readonly tileMats: THREE.MeshStandardMaterial[] = [];
    private readonly modules = new Map<number, ModuleNode>();
    private readonly walkers: Walker[] = [];
    private readonly beacons = new Map<string, THREE.Mesh>();
    private readonly sun: THREE.DirectionalLight;
    private readonly fill: THREE.HemisphereLight;
    private readonly selectRing: THREE.Mesh;
    private readonly dust: THREE.Mesh;
    private readonly ownedMaterials: THREE.Material[] = [];
    private readonly ray = new THREE.Raycaster();
    private width = 1;
    private height = 1;
    private storm = 0;
    private night = 0;
    private time = 0;
    private disposed = false;
    private signature = '';

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = false;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        // Isometric-ish: pitched like the battle camera, turned a quarter so
        // the grid reads as a diamond.
        this.camera.position.set(8, 9, 8);
        this.camera.lookAt(0, 0, 0);
        this.camera.up.set(0, 1, 0);

        this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
        this.sun.position.set(6, 8, 3);
        this.fill = new THREE.HemisphereLight(0x8fb3ff, 0x2b1d12, 0.55);
        this.scene.add(this.sun, this.fill, this.root);

        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: CLOSED_COLOUR, roughness: 0.95, metalness: 0.02 });
            const mesh = new THREE.Mesh(this.geo.tile, mat);
            const [x, z] = cellXZ(i);
            mesh.position.set(x, -TILE_H / 2, z);
            mesh.userData.cell = i;
            this.root.add(mesh);
            this.tiles.push(mesh);
            this.tileMats.push(mat);
            this.ownedMaterials.push(mat);
        }

        const selMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        this.selectRing = new THREE.Mesh(this.geo.select, selMat);
        this.selectRing.rotation.x = -Math.PI / 2;
        this.selectRing.visible = false;
        this.root.add(this.selectRing);
        this.ownedMaterials.push(selMat);

        const dustMat = new THREE.MeshBasicMaterial({ color: 0xc9a26b, transparent: true, opacity: 0, depthWrite: false });
        this.dust = new THREE.Mesh(this.geo.dust, dustMat);
        this.dust.rotation.x = -Math.PI / 2;
        this.dust.position.y = 0.9;
        this.root.add(this.dust);
        this.ownedMaterials.push(dustMat);
    }

    resize(width: number, height: number): void {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.renderer.setSize(this.width, this.height, false);
        const aspect = this.width / this.height;
        // The grid's diagonal plus a margin fits the shorter axis.
        const half = (GRID_SIZE * (TILE + GAP)) * 0.56;
        if (aspect >= 1) { this.camera.left = -half * aspect; this.camera.right = half * aspect; this.camera.top = half; this.camera.bottom = -half; }
        else { this.camera.left = -half; this.camera.right = half; this.camera.top = half / aspect; this.camera.bottom = -half / aspect; }
        this.camera.updateProjectionMatrix();
    }

    /** The cell under a canvas point, or null. */
    pick(px: number, py: number): number | null {
        const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
        this.ray.setFromCamera(ndc, this.camera);
        const hit = this.ray.intersectObjects(this.tiles, false)[0];
        return hit ? (hit.object.userData.cell as number) : null;
    }

    // ── Building the scene from state ───────────────────────────────────────

    private material(colour: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
        const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, metalness: 0.25, ...opts });
        this.ownedMaterials.push(m);
        return m;
    }

    private glass(colour: number): THREE.MeshPhysicalMaterial {
        const m = new THREE.MeshPhysicalMaterial({ color: colour, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.1, transmission: 0.2, emissive: colour, emissiveIntensity: 0.15 });
        this.ownedMaterials.push(m);
        return m;
    }

    private buildModule(id: ModuleId): ModuleNode {
        const g = this.geo;
        const colour = ROLE_COLOUR[ROLE[id]];
        const group = new THREE.Group();
        const glow: THREE.MeshStandardMaterial[] = [];
        const body = this.material(0x8b949e);
        const lit = (c = colour) => { const m = this.material(c, { emissive: c, emissiveIntensity: 0.6 }); glow.push(m); return m; };
        const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, ry = 0) => {
            const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
        };
        let glass: THREE.MeshPhysicalMaterial | undefined;
        let spin: THREE.Object3D | undefined;
        switch (id) {
            case 'hub': add(g.lowBox, body, 0, 0.09); glass = this.glass(colour); add(g.dome, glass, 0, 0.18); add(g.mast, lit(), 0.3, 0.6, 0.3); break;
            case 'habitat': case 'commons': case 'medbay': glass = this.glass(colour); add(g.dome, glass, 0, 0.02); add(g.ball, lit(), 0, 0.1); break;
            case 'life_support': add(g.box, body, 0, 0.15); add(g.tank, lit(), -0.18, 0.5); add(g.tank, lit(), 0.18, 0.5); break;
            case 'hydroponics': glass = this.glass(colour); add(g.lowBox, this.material(0x2f6b3a), 0, 0.09); add(g.domeSmall, glass, 0, 0.18); break;
            case 'solar': add(g.slab, lit(), 0, 0.12); add(g.mast, body, 0, 0.0); group.children[0].rotation.z = 0.35; break;
            case 'geothermal': add(g.stack, body, 0, 0.35); add(g.ball, lit(0xff7a3d), 0, 0.72); break;
            case 'reactor': add(g.box, body, 0, 0.15); add(g.stack, lit(0xfbbf24), 0, 0.55); break;
            case 'mine': { const d = add(g.drill, lit(), 0, 0.3); d.rotation.x = Math.PI; add(g.lowBox, body, 0, 0.09); spin = d; break; }
            case 'warehouse': add(g.box, body, 0, 0.15); add(g.slab, lit(), 0, 0.33); break;
            case 'dock': add(g.pad, body, 0, 0.02); { const r = add(g.ring, lit(), 0, 0.06); r.rotation.x = Math.PI / 2; } break;
            case 'bunker': add(g.lowBox, this.material(0x5b6472), 0, 0.09); add(g.ball, lit(), 0, 0.2); break;
            case 'cell_block': add(g.box, this.material(0x4b5563), 0, 0.15); add(g.barrel, lit(), -0.2, 0.3, 0.31); add(g.barrel, lit(), 0.2, 0.3, 0.31); break;
            case 'test_lab': glass = this.glass(colour); add(g.domeSmall, glass, 0, 0.02); add(g.mast, body, 0.25, 0.45, -0.2); add(g.ball, lit(), 0.25, 0.9, -0.2); break;
            case 'sensor_mast': { const m = add(g.mast, body, 0, 0.45); const b = add(g.ball, lit(), 0, 0.92); spin = b; void m; break; }
            case 'fuel_depot': add(g.tank, body, -0.2, 0.2); add(g.tank, body, 0.2, 0.2); add(g.ball, lit(), 0, 0.45); break;
            case 'barracks_module': add(g.box, this.material(0x6b4a3a), 0, 0.15); add(g.mast, lit(), 0.25, 0.6, 0.25); break;
            case 'drydock': { const f = add(g.frame, body, 0, 0.25); f.rotation.y = Math.PI / 4; add(g.ball, lit(), 0, 0.55); break; }
            case 'battery': add(g.lowBox, this.material(0x4b5563), 0, 0.09); { const b = add(g.barrel, lit(), 0, 0.32); b.rotation.z = 1.1; } break;
            case 'command_post': add(g.box, body, 0, 0.15); add(g.mast, body, 0, 0.6); add(g.ball, lit(), 0, 1.05); break;
        }
        return { group, id, glow, glass, spin };
    }

    update(input: DioramaInput): void {
        if (this.disposed) return;
        const { state, selected } = input;
        const running = new Set(input.running);

        // Tiles: ground, open or closed, selected.
        for (let i = 0; i < this.tiles.length; i++) {
            const cell = state.cells[i];
            const open = cellOpen(i, state.tier);
            const mat = this.tileMats[i];
            mat.color.setHex(open ? TERRAIN_COLOUR[cell?.terrain ?? 'flat'] : CLOSED_COLOUR);
            mat.emissive.setHex(0x000000);
            this.tiles[i].position.y = open ? -TILE_H / 2 : -TILE_H / 2 - 0.12;
            if (cell?.clearingUntilShift !== undefined) mat.emissive.setHex(0x332200);
        }
        if (selected !== null && selected !== undefined) {
            const [x, z] = cellXZ(selected);
            this.selectRing.position.set(x, 0.01, z);
            this.selectRing.visible = true;
        } else this.selectRing.visible = false;

        // Modules: rebuild only what changed.
        const sig = state.cells.map(c => c.module ?? '').join(',');
        if (sig !== this.signature) {
            for (const [i, node] of this.modules) { if (state.cells[i]?.module !== node.id) { this.root.remove(node.group); this.modules.delete(i); } }
            state.cells.forEach((c, i) => {
                if (!c.module || this.modules.has(i)) return;
                const node = this.buildModule(c.module);
                const [x, z] = cellXZ(i);
                node.group.position.set(x, 0, z);
                this.root.add(node.group);
                this.modules.set(i, node);
            });
            this.signature = sig;
        }
        for (const [i, node] of this.modules) {
            const cell = state.cells[i];
            const building = cell.buildDoneShift !== undefined && cell.buildDoneShift > state.shift;
            const down = (cell.downUntilShift ?? 0) > state.shift;
            const on = running.has(i);
            const idle = input.idle.get(i);
            const intensity = building ? 0.05 : on ? 0.7 : 0.08;
            for (const m of node.glow) {
                m.emissiveIntensity = intensity;
                if (idle && !building) m.emissive.setHex(0xf59e0b); else if (down) m.emissive.setHex(0x7f1d1d); else m.emissive.setHex(ROLE_COLOUR[ROLE[node.id]]);
            }
            if (node.glass) { node.glass.opacity = building ? 0.15 : 0.35; node.glass.emissiveIntensity = on ? 0.25 : 0.05; }
            node.group.scale.setScalar(building ? 0.7 : 1);
            node.group.visible = cellOpen(i, state.tier);
        }

        // Walkers: one per fit colonist up to the cap, wandering between staffed modules.
        const fit = state.roster ? state.roster.filter(c => c.status === 'well').length : state.colonists;
        const want = Math.min(MAX_WALKERS, Math.max(0, fit));
        while (this.walkers.length < want) {
            const mat = this.material(0xe2e8f0, { emissive: 0x38bdf8, emissiveIntensity: 0.25 });
            const mesh = new THREE.Mesh(this.geo.walker, mat);
            const p = this.randomStop(state, running);
            mesh.position.copy(p);
            this.root.add(mesh);
            this.walkers.push({ mesh, from: p.clone(), to: this.randomStop(state, running), t: Math.random(), speed: 0.25 + Math.random() * 0.2 });
        }
        while (this.walkers.length > want) { const w = this.walkers.pop()!; this.root.remove(w.mesh); }

        // Beacons over cells with an open crisis; dust when a storm is on.
        const wanted = new Map<string, number>();
        let storm = 0;
        for (const c of state.crises) {
            if (c.kind === 'dust_storm') storm = 1;
            if (c.cell !== undefined) wanted.set(c.id, c.cell);
        }
        if (state.effects.some(e => e.kind === 'solar_down' && e.untilShift > state.shift)) storm = 1;
        this.storm = storm;
        for (const [id, mesh] of this.beacons) { if (!wanted.has(id)) { this.root.remove(mesh); this.beacons.delete(id); } }
        for (const [id, cell] of wanted) {
            if (this.beacons.has(id)) continue;
            const mat = this.material(0xef4444, { emissive: 0xef4444, emissiveIntensity: 1.2 });
            const mesh = new THREE.Mesh(this.geo.beacon, mat);
            const [x, z] = cellXZ(cell);
            mesh.position.set(x, 1.2, z);
            this.root.add(mesh);
            this.beacons.set(id, mesh);
        }

        // The sun wheels over the plain through the shift.
        const a = input.shiftProgress * Math.PI * 2;
        this.sun.position.set(Math.cos(a) * 8, 5 + Math.sin(a) * 4, Math.sin(a) * 8);
        const night = Math.max(0, -Math.sin(a));
        this.night = night;
        this.sun.intensity = 1.6 - night * 1.1;
        this.fill.intensity = 0.55 - night * 0.25;
    }

    private randomStop(state: OutpostState, running: Set<number>): THREE.Vector3 {
        const stops = [...running];
        const cells = stops.length ? stops : state.cells.map((c, i) => (c.module ? i : -1)).filter(i => i >= 0);
        const i = cells.length ? cells[Math.floor(Math.random() * cells.length)] : Math.floor(GRID_SIZE * GRID_SIZE / 2);
        const [x, z] = cellXZ(i);
        return new THREE.Vector3(x + (Math.random() - 0.5) * 0.7, 0.1, z + (Math.random() - 0.5) * 0.7);
    }

    /**
     * The graduation dissolve, 0–1: the camera seems to pull back as the
     * diorama shrinks and sinks, the domes dim, dust rises — the snow globe
     * becomes a dot on a world. The React mount fades the canvas over it and
     * opens the surface at the end.
     */
    setPullback(p: number): void {
        this.pullback = Math.max(0, Math.min(1, p));
    }

    frame(dt: number, input: DioramaInput): void {
        if (this.disposed) return;
        this.time += dt;
        const pb = this.pullback;
        const ease = pb * pb * (3 - 2 * pb);
        this.root.scale.setScalar(1 - 0.72 * ease);
        this.root.position.y = -0.9 * ease;
        this.root.rotation.y = ease * 0.6;
        this.sun.intensity = (1.6 - this.night * 1.1) * (1 - 0.5 * ease);
        for (const node of this.modules.values()) for (const m of node.glow) m.emissiveIntensity *= 1 - 0.02 * ease;
        const running = new Set(input.running);
        for (const w of this.walkers) {
            w.t += dt * w.speed;
            if (w.t >= 1) { w.from.copy(w.to); w.to = this.randomStop(input.state, running); w.t = 0; }
            w.mesh.position.lerpVectors(w.from, w.to, w.t);
            w.mesh.position.y = 0.1 + Math.abs(Math.sin(w.t * Math.PI * 6)) * 0.02;
        }
        for (const node of this.modules.values()) if (node.spin) node.spin.rotation.y += dt * 1.5;
        for (const b of this.beacons.values()) {
            b.position.y = 1.15 + Math.sin(this.time * 3) * 0.08;
            (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(this.time * 6) * 0.6;
        }
        const dustMat = this.dust.material as THREE.MeshBasicMaterial;
        dustMat.opacity += ((this.storm ? 0.28 : 0) + 0.35 * ease - dustMat.opacity) * Math.min(1, dt * 2);
        this.dust.position.x = Math.sin(this.time * 0.4) * 0.8;
        this.dust.position.z = Math.cos(this.time * 0.3) * 0.8;
        this.renderer.render(this.scene, this.camera);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.clear();
        for (const g of this.geo.all()) g.dispose();
        for (const m of this.ownedMaterials) m.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
}

export { MODULES };
