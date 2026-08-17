// lib/factions/faction-traits-types.ts
// Per-faction bespoke mechanics — the state bag, and nothing else.
//
// Every civilization in players_describ/ has signature abilities that no generic
// system models: a mandatory ceasefire, a food-fuelled combat surge, a council of
// named champions, sovereign lending. Each lands in a DIFFERENT part of the
// engine — a tick step, an order gate, two combat sites, a diplomacy switch —
// so there is deliberately no trait framework here: no onTick/onCombatStart
// lifecycle, no registry, no plugin interface. Those four sites have nothing in
// common except needing somewhere to keep their numbers.
//
// What IS shared is this map, and that is worth paying for once. Adding a world
// field in this codebase means coordinated edits in several places at once
// (the singleton seed, the snapshot back-fill, sometimes cleanWorldForSave and
// the shard lists), and the failure mode when you miss one is silence — state
// that quietly resets on every save. Faction number two adds one optional
// sub-object below and one case in the dispatcher: no new world field, no new
// persistence edits, no new tick step.

/**
 * A standing retainer: someone pays the Kaer'Ruun to be on their side.
 *
 * Their primary economy — "If you want us, pay in skulls, spoils, or sacred
 * prey." Created by accepting a 'mercenary_contract' diplomatic offer.
 */
export interface MercenaryContract {
    id: string;
    /** Who is paying. */
    employerFactionId: string;
    /** The Kaer'Ruun faction being retained. */
    contractorFactionId: string;
    /** Optional: who they are hired against. Undefined = a general retainer. */
    againstFactionId?: string;
    /**
     * Reserve key, UPPERCASE. This matters: world.tributes is broken precisely
     * because it stores 'credits' while every reserve is keyed 'CREDITS', so the
     * transfer reads undefined on both sides and moves nothing.
     */
    resourceKey: string;
    /** Paid per strategic tick, from employer reserves to contractor reserves. */
    retainerPerTick: number;
    signedAtSeconds: number;
    expiresAtSeconds: number;
    status: 'active' | 'expired' | 'defaulted' | 'voided';
    /** Total actually transferred — the audit trail for the payout. */
    paidToDate: number;
}

/** Kaer'Ruun of Rrriiaa — stealth mercenaries bound by a sacred ceasefire. */
export interface KaerruunTraitState {
    /**
     * Bloodmoon cycle index whose onset has already been resolved. The window
     * itself is derived from world.nowSeconds (see isInBloodmoonCeasefire), not
     * stored — this latch exists only so the onset penalty fires once per cycle
     * rather than on all 288 fast cycles inside it.
     */
    lastResolvedCycle: number;
    /** True when the ceasefire opened while this faction was already at war. */
    inViolation: boolean;
    /** world.nowSeconds at the last evaluation. Guards against clock jumps. */
    lastEvaluatedSeconds: number;
    /** Lifetime count of ceasefires opened while at war. */
    violations: number;
    /** Lifetime count of ceasefires observed cleanly. */
    observed: number;
    /** Standing retainers, keyed by contract id. */
    contracts: Record<string, MercenaryContract>;
}

