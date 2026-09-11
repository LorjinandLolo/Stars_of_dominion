/**
 * lib/combat/recruitment-service.ts
 *
 * Handles the production of ground units (Infantry, Armor, Artillery, ...)
 * and ships. Ground units land in a planet's garrison or an army; ships land
 * in a fleet, keyed by lowercase ship class, carrying the power and design
 * signature the recruit order resolved (lib/combat/ship-design-service.ts).
 */

import { GroundUnitType, UnitComposition, PlanetaryDefenseState, RecruitmentJob } from './siege/siege-types';
import { addProfile, normalizeComposition, normalizeUnitKey, unitConfigFor } from './ship-registry';
import type { DesignProfile } from './ship-types';

/** Fields a job may carry beyond the siege-types base shape. */
export interface RecruitmentJobExtras {
    /** Formation (fleet or army) the units join on completion; planetId is a `formation-` spoof. */
    targetFormationId?: string;
    isFleet?: boolean;
    /** Ship design the job was priced from. */
    designId?: string;
    designName?: string;
    /** Lowercase composition key for ships. */
    classKey?: string;
    /** Per-unit power to add to the formation. Falls back to the unit config. */
    unitPower?: number;
    /** Per-ship design signature. */
    unitProfile?: DesignProfile;
}

export type RecruitmentJobRecord = RecruitmentJob & RecruitmentJobExtras;

export interface CreateJobOptions {
    /** Seconds per unit. Falls back to the unit config, then 60. */
    buildTimePerUnit?: number;
    designId?: string;
    designName?: string;
    classKey?: string;
    unitPower?: number;
    unitProfile?: DesignProfile;
}

export class RecruitmentService {

    /**
     * Per-unit recruitment cost from config, in faction-reserve keys
     * (CREDITS/METALS/...). Unknown types and deliberately cost-free entries
     * (ELDER_INFERNOID is hand-charged by its trait pipeline) return {}.
     * Case-insensitive: the config is keyed UPPERCASE.
     */
    static unitCost(unitType: string): Record<string, number> {
        const cost = unitConfigFor(unitType)?.cost;
        if (!cost || typeof cost !== 'object') return {};
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(cost)) {
            if (typeof v === 'number' && v > 0) out[k.toUpperCase()] = v;
        }
        return out;
    }

    /**
     * Queues a new recruitment order.
     * Requires Military Infrastructure check (handled at higher level).
     */
    static createJob(
        planetId: string,
        factionId: string,
        unitType: GroundUnitType,
        count: number,
        now: number,
        options: CreateJobOptions = {},
    ): RecruitmentJobRecord {
        const config = unitConfigFor(unitType);
        const buildTimePerUnit = options.buildTimePerUnit ?? config?.buildTime ?? 60; // seconds
        const totalBuildTime = buildTimePerUnit * count;

        const job: RecruitmentJobRecord = {
            id: `recruit-${planetId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            planetId,
            factionId,
            unitType,
            count,
            startedAt: now,
            completesAt: now + totalBuildTime,
            progress: 0,
        };
        if (options.designId) job.designId = options.designId;
        if (options.designName) job.designName = options.designName;
        if (options.classKey) job.classKey = options.classKey;
        if (options.unitPower !== undefined) job.unitPower = options.unitPower;
        if (options.unitProfile) job.unitProfile = options.unitProfile;
        return job;
    }

    /**
     * Periodic tick to process all active recruitment jobs.
     */
    static tick(world: any) {
        const now = world.nowSeconds;
        const jobs = world.combat?.recruitmentJobs || [];
        const remainingJobs: RecruitmentJob[] = [];

        for (const job of jobs) {
            if (now >= job.completesAt) {
                // Job Complete!
                this.completeJob(world, job);
            } else {
                // Update Progress
                const duration = job.completesAt - job.startedAt;
                const elapsed = now - job.startedAt;
                job.progress = Math.min(100, (elapsed / duration) * 100);
                remainingJobs.push(job);
            }
        }

        if (!world.combat) world.combat = { recruitmentJobs: [] };
        world.combat.recruitmentJobs = remainingJobs;
    }

    private static completeJob(world: any, job: RecruitmentJobRecord) {
        if (job.targetFormationId) {
            const formationId = job.targetFormationId;

            // Power comes from the job when a design priced it, else from the
            // unit config — a battleship is worth 90, a corvette 10; the old
            // flat 10-per-unit made every hull identical.
            const unitPower = job.unitPower ?? unitConfigFor(job.unitType)?.power ?? 10;
            if (job.isFleet) {
                const fleet = world.movement.fleets.get(formationId);
                if (fleet) {
                    // Ships live under their lowercase class so the combat
                    // engine's counter grid and the tactical adapter find them.
                    const key = job.classKey ?? normalizeUnitKey(job.unitType);
                    fleet.composition = normalizeComposition(fleet.composition);
                    fleet.composition[key] = (fleet.composition[key] || 0) + job.count;
                    fleet.basePower += job.count * unitPower;
                    if (job.unitProfile) {
                        fleet.designProfile = addProfile(fleet.designProfile, job.unitProfile, job.count);
                    }
                    if (job.designId) {
                        if (!fleet.designCounts) fleet.designCounts = {};
                        fleet.designCounts[job.designId] = (fleet.designCounts[job.designId] || 0) + job.count;
                    }
                    console.log(`[Recruitment] Completed ${job.count}x ${job.designName ?? job.unitType} for Fleet ${fleet.name}`);
                }
            } else {
                const army = world.movement.armies.get(formationId);
                if (army) {
                    const currentCount = army.composition[job.unitType] || 0;
                    army.composition[job.unitType] = currentCount + job.count;
                    army.basePower += job.count * unitPower;
                    console.log(`[Recruitment] Completed ${job.count}x ${job.unitType} for Army ${army.name}`);
                }
            }
            return;
        }

        const planet = world.construction.planets.get(job.planetId);
        if (!planet) return;

        // Ensure defense state exists
        if (!planet.garrison) {
            planet.garrison = {
                planetId: planet.id,
                ownerEmpireId: job.factionId,
                garrisonTroops: 0,
                unitComposition: {} as UnitComposition,
                fortificationLevel: 0,
                fortificationLayers: { orbitalSuppressed: false, outerDefenses: 0, innerDefenses: 0, commandBunkers: 0 },
                supply: 1000,
                maxSupply: 1000,
                morale: 100,
                maxMorale: 100,
                cohesion: 100,
                maxCohesion: 100,
                resistance: 0
            };
        }

        const defenseState = planet.garrison as PlanetaryDefenseState;

        // Add units
        const currentCount = defenseState.unitComposition[job.unitType] || 0;
        defenseState.unitComposition[job.unitType] = currentCount + job.count;

        // Update total troop count summary
        defenseState.garrisonTroops += job.count;

        console.log(`[Recruitment] Completed ${job.count}x ${job.unitType} on ${planet.name}`);
    }
}
