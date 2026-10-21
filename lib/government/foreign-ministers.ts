// lib/government/foreign-ministers.ts
// Stars of Dominion — the Palpatine path: a sitting ruler in another court.
//
// A seat holder may already rule an empire of their own. The court knows
// them by their persona; which empire they rule is `world.seatAllegiances`
// (seat id → faction id), which only the worker fills and which never reaches
// a shard or the snapshot. Until EXPOSED the persona holds. Exposure comes
// two ways: a loyal servant who names the plotter sometimes knows more than
// a name (lib/government/plots.ts reportToRuler), and war between the two
// empires dissolves the persona at once — a defence minister cannot serve
// the enemy's throne unnoticed. Exposure is a casus belli for the court
// against the true empire and a legitimacy wound at home.
//
// A sitting ruler whose plot WINS does not take a second throne: the court
// becomes their PUPPET (world.puppets, public). The puppet stays AI-run, its
// head of state is the persona, it joins its patron's wars and pays tribute
// (lib/ai/puppet-ai.ts). The Republic and the Separatists both stop existing.

import type { GameWorldState } from '@/lib/game-world-state';
import { getGovernment } from './government-service';
import { shiftRivalry, isAtWar } from '@/lib/diplomacy/offer-service';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import * as chronicle from '@/lib/narrative/chronicle';

export interface PuppetRecord {
    patronFactionId: string;
    sinceSeconds: number;
    /** The persona that rules it, by name. */
    rulerPersona: string;
}

/** Rivalry the court gains toward the true empire on exposure; legitimacy the true empire loses. */
export const EXPOSURE_RIVALRY = 40;
export const EXPOSURE_LEGITIMACY = 15;
/** Chance a loyal servant who names the plotter also knows whom they truly serve. */
export const EXPOSURE_ON_NAMED_REPORT = 0.3;

type ForeignWorld = GameWorldState & {
    seatAllegiances?: Map<string, string>;
    seatExposures?: string[];
    puppets?: Map<string, PuppetRecord>;
    seats?: Array<{ id: string; factionId: string; portfolio: string; persona: string; exposed?: boolean; exposedAs?: string }>;
};

export function allegianceOf(world: GameWorldState, seatId: string): string | undefined {
    return (world as ForeignWorld).seatAllegiances?.get(seatId);
}

export function ensurePuppets(world: GameWorldState): Map<string, PuppetRecord> {
    const w = world as ForeignWorld;
    if (!(w.puppets instanceof Map)) w.puppets = new Map(Object.entries(w.puppets ?? {}));
    return w.puppets;
}

export function patronOf(world: GameWorldState, factionId: string): string | undefined {
    return ensurePuppets(world).get(factionId)?.patronFactionId;
}

function factionName(world: GameWorldState, id: string): string {
    return (world as any).factionNames?.[id] ?? (world.economy.factions.get(id) as any)?.name ?? id;
}

/**
 * The persona falls. Returns false when the seat is unknown, has no hidden
 * allegiance, or is exposed already. The worker persists the flag
 * (world.seatExposures → prisma) so the next seat sync keeps it.
 */
