import { Bloc } from './cold-war-types';
import { IdeologyProfile } from './ideology-types';
import { ideologyDistance } from './ideology-service';

/**
 * Evaluates whether two empires possess enough ideological synergy and shared
 * strategic interests to naturally form an integrated Bloc.
 * Returns a 0-100 alignment score. Above 70 is strong bloc potential.
 */
export function evaluateBlocAlignment(
    ideologyA: IdeologyProfile,
    ideologyB: IdeologyProfile,
    sharedEnemiesCount: number,
    historicalTrust: number // -100 to 100
): number {
    const distance = ideologyDistance(ideologyA, ideologyB);

    // Base alignment: if distance is 0, base is 100. If distance is 600, base is 40.
    // Assuming distance effectively maxes out meaningfully around 1000.
    let alignment = 100 - (distance / 10);

    // Shared enemies heavily push empires together despite ideological gaps (realpolitik)
    alignment += sharedEnemiesCount * 15;

    // Historical trust adds directly to alignment
    alignment += historicalTrust / 2;

    return Math.max(0, Math.min(100, alignment));
}

/**
 * Calculates current Bloc Cohesion based on member similarity and current events.
 * If cohesion drops below 30, the bloc is at risk of fracturing.
 */
export function updateBlocCohesion(
    bloc: Bloc,
    memberIdeologies: Record<string, IdeologyProfile>, // empireId -> ideology
    recentBlocVictories: number, // count of recent proxy or systemic wins
    recentBlocBetrayals: number  // e.g. member sanctioned another member
): number {

    let baseCohesion = 80; // Blocs start relatively cohesive

    // Calculate the maximum ideological drift between the leader and members
    const leaderIdeology = memberIdeologies[bloc.leaderEmpireId];
    if (leaderIdeology) {
        let maxDistance = 0;
        for (const memberId of bloc.memberEmpireIds) {
            if (memberId === bloc.leaderEmpireId) continue;
            const memberIdeology = memberIdeologies[memberId];
            if (memberIdeology) {
                const dist = ideologyDistance(leaderIdeology, memberIdeology);
                if (dist > maxDistance) maxDistance = dist;
            }
        }

        // Massive ideological drift shatters cohesion
        // A distance of 400 strips 40 cohesion points
        baseCohesion -= (maxDistance / 10);
    }

    // Success breeds unity
    baseCohesion += recentBlocVictories * 10;

    // Betrayal destroys unity rapidly
    baseCohesion -= recentBlocBetrayals * 25;

    return Math.max(0, Math.min(100, Math.round(baseCohesion)));
}

/**
 * Generates a Bloc Doctrine array of behavioral tags based on the
 * leader's dominant ideological sliders.
 */
export function generateBlocDoctrine(leaderIdeology: IdeologyProfile): string[] {
    const doctrine: string[] = [];

    if (leaderIdeology.militarism_pacifism > 40) doctrine.push("military_hegemony");
    if (leaderIdeology.militarism_pacifism < -40) doctrine.push("defensive_containment");

    if (leaderIdeology.expansionism_isolationism > 40) doctrine.push("revolutionary_expansion");
    if (leaderIdeology.expansionism_isolationism < -40) doctrine.push("isolationist_pact");

    if (leaderIdeology.collectivism_individualism < -40) doctrine.push("trade_supremacy");
    if (leaderIdeology.authoritarianism_liberty < -40) doctrine.push("anti_authoritarian_liberation");

    if (doctrine.length === 0) doctrine.push("pragmatic_alliance");
    return doctrine;
}
