// lib/tactical/render3d/sky.ts
// The space behind a battle: a nebula, two star layers and a lit planet, drawn
// FIRST with their own screen-space orthographic camera, then the battle on
// top (battle-renderer clears depth in between).
//
// It is not part of the battlefield, so it ignores the tilted ground plane.
// Each layer slides a small fraction of the camera pan and grows a little with
// zoom (parallax): far stars barely move, the planet moves most. That sells
// depth without a perspective camera, so the 2D overlay mapping stays affine.
//
// Everything is procedural and seeded, so one battle always shows the same sky
// and no art files are needed. All textures are canvases made once at load.

import * as THREE from 'three';

export interface SkyView {
    /** Canvas size in CSS px. */
    cw: number;
    ch: number;
    /** Camera centre on the ground plane, in battle units. */
    cx: number;
    cy: number;
    /** Current zoom (1 = whole field visible). */
    zoom: number;
    /** Pixels per battle unit at zoom 1, so pan converts to screen px. */
    baseScale: number;
}

type PlanetKind = 'terran' | 'desert' | 'ice' | 'gas' | 'volcanic';

interface Layer {
    object: THREE.Object3D;
    /** Fraction of the camera's screen-space pan this layer follows. */
    parallax: number;
    /** Fraction of the zoom change this layer follows. */
    zoomFollow: number;
    /** Resting position, as fractions of the screen size from the centre. */
    home: THREE.Vector2;
    /** Size in fractions of the screen's larger side. */
    size: number;
    /** Width over height of the layer (the nebula is 2:1). */
    aspect: number;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

const NEBULA_PALETTES: Array<Array<[number, number, number]>> = [
    [[124, 58, 237], [219, 39, 119], [56, 189, 248], [30, 64, 175]],   // violet and magenta
    [[13, 148, 136], [37, 99, 235], [99, 102, 241], [6, 182, 212]],    // teal and blue
    [[234, 88, 12], [190, 24, 93], [124, 45, 18], [251, 146, 60]],     // ember
    [[22, 163, 74], [13, 148, 136], [59, 130, 246], [132, 204, 22]],   // verdant
];

/** Nebula and dust on a near-black field, with a few bright stars baked in. */
function makeNebulaTexture(rand: () => number): THREE.CanvasTexture {
    const w = 2048, h = 1024;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#02030a');
    bg.addColorStop(0.5, '#050819');
    bg.addColorStop(1, '#02030a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const palette = NEBULA_PALETTES[Math.floor(rand() * NEBULA_PALETTES.length)];
    // The cloud runs along a band across the sky, like a galactic arm.
    const bandY = h * (0.3 + rand() * 0.4);
    const bandTilt = (rand() - 0.5) * 0.6;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
        const x = rand() * w;
        const y = bandY + (x - w / 2) * bandTilt + (rand() - 0.5) * h * 0.55 * (0.4 + rand());
        const r = 60 + rand() * 320;
        const [cr, cg, cb] = palette[Math.floor(rand() * palette.length)];
        const a = 0.012 + rand() * 0.035;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.6, `rgba(${cr},${cg},${cb},${a * 0.35})`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // Dark dust lanes cut through the glow.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) {
        const x = rand() * w;
        const y = bandY + (x - w / 2) * bandTilt + (rand() - 0.5) * h * 0.25;
        const r = 40 + rand() * 160;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(2,3,10,0.6)');
        g.addColorStop(1, 'rgba(2,3,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // A few bright stars with soft halos, baked into the far layer.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 1.2 + rand() * 2.4;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.2, 'rgba(200,220,255,0.18)');
        g.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return canvasTexture(c);
}

const PLANET_COLOURS: Record<PlanetKind, { base: string; blobs: string[]; clouds: number; atmosphere: number }> = {
    terran:   { base: '#1d4e89', blobs: ['#3f6d3a', '#6b7f3c', '#8a7a4a', '#2f5d34'], clouds: 0.55, atmosphere: 0x7dd3fc },
    desert:   { base: '#a86b3c', blobs: ['#c48a52', '#8c5530', '#d9a66b', '#7a4626'], clouds: 0.15, atmosphere: 0xfcd34d },
    ice:      { base: '#9fb8cf', blobs: ['#e2ecf5', '#c7d7e6', '#7f9cb8', '#f1f6fb'], clouds: 0.3, atmosphere: 0xbae6fd },
    gas:      { base: '#b58a5a', blobs: [], clouds: 0, atmosphere: 0xfde68a },
    volcanic: { base: '#2a1d1a', blobs: ['#3b2a24', '#140d0b', '#5a2a16', '#1f1512'], clouds: 0.1, atmosphere: 0xfb923c },
};

/** Equirectangular surface: land blobs wrapped across the seam, or gas bands. */
function makePlanetTexture(kind: PlanetKind, rand: () => number): THREE.CanvasTexture {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const p = PLANET_COLOURS[kind];
    ctx.fillStyle = p.base;
    ctx.fillRect(0, 0, w, h);

    if (kind === 'gas') {
        // Banded giant: horizontal stripes with a wobble, plus a storm.
        const bands = ['#c99a66', '#8f6440', '#e0c08e', '#a47448', '#d8b07a', '#6e4a2e'];
        let y = 0;
        while (y < h) {
            const bh = 10 + rand() * 40;
            ctx.fillStyle = bands[Math.floor(rand() * bands.length)];
            ctx.globalAlpha = 0.55 + rand() * 0.4;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.012 + y) * 4);
            ctx.lineTo(w, y + bh);
            for (let x = w; x >= 0; x -= 32) ctx.lineTo(x, y + bh + Math.sin(x * 0.015 + y) * 4);
            ctx.closePath();
            ctx.fill();
            y += bh;
        }
        ctx.globalAlpha = 1;
        const sx = rand() * w, sy = h * (0.55 + rand() * 0.2);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
        g.addColorStop(0, '#b4532a');
        g.addColorStop(1, 'rgba(180,83,42,0)');
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1.8, 1);
        ctx.translate(-sx, -sy);
        ctx.beginPath();
        ctx.arc(sx, sy, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return canvasTexture(c);
    }

    // Land masses: many overlapping blobs, drawn twice across the seam.
    for (let i = 0; i < 260; i++) {
        const x = rand() * w;
        const y = h * (0.12 + rand() * 0.76);
        const r = 8 + rand() * 46;
        ctx.fillStyle = p.blobs[Math.floor(rand() * p.blobs.length)];
        ctx.globalAlpha = 0.55 + rand() * 0.4;
        for (const ox of [0, -w, w]) {
            ctx.beginPath();
            ctx.ellipse(x + ox, y, r * (1 + rand()), r, rand() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Polar caps.
    ctx.globalAlpha = kind === 'volcanic' ? 0 : 0.85;
    ctx.fillStyle = '#eef4fa';
    ctx.fillRect(0, 0, w, h * 0.06);
    ctx.fillRect(0, h * 0.94, w, h * 0.06);
    if (kind === 'volcanic') {
        // Lava rivers.
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
            ctx.beginPath();
            let x = rand() * w, y = h * (0.15 + rand() * 0.7);
            ctx.moveTo(x, y);
            for (let k = 0; k < 6; k++) {
                x += (rand() - 0.5) * 60;
                y += (rand() - 0.5) * 30;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }
    // Clouds.
    ctx.globalAlpha = 1;
    for (let i = 0; i < 160 * p.clouds; i++) {
        const x = rand() * w;
        const y = h * (0.1 + rand() * 0.8);
        const r = 10 + rand() * 40;
        // Volcanic worlds get dark ash plumes, everything else white cloud.
        ctx.fillStyle = kind === 'volcanic'
            ? `rgba(40,32,28,${0.3 + rand() * 0.3})`
            : `rgba(255,255,255,${0.15 + rand() * 0.3})`;
        for (const ox of [0, -w, w]) {
            ctx.beginPath();
            ctx.ellipse(x + ox, y, r * 2.5, r * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    return canvasTexture(c);
}

function makeStarLayer(rand: () => number, count: number, size: number, brightness: number): THREE.Points {
    // Stars in a unit square (-0.5..0.5); the layer is scaled to the screen.
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3] = rand() - 0.5;
        pos[i * 3 + 1] = rand() - 0.5;
        pos[i * 3 + 2] = 0;
        const a = brightness * (0.35 + rand() * 0.65);
        const tint = rand();
        col[i * 3] = a * (tint < 0.15 ? 1 : 0.82);
        col[i * 3 + 1] = a * 0.88;
        col[i * 3 + 2] = a * (tint > 0.8 ? 1 : 0.95);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, toneMapped: false });
    return new THREE.Points(g, m);
}

export class SkyBackdrop {
    readonly scene = new THREE.Scene();
    private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000);
    private readonly layers: Layer[] = [];
    private readonly planet: THREE.Mesh;
    private readonly textures: THREE.Texture[] = [];
    private readonly geometries: THREE.BufferGeometry[] = [];
    private readonly materials: THREE.Material[] = [];
    /** Pan at zoom 1 centred on the field, so parallax is measured from rest. */
    private readonly rest: { x: number; y: number };

    constructor(seed: number, field: { width: number; height: number }, glowTexture: THREE.Texture) {
        const rand = mulberry32(seed || 1);
        this.rest = { x: field.width / 2, y: field.height / 2 };
        this.camera.position.set(0, 0, 100);

        // Far: nebula plane, then two star layers.
        const nebulaTex = makeNebulaTexture(rand);
        this.textures.push(nebulaTex);
        const quad = new THREE.PlaneGeometry(1, 1);
        this.geometries.push(quad);
        const nebulaMat = new THREE.MeshBasicMaterial({ map: nebulaTex, toneMapped: false, depthWrite: false });
        this.materials.push(nebulaMat);
        const nebula = new THREE.Mesh(quad, nebulaMat);
        this.addLayer(nebula, 0.02, 0.03, 0, 0, 1.1, 2);

        const farStars = makeStarLayer(rand, 900, 1.2, 0.7);
        const nearStars = makeStarLayer(rand, 260, 2.0, 1.0);
        for (const s of [farStars, nearStars]) {
            this.geometries.push(s.geometry);
            this.materials.push(s.material as THREE.Material);
        }
        this.addLayer(farStars, 0.035, 0.04, 0, 0, 2.2);
        this.addLayer(nearStars, 0.07, 0.08, 0, 0, 2.6);

        // Near: the planet, low and to one side, partly off screen.
        const kinds: PlanetKind[] = ['terran', 'gas', 'desert', 'ice', 'volcanic'];
        const kind = kinds[Math.floor(rand() * kinds.length)];
        const planetTex = makePlanetTexture(kind, rand);
        this.textures.push(planetTex);
        const sphere = new THREE.SphereGeometry(0.5, 64, 40);
        this.geometries.push(sphere);
        const planetMat = new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.95, metalness: 0, color: 0xb8bcc8 });
        this.materials.push(planetMat);
        this.planet = new THREE.Mesh(sphere, planetMat);
        this.planet.rotation.set(0.35, 0, 0.2);

        // Atmosphere: a soft additive halo just behind the sphere.
        const haloMat = new THREE.MeshBasicMaterial({
            map: glowTexture,
            color: PLANET_COLOURS[kind].atmosphere,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        this.materials.push(haloMat);
        const halo = new THREE.Mesh(quad, haloMat);
        halo.scale.set(1.32, 1.32, 1);
        halo.position.z = -1;

        const planetGroup = new THREE.Group();
        planetGroup.add(halo, this.planet);
        const side = rand() < 0.5 ? -1 : 1;
        // Low in a far corner, partly below the screen edge, so it frames the
        // battle instead of sitting behind the fleets.
        const planetSize = 0.42 + rand() * 0.2;
        this.addLayer(planetGroup, 0.14, 0.12, side * (0.36 + rand() * 0.1), -(0.5 + rand() * 0.1), planetSize);

        // Sunlight from the side away from the planet's screen position, so the
        // lit crescent faces the battle.
        const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
        // Grazing light: a lit crescent and a dark night side read as a world.
        sun.position.set(-side * 1.0, 0.55, 0.2);
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0x6070a0, 0.08));
    }

    private addLayer(object: THREE.Object3D, parallax: number, zoomFollow: number, hx: number, hy: number, size: number, aspect = 1): void {
        this.scene.add(object);
        this.layers.push({ object, parallax, zoomFollow, home: new THREE.Vector2(hx, hy), size, aspect });
    }

    render(renderer: THREE.WebGLRenderer, view: SkyView, time: number): void {
        const { cw, ch } = view;
        const cam = this.camera;
        cam.left = -cw / 2;
        cam.right = cw / 2;
        cam.top = ch / 2;
        cam.bottom = -ch / 2;
        cam.updateProjectionMatrix();

        const big = Math.max(cw, ch);
        // Screen-space pan from rest, in px at the current zoom.
        const panX = (view.cx - this.rest.x) * view.baseScale * view.zoom;
        const panY = (view.cy - this.rest.y) * view.baseScale * view.zoom;
        for (const l of this.layers) {
            const grow = 1 + (view.zoom - 1) * l.zoomFollow;
            const s = big * l.size * grow;
            l.object.scale.set(s * l.aspect, s, s);
            l.object.position.set(
                l.home.x * cw - panX * l.parallax,
                l.home.y * ch + panY * l.parallax,
                l.object === this.planet.parent ? 0 : -50,
            );
        }
        this.planet.rotation.y = time * 0.01;
        renderer.render(this.scene, cam);
    }

    dispose(): void {
        for (const t of this.textures) t.dispose();
        for (const g of this.geometries) g.dispose();
        for (const m of this.materials) m.dispose();
        this.scene.clear();
    }
}
