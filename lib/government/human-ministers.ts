// lib/government/human-ministers.ts
// Stars of Dominion — a friend in the cabinet, as the government sees them.
//
// A FactionSeat row (prisma) says that an account holds a portfolio in a
// faction. The government only knows leaders, so each seat is mirrored by one
// Leader (`seat-<id>`) appointed to that portfolio; the AI minister it
// displaces goes back to the recruitment pool. The worker calls
// `syncHumanMinisters` with the seat table every time it refreshes the
// claims, so a seat taken or given up shows in the cabinet within a minute.
//
// The numbers on a human minister are deliberately dull: loyalty, corruption
// and ambition are the player's own doing (lib/government/plots), not a dice
// roll, so the cabinet tick leaves them alone (`leader.seatId`). Loyalty sits
// at 60 — above every "disloyal minister" trigger, so a human seat never
// starts an AI coup by existing. What the court SEES there later lies
// (a plotter's shown loyalty stays honest until a case exposes it).
//
// No database here: lib must not import lib/db. The seat rows come in.

import type { GameWorldState } from '@/lib/game-world-state';
import type { Leader } from '@/lib/leadership/types';
import type { CabinetPortfolio } from './types';
import { CABINET_PORTFOLIOS } from './types';
import { getGovernment } from './government-service';
import { fillVacantSeat, getMinister, portfolioLabel } from './cabinet-service';
import { refillRecruitmentPool } from './succession-service';
import { fireNotification } from '@/lib/time/notification-hooks';

/** What the worker reads from the seat table and keeps on the world. Never the user id. */
export interface SeatRecord {
    id: string;
    factionId: string;
    portfolio: string;
    persona: string;
    exposed?: boolean;
}

export const HUMAN_MINISTER_LOYALTY = 60;
const HUMAN_MINISTER_COMPETENCE = 50;

export function seatLeaderId(seatId: string): string {
    return `seat-${seatId}`;
}

export function isHumanMinister(leader: Leader | undefined | null): boolean {
    return Boolean(leader?.seatId);
}

/** Seats on this faction, from what the worker last loaded. */
export function seatsOf(world: GameWorldState, factionId: string): SeatRecord[] {
    const all: SeatRecord[] = (world as any).seats ?? [];
    return all.filter(s => s.factionId === factionId);
}

export interface SeatSyncReport { seated: string[]; vacated: string[] }

/**
 * Make the cabinets match the seat table: seat every holder in their
 * portfolio, retire the leaders of seats that are gone. Idempotent.
 */
export function syncHumanMinisters(world: GameWorldState, seats: SeatRecord[]): SeatSyncReport {
    const report: SeatSyncReport = { seated: [], vacated: [] };
    (world as any).seats = seats.map(s => ({ id: s.id, factionId: s.factionId, portfolio: s.portfolio, persona: s.persona, exposed: !!s.exposed }));
    if (!(world.government instanceof Map)) return report;

    const wanted = new Map<string, SeatRecord>();
    for (const seat of seats) {
        if (!CABINET_PORTFOLIOS.includes(seat.portfolio as CabinetPortfolio)) continue;
        if (!world.government.has(seat.factionId)) continue;
        wanted.set(seatLeaderId(seat.id), seat);
    }

    // Seats that are gone: the leader leaves office, the AI fills the chair.
    for (const leader of [...world.leadership.leaders.values()]) {
        if (!leader.seatId || wanted.has(leader.id) || leader.status !== 'active') continue;
        const gov = getGovernment(world, leader.factionId);
        leader.status = 'retired';
        leader.history.push({ timestamp: world.nowSeconds, description: 'Left the cabinet.' });
        if (gov && leader.portfolio && gov.cabinet[leader.portfolio as CabinetPortfolio] === leader.id) {
            gov.cabinet[leader.portfolio as CabinetPortfolio] = null;
            fillVacantSeat(world, gov, leader.portfolio as CabinetPortfolio);
            gov.history.push({ timestamp: world.nowSeconds, event: `${leader.name} left the ${portfolioLabel(leader.portfolio as CabinetPortfolio)} seat.` });
        }
        leader.portfolio = undefined;
        report.vacated.push(leader.id);
    }

    // Seats that are new or moved: seat the holder, displace the AI minister.
    for (const [leaderId, seat] of wanted) {
        const portfolio = seat.portfolio as CabinetPortfolio;
        const gov = getGovernment(world, seat.factionId)!;
        let leader = world.leadership.leaders.get(leaderId);
        if (leader && leader.status === 'active' && gov.cabinet[portfolio] === leaderId) {
            // Already seated. Keep the persona current; nothing else moves.
            leader.name = seat.persona;
            continue;
        }
        const sitting = getMinister(world, seat.factionId, portfolio);
        if (sitting && sitting.id !== leaderId) {
            // Back to the pool without the dismissal grudge: the ruler did not
            // sack them, a friend took the chair.
            sitting.portfolio = undefined;
            sitting.history.push({ timestamp: world.nowSeconds, description: `Stood aside as Minister of ${portfolioLabel(portfolio)}.` });
            world.leadership.leaders.delete(sitting.id);
            world.leadership.recruitmentPool.push(sitting);
        }
        if (!leader) {
            leader = {
                id: leaderId,
                factionId: seat.factionId,
                name: seat.persona,
                role: 'Minister',
                level: 1,
                xp: 0,
                loyalty: HUMAN_MINISTER_LOYALTY,
                status: 'active',
                traits: [],
                history: [],
                title: 'Minister',
                competence: HUMAN_MINISTER_COMPETENCE,
                corruption: 0,
                ambitionDrive: 50,
                popularity: 50,
                politicalSkill: 50,
                health: 100,
                age: 40,
                seatId: seat.id,
            };
            world.leadership.leaders.set(leaderId, leader);
        }
        leader.status = 'active';
        leader.factionId = seat.factionId;
        leader.name = seat.persona;
        leader.seatId = seat.id;
        leader.portfolio = portfolio;
        leader.history.push({ timestamp: world.nowSeconds, description: `Took the ${portfolioLabel(portfolio)} seat.` });
        gov.cabinet[portfolio] = leaderId;
        gov.history.push({ timestamp: world.nowSeconds, event: `${seat.persona} took the ${portfolioLabel(portfolio)} seat.` });
        refillRecruitmentPool(world, seat.factionId);
        report.seated.push(leaderId);
        try {
            fireNotification({
                id: `seat-${seat.id}-${world.nowSeconds}`,
                factionId: seat.factionId,
                category: 'politics',
                priority: 'normal',
                title: 'A FRIEND JOINS THE CABINET',
                body: `${seat.persona} now holds the ${portfolioLabel(portfolio)} seat. Their orders in that brief are the empire's own.`,
                createdAt: new Date(world.nowSeconds * 1000).toISOString(),
                read: false,
                linkToTab: 'government',
                payload: { portfolio },
            });
        } catch { /* notification queue absent in tests */ }
    }
    return report;
}
