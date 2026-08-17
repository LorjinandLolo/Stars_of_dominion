// lib/narrative/press-voices.ts — who is telling the story.
//
// The press system already models publishers: state media tied to an empire,
// independents, and pirate outlets, each with credibility and bias
// (lib/press-system/types.ts). This module reads that roster out of the
// committed world snapshot and decides which of them covers a given event.
//
// Reading is safe under Invariant 1: the narrator may READ anything the
// simulation writes, it may only never WRITE anything the simulation reads.
// Nothing here mutates. The snapshot is parsed, never deserialized into a live
// world, so there is no object the narrator could accidentally modify.
//
// Worker-side only.

import { prisma } from '../db';
import { prettifyFactionId } from './naming';
import type { NarratableEvent } from './prose/prose-types';

const SESSION_DOC_ID = 'default-session';

/** How long a roster read stays good. Publishers change slowly; the narrator
 *  runs often. */
const CACHE_TTL_MS = 60_000;

export type VoiceType = 'STATE_MEDIA' | 'INDEPENDENT_MEDIA' | 'PIRATE_PRESS';

export interface Publisher {
    id: string;
    type: VoiceType;
    /** Set for state media: the empire whose line it takes. */
    affiliatedEmpireId?: string;
    /** 0-100. Low-credibility outlets are believed less and print more. */
    credibility: number;
    /** -100 (anti-establishment) to 100 (pro-establishment). */
    bias: number;
    /** Printable masthead, e.g. "Aurelian Hegemony State Media". */
    masthead: string;
}

interface RosterCache {
    publishers: Publisher[];
    readAt: number;
}

let cache: RosterCache | null = null;

/** Snapshot Maps are serialized as `{ __map__: true, data: {...} }`. */
function readMap(node: any): Record<string, any> {
    if (!node) return {};
    if (node.__map__ && node.data && typeof node.data === 'object') return node.data;
    if (typeof node === 'object' && !Array.isArray(node)) return node;
    return {};
}

function mastheadFor(type: VoiceType, affiliatedEmpireId: string | undefined, factionNames: Record<string, string>): string {
    if (type === 'STATE_MEDIA' && affiliatedEmpireId) {
        const name = factionNames[affiliatedEmpireId] ?? prettifyFactionId(affiliatedEmpireId);
        return `${name} State Media`;
    }
    if (type === 'PIRATE_PRESS') return 'Free Signal';
    return 'The Galactic Wire';
}

/**
 * The publishers currently operating, read from the last committed snapshot.
 *
 * Returns just the independent wire when no snapshot exists yet, so a fresh
 * galaxy still has a newspaper.
 */
export async function loadPublishers(force = false): Promise<Publisher[]> {
    if (!force && cache && Date.now() - cache.readAt < CACHE_TTL_MS) return cache.publishers;

    const fallback: Publisher[] = [{
        id: 'galactic_wire',
        type: 'INDEPENDENT_MEDIA',
        credibility: 75,
        bias: 0,
        masthead: 'The Galactic Wire',
    }];

    try {
        const doc = await prisma.multiplayerSession.findUnique({
            where: { id: SESSION_DOC_ID },
            select: { snapshot: true },
        });
        if (!doc?.snapshot) {
            cache = { publishers: fallback, readAt: Date.now() };
            return fallback;
        }

        const parsed = JSON.parse(doc.snapshot);
        const pressFactions = readMap(parsed?.press?.pressFactions);

        // Faction display names are stripped from the snapshot into shards, so
        // mastheads fall back to a readable form of the id. Good enough for a
        // masthead, and it costs no extra query.
        const factionNames: Record<string, string> = {};

        const publishers: Publisher[] = Object.values(pressFactions)
            .filter((p: any) => p && typeof p.id === 'string')
            .map((p: any) => {
                const type = (p.type as VoiceType) ?? 'INDEPENDENT_MEDIA';
                return {
                    id: p.id,
                    type,
                    affiliatedEmpireId: p.affiliatedEmpireId,
                    credibility: typeof p.credibility === 'number' ? p.credibility : 50,
                    bias: typeof p.bias === 'number' ? p.bias : 0,
                    masthead: mastheadFor(type, p.affiliatedEmpireId, factionNames),
                };
            });

        const result = publishers.length ? publishers : fallback;
        cache = { publishers: result, readAt: Date.now() };
        return result;
    } catch (e: any) {
        console.warn('[Narrator] Could not read the press roster, using the wire:', e.message);
        cache = { publishers: fallback, readAt: Date.now() };
        return fallback;
    }
}

