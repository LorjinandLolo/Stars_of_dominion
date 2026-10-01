/**
 * lib/espionage/pressure.ts
 * How much covert pressure ONE empire is under.
 *
 * A leaf on purpose (types and the operation catalog only): bloc drift, the
 * crisis gate and the cabinet's advice all read it, and none of them should
 * have to import the espionage service to do so.
 *
 * Why this exists. `world.shared.espionagePressure` is one number for the whole
 * galaxy. It used to be fed by every active operation anywhere — and since any
 * one operation added more per tick than the scalar's decay removed, it sat at
 * its maximum from the first day AI empires started spying on each other. Bloc
 * drift then charged that maximum to every interest group of every empire,
 * whether anyone was spying on them or not: every bloc in the galaxy lost
 * thirty points of satisfaction a tick, approval fell to zero everywhere,
 * political capital stopped accruing and governments collapsed in order.
 *
 * Being spied on should cost the empire being spied on. So pressure is now two
 * things added together:
 *
 *   - targeted: live operations aimed at THIS empire, weighted by how
 *     politically corrosive their kind is (reading your mail is not the same as
 *     funding your separatists);
 *   - ambient:  the galaxy-wide scalar, which is now moved only by galaxy-wide
 *     causes (commodity scarcity, a hegemon's rise) and decays on its own.
 */

import type { GameWorldState } from '../game-world-state';
import type { EspionageOperation, OperationDomain } from './espionage-types';
import { OPERATION_CATALOG_BY_ID, type OperationCategory } from './operation-catalog';

/**
 * Pressure one full-investment, fully corrosive operation puts on its target.
 * Four of them saturate the scale; a single one is a quarter of it.
 */
const PRESSURE_PER_OPERATION = 0.25;

/** How politically corrosive each kind of operation is to the empire it targets. */
const CATEGORY_WEIGHT: Record<OperationCategory, number> = {
    intel_gathering: 0.3,
    counter_intelligence: 0,
    economic: 0.5,
    disinformation: 1,
    political: 1,
    // Wrecking a gate is felt in the lanes first and in the chamber second.
    sabotage: 0.5,
    military_blackops: 1,
};

/** The same, for operations launched through the legacy domain-only path. */
const DOMAIN_WEIGHT: Record<OperationDomain, number> = {
    politicalSubversion: 1,
    infrastructureSabotage: 0.5,
    shadowEconomy: 0.5,
};

function weightOf(op: EspionageOperation): number {
    if (op.definitionId) {
        const def = OPERATION_CATALOG_BY_ID.get(op.definitionId);
        if (def) return CATEGORY_WEIGHT[def.category] ?? 1;
    }
    return DOMAIN_WEIGHT[op.domain] ?? 1;
}

/**
 * 0–1. Pressure from live operations aimed at this empire. Nothing an empire
 * does to itself counts, and nothing aimed at anyone else does either.
 */
export function targetedEspionagePressure(world: GameWorldState, factionId: string): number {
    const operations = world.espionage?.operations;
    if (!(operations instanceof Map)) return 0;

    let pressure = 0;
    for (const op of operations.values()) {
        if (op.status !== 'active') continue;
        if (op.targetFactionId !== factionId || op.actorFactionId === factionId) continue;
        pressure += (op.investmentLevel ?? 0.5) * weightOf(op) * PRESSURE_PER_OPERATION;
    }
    return Math.max(0, Math.min(1, pressure));
}

/**
 * 0–1. Everything bearing on this empire: what is aimed at it, plus whatever
 * the galaxy as a whole is suffering.
 */
export function espionagePressureOn(world: GameWorldState, factionId: string): number {
    const ambient = world.shared?.espionagePressure ?? 0;
    return Math.max(0, Math.min(1, ambient + targetedEspionagePressure(world, factionId)));
}
