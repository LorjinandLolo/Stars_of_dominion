// lib/government/defiance-service.ts
// Stars of Dominion — Government & Leadership, Phase 6.2 (the escalation ladder).
//
// WORKER-SIDE. Stage 2 (Institutional Crisis) is passive: as cohesion falls the
// state simply works less well, and getCohesionModifiers expresses that in the
// same modifier vocabulary as policies and the cabinet. Stage 3 (Defiance) is
// active: a world refuses the centre and the player must answer it.
//
// Nothing here is random in the "your stability hit zero" sense — an event only
// opens on a world whose cohesion already collapsed, and it carries the drivers
// that got it there.

import type { GameWorldState } from '@/lib/game-world-state';
import type { DefianceEvent, DefianceKind, DefianceResponse } from './defiance-types';
import { defianceOption } from './defiance-types';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { Resource } from '@/lib/trade-system/types';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getGovernor, replaceGovernor } from './governor-service';
import { getPlanetCohesion } from './cohesion-service';
import { recordPoliticalEvent } from './ideology-drift';

/** Cohesion at or below which a world will start refusing the centre. */
const DEFIANCE_COHESION_THRESHOLD = 40;
/**
 * Pressure gained per sim day at maximum severity (cohesion 0). A world at the
 * threshold gains nothing; one at rock bottom refuses in about two and a half
 * days. Deterministic on purpose — the doc's rule is that collapse is a process
 * the player can watch developing, not a die that comes up wrong.
 */
const DEFIANCE_PRESSURE_PER_DAY = 40;
/** Pressure needed to act. */
const DEFIANCE_PRESSURE_THRESHOLD = 100;
/** Pressure shed per sim day once the world climbs back above the threshold. */
const DEFIANCE_PRESSURE_DECAY_PER_DAY = 25;
/** How long the government has to answer (5 sim days). */
const DEFIANCE_WINDOW_SECONDS = 5 * 86400;
/** Most open events one empire can face at once — a crisis, not a spreadsheet. */
const MAX_OPEN_EVENTS_PER_FACTION = 4;
/** Decided events kept for the record. */
const MAX_RESOLVED_KEPT = 12;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

// ─── Stage 2: institutional decay ─────────────────────────────────────────────

/**
 * What falling cohesion does to a functioning state, in the shared modifier
 * vocabulary (see lib/government/modifiers.ts).
 *
 * Below 50 the machinery starts slipping: revenue leaks first because tax needs
 * local cooperation, then production. Autonomy granted to defiant worlds is a
 * permanent standing cost — that is the price of having bought peace.
 */
export function getCohesionModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    const gov = getGovernment(world, factionId);
    if (!gov) return {};

    const out: Record<string, number> = {};

    // Institutional crisis: the further below 50, the less the state collects.
    const shortfall = Math.max(0, 50 - (gov.cohesion ?? 70)) / 50; // 0..1
    if (shortfall > 0) {
        out.tax_income = -shortfall * 0.35;
        out.production = -shortfall * 0.20;
    }

    // Worlds in open defiance are not paying anything at all.
    const defiantWorlds = [...(world.planetCohesion?.values() ?? [])]
        .filter(r => r.factionId === factionId && (r.stage === 'defiant' || r.stage === 'separatist')).length;
    const ownedWorlds = [...(world.planetCohesion?.values() ?? [])].filter(r => r.factionId === factionId).length;
    if (defiantWorlds > 0 && ownedWorlds > 0) {
        out.tax_income = (out.tax_income ?? 0) - (defiantWorlds / ownedWorlds) * 0.3;
    }

    // Autonomy bought with concessions never comes back cheap.
    const autonomy = [...(world.planetCohesion?.values() ?? [])]
        .filter(r => r.factionId === factionId)
        .reduce((sum, r) => sum + (r.autonomy ?? 0), 0);
    if (autonomy > 0 && ownedWorlds > 0) {
        out.tax_income = (out.tax_income ?? 0) - Math.min(0.35, (autonomy / (ownedWorlds * 100)) * 0.6);
    }

    return out;
}

// ─── Stage 3: defiance events ─────────────────────────────────────────────────

const KIND_TEMPLATES: Record<DefianceKind, { title: (planet: string, governor?: string) => string; demand: string }> = {
    tax_refusal: {
        title: (planet, governor) => `${governor ? `Governor ${governor}` : planet} refuses the imperial tax directive`,
        demand: 'The levy will not be collected here until the capital explains what it has bought us.',
    },
    policy_refusal: {
        title: (planet, governor) => `${governor ? `Governor ${governor}` : planet} will not enforce imperial policy`,
        demand: 'We will not enforce law written by people who have never been here.',
    },
    conscription_refusal: {
        title: planet => `${planet} refuses to send further conscripts`,
        demand: 'We have sent enough of our children to a war that was not ours.',
    },
    autonomy_demand: {
        title: planet => `${planet} demands autonomy`,
        demand: 'Local rule, local revenue, local law. We are not asking to leave — yet.',
    },
    garrison_standoff: {
        title: planet => `Standoff at the ${planet} garrison`,
        demand: 'The garrison has closed the port to imperial inspectors and will not stand down.',
    },
};

