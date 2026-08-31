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

/**
 * What the caller is entitled to see of the galaxy: systems they have scanned
 * or surveyed, and systems they are physically parked in. Built by the sync
 * route from the CALLER's own shard (`visibility` map + own fleet positions).
 */
export interface ViewerContext {
    /** systemId → revealStage ('pinged' | 'scanned' | 'surveyed'). */
    visibility: Record<string, string>;
    /** Systems where the viewer has a fleet — everything there is visible. */
    presenceSystems: Set<string>;
}

function fleetVisibleToViewer(fleet: any, viewer: ViewerContext): boolean {
    const sysId = fleet?.currentSystemId || fleet?.destinationSystemId;
    if (!sysId) return false;
    if (viewer.presenceSystems.has(sysId)) return true;
    const stage = viewer.visibility[sysId];
    return stage === 'scanned' || stage === 'surveyed';
}

/** A rival's shard, reduced to what the UI actually reads for other factions. */
export function projectPublicShard(shard: any, viewer?: ViewerContext): any {
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
    if (shard.fleets) {
        // Fog rival fleets server-side. Without a viewer context (no claim, or
        // the caller's shard is missing its visibility map) NOTHING is shown —
        // fail closed: the un-fogged version of this line is how every player's
        // fleet dispositions were readable from the network tab.
        out.fleets = viewer ? shard.fleets.filter((f: any) => fleetVisibleToViewer(f, viewer)) : [];
    }
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
 * `isOwner` decides which of the two scrubs applies; `viewer` (built from the
 * caller's own shard) fogs rival fleets.
 */
export function projectShardForCaller(shardJson: string, isOwner: boolean, viewer?: ViewerContext): string {
    let parsed: any;
    try {
        parsed = JSON.parse(shardJson);
    } catch {
        // An unparseable row must not become a hole — serve nothing for it.
        return JSON.stringify({});
    }
    return JSON.stringify(isOwner ? scrubOwnerSecrets(parsed) : projectPublicShard(parsed, viewer));
}

/**
 * Build the caller's ViewerContext from their own (parsed) shard: the compact
 * `visibility` map extractFactionShard stamps, plus fleet presence.
 */
export function viewerContextFromOwnShard(shardJson: string | null | undefined): ViewerContext | undefined {
    if (!shardJson) return undefined;
    let parsed: any;
    try {
        parsed = JSON.parse(shardJson);
    } catch {
        return undefined;
    }
    const visibility = (parsed?.visibility && typeof parsed.visibility === 'object') ? parsed.visibility : {};
    const presenceSystems = new Set<string>(
        Array.isArray(parsed?.fleets)
            ? parsed.fleets.map((f: any) => f?.currentSystemId).filter(Boolean)
            : []
    );
    return { visibility, presenceSystems };
}

// Remaining, smaller gap: the shared session snapshot still carries every
// faction's factionVisibility map (used by the client for its own fog), so a
// determined player can read WHERE rivals have scouted — but no longer what
// they field there. Scrubbing that needs a per-caller snapshot projection,
// which means parsing the multi-hundred-KB snapshot per poll; revisit alongside
// the delta-sync work.
