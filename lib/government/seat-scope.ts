// lib/government/seat-scope.ts
// Stars of Dominion — what a seated minister may order.
//
// A friend in the cabinet (prisma FactionSeat) issues the faction's own orders
// through the same queue the ruler uses; this table says which ones their
// brief covers. Pure data, shared by the order queue (server) and the client
// (greying out what a minister cannot do). No database, no world.
//
// Two rules:
//  1. The ruler keeps the sovereign verbs: declaring war, settling who runs
//     what (delegation, the advisors' desk, the cabinet itself), purging the
//     officer corps. A minister who wants those takes the throne the hard way
//     (lib/government/plots, later).
//  2. Everything else in a portfolio is the minister's to do, at the
//     faction's price. The treasury and the political capital are the
//     empire's, not theirs, exactly as for a real cabinet.

import type { CabinetPortfolio } from './types';

/** Orders no seat ever covers. */
export const SOVEREIGN_ONLY: ReadonlySet<string> = new Set([
    'DIP_DECLARE_WAR',
    'DIP_BREAK_TREATY',
    'GOV_SET_DELEGATION',
    'ADV_RESOLVE_PROPOSAL',
    'ADV_REVOKE_ALWAYS',
    'GOV_APPOINT_MINISTER',
    'GOV_DISMISS_MINISTER',
    'GOV_PURGE_OFFICERS',
    'GOV_SUPPRESS_SECESSION',
    'INTERNAL_PURGE_FACTION',
    'FACTION_JOIN',
    'PLANET_CLAIM',
]);

/**
 * Prefixes and ids per portfolio. A prefix matches `actionId.startsWith`;
 * an id matches exactly. Checked after SOVEREIGN_ONLY.
 */
const SCOPE: Record<CabinetPortfolio, { prefixes: string[]; ids: string[] }> = {
    defence: {
        prefixes: ['MIL_', 'AIR_', 'ORBITAL_', 'POW_'],
        ids: ['PLANET_RECRUIT_UNITS', 'PLANET_SET_GUN_TARGET', 'SHIP_DESIGN_SAVE', 'SHIP_DESIGN_DELETE', 'BUT_DEPLOY_CHAMPION', 'MIL_SET_GROUND_TACTIC', 'MIL_SET_GROUND_PREDICTION'],
    },
    economy: {
        prefixes: ['ECON_', 'CORP_', 'BNK_', 'INFRA_'],
        ids: ['PLANET_SET_SPECIALIZATION', 'PLANET_CLEAR_SPECIALIZATION', 'PLANET_SET_LOGISTICS_PRIORITY', 'CIV_SET_TRADE_ROUTE', 'GAB_CAPACOLA_SURGE'],
    },
    science: {
        prefixes: ['TECH_'],
        ids: ['PLANET_CONSTRUCT_BUILDING', 'PLANET_UPGRADE_BUILDING', 'PLANET_REPAIR_BUILDING', 'PLANET_DEMOLISH_BUILDING', 'SAR_ADMINISTER_SERUM'],
    },
    intelligence: {
        prefixes: ['ESP_'],
        ids: ['REB_CRACKDOWN', 'REB_SPONSOR_CELL', 'REB_CUT_SPONSORSHIP', 'PRESS_SUPPRESS_STORY', 'PRESS_TOGGLE_QUARANTINE', 'PRESS_TOGGLE_JAM'],
    },
    interior: {
        prefixes: ['PRESS_', 'DISCOURSE_', 'OUTPOST_', 'EXPLORE_'],
        ids: ['GOV_APPOINT_GOVERNOR', 'GOV_DECREE_POLICY', 'GOV_ENACT_POLICY', 'GOV_REPEAL_POLICY', 'GOV_RESOLVE_DEBATE', 'GOV_LOBBY_PARTY',
            'GOV_ANSWER_DEFIANCE', 'GOV_GRANT_CONCESSION', 'IDEO_ENACT_POLICY', 'CIV_FOUND_OUTPOST', 'PLANET_CONSTRUCT_BUILDING', 'LEADER_RECRUIT', 'LEADER_ASSIGN',
            'REB_SANCTUARY_ANSWER', 'REB_SANCTUARY_DEMAND'],
    },
    foreign: {
        prefixes: ['DIP_'],
        ids: ['PRESS_INFLUENCE_NARRATIVE'],
    },
};

/** May a minister in this portfolio issue this order? */
export function seatAllows(portfolio: string, actionId: string): boolean {
    if (SOVEREIGN_ONLY.has(actionId)) return false;
    const scope = SCOPE[portfolio as CabinetPortfolio];
    if (!scope) return false;
    // Every seat may conspire (lib/government/plots.ts); only a seat may.
    if (actionId.startsWith('PLOT_')) return true;
    return scope.ids.includes(actionId) || scope.prefixes.some(p => actionId.startsWith(p));
}

/** One line for a refusal. */
export function seatRefusal(portfolio: string, actionId: string): string {
    if (SOVEREIGN_ONLY.has(actionId)) return 'Only the head of state can order that.';
    return `That is outside the ${portfolio} brief.`;
}

export function isCabinetPortfolio(value: unknown): value is CabinetPortfolio {
    return typeof value === 'string' && value in SCOPE;
}
