// lib/press-system/press-office.ts
// Stars of Dominion — what a press office does when nobody is at the desk.
//
// The press system assumes somebody answers it. A journalist's dig runs to a
// scandal unless the government responds; a media crisis left past its deadline
// is read as a confession. Both were only ever answerable by a player's order,
// so every AI empire — and every player who was away — took the worst outcome
// every time: a scandal roughly every fortnight and an ignored crisis every
// week, each paid for in public trust, until trust reached zero and stayed
// there. Trust is 30% of approval.
//
// This is the conservative answer, the same for an AI empire and for a human
// whose press office is delegated (lib/delegation/delegation-runner.ts):
//
//   - an inquiry gets cooperation once it is a formal inquiry. It costs a
//     little trust and earns credibility; it never stonewalls, never offers up
//     an official, never gets ahead of the story;
//   - a crisis is denied when the story behind it is thin enough for a denial
//     to hold, and admitted when the receipts exist.
//
// Nothing here starts anything, spends narrative influence, or touches another
// empire. WORKER-SIDE ONLY, like the rest of the press integration.

import type { GameWorldState } from '@/lib/game-world-state';
import { CrisisChoice, InvestigationStage, type SimulationState } from './types';
import { PressConfig } from './config';
import { answerCrisis, CRISIS_WINDOW_TICKS } from './crisis';
import { respondCooperate } from './investigations';

/**
 * Press ticks a crisis sits open before the office answers it (one sim day).
 * Short on purpose: an open crisis stops the public losing interest, so every
 * tick it is held is a tick the pressure cannot drain.
 */
const CRISIS_HOLD_TICKS = 4;

/** Evidence assumed for a crisis whose story has already left the pool. */
const UNKNOWN_EVIDENCE = 50;

/**
 * Answer whatever is on this empire's press desk. Returns one line per thing
 * done, for the worker log and the delegation report.
 */
export function runPressOffice(world: GameWorldState, factionId: string): string[] {
    const press = (world as any).press as SimulationState | undefined;
    const empire = press?.empires?.get?.(factionId);
    if (!press || !empire) return [];

    const done: string[] = [];

    for (const inv of press.investigations?.values?.() ?? []) {
        if (inv.resolved || inv.targetEmpireId !== factionId) continue;
        // A rumour is not yet something a government can cooperate with.
        if (inv.stage === InvestigationStage.RUMOUR) continue;
        if (respondCooperate(inv, empire).ok) {
            done.push(`cooperated with the inquiry into "${inv.subject}"`);
        }
    }

    for (const crisis of press.crises?.values?.() ?? []) {
        if (crisis.resolved || crisis.targetEmpireId !== factionId) continue;
        // Not the moment it breaks. A crisis answered on the tick it was raised
        // is never open when anyone looks: the player whose office this is
        // never gets to answer it themselves, and no rival ever gets to
        // amplify, defend or call the response. It waits a sim day — and never
        // so long that the deadline answers first.
        const raisedTick = crisis.deadlineTick - CRISIS_WINDOW_TICKS;
        const answerFrom = Math.min(raisedTick + CRISIS_HOLD_TICKS, crisis.deadlineTick - 1);
        if ((press.tick ?? 0) < answerFrom) continue;
        const evidence = press.activeStories.get(crisis.storyId)?.evidenceStrength ?? UNKNOWN_EVIDENCE;
        const choice = evidence >= PressConfig.denial.exposureEvidenceThreshold
            ? CrisisChoice.ADMIT_REFORM
            : CrisisChoice.DENY;
        if (answerCrisis(press, crisis, choice)) {
            done.push(`answered a media crisis (${choice === CrisisChoice.DENY ? 'denied' : 'admitted and promised reform'})`);
        }
    }

    return done;
}
