// lib/government/defiance-types.ts
// Stars of Dominion — Government & Leadership, Phase 6.2 (the escalation ladder).
//
// Stage 3 of imperial collapse: a world stops merely resenting the centre and
// openly refuses it. A defiance event is a decision put to the player with a
// clock on it — ignoring it IS one of the answers, and it has consequences.

/** What the world is refusing to do. Chosen from whatever is driving it. */
export type DefianceKind =
    | 'tax_refusal'
    | 'policy_refusal'
    | 'conscription_refusal'
    | 'autonomy_demand'
    | 'garrison_standoff';

/** How the government answers. `ignore` is applied when the clock runs out. */
export type DefianceResponse =
    | 'negotiate'
    | 'bribe'
    | 'threaten'
    | 'replace_governor'
    | 'send_military'
    | 'ignore';

export interface DefianceOption {
    response: DefianceResponse;
    label: string;
    description: string;
    /** Political capital charged on use. */
    politicalCapital: number;
    /** Credits charged on use, if any. */
    credits: number;
    /** Whether the outcome is decided by a roll rather than being certain. */
    uncertain: boolean;
}

/**
 * The five answers, in the order the doc lists them. Costs live here so the
 * client can render them without importing the worker-side service.
 */
export const DEFIANCE_OPTIONS: DefianceOption[] = [
    {
        response: 'negotiate',
        label: 'Negotiate',
        description: 'Grant autonomy. The world stays, on looser terms — and the treasury feels it forever.',
        politicalCapital: 15,
        credits: 0,
        uncertain: false,
    },
    {
        response: 'bribe',
        label: 'Bribe',
        description: 'Fund local projects. Buys real goodwill with credits, and teaches the frontier that defiance pays.',
        politicalCapital: 5,
        credits: 4000,
        uncertain: false,
    },
    {
        response: 'threaten',
        label: 'Threaten',
        description: 'Demand compliance. Cheap when it works; it does not always work.',
        politicalCapital: 8,
        credits: 0,
        uncertain: true,
    },
    {
        response: 'replace_governor',
        label: 'Replace Governor',
        description: 'Install someone loyal. A popular governor does not go quietly.',
        politicalCapital: 12,
        credits: 0,
        uncertain: true,
    },
    {
        response: 'send_military',
        label: 'Send Military',
        description: 'Restore authority by force. It works on this world, and every other world is watching.',
        politicalCapital: 25,
        credits: 0,
        uncertain: false,
    },
];

export function defianceOption(response: DefianceResponse): DefianceOption | undefined {
    return DEFIANCE_OPTIONS.find(o => o.response === response);
}

export interface DefianceEvent {
    id: string;
    factionId: string;
    planetId: string;
    planetName: string;
    kind: DefianceKind;
    /** Headline, e.g. "Governor Tarek refuses the Imperial Tax Directive". */
    title: string;
    /** What the world is actually saying. */
    demand: string;
    /**
     * The cohesion drivers that produced this, captured when it opened — so the
     * player can always trace a crisis back to the decisions that caused it.
     */
    causes: string[];
    openedAtSeconds: number;
    /** When silence becomes an answer. */
    expiresAtSeconds: number;
    status: 'open' | 'resolved' | 'ignored';
    resolution?: DefianceResponse;
    /** What actually happened, once answered. */
    outcome?: string;
    resolvedAtSeconds?: number;
}

export const DEFIANCE_KIND_LABELS: Record<DefianceKind, string> = {
    tax_refusal: 'Tax Refusal',
    policy_refusal: 'Policy Refusal',
    conscription_refusal: 'Conscription Refusal',
    autonomy_demand: 'Autonomy Demand',
    garrison_standoff: 'Garrison Standoff',
};
