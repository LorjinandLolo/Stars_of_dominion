// lib/combat/war-status.ts
// Who is at war with whom, and whether a system is a battlefield right now.
// Tolerates partial worlds (test stubs with no rivalries or fleets).

/** Direct war is rivalry escalation level 7. */
export function areAtWar(world: any, factionA: string, factionB: string): boolean {
    if (!factionA || !factionB || factionA === factionB) return false;
    const rivalries = world?.rivalries;
    if (!rivalries?.get) return false;
    const rivalry = rivalries.get(`rivalry-${factionA}-${factionB}`) || rivalries.get(`rivalry-${factionB}-${factionA}`);
    return (rivalry?.escalationLevel || 0) >= 7;
}

/**
 * A system is contested for a faction while any fleet it is at war with is
 * holding there with strength left. Dock repair, and refit, need a quiet yard:
 * under power-vs-power damage a defender repairing 1-8% a cycle between rounds
 * would out-heal an equal attacker.
 */
export function isSystemContested(world: any, systemId: string | null | undefined, factionId: string): boolean {
    if (!systemId) return false;
    const fleets = world?.movement?.fleets;
    if (!fleets?.values) return false;
    for (const fleet of fleets.values()) {
        if (fleet.currentSystemId !== systemId || fleet.destinationSystemId) continue;
        if (fleet.factionId === factionId || !((fleet.strength ?? 1) > 0)) continue;
        if (areAtWar(world, factionId, fleet.factionId)) return true;
    }
    return false;
}
