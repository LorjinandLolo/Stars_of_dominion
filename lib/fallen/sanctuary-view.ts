/**
 * lib/fallen/sanctuary-view.ts
 * Item 14f: the sanctuary desk on an empire's diplomacy page. Pure (the save
 * builds it for each faction's shard, like foreignCellsFor), so it must stay a
 * leaf: no services, no world mutation.
 *
 * The host sees what it was asked and what it shelters, who asked, and how
 * close a quiet shelter is to being found out. The conqueror sees only the
 * shelters it knows of (given openly, or a quiet one exposed), named as "the
 * exiled government of X": never a cell, never who leads it.
 */

import { SANCTUARY_DEMAND_COOLDOWN_SECONDS, sanctuaryKnown, type RebelCell, type SanctuaryDeskEntry } from '../rebellion/rebellion-types';
import { labelFor } from '../time/notification-names';

function exposureWord(evidence: number): string {
    return evidence >= 0.55 ? 'they are close to proving it'
        : evidence >= 0.25 ? 'there are whispers'
        : 'nobody suspects';
}

export function sanctuariesFor(world: any, factionId: string): SanctuaryDeskEntry[] {
    const out: SanctuaryDeskEntry[] = [];
    const cells: Iterable<RebelCell> = world?.rebellion?.cells?.values?.() ?? [];
    const now = Number(world?.nowSeconds ?? 0);
    for (const cell of cells) {
        const s = cell.exile?.sanctuary;
        if (!s || (s.status !== 'asked' && s.status !== 'given')) continue;
        const asHost = s.hostFactionId === factionId;
        const asConqueror = cell.hostFactionId === factionId && sanctuaryKnown(s);
        if (!asHost && !asConqueror) continue;
        const planet = s.planetId ? world?.construction?.planets?.get?.(s.planetId) : null;
        const cooling = s.lastDemandAtSeconds != null && now - s.lastDemandAtSeconds < SANCTUARY_DEMAND_COOLDOWN_SECONDS;
        out.push({
            id: s.id,
            role: asHost ? 'host' : 'conqueror',
            exileName: `the exiled government of ${cell.exile!.fromName}`,
            leaderName: asHost ? cell.seat?.displayName ?? null : null,
            conquerorId: cell.hostFactionId,
            conquerorName: labelFor(cell.hostFactionId),
            hostId: s.hostFactionId,
            hostName: labelFor(s.hostFactionId),
            planetName: planet?.name ?? null,
            mode: s.mode,
            status: s.status,
            exposure: asHost && s.mode === 'quiet' ? (s.exposedAtSeconds ? 'found out' : exposureWord(s.evidence)) : null,
            demandUntilSeconds: s.demand?.untilSeconds ?? null,
            canDemand: asHost ? null
                : s.demand ? { open: false, why: 'Our demand is waiting on their answer.' }
                : cooling ? { open: false, why: 'Too soon after the last demand.' }
                : { open: true, why: null },
        });
    }
    return out;
}