/** Sarrak of Gor'Zhul — serum-fuelled conquerors running on slave labour. */
export interface SarrakTraitState {
    /**
     * Sim-second the current Swamp Juice dose wears off; 0 when clean.
     * Absolute timestamps, never a countdown — a stored `ticksRemaining` is the
     * shape that rots. (world.propagandaCampaigns is decremented on every
     * strategic tick against a Map nothing ever writes to.)
     */
    serumEndsAtSeconds: number;
    /** Sim-second withdrawal ends. Between serumEndsAt and this, they suffer. */
    withdrawalEndsAtSeconds: number;
    /** Lifetime doses administered. */
    dosesTaken: number;
    /** Dose index whose withdrawal-onset penalty has already been applied. */
    lastResolvedEpisode: number;
    /**
     * Worlds taken by conquest and worked as slave colonies.
     * Hops from the capital are NOT stored — they are recomputed each tick,
     * because the capital and the lane graph outlive any snapshot of a number.
     */
    slaveWorlds: Record<string, { conqueredAtSeconds: number; previousOwnerId: string }>;
    /** world.nowSeconds at last evaluation. Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

/** The Buthari of Jabal — mountain mystics who never strike first. */
export interface ButhariTraitState {
    /**
     * Who has earned the right to be struck back at, and why.
     *
     * The Buthari cannot open hostilities; a grievance is what unlocks
     * retaliation against one specific faction. A plain Record, never a Map —
     * only the top-level world.factionTraits is rehydrated as a Map by the
     * snapshot pass, so a nested Map deserialises as a bare object and every
     * .get() on it silently returns undefined.
     */
    grievances: Record<string, { sinceSeconds: number; kind: 'attacked' | 'rite_violated' }>;
    /** Lifetime purity disputes, for the ledger. */
    purityDisputes: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
    /** The Council of Five: their cooldowns, and whatever they are still doing. */
    council: CouncilState;
}

/**
 * The Five, and the effects they leave behind.
 *
 * Every field is a plain Record of ABSOLUTE sim-seconds. No Maps — only the
 * top-level world.factionTraits is rehydrated as a Map by the snapshot pass, so
 * a nested Map deserialises as a bare object and every .get() on it silently
 * returns undefined. No countdowns either: a stored "ticks remaining" is the
 * shape that rots the moment a tick is missed.
 */
export interface CouncilState {
    /** championId -> sim-second that champion may next be called. */
    cooldowns: Record<string, number>;
    /** systemId -> sim-second Barra's veil lifts. Hidden from RIVALS. */
    cloakedSystems: Record<string, number>;
    /** systemId -> sim-second Rahla's sight fades. Revealed to the BUTHARI. */
    revealedSystems: Record<string, number>;
    /** planetId -> sim-second Zughra's fire burns out. Invaders bleed. */
    scorchedPlanets: Record<string, number>;
    /** Lifetime deployments, for the ledger. */
    deployments: number;
}

export function emptyCouncilState(): CouncilState {
    return { cooldowns: {}, cloakedSystems: {}, revealedSystems: {}, scorchedPlanets: {}, deployments: 0 };
}

/** A faction that has wronged you, and when. */
export interface Grievance {
    sinceSeconds: number;
    kind: 'attacked' | 'rite_violated';
}

/** Movanites of Graviton Vale — bureaucrats with a retaliation clause. */
export interface MovaniteTraitState {
    /**
     * Orders deferred by bureaucratic gridlock since the last tick, for the
     * ledger and the UI. Deferred, never DROPPED: the worker leaves them
     * `processed: false` so the next poll picks them up in the same FIFO order.
     */
    deferredLastTick: number;
    /** Lifetime orders delayed by subcommittee. */
    deferredTotal: number;
    /** Lifetime tick count spent under the FAFO clause. */
    fafoTicks: number;
    /** Sim-second the current emergency session (cap suspension) ends; 0 = none. */
    fafoUntilSeconds: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyMovaniteTraitState(): MovaniteTraitState {
    return {
        deferredLastTick: 0,
        deferredTotal: 0,
        fafoTicks: 0,
        fafoUntilSeconds: 0,
        lastEvaluatedSeconds: 0,
    };
}

/**
 * Leo-pantheri of Savarr'Tel — philosopher-duelists paid in their own word.
 *
 * Note what is NOT here: their honour score. It lives in world.reputation, which
 * is already persisted, already written by twenty diplomacy call sites and
 * already decayed every tick. A copy in this bag would be a second source of
 * truth that drifts the moment a treaty is signed on a tick this faction is not
 * evaluated. Only the ledger the UI reads lives here.
 */
export interface LeopantheriTraitState {
    /** Lifetime wars opened without a grievance to justify them. */
    unjustifiedWars: number;
    /** Lifetime underhanded orders issued. */
    honorBreaches: number;
    /** Honour at the last tick — for rendering a trend, never for logic. */
    honorAtLastTick: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyLeopantheriTraitState(): LeopantheriTraitState {
    return { unjustifiedWars: 0, honorBreaches: 0, honorAtLastTick: 50, lastEvaluatedSeconds: 0 };
}

/**
 * Rhimetals of Aeiralux — a hive collective governed through one node.
 *
 * Note what is NOT here: coherence itself. It is derived from gov.headOfStateId
 * and the leader's tookOfficeAtSeconds, both already maintained by the
 * succession system and already moved by the espionage catalog's
 * assassinate_head_of_state op. Storing it would be a second source of truth
 * that goes stale the moment a coup resolves on a tick this faction is skipped.
 */
export interface RhimetalTraitState {
    /** Whether the hive was frayed at the last tick — edge detection only. */
    frayed: boolean;
    /** Lifetime times the hive lost its node. */
    nodeCollapses: number;
    /** Lifetime wars they stepped into as arbiter. */
    correctionsOffered: number;
    /** Lifetime aggressive orders the collective held back to deliberate. */
    ordersDeliberated: number;
    /** Coherence at the last tick — for rendering a trend, never for logic. */
    coherenceAtLastTick: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyRhimetalTraitState(): RhimetalTraitState {
    return {
        frayed: false,
        nodeCollapses: 0,
        correctionsOffered: 0,
        ordersDeliberated: 0,
        coherenceAtLastTick: 1,
        lastEvaluatedSeconds: 0,
    };
}

/**
 * Gabagoonians of Meatballia Prima — momentum brawlers running on capacola.
 *
 * The cycle timestamps mirror the Sarrak serum's and share their comparison
 * logic (lib/factions/stimulant.ts), but `surgeIntensity` has no counterpart
 * there: the serum is a binary dose while capacola scales with how much is
 * eaten. It is stored rather than recomputed because it describes a serving
 * already swallowed — reading the reserve later would report what is in the
 * pantry now, not what went in.
 */
export interface GabagoonTraitState {
    /** Sim-second the surge ends; 0 when they have not eaten. */
    surgeEndsAtSeconds: number;
    /** Sim-second the crash ends. Always at or after surgeEndsAtSeconds. */
    crashEndsAtSeconds: number;
    /** 0..1, how large the current serving was. Cleared once the cycle lapses. */
    surgeIntensity: number;
    /** Lifetime surges. */
    surgesTaken: number;
    /** Lifetime capacola eaten, for the ledger. */
    capacolaConsumed: number;
    /** Lifetime vendettas declared over the broadcast. */
    vendettas: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyGabagoonTraitState(): GabagoonTraitState {
    return {
        surgeEndsAtSeconds: 0,
        crashEndsAtSeconds: 0,
        surgeIntensity: 0,
        surgesTaken: 0,
        capacolaConsumed: 0,
        vendettas: 0,
        lastEvaluatedSeconds: 0,
    };
}

/**
 * Nexulan Convergence — programmable matter with organic cores to feed.
 *
 * Note what is NOT here: the starvation level. It is derived from the live FOOD
 * reserve, which moves every tick from trade, production and upkeep, so a cached
 * copy would report last tick's pantry.
 */
export interface NexulanTraitState {
    /** Whether the cores were starving at the last tick — edge detection only. */
    starving: boolean;
    /** Lifetime ticks spent below the core biomass floor. */
    starvationTicks: number;
    /** Biomass at the last tick — for rendering a trend, never for logic. */
    biomassAtLastTick: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyNexulanTraitState(): NexulanTraitState {
    return { starving: false, starvationTicks: 0, biomassAtLastTick: 0, lastEvaluatedSeconds: 0 };
}

/**
 * A sovereign loan written by the Banking Clan.
 *
 * Absolute timestamps and an explicit outstanding balance, never a countdown —
 * the same discipline as every other faction's state here. Note `outstanding`
 * already includes the whole term's interest, computed once at issue: interest
 * that accrued per tick would compound silently against a player losing a war,
 * turning one bad loan from expensive into unrecoverable.
 */
export interface SovereignLoan {
    id: string;
    lenderFactionId: string;
    borrowerFactionId: string;
    /** What was actually advanced. */
    principal: number;
    /** Principal plus the full term's interest, less whatever has been paid. */
    outstanding: number;
    paymentPerTick: number;
    issuedAtSeconds: number;
    dueAtSeconds: number;
    /** CONSECUTIVE missed payments; reset by any full payment. */
    missedPayments: number;
    /** Running total actually received, for the audit trail. */
    collected: number;
    status: 'active' | 'repaid' | 'defaulted' | 'foreclosed';
}

/**
 * Intergalactic Banking Clan — a creditor republic.
 *
 * Note what is NOT here: the bad-debt ratio. It is derived from the loan book,
 * which is serviced every tick, so a cached copy would report last tick's paper.
 */
export interface BankingTraitState {
    /** The book, keyed by loan id. A plain Record — a nested Map would not survive a snapshot. */
    loans: Record<string, SovereignLoan>;
    loansIssued: number;
    loansRepaid: number;
    defaults: number;
    foreclosures: number;
    /** Lifetime credits actually received in service. */
    totalCollected: number;
    /** Book value at the last tick — for rendering a trend, never for logic. */
    outstandingAtLastTick: number;
    /** Clock-jump guard. */
    lastEvaluatedSeconds: number;
}

export function emptyBankingTraitState(): BankingTraitState {
    return {
        loans: {},
        loansIssued: 0,
        loansRepaid: 0,
        defaults: 0,
        foreclosures: 0,
        totalCollected: 0,
        outstandingAtLastTick: 0,
        lastEvaluatedSeconds: 0,
    };
}

export interface FactionTraitState {
    factionId: string;
    kaerruun?: KaerruunTraitState;
    sarrak?: SarrakTraitState;
    buthari?: ButhariTraitState;
    movanite?: MovaniteTraitState;
    leopantheri?: LeopantheriTraitState;
    rhimetals?: RhimetalTraitState;
    gabagoon?: GabagoonTraitState;
    nexulan?: NexulanTraitState;
    banking?: BankingTraitState;
    // The tenth and last friend faction fills the remaining slot.

