// lib/persistence/shard-privacy.ts
// The privacy boundary for faction shards.
//
// A shard row does double duty: it is the AUTHORITATIVE persistence of state the
// shared snapshot deliberately drops (cleanWorldForSave clears fleets, economy,
// tech, every espionage collection and recruitmentJobs), AND it is what the
// client polls. Those two jobs want opposite things — persistence wants
// everything, the wire wants almost nothing — and conflating them is how every
// player ended up holding every rival's spy roster.
//
// So the split is drawn HERE, at serve time, not in extractFactionShard:
//
//   DB row            complete, authoritative, never truncated
//   own shard    ->   scrubOwnerSecrets()   everything except what the design
//                                           hides from the owner themselves
//   rival shard  ->   projectPublicShard()  only what is needed to draw them
//
// Scrubbing at extraction time instead would corrupt the save. That is not
// hypothetical: the `accurate` strip used to live in extractFactionShard, so
// every worker restart reloaded the world with the truth flag gone from every
// intel report. It is applied below instead, and extractFactionShard now keeps
// the field.

/**
 * Fields a rival may see. Everything else in the shard is either asymmetric
 * (espionage), unread by any component (tech, planetaryLogistics), or private
 * economics (reserves, debt, infamy).
 *
 * `fleets` is here because the galaxy cannot be drawn without rivals' fleets —
 * GalaxyShell renders every fleet in the store and SystemContextPanel needs
 * them to offer an engagement. NOTE: they are still un-fogged; see the module
 * note at the bottom.
 */
const PUBLIC_ECONOMY_FIELDS = [
    'id',
    'name',
    'capitalSystemId',
    'theatreId',
    'civilizationId',
    'ideologyId',
] as const;

/** A rival's shard, reduced to what the UI actually reads for other factions. */
export function projectPublicShard(shard: any): any {
    if (!shard || typeof shard !== 'object') return shard;

    const economy = shard.economy && typeof shard.economy === 'object'
        ? Object.fromEntries(
            PUBLIC_ECONOMY_FIELDS
                .filter(k => shard.economy[k] !== undefined)
                .map(k => [k, shard.economy[k]])
        )
        : undefined;

    // Built by allow-list, never by deleting from a copy: a field added to the
    // shard later must be opted IN to the public payload, not remembered about.
    const out: any = { factionId: shard.factionId };
    if (shard.fleets) out.fleets = shard.fleets;
    if (economy) out.economy = economy;
    return out;
}

/**
 * The caller's OWN shard, minus the things the design hides from the owner too.
 *
 * Two contracts, both documented in lib/espionage/:
 *  - IntelReport.accurate — "Never expose `accurate` to the report's owner."
 *    A player who can read it has a free lie detector and counter-intelligence
 *    plants stop working.
 *  - SpyAgent compromised / turned — an asset that has been flipped is a malus
 *    its owner is not supposed to know about until counter-intel surfaces it.
 *    Shipping it means the owner reads their own mole list.
 */
export function scrubOwnerSecrets(shard: any): any {
    if (!shard || typeof shard !== 'object') return shard;
    const out = { ...shard };

    if (Array.isArray(out.espionageReports)) {
        out.espionageReports = out.espionageReports.map((report: any) => {
            if (!report || typeof report !== 'object') return report;
            const { accurate, ...rest } = report;
            return rest;
        });
    }

    if (Array.isArray(out.espionageAgents)) {
        out.espionageAgents = out.espionageAgents.map((agent: any) => {
            if (!agent || typeof agent !== 'object') return agent;
            const copy = { ...agent };
            if (Array.isArray(copy.traitIds)) {
                copy.traitIds = copy.traitIds.filter((t: string) => t !== 'compromised');
            }
            // 'turned' is [CLASSIFIED] per agent-types.ts — the owner still sees
            // an agent in the field, which is exactly the intended illusion.
            if (copy.status === 'turned') copy.status = 'active';
            return copy;
        });
    }

    return out;
}

/**
 * Serve-time projection for one shard row.
 * `isOwner` decides which of the two scrubs applies.
 */
export function projectShardForCaller(shardJson: string, isOwner: boolean): string {
    let parsed: any;
    try {
        parsed = JSON.parse(shardJson);
    } catch {
        // An unparseable row must not become a hole — serve nothing for it.
        return JSON.stringify({});
    }
    return JSON.stringify(isOwner ? scrubOwnerSecrets(parsed) : projectPublicShard(parsed));
}

// KNOWN GAP, deliberately not closed here: rivals' fleets are still sent
// un-fogged, and filtered by hooks/useGameSync.ts in the browser. Projecting
// them properly needs world.movement.factionVisibility, which means
// deserializing the world on every poll — the wrong shape for this route. The
// fix is a per-faction fleet endpoint following the app/api/game/piracy pattern,
// plus scrubbing factionVisibility itself out of the shared snapshot. Until then
// scan/survey mechanics remain readable from the network tab.
