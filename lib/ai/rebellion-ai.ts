/**
 * lib/ai/rebellion-ai.ts
 * AI empires and rebel cells (Item 13, decision 9): abroad they sponsor them
 * (13b), at home they crack down on them by temperament (13c).
 *
 * An AI service that can see a cell in the territory of an empire it is
 * hostile to may start paying it: revolution exporters readily, shadow
 * empires through cutouts, most others now and then, the Buthari never (they
 * do not strike first, and arming another's rebels is striking). One
 * sponsorship at a time. An AI caught paying cuts its losses.
 */

import type { GameWorldState } from '../game-world-state';
import { activeSponsorshipsOf, crackdownWithPrisoners, cutSponsorship, ensureSponsorships, foreignCellsFor, sponsorCell } from '../rebellion/sponsor-service';
import { crackdownBlocker, knownCellsFor } from '../rebellion/cell-service';
import { CRACKDOWN_CAPITAL } from '../rebellion/rebellion-types';
import { spendPoliticalCapital } from '../government/government-service';
import { intelArchetypeOf, type AIIntelligenceArchetype } from './intelligence-ai-service';

/** Chance per strategic tick an eligible AI starts paying a cell. */
export const AI_SPONSOR_BASE_CHANCE = 0.02;
const ARCHETYPE_FACTOR: Partial<Record<AIIntelligenceArchetype, number>> = {
    revolution_exporter: 3,
    shadow_empire: 1.5,
};
/** Hostility (rivalry escalation) before an AI arms a rival's rebels. */
export const AI_SPONSOR_MIN_ESCALATION = 3;
export const AI_ARM_MIN_ESCALATION = 5;
/** Treasury an AI keeps before it pays anyone's rebels. */
export const AI_SPONSOR_MIN_CREDITS = 20_000;

function escalation(world: GameWorldState, a: string, b: string): number {
    const r: any = world.rivalries?.get?.(`rivalry-${a}-${b}`) ?? world.rivalries?.get?.(`rivalry-${b}-${a}`);
    return r?.escalationLevel ?? 0;
}

// ─── Crackdowns at home (Item 13, decision 9) ────────────────────────────────

/**
 * How strong a known cell must be before an AI government cracks down on its
 * world. Low is harsh. The Kaer'Ruun and the Sarrak never crack down softly:
 * any cell they know of is hit, and they hit restless worlds where they know of
 * none. Philosopher-kings and scientists wait until a cell is a real threat.
 */
export const CRACKDOWN_STANCE: Record<string, number> = {
    'faction-kaerruun': 0,
    'faction-sarrak': 0,
    'faction-aurelian': 20,
    'faction-infernoids': 20,
    'faction-rhimetals': 30,
    'faction-movanites': 30,
    'faction-null-syndicate': 35,
    'banking_clan': 35,
    'faction-covenant': 40,
    'faction-gabagoonians': 40,
    'nexulan_convergence': 45,
    'faction-vektori': 50,
    'faction-leopantheri': 55,
    'faction-buthari': 60,
};
export const DEFAULT_CRACKDOWN_STANCE = 40;
/** An iron-fisted government (stance 0) also sweeps worlds this restless with no known cell. */
export const IRON_FIST_UNREST = 60;

export function crackdownStance(factionId: string): number {
    return CRACKDOWN_STANCE[factionId] ?? DEFAULT_CRACKDOWN_STANCE;
}

/**
 * One crackdown at most per AI per strategic tick: on the world of its most
 * dangerous known cell past its stance, and always on a cell that has come
 * into the open. Political capital is spent like a player's.
 */
export function tickAICrackdowns(world: GameWorldState, factionId: string): string | null {
    const stance = crackdownStance(factionId);
    const known = knownCellsFor(world, factionId)
        .filter(c => c.status === 'active')
        .filter(c => c.crisisId || c.strength >= stance)
        .sort((a, b) => Number(!!b.crisisId) - Number(!!a.crisisId) || b.strength - a.strength);
    let planetId: string | undefined;
    for (const c of known) {
        if (!crackdownBlocker(world, factionId, c.planetId)) { planetId = c.planetId; break; }
    }
    if (!planetId && stance === 0) {
        const restless = [...world.construction.planets.values()]
            .filter((p: any) => p.ownerId === factionId && Number(p.unrest ?? 0) >= IRON_FIST_UNREST)
            .sort((a: any, b: any) => Number(b.unrest ?? 0) - Number(a.unrest ?? 0));
        planetId = restless.find(p => !crackdownBlocker(world, factionId, p.id))?.id;
    }
    if (!planetId) return null;
    if (!spendPoliticalCapital(world, factionId, CRACKDOWN_CAPITAL, 'a security crackdown')) return null;
    const res = crackdownWithPrisoners(world, factionId, planetId);
    return res.ok ? `crackdown ${planetId}` : null;
}

export function tickAISponsorship(world: GameWorldState, factionId: string, rand: () => number = Math.random): string | null {
    const civ = (world.economy?.factions?.get?.(factionId) as any)?.civilizationId;
    if (civ === 'civ-buthari') return null;

    const mine = [...ensureSponsorships(world).values()].filter(s => s.sponsorFactionId === factionId && !s.endedAtSeconds);
    for (const s of mine) {
        if (s.exposedAtSeconds) { cutSponsorship(world, factionId, s.id); return `cut ${s.cellId} (exposed)`; }
    }
    if (mine.length > 0) return null;

    const reserves = Number((world.economy?.factions?.get?.(factionId) as any)?.reserves?.CREDITS ?? 0);
    if (reserves < AI_SPONSOR_MIN_CREDITS) return null;

    const archetype = intelArchetypeOf(factionId);
    const chance = AI_SPONSOR_BASE_CHANCE * ((archetype && ARCHETYPE_FACTOR[archetype]) ?? 1);
    if (rand() >= chance) return null;

    const candidates = foreignCellsFor(world, factionId)
        .filter(c => escalation(world, factionId, c.hostFactionId) >= AI_SPONSOR_MIN_ESCALATION)
        .filter(c => !activeSponsorshipsOf(world, c.id).some(s => s.sponsorFactionId === factionId))
        .sort((a, b) => b.strength - a.strength);
    const pick = candidates[0];
    if (!pick) return null;

    const res = sponsorCell(world, factionId, pick.id, {
        armed: escalation(world, factionId, pick.hostFactionId) >= AI_ARM_MIN_ESCALATION,
        cutout: archetype === 'shadow_empire' || rand() < 0.4,
    });
    return res.ok ? `sponsor ${pick.id}` : null;
}