/** Pick the refusal that fits whatever is actually driving the collapse. */
function kindFromDrivers(world: GameWorldState, planetId: string): DefianceKind {
    const record = getPlanetCohesion(world, planetId);
    const top = record?.drivers?.find(d => d.delta < 0)?.id;

    switch (top) {
        case 'war_fatigue': return 'conscription_refusal';
        case 'corruption':
        case 'approval': return 'tax_refusal';
        case 'governor': return 'policy_refusal';
        case 'interference': return 'garrison_standoff';
        case 'distance': return 'autonomy_demand';
        case 'unrest':
        case 'happiness':
        case 'stability': return 'autonomy_demand';
        default: return 'tax_refusal';
    }
}

/** Open events a faction currently faces. */
export function openDefiance(world: GameWorldState, factionId: string): DefianceEvent[] {
    if (!(world.defianceEvents instanceof Map)) return [];
    return [...world.defianceEvents.values()]
        .filter(e => e.factionId === factionId && e.status === 'open')
        .sort((a, b) => a.expiresAtSeconds - b.expiresAtSeconds);
}

/**
 * Open a defiance event for a world. Exported so the governor tick can raise one
 * directly when a governor openly breaks with the capital.
 */
export function raiseDefiance(
    world: GameWorldState,
    planetId: string,
    kind?: DefianceKind
): DefianceEvent | undefined {
    if (!(world.defianceEvents instanceof Map)) world.defianceEvents = new Map();

    const planet = world.construction?.planets?.get(planetId);
    if (!planet?.ownerId) return undefined;
    const factionId = planet.ownerId;
    const gov = getGovernment(world, factionId);
    if (!gov) return undefined;

    // One crisis per world, and a ceiling per empire.
    const existing = [...world.defianceEvents.values()]
        .filter(e => e.status === 'open' && e.factionId === factionId);
    if (existing.some(e => e.planetId === planetId)) return undefined;
    if (existing.length >= MAX_OPEN_EVENTS_PER_FACTION) return undefined;

    const record = getPlanetCohesion(world, planetId);
    const governor = getGovernor(world, planetId);
    const resolvedKind = kind ?? kindFromDrivers(world, planetId);
    const template = KIND_TEMPLATES[resolvedKind];
    const planetName = planet.name ?? planetId;

    const event: DefianceEvent = {
        id: `defiance-${planetId}-${world.nowSeconds}`,
        factionId,
        planetId,
        planetName,
        kind: resolvedKind,
        title: template.title(planetName, governor?.name),
        demand: template.demand,
        causes: (record?.drivers ?? []).filter(d => d.delta < 0).slice(0, 3).map(d => d.label),
        openedAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + DEFIANCE_WINDOW_SECONDS,
        status: 'open',
    };

    world.defianceEvents.set(event.id, event);
    gov.history.push({ timestamp: world.nowSeconds, event: event.title });

    try {
        fireNotification({
            id: event.id,
            factionId,
            category: 'politics',
            priority: 'urgent',
            title: 'Open Defiance',
            body: `${event.title}. ${event.causes[0] ?? ''}`.trim(),
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { defianceId: event.id, planetId },
        });
    } catch { /* notification queue absent in tests */ }

    try {
        pushWorldStory(world, { targetEmpireId: factionId, subject: event.title, magnitude: 65 });
    } catch { /* press state absent on minimal worlds */ }

    return event;
}

/**
 * Spawn new defiance on collapsed worlds and close out anything the government
 * let expire. Silence is an answer, and it is the worst one.
 */