/** Tests and the first pass after a reseed. */
export function clearPublisherCache(): void {
    cache = null;
}

/**
 * Pick who covers this story.
 *
 * The rules are about incentive, not randomness:
 *   * An act nobody can attribute is the pirate press's natural territory —
 *     they are the outlet willing to speculate without evidence.
 *   * A victory belongs to the winner's own state media, which will frame it
 *     as one.
 *   * Anything embarrassing to an empire will not be broken by that empire's
 *     state media; it goes to the independents.
 *   * Everything else is wire copy.
 *
 * Deterministic: the same event always draws the same outlet, so re-running the
 * narrator cannot reshuffle who said what.
 */
export function selectPublisher(event: NarratableEvent, publishers: Publisher[]): Publisher {
    const wire = publishers.find(p => p.type === 'INDEPENDENT_MEDIA')
        ?? publishers[0];

    const pirate = publishers.find(p => p.type === 'PIRATE_PRESS');
    const stateOf = (factionId?: string) => factionId
        ? publishers.find(p => p.type === 'STATE_MEDIA' && p.affiliatedEmpireId === factionId)
        : undefined;

    // Unattributable acts: the wire will not print a name it cannot stand up,
    // so speculation falls to the outlet with the least to lose.
    if (event.attribution === 'invisible' && pirate) return pirate;

    const actor = event.actorIds[0];
    const target = event.targetIds[0];

    // Exposure and scandal: the implicated empire's own media is not breaking
    // this, and the pirate press will run it loudest.
    const EMBARRASSING = ['operation_exposed', 'investigation_published', 'coup_attempted', 'government_changed', 'secession_declared', 'civil_war_started'];
    if (EMBARRASSING.includes(event.type)) {
        // Prefer an independent; fall back to the pirate press.
        return wire ?? pirate ?? publishers[0];
    }

    // A win is a story the winner wants told their way.
    const VICTORIES = ['capital_captured', 'system_captured', 'battle_resolved', 'war_ended', 'colony_founded'];
    if (VICTORIES.includes(event.type) && event.attribution === 'exposed') {
        const home = stateOf(actor);
        // Credibility matters: a state medium nobody believes cannot carry it.
        if (home && home.credibility >= 35) return home;
    }

    // Being attacked is also a story the victim's media will tell.
    const GRIEVANCES = ['planet_bombarded', 'siege_started', 'blockade_started', 'treaty_broken'];
    if (GRIEVANCES.includes(event.type)) {
        const victim = stateOf(target);
        if (victim && victim.credibility >= 35) return victim;
    }

    return wire ?? publishers[0];
}

/**
 * The editorial line an outlet takes on a specific story: whose side it is on,
 * and how much it is willing to assert.
 *
 * `slant` is what the prose layer acts on. It is derived, not authored, so a
 * change in an outlet's credibility during the game changes how it writes.
 */
export interface Stance {
    publisher: Publisher;
    /** 'friendly' | 'hostile' | 'detached' — toward the event's actor. */
    slant: 'friendly' | 'hostile' | 'detached';
    /** True when the outlet is reporting on its own empire's embarrassment. */
    coveringOwnEmpire: boolean;
    /** Low-credibility outlets hedge less and sensationalise more. */
    sensational: boolean;
}

export function stanceFor(event: NarratableEvent, publisher: Publisher): Stance {
    const actor = event.actorIds[0];
    const target = event.targetIds[0];
    const affiliated = publisher.affiliatedEmpireId;

    let slant: Stance['slant'] = 'detached';
    if (publisher.type === 'PIRATE_PRESS') {
        // Assumes the worst of whoever is in charge, on principle.
        slant = 'hostile';
    } else if (affiliated && affiliated === actor) {
        slant = 'friendly';
    } else if (affiliated && affiliated === target) {
        slant = 'hostile';
    }

    return {
        publisher,
        slant,
        coveringOwnEmpire: Boolean(affiliated && (affiliated === actor || affiliated === target)),
        sensational: publisher.credibility < 50,
    };
}
