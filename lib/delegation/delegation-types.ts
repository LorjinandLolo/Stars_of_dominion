// lib/delegation/delegation-types.ts
// Stars of Dominion — who runs an empire while nobody is watching.
//
// Absence may slow an empire; it must never wound it. A human faction leaves
// six systems delegated by default, and each delegated system is run by the
// same code that already runs it for the AI factions — with the conservative
// choice, never the ambitious one. A depth player turns a system off and takes
// it back; nothing else about that system changes.
//
// The record rides the faction's own shard (lib/persistence/save-service.ts),
// because it is the player's setting, not public knowledge.

/** The six systems a player can hand to their advisors. */
export type DelegatedSystem =
    | 'government'
    | 'corporate'
    | 'press'
    | 'piracy'
    | 'exploration'
    | 'research';

export const DELEGATED_SYSTEMS: DelegatedSystem[] = [
    'government', 'corporate', 'press', 'piracy', 'exploration', 'research',
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
    };
}

/** One line each, for the Advisors card. */
export const DELEGATION_LABELS: Record<DelegatedSystem, { title: string; detail: string }> = {
    government: {
        title: 'Cabinet',
        detail: 'Your ministers settle open debates the way they advise, answer defiance, and keep the officer corps from reading your silence as weakness.',
    },
    corporate: {
        title: 'Board liaison',
        detail: 'Corporate demands are declined on your behalf, and a crisis on the state’s desk gets the cheapest lawful answer.',
    },
    press: {
        title: 'Press office',
        detail: 'Hostile campaigns are answered with the cheapest response rather than left to run.',
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
        detail: 'When a project finishes, the cheapest technology in your current focus is started.',
    },
};
