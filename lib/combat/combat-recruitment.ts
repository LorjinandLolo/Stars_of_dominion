import { UnitType, RecruitmentJob } from './combat-types';

export function queueRecruitment(
    id: string,
    factionId: string,
    systemId: string,
    unitType: UnitType,
    count: number,
    baseCostPerUnit: number,
    durationSeconds: number,
    nowSeconds: number
): RecruitmentJob {
    const totalCost = baseCostPerUnit * count;

    // In a full integration, you would deduct `totalCost` from world economy here.

    const completesAt = new Date((nowSeconds + durationSeconds) * 1000).toISOString();

    return {
        id,
        factionId,
        systemId,
        unitType,
        count,
        supplyCost: totalCost,
        completesAt
    };
}

export function tickRecruitment(
    jobs: RecruitmentJob[],
    nowSeconds: number
): { remainingJobs: RecruitmentJob[]; completedJobs: RecruitmentJob[] } {
    const remainingJobs: RecruitmentJob[] = [];
    const completedJobs: RecruitmentJob[] = [];

    for (const job of jobs) {
        const completesAtSecs = new Date(job.completesAt).getTime() / 1000;
        if (nowSeconds >= completesAtSecs) {
            completedJobs.push(job);
        } else {
            remainingJobs.push(job);
        }
    }

    return { remainingJobs, completedJobs };
}
