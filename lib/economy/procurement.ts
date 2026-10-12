// lib/economy/procurement.ts
// War materiel: what the factories make, and what war spends.
//
// Until 2026-10-12 the ammo and military-goods chains turned most of a planet's
// metals into stock nobody used (~850k units piled up in a season soak), while
// the three orders priced in ammo (attack, bombard, invade) were silently free:
// no faction held an AMMO reserve, and an untracked reserve is never charged.
//
// Now the state procures a share of each tick's factory output into two
// national reserves, and war draws on them:
//   AMMO     — spent by MIL_ATTACK_FLEET, MIL_BOMBARD_PLANET, MIL_INVASION_PLANET
//              (prices in lib/actions/registry.ts, charged by chargeOrderCost).
//   MATERIEL — military goods; every ship and army costs some, in proportion to
//              its metals (materielFor), on top of credits and metals.
//
// Client-safe: the ship designer, the recruit panels and the top bar print the
// same numbers the worker charges.

/** Reserve key for military goods. Ammo uses the existing AMMO key. */
export const MATERIEL = 'MATERIEL' as const;
export const AMMO = 'AMMO' as const;

/** Materiel a war machine needs per unit of metal in it. A corvette (300 metals) needs 30. */
export const MATERIEL_PER_METAL = 0.1;

export function materielFor(metals: number): number {
    return Math.max(0, Math.round((Number(metals) || 0) * MATERIEL_PER_METAL));
}

/**
 * Share of each tick's ammo and military-goods output the state takes into its
 * reserves (the rest stays on the planet, tradeable). Raw factory output runs
 * at the same ~100x scale as raw extraction (see productionTaxRate), so this is
 * small: a capital-only empire procures a few hundred of each per real day
 * (scripts/economy-pace-probe.ts).
 */
export const PROCUREMENT_SHARE = 0.001;

/** What an empire holds before its factories have delivered anything. */
export const STARTING_AMMO = 500;
export const STARTING_MATERIEL = 400;

/** Planet stockpile key → national reserve key, for the goods the state procures. */
export const PROCURED_GOODS: ReadonlyArray<readonly [string, string]> = [
    ['ammo', AMMO],
    ['military', MATERIEL],
];

/** Add MATERIEL to a CREDITS/METALS price map (ships, armies, refits). Returns a new map. */
export function withMateriel<T extends Record<string, number>>(cost: T): T & { MATERIEL: number } {
    return { ...cost, MATERIEL: materielFor(cost.METALS ?? 0) };
}
