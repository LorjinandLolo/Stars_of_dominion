// components/planet/iso.ts
// Minimal isometric projection for surface motifs. Districts stay flat on the
// map; the things built on them are drawn as little 3D blocks so a city reads
// as a city and never as a mountain range.

export type IsoFaces = { top: string; left: string; right: string };

/** 2:1 isometric — the standard game-art ratio, cheap and readable. */
const ISO_X = 1;
const ISO_Y = 0.5;

/**
 * Projects a point in block-space (x east, y south, z up) to screen space,
 * anchored at a ground origin.
 */
export function iso(ox: number, oy: number, x: number, y: number, z: number): [number, number] {
    return [
        ox + (x - y) * ISO_X,
        oy + (x + y) * ISO_Y - z,
    ];
}

const pts = (arr: Array<[number, number]>) =>
    arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/**
 * The three visible faces of an axis-aligned box standing on the ground at
 * (ox, oy), with footprint w×d and height h.
 */
export function isoBox(ox: number, oy: number, w: number, d: number, h: number): IsoFaces {
    const P = (x: number, y: number, z: number) => iso(ox, oy, x, y, z);
    // Ground corners
    const g0 = P(0, 0, 0);       // near
    const gR = P(w, 0, 0);       // right
    const gB = P(w, d, 0);       // far
    const gL = P(0, d, 0);       // left
    // Roof corners
    const t0 = P(0, 0, h);
    const tR = P(w, 0, h);
    const tB = P(w, d, h);
    const tL = P(0, d, h);

    return {
        top: pts([t0, tR, tB, tL]),
        // Left face runs from the near corner to the left corner.
        left: pts([g0, gL, tL, t0]),
        // Right face runs from the near corner to the right corner.
        right: pts([g0, gR, tR, t0]),
    };
}

/** Depth sort: blocks further "back" (smaller x+y) draw first. */
export const isoDepth = (x: number, y: number) => x + y;

/** Shades for a base colour: [top, left, right]. */
export function isoShades(base: string): [string, string, string] {
    return [base, shade(base, -0.34), shade(base, -0.16)];
}

function shade(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(full, 16);
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(((num >> 16) & 255) * (1 + amount));
    const g = clamp(((num >> 8) & 255) * (1 + amount));
    const b = clamp((num & 255) * (1 + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
