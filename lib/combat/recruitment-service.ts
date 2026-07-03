/**
 * lib/combat/recruitment-service.ts
 * 
 * Handles the production of ground units (Infantry, Armor, Artilery, etc.)
 * Units are added to a planet's garrison unit composition upon completion.
 */

import { GroundUnitType, UnitComposition, PlanetaryDefenseState, RecruitmentJob } from './siege/siege-types';
import * as fs from 'fs';
import * as path from 'path';

const unitsConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/combat/ground-units.json'), 'utf-8'));

export class RecruitmentService {

    /**
     * Queues a new recruitment order.
     * Requires Military Infrastructure check (handled at higher level).
     */
    static createJob(
        planetId: string, 
        factionId: string, 
        unitType: GroundUnitType, 
        count: number, 
        now: number
    ): RecruitmentJob {
        const config = unitsConfig[unitType];
        const buildTimePerUnit = config?.buildTime || 60; // seconds
        const totalBuildTime = buildTimePerUnit * count;

        return {
            id: `recruit-${planetId}-${Date.now()}`,
            planetId,
            factionId,
            unitType,
            count,
            startedAt: now,
            completesAt: now + totalBuildTime,
            progress: 0
        };
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

    private static completeJob(world: any, job: RecruitmentJob) {
        if ((job as any).targetFormationId) {
            const formationId = (job as any).targetFormationId;
            const isFleet = (job as any).isFleet;
            
            if (isFleet) {
                const fleet = world.movement.fleets.get(formationId);
                if (fleet) {
                    const currentCount = fleet.composition[job.unitType] || 0;
                    fleet.composition[job.unitType] = currentCount + job.count;
                    fleet.basePower += job.count * 10; // rough approximation
                    console.log(`[Recruitment] Completed ${job.count}x ${job.unitType} for Fleet ${fleet.name}`);
                }
            } else {
                const army = world.movement.armies.get(formationId);
                if (army) {
                    const currentCount = army.composition[job.unitType] || 0;
                    army.composition[job.unitType] = currentCount + job.count;
                    army.basePower += job.count * 10;
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
