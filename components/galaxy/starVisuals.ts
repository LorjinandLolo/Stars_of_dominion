// components/galaxy/starVisuals.ts
// Deterministic visual classification for galaxy-map systems.
// Everything here is a pure function of the system's own data, so a given system
// always looks the same across renders (stable "personality") without needing extra
// data on the server.

export interface StarClass {
    key: string;
    label: string;
    core: string;   // core fill colour
    glow: string;   // halo colour
    ring?: string;  // optional accretion / pulsar ring colour
    binary?: boolean;
    dark?: boolean; // black-hole style (dark core, bright ring)
}

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
export function classifyStar(sys: any): StarClass {
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

export interface StarSize { core: number; glow: number; tier: number; }

/** Visual weight tier: bigger, brighter for capitals / strategic systems. */
export function systemSize(sys: any, isCapital: boolean): StarSize {
    const tags: string[] = sys?.tags || [];
    if (isCapital) return { core: 5.5, glow: 24, tier: 4 };
    if (tags.includes('fortress') || tags.includes('gate')) return { core: 4, glow: 17, tier: 3 };
    const trade = sys?.tradeValue || 0;
    if (trade > 60) return { core: 3.3, glow: 13, tier: 2 };
    if (trade > 25) return { core: 2.6, glow: 10, tier: 1 };
    return { core: 2, glow: 7, tier: 0 };
}

const FACTION_PALETTE = [
    '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b',
    '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#06b6d4',
];

// Friend/foe ring colours — the standard 4X convention.
export type Relationship = 'mine' | 'ally' | 'neutral' | 'hostile';
export const RELATIONSHIP_COLORS: Record<Relationship, string> = {
    mine: '#22c55e',    // green
    ally: '#38bdf8',    // blue
    neutral: '#94a3b8', // grey
    hostile: '#ef4444', // red
};

/** Consistent colour per owning faction (known factions pinned, others hashed). */
export function factionColor(ownerId?: string | null): string {
    if (!ownerId) return '#94a3b8';
    if (ownerId === 'faction-aurelian') return '#3b82f6';
    if (ownerId === 'faction-vektori') return '#ef4444';
    return FACTION_PALETTE[hashString(ownerId) % FACTION_PALETTE.length];
}

// ── Tag visuals ──────────────────────────────────────────────────────────────
// Each meaningful tag gets a glyph, colour, and (optionally) a highlight ring so the
// seeded taxonomy reads at a glance on the map. `priority` picks which tag's marker
// shows when a system has several.
export interface TagVisual { icon: string; color: string; ring?: boolean; priority: number; }

export const TAG_VISUALS: Record<string, TagVisual> = {
    // political / threat (highest priority — you want to see danger)
    under_siege:      { icon: '⚔', color: '#ef4444', ring: true, priority: 98 },
    pirate_station:   { icon: '☠', color: '#ef4444', ring: true, priority: 96 },
    plague_quarantine:{ icon: '⚕', color: '#65a30d', ring: true, priority: 94 },
    corsair_den:      { icon: '⚑', color: '#f87171', priority: 92 },
    boomtown:         { icon: '↑', color: '#fbbf24', ring: true, priority: 90 },
    famine:           { icon: '☒', color: '#b45309', priority: 88 },
    rebel_stronghold: { icon: '✹', color: '#f43f5e', ring: true, priority: 86 },
    // ancient / rare
    black_hole:       { icon: '⬤', color: '#7c3aed', ring: true, priority: 84 },
    precursor_relic:  { icon: '◈', color: '#c084fc', ring: true, priority: 82 },
    dyson_remnant:    { icon: '◍', color: '#a78bfa', ring: true, priority: 80 },
    ancient_ruins:    { icon: '⌘', color: '#a78bfa', priority: 72 },
    derelict_station: { icon: '⌗', color: '#94a3b8', priority: 54 },
    // strategic
    trade_hub:        { icon: '⬡', color: '#fbbf24', priority: 70 },
    shipyard:         { icon: '⚒', color: '#38bdf8', priority: 68 },
    chokepoint:       { icon: '⧖', color: '#f59e0b', priority: 66 },
    research_colony:  { icon: '⚛', color: '#22d3ee', priority: 46 },
    mining_world:     { icon: '⛏', color: '#d97706', priority: 42 },
    agri_world:       { icon: '❦', color: '#84cc16', priority: 42 },
    // social / political-lite
    disputed:         { icon: '⚔', color: '#f97316', priority: 60 },
    black_market:     { icon: '⧉', color: '#a855f7', priority: 56 },
    free_port:        { icon: '⚓', color: '#fcd34d', priority: 52 },
    free_market:      { icon: '$', color: '#fcd34d', priority: 50 },
    holy_site:        { icon: '✶', color: '#fde68a', priority: 48 },
    cultural_capital: { icon: '♜', color: '#f0abfc', priority: 47 },
    festival:         { icon: '❋', color: '#f472b6', priority: 44 },
    refugee_world:    { icon: '⚑', color: '#fb923c', priority: 34 },
    // stellar / cosmetic
    ion_storm:        { icon: '⌇', color: '#5eead4', priority: 24 },
    nebula:           { icon: '☁', color: '#818cf8', priority: 22 },
    asteroid_field:   { icon: '⁙', color: '#a8a29e', priority: 20 },
    binary_star:      { icon: '✸', color: '#fca5a5', priority: 16 },
    rogue_comet:      { icon: '☄', color: '#93c5fd', priority: 12 },
};

/** Highest-priority tag marker for a system, or null. */
export function dominantTagVisual(tags: string[] | undefined): { tag: string; v: TagVisual } | null {
    if (!tags || !tags.length) return null;
    let best: { tag: string; v: TagVisual } | null = null;
    for (const t of tags) {
        const v = TAG_VISUALS[t];
        if (v && (!best || v.priority > best.v.priority)) best = { tag: t, v };
    }
    return best;
}

/**
 * Tags observable from across the galaxy (astronomical phenomena / megastructures) —
 * these show even on unscanned systems. Everything else is "contents" and stays hidden
 * until the system is scanned.
 */
export const OBSERVABLE_TAGS = new Set<string>([
    'nebula', 'black_hole', 'binary_star', 'ion_storm', 'asteroid_field', 'rogue_comet', 'dyson_remnant',
]);

/** Tags rendered as large spatial features (their own layer), not as a small glyph. */
export const PHENOMENA_TAGS = new Set<string>([
    'black_hole', 'dyson_remnant', 'nebula', 'ion_storm', 'asteroid_field', 'rogue_comet',
]);

/**
 * Fog-of-war brightness. The star itself is ALWAYS visible (systems are common knowledge);
 * only its contents are hidden. Scan state modulates brightness so information still reads
 * as a resource: unknown -> dimmer, scanned -> normal, owned -> bright, capital -> brilliant.
 */
export function revealBrightness(revealStage: string, isOwned: boolean, isCapital: boolean): number {
    if (isCapital && isOwned) return 1;
    switch (revealStage) {
        case 'surveyed':
        case 'scanned':
            return isOwned ? 1 : 0.92;
        case 'pinged':
            return 0.75;
        default:
            return 0.6; // unknown — star visible, contents hidden
    }
}
