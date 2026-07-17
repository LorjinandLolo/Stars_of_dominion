// lib/galaxy/system-tags.ts
// Canonical "flavour" tag taxonomy for star systems, plus deterministic seeding so the
// galaxy has personality the moment it loads (without editing the large systems JSON).
//
// Categories:
//   stellar   — natural phenomena (visual variety + minor mechanics)
//   ancient   — mysteries and precursor sites (exploration + events)
//   strategic — economy/military landmarks (specialised worlds, chokepoints)
//   social    — soft-power and population flavour
//   political — lawlessness, dissent, disputed space
//   temporary — transient states the simulation toggles on/off ("living galaxy")

export type TagCategory = 'stellar' | 'ancient' | 'strategic' | 'social' | 'political' | 'temporary';

export interface SystemTagDef {
    id: string;
    category: TagCategory;
    label: string;
    description: string;
    rarity: number;      // seed probability per system (0 = never seeded statically)
    temporary?: boolean; // applied dynamically by the sim, never seeded at load
}

export const SYSTEM_TAGS: SystemTagDef[] = [
    // ── Stellar ──────────────────────────────────────────────────────────────
    { id: 'nebula', category: 'stellar', label: 'Nebula', description: 'Ionised clouds cut sensor range and hide fleets.', rarity: 0.10 },
    { id: 'ion_storm', category: 'stellar', label: 'Ion Storm', description: 'Charged tempests batter passing ships.', rarity: 0.05 },
    { id: 'asteroid_field', category: 'stellar', label: 'Asteroid Field', description: 'Dense debris — rich in metals, hard to cross.', rarity: 0.08 },
    { id: 'black_hole', category: 'stellar', label: 'Black Hole', description: 'A gravitational monster warping local space.', rarity: 0.015 },
    { id: 'binary_star', category: 'stellar', label: 'Binary Star', description: 'Twin suns bathe the system in energy.', rarity: 0.06 },
    { id: 'rogue_comet', category: 'stellar', label: 'Comet Swarm', description: 'Icy wanderers streak across the void.', rarity: 0.05 },

    // ── Ancient ──────────────────────────────────────────────────────────────
    { id: 'ancient_ruins', category: 'ancient', label: 'Ancient Ruins', description: 'Silent structures of a forgotten people.', rarity: 0.05 },
    { id: 'precursor_relic', category: 'ancient', label: 'Precursor Relic', description: 'Technology beyond current understanding.', rarity: 0.02 },
    { id: 'derelict_station', category: 'ancient', label: 'Derelict Station', description: 'A dead station drifting, ripe for salvage.', rarity: 0.04 },
    { id: 'dyson_remnant', category: 'ancient', label: 'Dyson Remnant', description: 'The shattered ring of a stellar megastructure.', rarity: 0.012 },

    // ── Strategic ────────────────────────────────────────────────────────────
    { id: 'trade_hub', category: 'strategic', label: 'Trade Hub', description: 'A crossroads of interstellar commerce.', rarity: 0.06 },
    { id: 'shipyard', category: 'strategic', label: 'Shipyard', description: 'Orbital docks capable of building fleets.', rarity: 0.04 },
    { id: 'mining_world', category: 'strategic', label: 'Mining World', description: 'Vast ore-extraction operations.', rarity: 0.06 },
    { id: 'agri_world', category: 'strategic', label: 'Agri-World', description: 'A breadbasket feeding whole sectors.', rarity: 0.06 },
    { id: 'research_colony', category: 'strategic', label: 'Research Colony', description: 'Laboratories pushing the scientific frontier.', rarity: 0.04 },
    { id: 'chokepoint', category: 'strategic', label: 'Chokepoint', description: 'A narrow passage every fleet must cross.', rarity: 0.03 },

    // ── Social ───────────────────────────────────────────────────────────────
    { id: 'free_port', category: 'social', label: 'Free Port', description: 'A lawless market beyond any flag.', rarity: 0.04 },
    { id: 'refugee_world', category: 'social', label: 'Refugee World', description: 'Displaced millions seeking shelter.', rarity: 0.03 },
    { id: 'holy_site', category: 'social', label: 'Holy Site', description: 'A place of pilgrimage and devotion.', rarity: 0.03 },
    { id: 'cultural_capital', category: 'social', label: 'Cultural Capital', description: 'A beacon of art and soft power.', rarity: 0.025 },

    // ── Political ────────────────────────────────────────────────────────────
    { id: 'free_market', category: 'political', label: 'Free Market', description: 'Deregulated commerce draws opportunists.', rarity: 0.03 },
    { id: 'black_market', category: 'political', label: 'Black Market', description: 'Smuggling and espionage thrive here.', rarity: 0.035 },
    { id: 'rebel_stronghold', category: 'political', label: 'Rebel Stronghold', description: 'Insurgents entrenched against their rulers.', rarity: 0.03 },
    { id: 'corsair_den', category: 'political', label: 'Corsair Den', description: 'A haven for pirates and raiders.', rarity: 0.03 },
    { id: 'pirate_station', category: 'political', label: 'Pirate Station', description: 'A fortified raider base preying on trade lanes.', rarity: 0.02 },
    { id: 'disputed', category: 'political', label: 'Disputed Space', description: 'Claimed by more than one power.', rarity: 0.03 },

    // ── Temporary (sim-driven, never seeded statically) ──────────────────────
    { id: 'boomtown', category: 'temporary', label: 'Boomtown', description: 'A sudden economic surge.', rarity: 0, temporary: true },
    { id: 'famine', category: 'temporary', label: 'Famine', description: 'Failing supply lines starve the populace.', rarity: 0, temporary: true },
    { id: 'plague_quarantine', category: 'temporary', label: 'Quarantine', description: 'A system sealed under medical lockdown.', rarity: 0, temporary: true },
    { id: 'festival', category: 'temporary', label: 'Festival', description: 'Celebration lifts morale across the system.', rarity: 0, temporary: true },
    { id: 'under_siege', category: 'temporary', label: 'Under Siege', description: 'Active conflict grips the system.', rarity: 0, temporary: true },
];

export const SYSTEM_TAG_MAP: Record<string, SystemTagDef> =
    Object.fromEntries(SYSTEM_TAGS.map((t) => [t.id, t]));

/** Stable FNV-1a hash for deterministic seeding. */
function hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Deterministically assign up to 2 flavour tags to a system by id.
 * Temporary tags are never seeded here (the sim applies those). Existing tags are kept
 * and never duplicated. Same id always yields the same tags, so the galaxy is stable.
 */
export function assignFlavorTags(sysId: string, existing: string[] = []): string[] {
    const has = new Set(existing);
    const out: string[] = [];
    const seedable = SYSTEM_TAGS.filter((t) => !t.temporary);
    let h = hash(sysId || '');
    for (const t of seedable) {
        if (has.has(t.id) || out.includes(t.id)) continue;
        // Advance the hash stream so each tag rolls independently.
        h = (Math.imul(h, 1103515245) + 12345) >>> 0;
        const roll = (h % 100000) / 100000;
        if (roll < t.rarity) {
            out.push(t.id);
            if (out.length >= 2) break;
        }
    }
    return out;
}
