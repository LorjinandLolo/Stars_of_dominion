// lib/titles/types.ts
// Seasons & Titles — Phase 0 data model (docs/season-title-system/README.md).
// The registry owns the catalog and the ledger; nothing in here ends the game.

export type TitleKind = 'earned' | 'held';
/**
 * Who can hold a title. Pirate organizations and charter companies are
 * first-class crown holders — a lane the Crimson Corsairs tax is a lane the
 * empire does not hold. Phase 2 evaluates factions first; the other two need
 * their metrics wired, not a schema change.
 */
export type TitleSubject = 'faction' | 'leader' | 'pirate_org' | 'company';

export interface TitleDefinition {
    id: string;                  // 'held_trade_dominance', 'earned_first_hegemon', ...
    kind: TitleKind;
    subject: TitleSubject;
    name: string;                // "Galactic Hegemon"
    description: string;
    /** Held titles: the metric that decides the holder (phase 2). */
    metricId?: string;
    /** Held titles: challenger must exceed holder by this fraction to take the crown. */
    challengeMargin?: number;
    /** Held titles: consecutive evaluations the margin must hold. */
    challengeDwell?: number;
    /** Earned titles: event predicate id fired via notifyTitleTrigger. */
    triggerId?: string;
    /**
     * Honour or disgrace. The ledger is append-only, so shame is exactly as
     * permanent as glory — a disgrace title is never revoked, only outlived.
     * Disgrace titles carry negative prestige.
     */
    valence?: 'honour' | 'disgrace';
    /** Prestige granted on award (earned) or per season held at close (held). */
    prestige: number;
    /**
     * Held titles: display-only decoration while the crown is held (map badge,
     * gazette masthead). Never a mechanical modifier — see invariant 3.
     */
    cosmetic?: { badge?: string; mastheadLine?: string };
    /**
     * 'unique'      — one award galaxy-wide, ever (feats, galactic firsts).
     * 'per_season'  — one per subject per season (season rank and endurance).
     * 'repeatable'  — one per subject, ever. Default.
     */
    uniqueness?: 'unique' | 'per_season' | 'repeatable';
}

export interface TitleAward {
    titleId: string;
    subjectId: string;           // factionId or leaderId
    /** Sim-clock seconds (world.nowSeconds). Never wall clock. */
    awardedAtSeconds: number;
    seasonNumber: number;
    /** Held titles only: when lost (null = currently held). */
    lostAtSeconds: number | null;
    /** Season-close snapshot flag: this hold was ratified into the permanent record. */
    ratified: boolean;
}

export type DefeatStatusLatch = 'ALIVE' | 'DYING' | 'ELIMINATED';

export interface TitleWorldState {
    /** titleId → current holder award (held titles only, phase 2). */
    currentHolders: Map<string, TitleAward>;
    /** Full append-only ledger, earned + historical holds. */
    ledger: TitleAward[];
    /** Held-title challenge progress: titleId → { challengerId, dwellCount }. */
    challenges: Map<string, { challengerId: string; dwellCount: number }>;
    /**
     * The declared exception to "held titles are pure functions of current
     * state": tallies the world does not otherwise keep. Keyed
     * `<counterId>|<subjectId>`. Season tallies are cleared at every close;
     * streak marks survive it. See lib/titles/metrics.ts.
     */
    seasonCounters: Map<string, number>;
    /**
     * How many consecutive season closes each subject has ratified a crown:
     * `<titleId>|<subjectId>` → count. Feeds Dynasty and Regicide.
     */
    crownTenure: Map<string, number>;
    /**
     * Defeat-status latch: factionId → last announced DefeatManager status.
     * Lives here because step20 owns both concerns; a status *transition*
     * fires exactly one notification, steady state fires nothing.
     */
    defeatStatuses: Map<string, DefeatStatusLatch>;
}
