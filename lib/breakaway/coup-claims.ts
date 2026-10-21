// lib/breakaway/coup-claims.ts
// Stars of Dominion — what a resolved coup crisis does to the claims table.
//
// SERVER-ONLY (imports lib/db; the worker calls it). lib/government/crisis.ts
// settles the world — the throne, the cabinet, the split — and leaves a
// PendingCrisisOutcome on world.pendingCrisisOutcomes. This writes the part
// the world cannot: who logs in as what.
//
//  ruler_holds   the plotter's seat (and the seats of ministers who backed
//                them) are deleted; those accounts are back in the lobby.
//  plotter_wins  the plotter's account takes the faction's claim. An account
//                that already rules another empire moves its claim here and
//                leaves that empire to the AI (the puppet rule comes later).
//                The deposed ruler's account falls into hiding (Item 14), or
//                its claim is released when no world will hide them. Seats of
//                ministers who stood with the old ruler are deleted.
//  civil_war     the plotter's account takes the new state's claim; their
//                seat is deleted.
// Each outcome is applied once; the worker's claim list is updated in the
// same cycle so no AI speaks for the new ruler before the next refresh.

import { prisma } from '@/lib/db';
import type { PendingCrisisOutcome } from '@/lib/government/crisis';
import { exileDeposedRuler } from './seat-service';
import { installPuppet } from '@/lib/government/foreign-ministers';

/** Persist the personas that fell this tick (lib/government/foreign-ministers.ts exposeSeat). */
export async function persistSeatExposures(world: any): Promise<number> {
    const ids: string[] = Array.isArray(world.seatExposures) ? world.seatExposures.splice(0) : [];
    if (!ids.length) return 0;
    const { count } = await prisma.factionSeat.updateMany({ where: { id: { in: ids } }, data: { exposed: true } });
    return count;
}

export interface AppliedOutcome { crisisId: string; outcome: string; notes: string[] }

export async function applyCrisisOutcomes(world: any): Promise<AppliedOutcome[]> {
    const pending: PendingCrisisOutcome[] = Array.isArray(world.pendingCrisisOutcomes) ? world.pendingCrisisOutcomes.splice(0) : [];
    const applied: AppliedOutcome[] = [];
    for (const p of pending) {
        const notes: string[] = [];
        try {
            const plotterSeat = await prisma.factionSeat.findUnique({ where: { id: p.plotterSeatId } });
            const plotterUserId = plotterSeat?.userId ?? null;
            const plotterName = plotterSeat?.persona ?? 'the plotter';

            if (p.outcome === 'plotter_wins' && p.throne && plotterUserId) {
                const deposed = await prisma.playerProfile.findUnique({ where: { factionId: p.factionId } });
                if (deposed && deposed.userId !== plotterUserId) {
                    const seatId = await exileDeposedRuler(world, { userId: deposed.userId, fromFactionId: p.factionId, displayName: deposed.displayName ?? 'Commander' });
                    notes.push(seatId ? `${deposed.displayName ?? 'the ruler'} went into hiding (${seatId})` : `${deposed.displayName ?? 'the ruler'}'s claim released`);
                }
                const own = await prisma.playerProfile.findUnique({ where: { userId: plotterUserId } });
                if (own && own.factionId !== p.factionId) {
                    // A sitting ruler: no second throne. The court is their
                    // puppet (lib/government/foreign-ministers.ts) and stays
                    // AI-run under the persona; the plotter keeps their own claim.
                    installPuppet(world, p.factionId, own.factionId, plotterName);
                    world.claimedFactionIds = (world.claimedFactionIds ?? []).filter((id: string) => id !== p.factionId);
                    if (world.factionPlayerNames) delete world.factionPlayerNames[p.factionId];
                    notes.push(`${p.factionId} is now a puppet of ${own.factionId} under "${plotterName}"`);
                } else {
                    if (!own) await prisma.playerProfile.create({ data: { userId: plotterUserId, factionId: p.factionId, displayName: plotterName } });
                    notes.push(`${plotterName} now rules ${p.factionId}`);
                    if (Array.isArray(world.claimedFactionIds) && !world.claimedFactionIds.includes(p.factionId)) world.claimedFactionIds.push(p.factionId);
                    if (world.factionPlayerNames) world.factionPlayerNames[p.factionId] = plotterName;
                }
            }

            if (p.outcome === 'civil_war' && p.rebelFactionId && plotterUserId) {
                const own = await prisma.playerProfile.findUnique({ where: { userId: plotterUserId } });
                if (own) {
                    await prisma.playerProfile.update({ where: { userId: plotterUserId }, data: { factionId: p.rebelFactionId, briefSeenAt: null } });
                    world.claimedFactionIds = (world.claimedFactionIds ?? []).filter((id: string) => id !== own.factionId);
                } else {
                    await prisma.playerProfile.create({ data: { userId: plotterUserId, factionId: p.rebelFactionId, displayName: plotterName } });
                }
                if (Array.isArray(world.claimedFactionIds)) world.claimedFactionIds.push(p.rebelFactionId);
                if (world.factionPlayerNames) world.factionPlayerNames[p.rebelFactionId] = plotterName;
                notes.push(`${plotterName} leads ${p.rebelFactionId}`);
            }

            if (p.removeSeatIds.length) {
                const { count } = await prisma.factionSeat.deleteMany({ where: { id: { in: p.removeSeatIds } } });
                world.seats = (world.seats ?? []).filter((s: any) => !p.removeSeatIds.includes(s.id));
                notes.push(`${count} seat(s) cleared`);
            }
        } catch (e: any) {
            notes.push(`FAILED: ${e?.message ?? e}`);
            // Put it back for the next cycle rather than lose a throne.
            (world.pendingCrisisOutcomes ??= []).push(p);
        }
        applied.push({ crisisId: p.crisisId, outcome: p.outcome, notes });
    }
    return applied;
}
