// lib/galaxy/star-class.ts
// What kind of star a system has. A pure function of the system's id and
// tags, so the galaxy map (components/galaxy/starVisuals.ts re-exports this),
// the system view and the worker's body generator (lib/exploration/
// body-generator.ts) all agree on it without anything being stored.

export interface StarClass {
    key: StarKey;
    label: string;
    core: string;   // core fill colour
    glow: string;   // halo colour
    ring?: string;  // optional accretion / pulsar ring colour
    binary?: boolean;
    dark?: boolean; // black-hole style (dark core, bright ring)
}

export type StarKey = 'blueGiant' | 'yellow' | 'redDwarf' | 'whiteDwarf' | 'neutron' | 'binary' | 'pulsar' | 'blackHole';

// Ordered roughly common -> exotic. Indices are referenced by classifyStar().
export const STAR_CLASSES: StarClass[] = [
    { key: 'blueGiant', label: 'Blue Giant', core: '#cfe2ff', glow: '#4d8dff' },
    { key: 'yellow', label: 'Yellow Star', core: '#ffe8a3', glow: '#f5b642' },
    { key: 'redDwarf', label: 'Red Dwarf', core: '#ff9d7a', glow: '#e0492b' },
    { key: 'whiteDwarf', label: 'White Dwarf', core: '#f2f6ff', glow: '#a9c7ff' },
    { key: 'neutron', label: 'Neutron Star', core: '#dbf3ff', glow: '#7fdcff', ring: '#a9f0ff' },
    { key: 'binary', label: 'Binary Star', core: '#ffd9a3', glow: '#ff9d4d', binary: true },
    { key: 'pulsar', label: 'Pulsar', core: '#e6d3ff', glow: '#a970ff', ring: '#c9a3ff' },
    { key: 'blackHole', label: 'Black Hole', core: '#0a0612', glow: '#7c3aed', ring: '#c084fc', dark: true },
];

/** Stable 32-bit FNV-1a hash so visuals are deterministic per system id. */
export function hashString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Pick a star class from tags (special cases) then a weighted hash of the id. */
export function classifyStar(sys: { id?: string; tags?: string[] } | null | undefined): StarClass {
    const tags: string[] = sys?.tags || [];
    if (tags.includes('black_hole') || tags.includes('anomaly')) return STAR_CLASSES[7];
    if (tags.includes('corsair_den')) return STAR_CLASSES[2]; // lawless red
    const roll = hashString(sys?.id || '') % 100;
    if (roll < 34) return STAR_CLASSES[1];  // yellow (most common)
    if (roll < 58) return STAR_CLASSES[2];  // red dwarf
    if (roll < 74) return STAR_CLASSES[0];  // blue giant
    if (roll < 86) return STAR_CLASSES[3];  // white dwarf
    if (roll < 93) return STAR_CLASSES[5];  // binary
    if (roll < 98) return STAR_CLASSES[4];  // neutron
    return STAR_CLASSES[6];                 // pulsar (rare)
}
