// lib/brief/brief-types.ts
// Stars of Dominion — the daily brief, as plain data.
//
// The brief is what a player who gives the game five minutes a day sees first:
// what happened while they were gone, what is waiting on their answer, and one
// thing worth doing. It is produced server-side (app/api/game/brief) by a pure
// projection (lib/brief/daily-brief.ts) and rendered by the client, so both
// sides share these shapes and neither invents its own.

/** One line of "what happened". */
export interface BriefLine {
    id: string;
    text: string;
    /** ISO timestamp, real clock — what the player's own day looked like. */
    at: string;
    /** Where the line came from, so the UI can mark a narrated headline. */
    source: 'headline' | 'chronicle' | 'notification';
    /** Urgent lines sort first within their day. */
    urgent?: boolean;
}

/** A button on a decision or the suggested move. */
export interface BriefAction {
    label: string;
    tone: 'accept' | 'decline' | 'open';
    /** Order to dispatch, if this button answers directly. */
    actionId?: string;
    payload?: Record<string, unknown>;
    /** Panel to open instead, for answers the brief cannot make inline. */
    openTab?: string;
    /** A first-week goal's deep link: a panel plus the planet or system it is about. */
    deepLink?: {
        tab: string;
        constructionPlanetId?: string;
        selectSystemId?: string;
        label: string;
    };
}

/** How long is left, in the units a player thinks in. */
export interface BriefDeadline {
    /** Sim clock instant the thing expires. */
    atSimSeconds: number;
    /** Real seconds from the moment the brief was built. Negative = expired. */
    realSecondsLeft: number;
    /** "3h 10m left", "expires today", "expired". */
    label: string;
}

export type BriefDecisionKind =
    | 'diplomacy'
    | 'gambit'
    | 'debate'
    | 'crisis'
    | 'secession'
    | 'corporate';

/** Something that will not resolve itself the way the player wants. */
export interface BriefDecision {
    id: string;
    kind: BriefDecisionKind;
    title: string;
    detail: string;
    deadline?: BriefDeadline;
    actions: BriefAction[];
    /**
     * The other empires involved, each as "<Empire> · played by <name>" or
     * "<Empire> · AI" (Item 6b): an offer from a friend reads differently
     * from an offer from the machine.
     */
    counterparts?: string[];
}

/** A message another player sent this empire since the last brief (Item 6c). */
export interface BriefMessage {
    id: string;
    fromFactionId: string;
    /** "<Empire> · played by <name>". */
    from: string;
    /** Plain text as the sender typed it. Render as text, never as markup. */
    body: string;
    /** ISO timestamp, real clock. */
    at: string;
}

/** The one thing worth doing today. */
export interface BriefSuggestion {
    id: string;
    title: string;
    detail: string;
    action: BriefAction;
    /** Present when the suggestion is a first-week goal: "Goal 2 of 5", 1/3 done. */
    goal?: { number: number; total: number; progress: number; target: number };
}

export interface DailyBrief {
    factionId: string;
    /** Real clock, when this brief was built. */
    generatedAt: string;
    /** Sim clock at the same moment. */
    nowSeconds: number;
    /** The window this brief covers, real clock. Null on a player's first one. */
    since: string | null;
    /** What other players wrote to this empire in that window, newest first. */
    messages: BriefMessage[];
    happened: BriefLine[];
    decisions: BriefDecision[];
    suggestion: BriefSuggestion | null;
    /** Real seconds until the next strategic tick. */
    nextTickInSeconds: number;
    /** Nothing to report and nothing waiting — the brief still opens, briefly. */
    empty: boolean;
}
