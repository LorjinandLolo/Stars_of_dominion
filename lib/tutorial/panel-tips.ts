// lib/tutorial/panel-tips.ts
// Stars of Dominion — one tip the first time each big panel opens.
//
// The tour shows where things are; the goals say what to do next. Neither
// says what a panel is FOR the first time a player lands in it, which is
// when the question comes up. Three lines each: what this is, the one rule
// that surprises people, where to look first. Shown once per player, whatever
// the device (remembered in uiPrefs.opened as `tip:<tab>`).
//
// Research has its own in-panel fork explainer (ResearchPanel), so it is not
// here. Pure data, safe in the client bundle.

export interface PanelTip {
    /** NavTab the tip belongs to. */
    tab: string;
    title: string;
    lines: string[];
    /** The guidebook chapter (lib/manual/manual-data.ts id) "Read more" opens. */
    manual: string;
}

export const PANEL_TIPS: readonly PanelTip[] = [
    {
        tab: 'government',
        manual: 'government',
        title: 'Governing',
        lines: [
            'Approval, legitimacy and cohesion decide whether your worlds follow you. Watch them here.',
            'Policies cost political capital, which refills with approval and legitimacy and has a ceiling. You hold three policy slots; a bill before the chamber takes one too.',
            'Your cabinet answers debates and defiance while you are away. Change that under Advisors.',
        ],
    },
    {
        tab: 'intelligence',
        manual: 'espionage',
        title: 'Espionage',
        lines: [
            'Agents build networks inside other empires; operations need a network deep enough to reach their target.',
            'Every operation leaves evidence. An exposed one becomes an incident between you and its victim.',
            'Case files are the other side: operations against you, and who the evidence points at. It is not always who it seems.',
        ],
    },
    {
        tab: 'economy',
        manual: 'economy',
        title: 'The economy',
        lines: [
            'Your worlds produce every cycle (24 minutes) and the state takes a share as taxes. The top bar is your treasury.',
            'A small share of factory output becomes Ammo and Materiel: attacks spend Ammo, every ship and army costs Materiel.',
            'Tariffs and subsidies here shape regional trade, for your own worlds and your neighbours.',
        ],
    },
    {
        tab: 'military',
        manual: 'fleets',
        title: 'Your forces',
        lines: [
            'Every fleet and army you have, where it is and what it is doing. Locate takes the camera there with it selected.',
            'Contacts lists foreign fleets inside your space; In production counts down what your yards are building.',
            'Click the pencil next to a name to rename a fleet or army.',
        ],
    },
    {
        tab: 'war',
        manual: 'ground',
        title: 'The war room',
        lines: [
            'Every battle your fleets fight shows here while it lasts: momentum, morale, and the button to break off.',
            'Declaring war costs political capital. Attacks spend Ammo from the top bar.',
            'A world falls on the ground, not in orbit: troops hold its strongpoints and capital while your fleet holds the sky.',
        ],
    },
    {
        tab: 'diplomacy',
        manual: 'diplomacy',
        title: 'Diplomacy',
        lines: [
            'Trust is earned slowly. Envoys open doors; pacts (non-aggression, defence, research, open borders) keep them open.',
            'Breaking a treaty or imposing sanctions costs political capital, and every empire hears about it.',
            'Proposals sent to you wait here and in your daily brief. Unanswered ones lapse.',
        ],
    },
    {
        tab: 'saga',
        manual: 'victory',
        title: 'Your saga',
        lines: [
            'What your empire has done, as history will tell it, and how close you are to each victory.',
            'Enlightenment is the peaceful victory: a content, stable empire of three or more worlds with a Great Archive, held for several days. Rivals will try to break it.',
            'Conquest means holding most of the galaxy. Both are tracked on this page.',
        ],
    },
    {
        tab: 'designer',
        manual: 'fleets',
        title: 'Ship designer',
        lines: [
            'A design is a hull plus modules. The price, power and build time update as you fit it.',
            'Bigger hulls need a bigger yard: your ground yard lays corvettes and destroyers, cruisers and battleships need the larger yards.',
            'A design in service is locked. To change ships already built, save a new design and refit them.',
        ],
    },
];

const BY_TAB = new Map(PANEL_TIPS.map(t => [t.tab, t]));

export function panelTipFor(tab: string): PanelTip | undefined {
    return BY_TAB.get(tab);
}

/** The uiPrefs.opened id that remembers a tip was dismissed. */
export function panelTipPrefId(tab: string): string {
    return `tip:${tab}`;
}
