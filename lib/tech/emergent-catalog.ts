// lib/tech/emergent-catalog.ts
// Stars of Dominion — conduct-driven technology reveals.
//
// A trigger watches the History Ledger. When a faction's behaviour crosses a
// threshold, the institution that behaviour has effectively already built is
// revealed as a crash programme at half cost. Keep pushing past
// `grantAtMultiple` times the threshold and the theory catches up on its own.
//
// ── Catalog reveals vs standalone emergent techs ─────────────────────────────
// The design (docs/tech-web/systems.md §1.4) defines 15 triggers: 12 standalone
// `emg_` techs plus 3 reveals of ordinary catalog techs. The 12 standalone techs
// belong to the new technology web and are not authored in lib/tech/trees yet,
// so every trigger here is currently the *catalog reveal* kind — it points at a
// tech that exists today. The machinery is identical either way; when the web
// lands, its `emg_` entries drop straight into this table.
//
// Catalog techs are never auto-granted. Conduct earns a discount and the right
// to research, not the research itself — and a tech locked out by a mutually
// exclusive choice is never revealed at all.

import { registry } from './engine';
import './techData';

export interface EmergentCondition {
    metric: string;
    gte?: number;
    lte?: number;
}

export interface EmergentTrigger {
    /** Trigger id, distinct from the tech it reveals. */
    id: string;
    /** The tech revealed (or granted) when the conditions hold. */
    techId: string;
    /** Player-facing reason, shown in the notification. */
    narrative: string;
    /** Every condition must hold. */
    all: EmergentCondition[];
    /**
     * Multiple of each `gte` threshold at which conduct fully substitutes for
     * theory. Standalone emergent techs auto-grant here; catalog techs deepen
     * the discount instead. Default 2.
     */
    grantAtMultiple?: number;
    /**
     * True for dedicated `emg_` techs, which may be granted outright. Catalog
     * techs (everything today) stay research-only.
     */
    autoGrantable?: boolean;
    /**
     * Prerequisites conduct has substituted for. `true` waives all of them;
     * a list waives only those named. Without this a revealed Tier-3 tech is
     * still walled behind its whole chain and the crash programme is hollow.
     */
    waivePrerequisites?: boolean | string[];
}

export const REVEAL_DISCOUNT = 0.5;
export const DEEP_DISCOUNT = 0.25;

export const EMERGENT_TRIGGERS: EmergentTrigger[] = [
    {
        id: 'sabotage_cells.reveal',
        techId: 'esp_t3_5', // Sabotage Cells
        narrative: 'Our operatives have run enough clandestine work to formalise a sabotage doctrine.',
        all: [{ metric: 'esp.opsLaunched', gte: 8 }],
        waivePrerequisites: true,
    },
    {
        id: 'counter_prediction.reveal',
        techId: 'esp_t3_2', // Counter-Prediction AI
        narrative: 'Being read this often has taught our analysts how the reading is done.',
        all: [{ metric: 'esp.opsDetectedAgainstUs', gte: 5 }],
        waivePrerequisites: true,
    },
    {
        id: 'sustained_bombardment.reveal',
        techId: 'mil_t2_ovr_5', // Sustained Bombardment
        narrative: 'Our gunnery crews have spent long enough over hostile worlds to write the manual themselves.',
        all: [{ metric: 'mil.bombardmentsConducted', gte: 6 }],
    },
    {
        id: 'defensive_grid.reveal',
        techId: 'mil_t3_8', // Overextension Punishment
        narrative: 'Having been declared upon repeatedly, our staff has learned exactly how an overextended attacker breaks.',
        all: [{ metric: 'war.declaredAgainstUs', gte: 3 }],
    },
    {
        id: 'black_market.reveal',
        techId: 'eco_t3_6', // Black Market Operations
        narrative: 'Sustained trade under sanction has built an underworld we may as well institutionalise.',
        all: [{ metric: 'eco.sanctionedTicksStreak', gte: 12 }],
    },
    {
        id: 'commercial_influence.reveal',
        techId: 'eco_t2_trd_4', // Commercial Influence Networks
        narrative: 'Our chartered companies now carry more of the economy than the ministries do.',
        all: [{ metric: 'corp.activeCharters', gte: 3 }],
    },
    {
        id: 'trade_manipulation.reveal',
        techId: 'eco_t3_8', // Trade Route Manipulation
        narrative: 'A trade network this dense is an instrument of policy whether we intend it or not.',
        all: [{ metric: 'trade.activeRoutes', gte: 6 }],
    },
];

/** Triggers whose techId does not exist are a data bug, not a silent no-op. */
export function unknownTriggerTechIds(): string[] {
    return EMERGENT_TRIGGERS
        .filter(t => !registry.get(t.techId))
        .map(t => `${t.id} -> ${t.techId}`);
}

/** Every tech id reachable through the emergent catalog. */
export function emergentTechIds(): Set<string> {
    return new Set(EMERGENT_TRIGGERS.map(t => t.techId));
}
