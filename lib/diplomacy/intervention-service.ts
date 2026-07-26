// lib/diplomacy/intervention-service.ts
// Stars of Dominion — Diplomacy Phase 5: intervention windows (§23) + rumors (§26).
//
// WORKER-SIDE ONLY. Every new empire-vs-empire war opens a 24 sim-hour window
// where third parties take a public position:
//   - condemn: pressure with the aggressor rises; enough condemnations become
//     a "galactic condemnation" that costs the aggressor public trust.
//   - endorse: pressure with the defender rises; endorsing wars marks you.
//   - mediate: burnishes your honor and clears the peace-offer cooldown
//     between the belligerents — talks can start immediately.
// Diplomacy becomes multiplayer instead of isolated one-on-one exchanges.

import type { GameWorldState } from '@/lib/game-world-state';
import { ReputationService } from '@/lib/reputation/reputation-service';
import {
    InterventionWindow,
    InterventionStance,
    INTERVENTION_WINDOW_SECONDS,
    INTERVENTION_RETENTION_SECONDS,
    CONDEMNATION_THRESHOLD,
    RUMOR_COOLDOWN_SECONDS,
    RUMOR_EXPOSURE_CHANCE,
} from './diplomacy-types';
import { ensureDiplomacyState, shiftRivalry } from './offer-service';
import type { DiplomacyResult } from './offer-service';
import { pushWorldStory, adjustPublicTrust } from '@/lib/press-system/integration';
import { StorySource, StoryTruth } from '@/lib/press-system/types';

const ok = (message: string): DiplomacyResult => ({ success: true, message });
const fail = (message: string): DiplomacyResult => ({ success: false, message });

/** Called from registerActOfWar for each fresh empire-vs-empire war. */
export function openInterventionWindow(world: GameWorldState, aggressorId: string, defenderId: string): void {
    // Raider hostilities don't merit galactic politics.
    if (!world.economy.factions.has(aggressorId) || !world.economy.factions.has(defenderId)) return;
    const dip = ensureDiplomacyState(world);
    for (const w of dip.interventions.values()) {
        if (w.status === 'open' && w.aggressorId === aggressorId && w.defenderId === defenderId) return;
    }
    const window: InterventionWindow = {
        id: `intervention-${aggressorId}-${defenderId}-${world.nowSeconds}`,
        aggressorId,
        defenderId,
        openedAtSeconds: world.nowSeconds,
        closesAtSeconds: world.nowSeconds + INTERVENTION_WINDOW_SECONDS,
        responses: {},
        status: 'open',
    };
    dip.interventions.set(window.id, window);
    console.log(`[Diplomacy] Intervention window opened: ${aggressorId} vs ${defenderId}`);
}

export function intervene(world: GameWorldState, factionId: string, windowId: string, stance: InterventionStance): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const window = dip.interventions.get(windowId);
    if (!window) return fail('No such confrontation.');
    if (window.status !== 'open' || world.nowSeconds >= window.closesAtSeconds) return fail('The window for intervention has closed.');
    if (factionId === window.aggressorId || factionId === window.defenderId) return fail('Belligerents cannot intervene in their own war.');
    if (window.responses[factionId]) return fail('You have already taken a position.');
    if (!['condemn', 'endorse', 'mediate'].includes(stance)) return fail('Unknown stance.');

    window.responses[factionId] = stance;

    switch (stance) {
        case 'condemn':
            shiftRivalry(world, factionId, window.aggressorId, 6, 'condemned_war');
            ReputationService.updateScore(world, window.aggressorId, { aggression: 2 }, 'condemned_by_third_party');
            break;
        case 'endorse':
            shiftRivalry(world, factionId, window.defenderId, 6, 'endorsed_war');
            ReputationService.updateScore(world, factionId, { aggression: 2 }, 'endorsed_war');
            break;
        case 'mediate': {
            ReputationService.updateScore(world, factionId, { honor: 3 }, 'offered_mediation');
            // Mediation clears the diplomatic logjam: peace offers between the
            // belligerents skip their initiative cooldown while talks are fresh.
            for (const [a, b] of [[window.aggressorId, window.defenderId], [window.defenderId, window.aggressorId]]) {
                dip.cooldowns.delete(`${a}|${b}|peace_offer`);
            }
            break;
        }
    }
    console.log(`[Diplomacy] ${factionId} ${stance}s the ${window.aggressorId} vs ${window.defenderId} war`);
    return ok(`Position registered: ${stance}.`);
}

