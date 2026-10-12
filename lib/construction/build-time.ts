// lib/construction/build-time.ts
// How long a building takes, before speed modifiers. Client-safe: the worker's
// startConstruction and repairBuilding, the AI and the build pickers all read
// the same number.
//
// Until 2026-10-12 the authored buildTimeSeconds was used as-is. Shown in real
// time (the sim runs at 15x), that put every ordinary building at 14 seconds to
// 3 minutes regardless of tier, so a tier-4 drydock took about as long as a
// tier-1 mine. Now the tier sets the band and the authored time sets the order
// within it:
//
//   tier 1  x30   about 7–30 real minutes
//   tier 2  x60   about 30–80 real minutes
//   tier 3  x90   about 1.3–2.5 real hours
//   tier 4  x120  about 4–5.3 real hours
//
// A building authored with `buildTimeIsAbsolute` (the Great Archive, a set-piece
// megaproject) keeps its own time.

import type { BuildingDefinition } from './construction-types';

export const TIER_BUILD_TIME_MULTIPLIER: Readonly<Record<number, number>> = { 1: 30, 2: 60, 3: 90, 4: 120 };

type Timed = Pick<BuildingDefinition, 'buildTimeSeconds' | 'tier' | 'buildTimeIsAbsolute' | 'repairTimeSeconds'>;

/** Base build time in sim seconds, before construction-speed modifiers. */
export function baseBuildSeconds(def: Timed): number {
    if (def.buildTimeIsAbsolute) return def.buildTimeSeconds;
    const tier = Math.max(1, Math.min(4, Math.round(def.tier || 1)));
    return def.buildTimeSeconds * (TIER_BUILD_TIME_MULTIPLIER[tier] ?? 1);
}

/** Base repair time in sim seconds: the authored override, or half the build. */
export function baseRepairSeconds(def: Timed): number {
    return def.repairTimeSeconds ?? baseBuildSeconds(def) / 2;
}
