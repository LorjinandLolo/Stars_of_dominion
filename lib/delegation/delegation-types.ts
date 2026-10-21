// lib/delegation/delegation-types.ts
// Stars of Dominion — who runs an empire while nobody is watching.
//
// Absence may slow an empire; it must never wound it. A human faction leaves
// most systems delegated by default, and each delegated system is run by the
// same code that already runs it for the AI factions — with the conservative
// choice, never the ambitious one. A depth player turns a system off and takes
// it back; nothing else about that system changes.
//
// The record rides the faction's own shard (lib/persistence/save-service.ts),
// because it is the player's setting, not public knowledge.

/**
 * The nine systems a player can hand to their advisors. The last three
 * (military, diplomacy, development) joined with the veto feed
 * (lib/delegation/advisor-proposals.ts): delegated, they run the routine;
 * the ambitious — a war, a peace, a battle group — is only ever PROPOSED,
 * whatever is delegated.
 */
export type DelegatedSystem =
    | 'government'
    | 'corporate'
    | 'press'
    | 'piracy'
    | 'exploration'
    | 'research'
    | 'military'
    | 'diplomacy'
    | 'development';

export const DELEGATED_SYSTEMS: DelegatedSystem[] = [
    'government', 'corporate', 'press', 'piracy', 'exploration', 'research',
    'military', 'diplomacy', 'development',
];

export type DelegationState = Record<DelegatedSystem, boolean>;

/**
 * Everything delegated. This is the default for a faction with no record —
 * a player who never opens the Advisors card is the player this exists for.
 */
export function defaultDelegation(): DelegationState {
    return {
        government: true,
        corporate: true,
        press: true,
        piracy: true,
        exploration: true,
        research: true,
        // The Admiralty and the Foreign Office take orders; they do not take
        // over. Off by default: a fleet that disengages by itself or a peace
        // signed in your name is a surprise. The Works are on: an idle build
        // queue is the one thing nobody misses.
        military: false,
        diplomacy: false,
        development: true,
    };
}

/** Nothing delegated: the old behaviour, for a player who wants every lever. */
export function noDelegation(): DelegationState {
    return {
        government: false,
        corporate: false,
        press: false,
        piracy: false,
        exploration: false,
        research: false,
        military: false,
        diplomacy: false,
        development: false,
    };
}

/** One line each, for the Advisors card. */
export const DELEGATION_LABELS: Record<DelegatedSystem, { title: string; detail: string }> = {
    government: {
        title: 'Cabinet',
        detail: 'Your ministers settle open debates the way they advise, answer defiance, dismiss a colleague whose corruption is about to become a scandal, and keep the officer corps from reading your silence as weakness.',
    },
    corporate: {
        title: 'Board liaison',
        detail: 'Corporate demands are declined on your behalf, and a crisis on the state’s desk gets the cheapest lawful answer.',
    },
    press: {
        title: 'Press office',
        detail: 'Journalists get cooperation before a dig becomes a scandal, a media crisis is answered before its deadline, and hostile campaigns are countered rather than left to run.',
    },
    piracy: {
        title: 'Patrol command',
        detail: 'Pirate posture stays defensive: convoys escorted, no bounties, no sponsorships.',
    },
    exploration: {
        title: 'Survey office',
        detail: 'Idle fleets keep charting nearby systems instead of sitting at the capital.',
    },
    research: {
        title: 'Research council',
        detail: 'When a project finishes, the cheapest technology in your current focus is started. It never picks a fork of no return, and a project you choose replaces its pick.',
    },
    military: {
        title: 'Admiralty',
        detail: 'Your battle groups fight their own battles: a stance each round, an orderly withdrawal when outmatched, mauled groups merged at the yard. It never declares war, never bombards, never gives up a siege — those come to you as proposals.',
    },
    diplomacy: {
        title: 'Foreign Office',
        detail: 'A peace offer the court would accept is accepted before it lapses. Every other offer waits for you, with the ministry’s advice attached.',
    },
    development: {
        title: 'The Works',
        detail: 'An empty build queue is filled with what the world needs most: order where it is unstable, industry where it is poor, research where it is rich. A project you queue yourself always comes first.',
    },
};