export function tickDefiance(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.defianceEvents instanceof Map)) world.defianceEvents = new Map();
    const days = deltaSeconds / 86400;

    // Expiry first — an ignored crisis frees the slot, it does not block it.
    for (const event of world.defianceEvents.values()) {
        if (event.status !== 'open') continue;
        if (world.nowSeconds < event.expiresAtSeconds) continue;
        applyIgnored(world, event);
    }

    for (const record of world.planetCohesion?.values() ?? []) {
        // A world that has climbed back above the line calms down again.
        if (record.cohesion > DEFIANCE_COHESION_THRESHOLD) {
            record.defiancePressure = Math.max(0, (record.defiancePressure ?? 0) - DEFIANCE_PRESSURE_DECAY_PER_DAY * days);
            continue;
        }

        // The further past the line, the faster patience runs out.
        const severity = (DEFIANCE_COHESION_THRESHOLD - record.cohesion) / DEFIANCE_COHESION_THRESHOLD;
        record.defiancePressure = (record.defiancePressure ?? 0) + DEFIANCE_PRESSURE_PER_DAY * severity * days;
        if (record.defiancePressure < DEFIANCE_PRESSURE_THRESHOLD) continue;

        // Spend the pressure whether or not a slot was free — a world that has
        // already refused, or an empire at its crisis ceiling, does not bank it.
        record.defiancePressure = 0;
        raiseDefiance(world, record.planetId);
    }

    pruneResolved(world);
}

function pruneResolved(world: GameWorldState): void {
    const resolved = [...world.defianceEvents.values()]
        .filter(e => e.status !== 'open')
        .sort((a, b) => (a.resolvedAtSeconds ?? 0) - (b.resolvedAtSeconds ?? 0));
    const excess = resolved.length - MAX_RESOLVED_KEPT;
    for (let i = 0; i < excess; i++) world.defianceEvents.delete(resolved[i].id);
}

export interface DefianceResult {
    ok: boolean;
    message?: string;
    outcome?: string;
    /** False when an uncertain response went badly. */
    succeeded?: boolean;
}

/**
 * Answer an open defiance. Costs are charged here so a refused answer is free,
 * and every branch writes a plain-language outcome onto the event.
 */
export function answerDefiance(
    world: GameWorldState,
    factionId: string,
    eventId: string,
    response: DefianceResponse
): DefianceResult {
    const event = world.defianceEvents?.get(eventId);
    if (!event || event.status !== 'open') return { ok: false, message: 'That crisis is no longer open.' };
    if (event.factionId !== factionId) return { ok: false, message: 'That crisis is not yours to answer.' };
    if (response === 'ignore') return { ok: false, message: 'Silence is applied when the window closes, not chosen.' };

    const option = defianceOption(response);
    if (!option) return { ok: false, message: `Unknown response "${response}".` };

    const gov = getGovernment(world, factionId)!;
    const economy = world.economy.factions.get(factionId);

    if (option.credits > 0) {
        const held = (economy?.reserves as Record<string, number> | undefined)?.[Resource.CREDITS] ?? 0;
        if (held < option.credits) {
            return { ok: false, message: `Needs ${option.credits} credits; the treasury holds ${Math.floor(held)}.` };
        }
    }
    if (!spendPoliticalCapital(world, factionId, option.politicalCapital, `answered ${event.planetName}`)) {
        return { ok: false, message: `Needs ${option.politicalCapital} political capital; the government holds ${Math.floor(gov.politicalCapital)}.` };
    }
    if (option.credits > 0 && economy) {
        const reserves = economy.reserves as Record<string, number>;
        reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) - option.credits;
    }

    const result = applyResponse(world, event, response);

    event.status = 'resolved';
    event.resolution = response;
    event.outcome = result.outcome;
    event.resolvedAtSeconds = world.nowSeconds;
    gov.history.push({ timestamp: world.nowSeconds, event: `${event.planetName}: ${result.outcome}` });

    try {
        pushWorldStory(world, { targetEmpireId: factionId, subject: `${event.planetName}: ${result.outcome}`, magnitude: 50 });
    } catch { /* press state absent on minimal worlds */ }

    return { ok: true, ...result };
}