/** Close expired windows; mass condemnation lands as a trust penalty + story. */
export function tickInterventions(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    for (const window of dip.interventions.values()) {
        if (window.status === 'open' && world.nowSeconds >= window.closesAtSeconds) {
            window.status = 'closed';
            const condemns = Object.values(window.responses).filter(s => s === 'condemn').length;
            if (condemns >= CONDEMNATION_THRESHOLD) {
                adjustPublicTrust(world, window.aggressorId, -5);
                pushWorldStory(world, {
                    targetEmpireId: window.aggressorId,
                    subject: `Galactic condemnation: ${condemns} powers denounce the war on ${window.defenderId}`,
                    magnitude: 50 + 5 * condemns,
                    source: StorySource.WAR_REPORT,
                    truth: StoryTruth.TRUE,
                });
            }
        }
    }
    for (const [id, window] of [...dip.interventions.entries()]) {
        if (window.status === 'closed' && world.nowSeconds - window.closesAtSeconds > INTERVENTION_RETENTION_SECONDS) {
            dip.interventions.delete(id);
        }
    }
}

// ─── Rumor planting (§26) ────────────────────────────────────────────────────

const RUMOR_SUBJECTS = [
    'Fleet readiness reports allegedly falsified',
    'Secret treaty rumored with a hostile power',
    'Treasury said to be weeks from insolvency',
    'Rebel cells reportedly funded from the palace',
    'Leadership rumored to be gravely ill',
];

/**
 * Plant a false story against a rival through the pirate press. Risky:
 * exposure brands the planter as a disinformation state.
 */
export function plantRumor(world: GameWorldState, planterId: string, targetId: string): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    if (!targetId || targetId === planterId) return fail('Invalid rumor target.');
    if (!world.economy.factions.has(targetId)) return fail('Nobody would believe rumors about them.');

    const cooldownKey = `rumor|${planterId}|${targetId}`;
    const lockedUntil = dip.cooldowns.get(cooldownKey) ?? 0;
    if (world.nowSeconds < lockedUntil) {
        return fail('The rumor mill needs time before it will carry your material again.');
    }
    dip.cooldowns.set(cooldownKey, world.nowSeconds + RUMOR_COOLDOWN_SECONDS);

    const subject = RUMOR_SUBJECTS[Math.floor(Math.random() * RUMOR_SUBJECTS.length)];
    pushWorldStory(world, {
        targetEmpireId: targetId,
        subject,
        magnitude: 30 + Math.floor(Math.random() * 15),
        source: StorySource.RUMOR_MILL,
        truth: StoryTruth.FALSE,
    });

    if (Math.random() < RUMOR_EXPOSURE_CHANCE) {
        // Traced back to the source.
        ReputationService.updateScore(world, planterId, { deception: 8, reliability: -5 }, 'rumor_traced');
        shiftRivalry(world, planterId, targetId, 8, 'rumor_exposed');
        adjustPublicTrust(world, planterId, -3);
        pushWorldStory(world, {
            targetEmpireId: planterId,
            subject: 'Disinformation campaign traced to state handlers',
            magnitude: 45,
            source: StorySource.ESPIONAGE_LEAK,
            truth: StoryTruth.TRUE,
        });
        return ok('Rumor seeded — but it was traced back to you.');
    }
    return ok('Rumor seeded into the pirate press.');
}
