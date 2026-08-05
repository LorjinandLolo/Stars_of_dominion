// lib/politics/posture-bootstrap.ts
// Stars of Dominion — Diplomacy Phase 3: empire posture bootstrap.
//
// WORKER-SIDE ONLY (uses the fs-backed JSON registries). The internal-politics
// stack (blocs, ideology, postures) was fully implemented but NOTHING in the
// live game ever created an EmpirePosture — world.movement.empirePostures
// stayed empty, so bloc drift, ideology-driven rivalry, support meters, and
// doctrine-flavored auto-responses all ran on air. This seeds a posture for
// every real faction, derived from its society/government JSON where one
// exists (same id convention as scripts/test-ideology-engine.ts).

import type { GameWorldState } from '@/lib/game-world-state';
import type { EmpirePosture, EmpirePostureType, InfluenceBloc } from '@/lib/movement/types';
import { initRegistries, societyRegistry, governmentRegistry, blocRegistry } from './registry';
import { calculateInitialIdeology } from './ideology-service';

/** Fallback roster if data/blocs is missing — the original hardcoded four. */
const LEGACY_BLOCS: Array<{ id: string; name: string; influence: number; hints: RegExp }> = [
    { id: 'military', name: 'Military Command', influence: 25, hints: /militar|honor|crusade|legion|hunt/ },
    { id: 'trade', name: 'Merchant Guilds', influence: 25, hints: /trade|merchant|banking|corporate|market/ },
    { id: 'frontier', name: 'Border Worlds', influence: 20, hints: /expansion|stampede|swarm|frontier/ },
    { id: 'science', name: 'Academies', influence: 20, hints: /scien|logic|synthetic|progress/ },
];

/** A bloc whose society hints match the empire starts with more influence. */
const HINT_INFLUENCE_BONUS = 10;
const STARTING_SATISFACTION = 60;

function defaultBlocs(societyTags: string[]): InfluenceBloc[] {
    // Society flavor nudges starting influence; totals are normalized to 100.
    const defs = blocRegistry.getAll();

    if (defs.length === 0) {
        return normalizeInfluence(LEGACY_BLOCS.map(b => ({
            id: b.id,
            name: b.name,
            influence: societyTags.some(t => b.hints.test(t)) ? b.influence + HINT_INFLUENCE_BONUS : b.influence,
            satisfaction: STARTING_SATISFACTION,
            trend: 0,
        })));
    }

    return normalizeInfluence(defs.map(def => ({
        id: def.id,
        name: def.name ?? def.id,
        influence: matchesHints(def.society_hints, societyTags)
            ? def.base_influence + HINT_INFLUENCE_BONUS
            : def.base_influence,
        satisfaction: STARTING_SATISFACTION,
        trend: 0,
        ideologyAffinity: def.ideology_affinity,
        signals: def.signals,
    })));
}

/** Scale influence shares to sum to 100 — the invariant the drift tick keeps. */
function normalizeInfluence(blocs: InfluenceBloc[]): InfluenceBloc[] {
    const total = blocs.reduce((s, b) => s + b.influence, 0);
    if (total > 0) {
        for (const bloc of blocs) bloc.influence = (bloc.influence / total) * 100;
    }
    return blocs;
}

function matchesHints(hints: string[] | undefined, societyTags: string[]): boolean {
    if (!hints?.length) return false;
    return societyTags.some(tag => hints.some(h => tag.includes(h)));
}

/**
 * Add any bloc defined in data/blocs that this posture is missing, without
 * touching the satisfaction of blocs it already has. Snapshots written before
 * the roster grew keep their tuned state and gain the new interest groups at a
 * neutral standing. Idempotent.
 */
function ensureBlocRoster(posture: EmpirePosture): number {
    const defs = blocRegistry.getAll();
    if (defs.length === 0) return 0;

    const byId = new Map(posture.blocs.map(b => [b.id, b]));
    let added = 0;

    for (const def of defs) {
        const existing = byId.get(def.id);
        if (existing) {
            // Refresh the copied definition data so edits to data/blocs reach
            // live saves; influence and satisfaction stay as the game left them.
            existing.name = def.name ?? existing.name;
            existing.ideologyAffinity = def.ideology_affinity;
            existing.signals = def.signals;
            continue;
        }
        posture.blocs.push({
            id: def.id,
            name: def.name ?? def.id,
            influence: matchesHints(def.society_hints, posture.society_tags ?? [])
                ? def.base_influence + HINT_INFLUENCE_BONUS
                : def.base_influence,
            satisfaction: STARTING_SATISFACTION,
            trend: 0,
            ideologyAffinity: def.ideology_affinity,
            signals: def.signals,
        });
        added++;
    }

    // Keep the invariant the drift tick relies on: influence sums to 100.
    if (added > 0) normalizeInfluence(posture.blocs);

    return added;
}

function postureTypeFrom(societyTags: string[]): EmpirePostureType {
    if (societyTags.some(t => /militar|crusade|legion|honor/.test(t))) return 'Militarist';
    if (societyTags.some(t => /trade|merchant|banking|corporate/.test(t))) return 'Mercantile';
    if (societyTags.some(t => /pacif|harmony|spiritual/.test(t))) return 'Pacifist';
    if (societyTags.some(t => /expansion|stampede|swarm/.test(t))) return 'Expansionist';
    return 'Consolidating';
}

/**
 * Seed an EmpirePosture for every economy faction that lacks one, and default
 * blocs for any posture that lost its bloc array. Idempotent; call at world
 * load. Existing postures are never overwritten.
 */
export function ensureEmpirePostures(world: GameWorldState): void {
    initRegistries();
    let seeded = 0;
    let blocsAdded = 0;

    for (const factionId of world.economy.factions.keys()) {
        const existing = world.movement.empirePostures.get(factionId) as EmpirePosture | undefined;
        if (existing) {
            if (!Array.isArray(existing.blocs) || existing.blocs.length === 0) {
                existing.blocs = defaultBlocs(existing.society_tags ?? []);
            } else {
                blocsAdded += ensureBlocRoster(existing);
            }
            if (!existing.ideology) {
                existing.ideology = calculateInitialIdeology(existing.society_tags ?? [], existing.government_tags ?? []);
            }
            continue;
        }

        // Convention from test-ideology-engine: faction-aurelian → aurelian_society.
        const shortName = factionId.replace(/^faction-/, '').replace(/-/g, '_');
        const society = societyRegistry.get(`${shortName}_society`)
            ?? societyRegistry.getAll().find(s => s.id.startsWith(shortName));
        const government = governmentRegistry.getAll().find(g => g.id.startsWith(shortName));
        const societyTags = society?.tags ?? [];
        const governmentTags = government?.tags ?? [];

        const posture: EmpirePosture = {
            factionId,
            current: postureTypeFrom(societyTags),
            pendingTarget: null,
            switchCompletesAt: null,
            transitionPenalty: 0,
            blocs: defaultBlocs(societyTags),
            societyId: society?.id,
            governmentId: government?.id,
            society_tags: societyTags,
            government_tags: governmentTags,
            ideology: calculateInitialIdeology(societyTags, governmentTags),
        };
        world.movement.empirePostures.set(factionId, posture);
        seeded++;
    }

    if (seeded > 0) {
        console.log(`[Politics] Seeded ${seeded} empire posture(s) — internal politics now live.`);
    }
    if (blocsAdded > 0) {
        console.log(`[Politics] Added ${blocsAdded} interest group(s) to existing postures.`);
    }
}
