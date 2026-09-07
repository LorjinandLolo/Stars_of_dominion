// lib/tech/deed-metrics.ts
// The common-rules deeds every empire accrues, whoever it is.
//
// The history ledger (history-ledger.ts) counts what a faction has done so
// emergent technology can read it. Until now it counted only what a trigger
// happened to need, so an empire without bespoke mechanics had no saga at all
// — nothing charted, nothing settled, nothing signed. These are the metric
// names the event sources bump and the Saga tab reads, in one leaf so the two
// can never drift. Add a name here, bump it at its ONE source, and it appears
// in every empire's ledger with the label below.

export const DEED_SYSTEMS_SURVEYED = 'explore.systemsSurveyed';
export const DEED_COLONIES_FOUNDED = 'explore.coloniesFounded';
export const DEED_WARS_DECLARED = 'war.declared';
/** Pre-existing: counted on the target's ledger by DIP_DECLARE_WAR. */
export const DEED_WARS_DECLARED_ON_US = 'war.declaredAgainstUs';
export const DEED_TREATIES_SIGNED = 'dip.treatiesSigned';
export const DEED_FLEETS_DESTROYED = 'mil.fleetsDestroyed';
export const DEED_FLEETS_LOST = 'mil.fleetsLost';
/** Pre-existing: the capturePlanet path in the worker. */
export const DEED_PLANETS_CONQUERED = 'mil.planetsConquered';
/** Pre-existing: MIL_BOMBARD in the worker. */
export const DEED_BOMBARDMENTS = 'mil.bombardmentsConducted';
/** Pre-existing: espionage-service launchOperation. */
export const DEED_OPS_LAUNCHED = 'esp.opsLaunched';
/**
 * Pre-existing, on the TARGET's ledger, from two writers: espionage-service
 * when a catalog op against them is exposed, and the worker's blueprint-theft
 * handler on EVERY theft (by design, "theft is noticed by the people it is
 * done to"). So the honest label is "detected", not "exposed".
 */
export const DEED_OPS_DETECTED_AGAINST_US = 'esp.opsDetectedAgainstUs';
/** Pre-existing: lib/politics/debate-service.ts DEBATES_RESOLVED_METRIC (that module is not a leaf, so the literal lives here too). */
export const DEED_DEBATES_SETTLED = 'pol.debatesResolved';

export interface DeedDef {
    metric: string;
    /** Story-shaped, past tense, as the ledger reads it. */
    label: string;
}

/** Ledger order: exploration, then diplomacy, then war, then the quiet work. */
export const DEED_DEFS: readonly DeedDef[] = [
    { metric: DEED_SYSTEMS_SURVEYED, label: 'Systems charted' },
    { metric: DEED_COLONIES_FOUNDED, label: 'Worlds settled' },
    { metric: DEED_TREATIES_SIGNED, label: 'Treaties signed' },
    { metric: DEED_WARS_DECLARED, label: 'Wars declared' },
    { metric: DEED_WARS_DECLARED_ON_US, label: 'Wars declared on us' },
    { metric: DEED_FLEETS_DESTROYED, label: 'Enemy fleets destroyed' },
    { metric: DEED_FLEETS_LOST, label: 'Fleets lost' },
    { metric: DEED_PLANETS_CONQUERED, label: 'Worlds taken by force' },
    { metric: DEED_BOMBARDMENTS, label: 'Bombardments ordered' },
    { metric: DEED_OPS_LAUNCHED, label: 'Covert operations launched' },
    { metric: DEED_OPS_DETECTED_AGAINST_US, label: 'Enemy operations detected' },
    { metric: DEED_DEBATES_SETTLED, label: 'Debates settled' },
];
