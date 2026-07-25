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
import { initRegistries, societyRegistry, governmentRegistry } from './registry';
import { calculateInitialIdeology } from './ideology-service';

function defaultBlocs(societyTags: string[]): InfluenceBloc[] {
    // Society flavor nudges starting influence; totals normalize to 100 later.
    const militarist = societyTags.some(t => /militar|honor|crusade|legion|hunt/.test(t));
    const mercantile = societyTags.some(t => /trade|merchant|banking|corporate|market/.test(t));
    const scientific = societyTags.some(t => /scien|logic|synthetic|progress/.test(t));
    return [
        { id: 'military', name: 'Military Command', influence: militarist ? 35 : 25, satisfaction: 60, trend: 0 },
        { id: 'trade', name: 'Merchant Guilds', influence: mercantile ? 35 : 25, satisfaction: 60, trend: 0 },
        { id: 'frontier', name: 'Border Worlds', influence: 20, satisfaction: 60, trend: 0 },
        { id: 'science', name: 'Academies', influence: scientific ? 30 : 20, satisfaction: 60, trend: 0 },
    ];
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

    for (const factionId of world.economy.factions.keys()) {
        const existing = world.movement.empirePostures.get(factionId) as EmpirePosture | undefined;
        if (existing) {
            if (!Array.isArray(existing.blocs) || existing.blocs.length === 0) {
                existing.blocs = defaultBlocs(existing.society_tags ?? []);
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
}
