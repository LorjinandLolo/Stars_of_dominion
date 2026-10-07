/**
 * lib/ai/case-ai.ts
 * AI empires work their case files (spec item 12c).
 *
 * Until now only player-run victims opened files, so an AI hit by a covert
 * operation shrugged. Now it investigates: it pursues a lead when it can
 * spare the Intel, and when the evidence on file points clearly at one
 * empire, it accuses, or, after long enough, leaks.
 *
 * The AI reads the file the way a player does: the clues' public tags, who
 * they name and whom they clear. It never reads the hidden weights. That is
 * the point: a well-built false flag fools an AI service exactly as it fools
 * a person, and an AI can accuse a player of something the player did not do.
 *
 * Character decides how much evidence is enough. A paranoid security state
 * accuses on little; a shadow empire waits for a lot.
 */

import type { GameWorldState } from '../game-world-state';
import type { CovertCase } from '../espionage/espionage-types';
import {
    ensureCases, fileAccusation, leakCase, leadBlocker, pursueLead,
} from '../espionage/case-board';
import { leadCost, motiveOptions, SOURCES_LEAD_MIN_INFILTRATION, type ClueTag, type LeadKind } from '../espionage/dossier';
import { intelArchetypeOf, type AIIntelligenceArchetype } from './intelligence-ai-service';

/** How much each kind of finding weighs with an AI investigator. */
const TAG_WEIGHT: Record<ClueTag, number> = {
    means: 1.0,
    opportunity: 0.8,
    motive: 0.7,
    testimony: 0.6,
};

/** Evidence an AI wants before it names someone in public, by character. */
const ACCUSE_THRESHOLD: Partial<Record<AIIntelligenceArchetype, number>> = {
    paranoid_security_state: 1.4,
    precision_assassin: 1.8,
    economic_subverter: 2.0,
    shadow_empire: 2.4,
    revolution_exporter: 1.6,
};
export const DEFAULT_ACCUSE_THRESHOLD = 1.8;
/** The leading suspect must stand this far clear of the next. */
export const ACCUSE_MARGIN = 0.5;
/** A file must be at least this old before the AI acts on it (sim seconds). */
export const AI_MIN_FILE_AGE_SECONDS = 24 * 3600;
/** After this long, an AI that cannot prove it leaks instead (sim seconds). */
export const AI_LEAK_AFTER_SECONDS = 20 * 24 * 3600;
/** Intel an AI keeps back for its own operations. */
export const AI_LEAD_RESERVE = 50;

export function accuseThreshold(factionId: string): number {
    const archetype = intelArchetypeOf(factionId);
    return (archetype && ACCUSE_THRESHOLD[archetype]) ?? DEFAULT_ACCUSE_THRESHOLD;
}

/** How strongly the file, read at face value, points at each suspect. */
export function surfaceScores(kase: CovertCase): Map<string, number> {
    const scores = new Map<string, number>(kase.suspectIds.map(id => [id, 0]));
    for (const clue of kase.clues) {
        const w = TAG_WEIGHT[clue.tag ?? 'testimony'] ?? 0.5;
        const named = clue.pointsAt.filter(id => scores.has(id));
        for (const id of named) scores.set(id, (scores.get(id) ?? 0) + w / Math.max(1, named.length));
        for (const id of clue.clears ?? []) if (scores.has(id)) scores.set(id, (scores.get(id) ?? 0) - 1);
    }
    return scores;
}

function leading(scores: Map<string, number>): { top: string | null; topScore: number; margin: number } {
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [first, second] = ranked;
    return { top: first?.[0] ?? null, topScore: first?.[1] ?? 0, margin: (first?.[1] ?? 0) - (second?.[1] ?? 0) };
}

/** The AI's guess at why: the first motive the public record suggests. */
function aiTheory(world: GameWorldState, owner: string, suspect: string): string | null {
    const r: any = world.rivalries?.get?.(`rivalry-${owner}-${suspect}`) ?? world.rivalries?.get?.(`rivalry-${suspect}-${owner}`);
    return motiveOptions(r?.recentEvents ?? [], (r?.escalationLevel ?? 0) >= 7, world.nowSeconds)[0]?.key ?? null;
}

/** Pick a lead worth running: our sources first, then the money, then the logs. */
function chooseLead(world: GameWorldState, kase: CovertCase, top: string | null): { kind: LeadKind; target: string | null } | null {
    const ours = world.espionage.factionIntel.get(kase.ownerFactionId)?.infiltrationLevels ?? {};
    const sourced = (top && (ours[top] ?? 0) >= SOURCES_LEAD_MIN_INFILTRATION)
        ? top
        : kase.suspectIds.find(id => (ours[id] ?? 0) >= SOURCES_LEAD_MIN_INFILTRATION) ?? null;
    const tries: { kind: LeadKind; target: string | null }[] = [
        ...(sourced ? [{ kind: 'sources' as LeadKind, target: sourced }] : []),
        { kind: 'prisoner', target: null },
        { kind: 'operative', target: null },
        { kind: 'money', target: null },
        { kind: 'sensors', target: null },
    ];
    return tries.find(t => !leadBlocker(world, kase, t.kind, t.target)) ?? null;
}

export interface AICaseAction { caseId: string; action: 'lead' | 'accuse' | 'leak'; suspectId?: string; message: string }

/**
 * One AI empire's pass over its open files. Called each strategic tick for
 * AI-run factions only. Returns what it did, for logs and probes.
 */
export function tickAICases(world: GameWorldState, factionId: string): AICaseAction[] {
    const done: AICaseAction[] = [];
    const now = world.nowSeconds;
    const files = [...ensureCases(world).values()].filter(c => c.ownerFactionId === factionId && c.status === 'open');
    for (const kase of files) {
        if (now - kase.openedAt < AI_MIN_FILE_AGE_SECONDS) continue;
        const { top, topScore, margin } = leading(surfaceScores(kase));
        const threshold = accuseThreshold(factionId);

        if (top && topScore >= threshold && margin >= ACCUSE_MARGIN) {
            const res = fileAccusation(world, factionId, kase.id, top, aiTheory(world, factionId, top));
            if (res.ok) done.push({ caseId: kase.id, action: 'accuse', suspectId: top, message: res.message });
            continue;
        }
        if (top && now - kase.openedAt >= AI_LEAK_AFTER_SECONDS && topScore >= threshold * 0.6) {
            const res = leakCase(world, factionId, kase.id, top);
            if (res.ok) done.push({ caseId: kase.id, action: 'leak', suspectId: top, message: res.message });
            continue;
        }
        if (!kase.lead) {
            const pick = chooseLead(world, kase, top);
            const intel = world.espionage.factionIntel.get(factionId);
            if (pick && intel && intel.intelPoints >= leadCost(pick.kind, intel.counterIntelStrength ?? 0) + AI_LEAD_RESERVE) {
                const res = pursueLead(world, factionId, kase.id, pick.kind, pick.target);
                if (res.ok) done.push({ caseId: kase.id, action: 'lead', message: res.message });
            }
        }
    }
    return done;
}
