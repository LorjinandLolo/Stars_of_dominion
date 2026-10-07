/**
 * lib/ai/rebellion-ai.ts
 * AI empires and rebel cells abroad (Item 13b, decision 9).
 *
 * An AI service that can see a cell in the territory of an empire it is
 * hostile to may start paying it: revolution exporters readily, shadow
 * empires through cutouts, most others now and then, the Buthari never (they
 * do not strike first, and arming another's rebels is striking). One
 * sponsorship at a time. An AI caught paying cuts its losses.
 */

import type { GameWorldState } from '../game-world-state';
import { activeSponsorshipsOf, cutSponsorship, ensureSponsorships, foreignCellsFor, sponsorCell } from '../rebellion/sponsor-service';
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
