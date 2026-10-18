// lib/combat/commando-raid.ts
// Stars of Dominion — a commando raid on one installation, without an invasion.
//
// The loud, fast counterpart to agent sabotage (lib/espionage/defence-
// sabotage.ts). A fleet parked over an enemy world, carrying an army with
// Special Ops or Airborne troops, drops them on one target:
//
//   shield   the surface shield generators and orbital shield arrays
//   guns     the surface defence platforms and outpost batteries
//   uplink   the orbital defences' ground uplink: the defence stations go
//            offline
//
// Only those troops go down. Their odds are their quality against the
// garrison and how dug in it is. Success puts the target out for longer than
// an agent can (RAID_DURATION_SECONDS; counter-intelligence's Restore
// Defences still brings it back early). Raiders always take losses; when the
// raid fails, the survivors are taken prisoner. A raid is an act of war, and
// a force can raid again only after RAID_COOLDOWN_SECONDS.
//
// Pure apart from the world it is handed; no lib/db.

import type { GameWorldState } from '../game-world-state';
import { sabotageDefences, type DefenceSabotageKind } from '../espionage/defence-sabotage';
import { ensureLedger } from './siege/prisoners';
import { fortificationLevelFor } from './siege/strongpoints';
import { RNG, seedFromString } from '../trade-system/rng';

export type RaidTarget = 'shield' | 'guns' | 'uplink';
export const RAID_TARGETS: readonly RaidTarget[] = ['shield', 'guns', 'uplink'];
export const RAID_TARGET_LABEL: Record<RaidTarget, string> = {
    shield: 'the shield', guns: 'the guns', uplink: 'the orbital uplink',
};
const KIND: Record<RaidTarget, DefenceSabotageKind> = { shield: 'shield', guns: 'guns', uplink: 'orbital' };

/** Troops that can raid, and what each is worth on a raid. */
export const RAIDER_WEIGHT: Record<string, number> = { SPECIAL_OPS: 3, AIRBORNE: 1.5 };
/** The most men one raid puts down. */
export const RAID_MAX_MEN = 300;
/** How long a successful raid keeps the target out (sim seconds: four days). */
export const RAID_DURATION_SECONDS = 4 * 86400;
/** One raid per army per this long (sim seconds: six hours). */
export const RAID_COOLDOWN_SECONDS = 6 * 3600;
/** Odds are clamped to this band: no raid is certain, none hopeless. */
export const RAID_MIN_CHANCE = 0.1;
export const RAID_MAX_CHANCE = 0.85;

/** The raiders an army can put down: its Special Ops and Airborne, up to the cap. */
export function raidersOf(army: { composition?: Record<string, number> }): Record<string, number> {
    const out: Record<string, number> = {};
    let left = RAID_MAX_MEN;
    for (const type of ['SPECIAL_OPS', 'AIRBORNE']) {
        const n = Math.min(left, Math.max(0, Math.floor(Number(army.composition?.[type]) || 0)));
        if (n > 0) { out[type] = n; left -= n; }
    }
    return out;
}

/** Chance a raid of these men on this world succeeds. */
export function raidChance(raiders: Record<string, number>, planet: any): number {
    const power = Object.entries(raiders).reduce((s, [t, n]) => s + n * (RAIDER_WEIGHT[t] ?? 0), 0);
    const garrison = Number(planet?.garrison?.garrisonTroops) || 0;
    const defence = garrison * 0.15 + fortificationLevelFor(planet) * 40 + 60;
    return Math.max(RAID_MIN_CHANCE, Math.min(RAID_MAX_CHANCE, power / (power + defence)));
}

export interface RaidResult {
    ok: boolean;
    reason?: string;
    success?: boolean;
    hit?: string[];
    lost?: number;
    captured?: number;
}

/**
 * Carry out a raid. Validates, rolls, applies: the target out of action, the
 * raiders' losses taken from the army, prisoners on failure. The caller
 * records the act of war and tells both sides.
 */
export function commandoRaid(world: GameWorldState, factionId: string, fleetId: string, planetId: string, target: RaidTarget, isAtWar: (a: string, b: string) => boolean): RaidResult {
    const fleet: any = world.movement.fleets.get(fleetId);
    const planet: any = world.construction.planets.get(planetId);
    if (!fleet || fleet.factionId !== factionId) return { ok: false, reason: 'No such fleet under your command.' };
    if (!planet) return { ok: false, reason: 'No such world.' };
    if (!RAID_TARGETS.includes(target)) return { ok: false, reason: 'Unknown raid target.' };
    if (!planet.ownerId || planet.ownerId === factionId) return { ok: false, reason: 'Raid an enemy world.' };
    if (!isAtWar(factionId, planet.ownerId)) return { ok: false, reason: 'You are not at war with its owner.' };
    if (!fleet.currentSystemId || fleet.destinationSystemId || fleet.currentSystemId !== planet.systemId) {
        return { ok: false, reason: `${fleet.name ?? 'The fleet'} must be parked over ${planet.name}.` };
    }
    const armies: any[] = (fleet.transportedArmyIds ?? []).map((id: string) => world.movement.armies?.get(id)).filter(Boolean);
    const army = armies.find(a => Object.keys(raidersOf(a)).length > 0);
    if (!army) return { ok: false, reason: 'No Special Ops or Airborne troops aboard to raid with.' };
    if ((army.raidReadyAt ?? 0) > world.nowSeconds) return { ok: false, reason: `${army.name ?? 'The raiders'} are still recovering from their last raid.` };

    const raiders = raidersOf(army);
    const chance = raidChance(raiders, planet);
    const rng = new RNG(seedFromString(`${planetId}|raid|${army.id}|${world.nowSeconds}`));
    const success = rng.check(chance);

    // Losses: a raid always costs men; a failed one costs most of them.
    const lossShare = success ? 0.15 + rng.next() * 0.25 : 0.5 + rng.next() * 0.3;
    let lost = 0, captured = 0;
    const capturedByType: Record<string, number> = {};
    for (const [type, n] of Object.entries(raiders)) {
        const dead = Math.round(n * lossShare);
        const taken = success ? 0 : n - dead; // a failed raid's survivors are cut off
        lost += dead;
        captured += taken;
        if (taken > 0) capturedByType[type] = taken;
        army.composition[type] = Math.max(0, (army.composition[type] ?? 0) - dead - taken);
        if (army.composition[type] === 0) delete army.composition[type];
    }
    army.raidReadyAt = world.nowSeconds + RAID_COOLDOWN_SECONDS;

    if (captured > 0) {
        const ledger = ensureLedger((world as any).combat ?? ((world as any).combat = { recruitmentJobs: [] }));
        for (const [type, n] of Object.entries(capturedByType)) {
            ledger.groups.push({
                id: `pow-${planetId}-raid-${type}-${world.nowSeconds}`, ownerEmpireId: factionId, captorEmpireId: planet.ownerId,
                planetId, planetName: planet.name, unitType: type as any, count: n, capturedAtSeconds: world.nowSeconds,
            });
        }
    }
    // The army is gone if nobody is left in it.
    if (!Object.values(army.composition ?? {}).some((n: any) => Number(n) > 0)) {
        world.movement.armies?.delete(army.id);
        fleet.transportedArmyIds = (fleet.transportedArmyIds ?? []).filter((id: string) => id !== army.id);
    }

    const hit = success
        ? sabotageDefences(world, planet.ownerId, planet.systemId, KIND[target], RAID_DURATION_SECONDS)
            .filter(h => h.planetId === planetId).flatMap(h => h.hit)
        : [];
    return { ok: true, success, hit, lost, captured };
}
