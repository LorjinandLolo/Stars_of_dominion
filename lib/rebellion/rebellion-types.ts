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

import type { PirateBase } from '../piracy/piracy-types';

export type CellStatus = 'active' | 'dissolved' | 'crushed';

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
}

/** Political capital a crackdown costs: it is an act of state. Here so the page can show it. */
export const CRACKDOWN_CAPITAL = 10;