export function exposeSeat(world: GameWorldState, factionId: string, seatId: string, how: 'report' | 'war' | 'case'): boolean {
    const w = world as ForeignWorld;
    const allegiance = allegianceOf(world, seatId);
    if (!allegiance) return false;
    const seat = (w.seats ?? []).find(s => s.id === seatId && s.factionId === factionId);
    if (!seat || seat.exposed) return false;
    seat.exposed = true;
    seat.exposedAs = allegiance;
    (w.seatExposures ??= []).push(seatId);

    const court = factionName(world, factionId);
    const home = factionName(world, allegiance);
    shiftRivalry(world, factionId, allegiance, EXPOSURE_RIVALRY, 'foreign_ruler_in_cabinet', `${seat.persona} in the ${court} cabinet`);
    const homeGov = getGovernment(world, allegiance);
    if (homeGov) {
        homeGov.legitimacy = Math.max(0, homeGov.legitimacy - EXPOSURE_LEGITIMACY);
        homeGov.history.push({ timestamp: world.nowSeconds, event: `Our ruler was caught scheming in the ${court} cabinet as "${seat.persona}".` });
    }
    const courtGov = getGovernment(world, factionId);
    courtGov?.history.push({ timestamp: world.nowSeconds, event: `${seat.persona}, Minister of ${seat.portfolio}, was exposed as the ruler of ${home}.` });

    const stamp = new Date(world.nowSeconds * 1000).toISOString();
    try {
        fireNotification({
            id: `exposed-${seatId}-${world.nowSeconds}`, factionId, category: 'politics', priority: 'urgent',
            title: 'YOUR MINISTER IS A FOREIGN RULER',
            body: `${seat.persona}, your Minister of ${seat.portfolio}, is the ruler of ${home}${how === 'war' ? ' — the war made it plain' : how === 'report' ? ' — a loyal servant knew more than a name' : ''}. The court will understand a dismissal, and more.`,
            createdAt: stamp, read: false, linkToTab: 'government', payload: { seatId },
        });
        fireNotification({
            id: `exposed-home-${seatId}-${world.nowSeconds}`, factionId: allegiance, category: 'politics', priority: 'urgent',
            title: 'YOUR SEAT ABROAD IS BLOWN',
            body: `${court} knows that "${seat.persona}" is you. Legitimacy at home fell by ${EXPOSURE_LEGITIMACY}; their court has its grievance.`,
            createdAt: stamp, read: false, linkToTab: 'government',
        });
    } catch { /* notification queue absent in tests */ }
    try { pushWorldStory(world, { targetEmpireId: factionId, subject: `${court}'s Minister of ${seat.portfolio} exposed as the ruler of ${home}`, magnitude: 90 }); } catch { /* press absent */ }
    chronicle.record(world, {
        type: 'operation_exposed', actorIds: [allegiance], targetIds: [factionId],
        facts: { persona: seat.persona, portfolio: seat.portfolio, how, foreignRulerInCabinet: true },
    });
    return true;
}

/** A sitting ruler's plot won: the court becomes their puppet. */
export function installPuppet(world: GameWorldState, puppetFactionId: string, patronFactionId: string, rulerPersona: string): PuppetRecord {
    const rec: PuppetRecord = { patronFactionId, sinceSeconds: world.nowSeconds, rulerPersona };
    ensurePuppets(world).set(puppetFactionId, rec);
    const puppet = factionName(world, puppetFactionId);
    const patron = factionName(world, patronFactionId);
    getGovernment(world, puppetFactionId)?.history.push({ timestamp: world.nowSeconds, event: `${rulerPersona} rules — and answers to ${patron}.` });
    getGovernment(world, patronFactionId)?.history.push({ timestamp: world.nowSeconds, event: `${puppet} became our puppet under "${rulerPersona}".` });
    const stamp = new Date(world.nowSeconds * 1000).toISOString();
    try {
        fireNotification({
            id: `puppet-${puppetFactionId}-${world.nowSeconds}`, factionId: patronFactionId, category: 'politics', priority: 'urgent',
            title: 'A THRONE IN ALL BUT NAME',
            body: `Your persona "${rulerPersona}" rules ${puppet}. It fights your wars and pays you tribute; you keep your own throne. If the galaxy learns who sits behind it, it is a war with everyone.`,
            createdAt: stamp, read: false, linkToTab: 'diplomacy',
        });
    } catch { /* notification queue absent in tests */ }
    try { pushWorldStory(world, { targetEmpireId: puppetFactionId, subject: `${rulerPersona} takes the ${puppet} throne`, magnitude: 95 }); } catch { /* press absent */ }
    chronicle.record(world, { type: 'government_changed', actorIds: [puppetFactionId], targetIds: [patronFactionId], facts: { puppet: true, rulerPersona, patron, cause: 'cabinet_plot' } });
    return rec;
}

/** The tripwire: war between the court and the true empire dissolves every persona between them. */
export function tickForeignMinisters(world: GameWorldState): string[] {
    const w = world as ForeignWorld;
    const out: string[] = [];
    for (const seat of w.seats ?? []) {
        if (seat.exposed) continue;
        const allegiance = allegianceOf(world, seat.id);
        if (!allegiance || allegiance === seat.factionId) continue;
        if (isAtWar(world, seat.factionId, allegiance) && exposeSeat(world, seat.factionId, seat.id, 'war')) {
            out.push(`${seat.persona} exposed in ${seat.factionId} by the war with ${allegiance}`);
        }
    }
    return out;
}