function applyResponse(
    world: GameWorldState,
    event: DefianceEvent,
    response: DefianceResponse
): { outcome: string; succeeded: boolean } {
    const planet = world.construction.planets.get(event.planetId);
    const record = getPlanetCohesion(world, event.planetId);
    const gov = getGovernment(world, event.factionId)!;
    const governor = getGovernor(world, event.planetId);
    const rng = new RNG(seedFromString(`${event.id}|${response}`));

    switch (response) {
        case 'negotiate': {
            // Concessions work. They also permanently loosen the empire's grip.
            if (record) record.autonomy = Math.min(100, (record.autonomy ?? 0) + 25);
            if (record) record.cohesion = clamp100(record.cohesion + 15);
            if (governor) governor.loyalty = clamp100(governor.loyalty + 20);
            if (planet) planet.unrest = clamp100((planet.unrest ?? 0) - 20);
            return {
                outcome: 'autonomy granted — the world stays, on its own terms',
                succeeded: true,
            };
        }

        case 'bribe': {
            if (record) record.cohesion = clamp100(record.cohesion + 10);
            if (planet) {
                planet.happiness = clamp100((planet.happiness ?? 80) + 15);
                planet.unrest = clamp100((planet.unrest ?? 0) - 15);
            }
            if (governor) governor.loyalty = clamp100(governor.loyalty + 10);
            // Everyone learns what defiance is worth.
            gov.corruption = clamp100(gov.corruption + 4);
            return { outcome: 'bought off with local funding', succeeded: true };
        }

        case 'threaten': {
            // Credible only if the government still has standing to spend.
            const credibility = (gov.legitimacy / 100) * 0.5 + ((governor?.loyalty ?? 40) / 100) * 0.3 + 0.2;
            const complied = rng.next() < credibility;
            if (complied) {
                if (record) record.cohesion = clamp100(record.cohesion + 8);
                if (planet) planet.unrest = clamp100((planet.unrest ?? 0) - 10);
                return { outcome: 'backed down under threat of consequences', succeeded: true };
            }
            if (record) record.cohesion = clamp100(record.cohesion - 12);
            if (planet) planet.unrest = clamp100((planet.unrest ?? 0) + 20);
            if (governor) governor.loyalty = clamp100(governor.loyalty - 15);
            gov.legitimacy = clamp100(gov.legitimacy - 4);
            return { outcome: 'called the bluff — the capital was ignored in public', succeeded: false };
        }

        case 'replace_governor': {
            const outgoing = governor;
            // A popular governor has a base that resents the removal.
            const resistance = ((outgoing?.popularity ?? 40) / 100) * 0.7;
            const replacement = replaceGovernor(world, event.planetId);
            const resisted = rng.next() < resistance;

            if (!replacement) {
                return { outcome: 'no replacement could be found', succeeded: false };
            }
            if (resisted) {
                if (record) record.cohesion = clamp100(record.cohesion - 8);
                if (planet) planet.unrest = clamp100((planet.unrest ?? 0) + 15);
                return {
                    outcome: `${outgoing?.name ?? 'the governor'} removed — supporters took to the streets; ${replacement.name} governs a hostile world`,
                    succeeded: false,
                };
            }
            if (record) record.cohesion = clamp100(record.cohesion + 12);
            if (planet) planet.unrest = clamp100((planet.unrest ?? 0) - 10);
            return { outcome: `${replacement.name} installed and the directive enforced`, succeeded: true };
        }

        case 'send_military': {
            if (planet) {
                planet.unrest = clamp100((planet.unrest ?? 0) - 40);
                planet.stability = clamp100((planet.stability ?? 50) + 15);
                planet.happiness = clamp100((planet.happiness ?? 80) - 20);
            }
            if (record) record.cohesion = clamp100(record.cohesion + 5);

            // Every other world is watching what the capital does to its own.
            for (const other of world.planetCohesion.values()) {
                if (other.factionId !== event.factionId || other.planetId === event.planetId) continue;
                other.cohesion = clamp100(other.cohesion - 3);
            }
            const military = world.movement.empirePostures.get(event.factionId)?.blocs?.find(b => b.id === 'military');
            if (military) military.satisfaction = clamp100(military.satisfaction + 8);
            gov.legitimacy = clamp100(gov.legitimacy - 3);
            recordPoliticalEvent(world, event.factionId, 'purge_officers'); // authority asserted by force

            return { outcome: 'order restored by force — the rest of the empire took note', succeeded: true };
        }

        default:
            return { outcome: 'no action taken', succeeded: false };
    }
}

/** The government said nothing. The world draws its own conclusions. */
function applyIgnored(world: GameWorldState, event: DefianceEvent): void {
    const planet = world.construction.planets.get(event.planetId);
    const record = getPlanetCohesion(world, event.planetId);
    const governor = getGovernor(world, event.planetId);
    const gov = getGovernment(world, event.factionId);

    if (record) record.cohesion = clamp100(record.cohesion - 15);
    if (planet) planet.unrest = clamp100((planet.unrest ?? 0) + 15);
    if (governor) governor.loyalty = clamp100(governor.loyalty - 20);
    if (gov) {
        gov.legitimacy = clamp100(gov.legitimacy - 3);
        gov.history.push({
            timestamp: world.nowSeconds,
            event: `${event.planetName} was left unanswered — the refusal stands.`,
        });
    }

    event.status = 'ignored';
    event.resolution = 'ignore';
    event.outcome = 'left unanswered — the refusal stands and the world governs itself on the point';
    event.resolvedAtSeconds = world.nowSeconds;

    try {
        fireNotification({
            id: `${event.id}-ignored`,
            factionId: event.factionId,
            category: 'politics',
            priority: 'urgent',
            title: 'Defiance Unanswered',
            body: `${event.planetName}: ${event.outcome}`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { defianceId: event.id },
        });
    } catch { /* notification queue absent in tests */ }
}
