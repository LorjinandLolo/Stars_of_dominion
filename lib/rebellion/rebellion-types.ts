/**
 * lib/rebellion/rebellion-types.ts
 * Rebel cells (spec Item 13, the Andor loop). Types only: the page imports
 * this, so it must stay a leaf.
 *
 * A cell is a political pirate band. It is NOT stored among the pirate
 * organizations: eleven pirate passes iterate that map (stages, raids,
 * demotion, dissolution, AI targeting) and would treat a cell as a raiding
 * band. Cells live in their own map and reuse the pirate pieces that fit: the
 * hideout is a PirateBase of kind 'safe_house' (concealment, who knows where
 * it is, who has compromised it), and 13b's sponsors will reuse Sponsorship.
 */

import type { PirateBase, Sponsorship } from '../piracy/piracy-types';

export type CellStatus = 'active' | 'dissolved' | 'crushed' | 'risen';

export interface RebelCell {
    id: string;
    /** What the cell calls itself ("the Aglate Free Hand"). */
    name: string;
    /** The world it belongs to, and that world's system and owner. */
    planetId: string;
    systemId: string;
    hostFactionId: string;
    /** The grievance it grew from: the most dissatisfied bloc on that world. */
    causeBlocId: string | null;
    cause: string;

    /** 0–100. How capable it is. Grows with grievance, falls with prosperity and crackdowns. */
    strength: number;
    /**
     * Members. Cells are compartmented: a captured member knows their own cell
     * and nothing of any other (Item 13, decision 6).
     */
    members: number;
    /** Grievance on its world when last measured, 0–100. */
    grievance: number;

    /** The hideout, on the pirate base model. Concealment decides how hard it is to find. */
    safeHouse: PirateBase;

    status: CellStatus;
    formedAtSeconds: number;
    endedAtSeconds?: number | null;
    /** Crackdowns that hit it. */
    crackdownsSurvived: number;
    /** Money the cell holds (13b): what heists bring in and sponsors pay. */
    treasury?: number;
    /** Acts committed (13b). */
    actsCommitted?: number;
    lastActAtSeconds?: number | null;
    // ─── 13c ───
    /** An informant inside it (a lead) until then: the next crackdown on its world knows where to look. */
    informedUntilSeconds?: number | null;
    /** The secession crisis it came into the open as (13c): it is a movement now. */
    crisisId?: string | null;
    movementAtSeconds?: number | null;
    /** When its last crisis ended without a state; it must wait again before it can rise. */
    lastCrisisEndedAtSeconds?: number | null;
    /** The breakaway state it became, when status is 'risen'. */
    breakawayFactionId?: string | null;
}

/** A security crackdown on one world (REB_CRACKDOWN). */
export interface Crackdown {
    planetId: string;
    hostFactionId: string;
    startedAtSeconds: number;
    /** No second crackdown on this world until then. */
    untilSeconds: number;
    cellsHit: number;
    cellsFound: number;
}

export interface RebellionState {
    cells: Map<string, RebelCell>;
    /** planetId → the latest crackdown there. */
    crackdowns: Map<string, Crackdown>;
    /** Who is paying which cell (13b). Stored in each sponsor's own shard. */
    sponsorships?: Map<string, CellSponsorship>;
    /** Client only: the foreign cells this player's service can see. */
    foreignView?: ForeignCellView[];
}

/** Political capital a crackdown costs: it is an act of state. Here so the page can show it. */
export const CRACKDOWN_CAPITAL = 10;

// ─── 13b: sponsors and acts ──────────────────────────────────────────────────

/** "no foreign hand": the suspect on a cell's file that means the cell acted alone. */
export const HOMEGROWN = 'homegrown';

export type CellActKind = 'heist' | 'sabotage' | 'propaganda' | 'prison_break' | 'assassination';

/**
 * An empire paying a cell in a rival's territory. The pirate Sponsorship
 * record, reused: organizationId is the cell's id, evidence accrues the same
 * way, and exposure rides the same ladder (exposureStep in sponsorship-service).
 */
export interface CellSponsorship extends Sponsorship {
    cellId: string;
    /** Weapons as well as money: stronger acts, faster evidence. */
    armed: boolean;
    /** Paid through a middleman: a captured member cannot name the sponsor; evidence builds at half speed; costs more. */
    cutout: boolean;
    /** An agent seconded to the cell: their face is the one a witness sees. */
    secondedAgentId?: string | null;
    creditsPaid: number;
    /** The sponsor's share of what heists took. */
    cutReceived: number;
    endedAtSeconds?: number | null;
    endReason?: 'cut' | 'lapsed' | 'cell_ended' | null;
}

/** What a foreign service sees of a cell it could sponsor. No sponsors, no truth. */
export interface ForeignCellView {
    id: string;
    name: string;
    planetId: string;
    planetName: string;
    systemId: string;
    hostFactionId: string;
    cause: string;
    strength: number;
    members: number;
    actsCommitted: number;
    /** Out in the open: a secession crisis carries its name (13c). */
    movement: boolean;
}

/** Credits per strategic tick (24 real minutes). Shared with the page. */
export const SPONSOR_FUND_PER_TICK = 300;
export const SPONSOR_ARM_PER_TICK = 200;
export const SPONSOR_CUTOUT_MULTIPLIER = 1.5;

export function sponsorshipCostPerTick(armed: boolean, cutout: boolean): number {
    return Math.round((SPONSOR_FUND_PER_TICK + (armed ? SPONSOR_ARM_PER_TICK : 0)) * (cutout ? SPONSOR_CUTOUT_MULTIPLIER : 1));
}