    /**
     * Who has wronged this faction, and when — SHARED, not per-civilization.
     *
     * Promoted out of ButhariTraitState when the Movanite FAFO clause needed the
     * same thing. Two civilizations keying retaliation off two independent copies
     * of the same record, written by three separate call sites, is precisely the
     * duplication this codebase already suffers from.
     *
     * Read through grievanceHolders(), which back-fills from the old
     * buthari.grievances location so live snapshots heal without a world wipe.
     */
    grievances?: Record<string, Grievance>;
}

export function emptyButhariTraitState(): ButhariTraitState {
    return { grievances: {}, purityDisputes: 0, lastEvaluatedSeconds: 0, council: emptyCouncilState() };
}

/**
 * What a civilization does to one district battle.
 *
 * Lives here rather than in a faction module because more than one civilization
 * now supplies it and the dispatcher in traits-service must be able to name the
 * type without importing any single faction.
 *
 * `taken` exists separately from `dealt` because losses in the district layer
 * scale with the OPPONENT's strength — raising your own `dealt` does nothing for
 * your own casualties, so "tougher" has to be expressed as bleeding less.
 */
export interface DistrictTraitMultiplier {
    /** Scales the damage this side deals. */
    dealt: number;
    /**
     * Fraction of THIS side's just-suffered casualties dealt straight back into
     * the enemy formations in the same district, same cycle. The Infernoid
     * fireblood: their dead take yours with them.
     */
    detonation: number;
    /** Scales the casualties this side takes. */
    taken: number;
}

export const NEUTRAL_DISTRICT_TRAITS: DistrictTraitMultiplier = { dealt: 1, taken: 1, detonation: 0 };

export function emptySarrakTraitState(): SarrakTraitState {
    return {
        serumEndsAtSeconds: 0,
        withdrawalEndsAtSeconds: 0,
        dosesTaken: 0,
        lastResolvedEpisode: -1,
        slaveWorlds: {},
        lastEvaluatedSeconds: 0,
    };
}

export function emptyKaerruunTraitState(): KaerruunTraitState {
    return {
        lastResolvedCycle: -1,
        inViolation: false,
        lastEvaluatedSeconds: 0,
        violations: 0,
        observed: 0,
        contracts: {},
    };
}
