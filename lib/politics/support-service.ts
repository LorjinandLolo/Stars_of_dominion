// lib/politics/support-service.ts
// Stars of Dominion — Diplomacy Phase 3: public support meters (design doc §5-§6).
//
// PURE MODULE: no world imports, no fs, no registries — callable from both the
// game-loop worker (to apply political consequences when an order executes)
// and the client panel (to preview support before committing). Both sides feed
// it the same inputs: the empire's internal blocs and a small context snapshot.
//
// Support is NOT general happiness: each bloc weighs a specific action through
// its own interests, then satisfaction colors how charitable it feels toward
// the government at all.

export type DiplomaticActionKind =
    | 'declare_war'
    | 'offer_peace'
    | 'tribute_demand'
    | 'trade_pact'
    | 'treaty'
    | 'break_treaty'
    | 'ultimatum'
    | 'accusation'
    | 'show_of_force'
    | 'sanctions';

export interface BlocSupportInput {
    id: string;          // 'military' | 'trade' | 'frontier' | 'science'
    name?: string;
    influence: number;   // share of 100
    satisfaction: number; // 0-100
}

export interface SupportContext {
    /** Global war exhaustion 0-100. */
    warFatigue: number;
    /** Tension with the action's target 0-100 (colors whether a war feels justified). */
    rivalryScore: number;
    /**
     * The government's public trust 0-100 (press system). A distrusted
     * government struggles to sell ANY initiative. Optional; 60 = neutral.
     */
    publicTrust?: number;
}

export type SupportBand = 'mandate' | 'supported' | 'divided' | 'unpopular' | 'opposition';

export interface BlocSupportResult {
    id: string;
    name: string;
    influence: number;
    stance: number;      // -1..1 after modifiers
    support: number;     // 0-100
}

export interface ActionSupportResult {
    kind: DiplomaticActionKind;
    total: number;       // 0-100, influence-weighted
    band: SupportBand;
    blocs: BlocSupportResult[];
}

// Base stances: how each bloc's interests read each action, before context.
// Blocs absent from a row read the action as neutral (0).
const BLOC_STANCES: Record<DiplomaticActionKind, Record<string, number>> = {
    declare_war:    { military: 0.8,  trade: -0.7, frontier: -0.3, science: -0.5, workers: -0.6, religious: 0.1,  environmentalists: -0.8, colonists: -0.2, alien_minorities: -0.5 },
    offer_peace:    { military: -0.4, trade: 0.8,  frontier: 0.4,  science: 0.6,  workers: 0.7,  religious: 0.2,  environmentalists: 0.9,  colonists: 0.4,  alien_minorities: 0.7  },
    tribute_demand: { military: 0.5,  trade: 0.4,  frontier: 0.0,  science: -0.3, workers: 0.1,  religious: 0.2,  environmentalists: -0.3, colonists: 0.2,  alien_minorities: -0.4 },
    trade_pact:     { military: -0.1, trade: 0.9,  frontier: 0.3,  science: 0.3,  workers: 0.4,  religious: 0.0,  environmentalists: -0.1, colonists: 0.5,  alien_minorities: 0.4  },
    treaty:         { military: -0.2, trade: 0.5,  frontier: 0.2,  science: 0.6,  workers: 0.4,  religious: 0.1,  environmentalists: 0.5,  colonists: 0.3,  alien_minorities: 0.6  },
    // Oathbreaking reads as sacrilege to the temples, betrayal to the minorities.
    break_treaty:   { military: 0.2,  trade: -0.6, frontier: -0.2, science: -0.5, workers: -0.3, religious: -0.4, environmentalists: -0.5, colonists: -0.2, alien_minorities: -0.4 },
    ultimatum:      { military: 0.6,  trade: -0.2, frontier: 0.0,  science: -0.4, workers: -0.4, religious: 0.2,  environmentalists: -0.5, colonists: 0.0,  alien_minorities: -0.4 },
    accusation:     { military: 0.3,  trade: -0.3, frontier: 0.0,  science: 0.2,  workers: 0.0,  religious: 0.3,  environmentalists: 0.1,  colonists: 0.0,  alien_minorities: -0.2 },
    show_of_force:  { military: 0.7,  trade: -0.4, frontier: 0.2,  science: -0.3, workers: -0.3, religious: 0.2,  environmentalists: -0.5, colonists: 0.2,  alien_minorities: -0.4 },
    // Merchants hate embargoes cutting into business; hawks like the pressure.
    sanctions:      { military: 0.4,  trade: -0.6, frontier: -0.1, science: 0.1,  workers: -0.3, religious: 0.1,  environmentalists: 0.2,  colonists: -0.2, alien_minorities: -0.3 },
};

/** Actions the population reads as belligerent (war fatigue sours them). */
const BELLIGERENT: Set<DiplomaticActionKind> = new Set(['declare_war', 'ultimatum', 'show_of_force', 'break_treaty']);

export function supportBand(total: number): SupportBand {
    if (total >= 80) return 'mandate';
    if (total >= 60) return 'supported';
    if (total >= 40) return 'divided';
    if (total >= 20) return 'unpopular';
    return 'opposition';
}

export const SUPPORT_BAND_LABELS: Record<SupportBand, string> = {
    mandate: 'Popular Mandate',
    supported: 'Broadly Supported',
    divided: 'Divided',
    unpopular: 'Unpopular',
    opposition: 'Strong Opposition',
};

/**
 * Compute per-bloc and total public support for a diplomatic action.
 */
export function computeActionSupport(
    blocs: BlocSupportInput[],
    kind: DiplomaticActionKind,
    ctx: SupportContext
): ActionSupportResult {
    const stances = BLOC_STANCES[kind] ?? {};
    const fatigue = Math.max(0, Math.min(100, ctx.warFatigue)) / 100;

    const results: BlocSupportResult[] = blocs.map(bloc => {
        let stance = stances[bloc.id] ?? 0;

        // A war against a hated rival feels justified; an unprovoked one doesn't.
        if (kind === 'declare_war') {
            if (ctx.rivalryScore >= 70) stance += 0.3;
            else if (ctx.rivalryScore < 40) stance -= 0.3;
        }
        // Exhausted populations sour on belligerence and crave peace.
        if (BELLIGERENT.has(kind)) stance -= fatigue * 0.8;
        if (kind === 'offer_peace') stance += fatigue * 0.8;

        stance = Math.max(-1, Math.min(1, stance));

        // Satisfied blocs extend the government goodwill; unhappy ones oppose
        // almost anything it proposes. A distrusted government (press system)
        // struggles to sell any initiative at all.
        const trustShift = ((ctx.publicTrust ?? 60) - 60) * 0.25;
        const support = Math.max(0, Math.min(100,
            50 + stance * 45 + (bloc.satisfaction - 50) * 0.3 + trustShift
        ));

        return {
            id: bloc.id,
            name: bloc.name ?? bloc.id,
            influence: bloc.influence,
            stance,
            support: Math.round(support),
        };
    });

    const totalInfluence = results.reduce((s, b) => s + b.influence, 0);
    const total = totalInfluence > 0
        ? Math.round(results.reduce((s, b) => s + b.support * b.influence, 0) / totalInfluence)
        : 50;

    return { kind, total, band: supportBand(total), blocs: results };
}
