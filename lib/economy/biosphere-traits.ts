// lib/economy/biosphere-traits.ts
import { ResourceBundle } from './economy-types';

/**
 * Maps narrative SWN World Tags to gameplay economic base rate modifiers.
 * These act as fixed flat bonuses/penalties to a planet's static resource output.
 * 
 * Design philosophy:
 *   - Specialized worlds get strong boosts in their niche but suffer trade-offs elsewhere.
 *   - Tags represent environmental/societal realities — e.g. grasslands improve food,
 *     prison planets boost military but harm happiness (instability side-effects handled elsewhere).
 *   - Values are per-second flat additions to base rate bundles.
 */
export const BIOSPHERE_TRAIT_MODIFIERS: Record<string, ResourceBundle> = {

    // ── Environmental Worlds ───────────────────────────────────────────────────
    'Agriculture World': { food: +40, luxury: +10, metals: -15 },
    'Grasslands':        { food: +25, luxury: +5 },
    'Ocean World':       { food: +30, chemicals: +15, metals: -10 },
    'Oceanic World':     { food: +25, chemicals: +10, metals: -10 },
    'Desert World':      { metals: +10, energy: +20, food: -15 },
    'Radioactive World': { chemicals: +20, energy: +15, food: -20 },
    'Ice World':         { metals: +10, food: -20, energy: -10 },
    'Jungle World':      { food: +20, chemicals: +20, research: +10 },
    'Night World':       { energy: -15, food: -10, rare: +15 },
    'Tomb World':        { research: +20, rare: +25, food: -25, military: -10 },
    'Freak Weather':     { energy: +25, food: -10 },
    'Freak Geology':     { metals: +30, rare: +10, food: -10 },
    'Hostile Biosphere': { research: +15, chemicals: +20, food: -20 },
    'Seismic Instability': { metals: +15, energy: +10 },
    'Seamic Instability':  { metals: +15, energy: +10 }, // legacy typo support
    'Terraform Failure': { food: -20, chemicals: +10, research: +10 },
    'Bubble Cities':     { energy: +10, luxury: +20, metals: -5 },
    'Flying Cities':     { energy: -10, luxury: +15 },

    // ── Post-Human & Tech ──────────────────────────────────────────────────────
    'Utopia':               { luxury: +30, cultural: +20 },
    'Post-Scarcity':        { metals: +20, energy: +20, food: +20, chemicals: +20 },
    'Cybercommunists':      { military: +15, metals: +10, luxury: -20 },
    'Cyborgs':              { military: +20, research: +10, food: -15 },
    'Unbraked AI':          { research: +40 },
    'Psionics Academy':     { rare: +30, research: +15 },
    'Psionics Worship':     { cultural: +20, rare: +15, military: -5 },
    'Preceptor Archive':    { research: +35, cultural: +20 },
    'Major Spaceyard':      { metals: +20, military: +25, energy: +10 },
    'Perimeter Agency':     { military: +20, research: +10 },
    'Research Station':     { research: +30 },

    // ── Societal & Governance ──────────────────────────────────────────────────
    'Police State':         { military: +20, rare: -10 },
    'Theocracy':            { cultural: +30, research: -15 },
    'Warlords':             { military: +30 },
    'Secret Masters':       { rare: +15 },
    'Tyranny':              { military: +15, food: -10, luxury: -20 },
    'Former Warriors':      { military: +20, food: -5, cultural: -10 },
    'Shackled World':       { metals: +10, luxury: -30, cultural: -20 },
    'Cultural Power':       { cultural: +40, luxury: +15 },
    'Sole Supplier':        { credits: +30, rare: +20, luxury: +10 },
    'Feudal Overlords':     { military: +15, food: -10, credits: +10 },
    'Nomads':               { military: +10, credits: +15 },
    'Anthropomorphs':       { food: +15, military: +10 },
    'Primitive Aliens':     { research: +10, food: +10 },
    'Beastmasters':         { military: +15, food: +10 },
    'Hatred':               { military: +25, luxury: -20, cultural: -20 },

    // ── History & Conflict ─────────────────────────────────────────────────────
    'Alien Ruins':          { research: +30, rare: +20 },
    'Ancient Ruins':        { research: +25, rare: +15 },
    'Battleground':         { military: +25, food: -15 },
    'Fallen Hegemon':       { cultural: +20, research: +15, military: -10 },
    'Megacorps':            { credits: +40, luxury: +20 },
    'Zombies':              { military: +15, food: -30 },
    'Holy War':             { military: +30, cultural: +15, food: -10, luxury: -20 },
    'Cyclical Doom':        { rare: +20, research: -10, food: -10 },
    'Doomed World':         { rare: +30, research: +20, food: -20, credits: -20 },
    'Taboo Treasure':       { rare: +40, credits: -15 },
    'Sealed Menace':        { military: +20, research: +10, luxury: -15 },
    'Quarantined World':    { chemicals: +15, research: +20, credits: -25, food: -10 },

    // ── Criminal / Shadow Economy ──────────────────────────────────────────────
    'Pirate Den':           { credits: +30, luxury: +20, military: +10, food: -10 },
    'black-market':         { credits: +35, luxury: +25, rare: +10 },
    'corsair_den':          { military: +20, credits: +25, luxury: +15 },
    'Prison Planet':        { military: +30, food: -20, luxury: -30, cultural: -20 },
    'Abandoned Colony':     { metals: +15, rare: +10, food: -15 },

    // ── Geographic / Archetype Tags ────────────────────────────────────────────
    'throat':               { military: +15, credits: +10 },
    'gate':                 { credits: +25, military: +10, energy: +10 },
    'canal':                { credits: +30, food: +10 },
    'relay':                { credits: +20, energy: +10, research: +5 },
    'spine':                { military: +10, credits: +10 },
    'void':                 { rare: +10, research: +5, food: -10 },
    'deep-space':           { research: +10, rare: +15, food: -15 },
    'fortress':             { military: +40, food: -10, credits: -10 },
    'basin':                { food: +20, metals: +10 },
    'mining-hub':           { metals: +40, energy: +10, food: -15 },
    'nebula-outpost':       { research: +20, rare: +25, food: -20 },
    'contested':            { military: +25, credits: -10, luxury: -15 },
    'dead-world':           { metals: +20, rare: +20, food: -30 },
    'research-station':     { research: +30, food: -10 },
};

/**
 * Calculates the combined economic modifier profile for a given set of system tags.
 */
export function calculateBiosphereModifiers(tags: string[]): ResourceBundle {
    const aggregate: ResourceBundle = {};

    tags.forEach(tag => {
        const mod = BIOSPHERE_TRAIT_MODIFIERS[tag];
        if (mod) {
            Object.entries(mod).forEach(([resource, value]) => {
                const resName = resource as keyof ResourceBundle;
                aggregate[resName] = (aggregate[resName] || 0) + value;
            });
        }
    });

    return aggregate;
}
