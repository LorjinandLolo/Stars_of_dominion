// lib/titles/catalog.ts
// Seasons & Titles — the title catalog. Adding a title is adding an entry here;
// no scattered logic. Held-title entries arrive in phase 2.

import type { TitleDefinition } from './types';

// ─── Trigger ids ──────────────────────────────────────────────────────────────
// Systems call notifyTitleTrigger(TRIGGER.x, subjectId) at their existing
// announcement sites. A trigger with no catalog consumer is a no-op — safe to
// instrument ahead of the title existing.

export const TRIGGER = {
    /** Faction regained a planet after holding zero. */
    FACTION_REGAINED_LAST_PLANET: 'faction_regained_last_planet',
    /** Faction ended a civil war with no territorial loss. */
    CIVIL_WAR_SURVIVED_INTACT: 'civil_war_survived_intact',
    /** Faction dismantled a Stage III+ pirate organization. */
    PIRATE_ORG_DISMANTLED: 'pirate_org_stage3_dismantled',
    /** Won a war against a faction holding 2x its prestige at war start. */
    WAR_WON_AGAINST_GIANT: 'war_won_against_giant',
    /** Took a crown from a holder who had kept it two or more seasons. */
    CROWN_TAKEN_FROM_LONG_HOLDER: 'crown_taken_from_long_holder',
    /** Held the same crown across three consecutive season closes. */
    CROWN_HELD_THREE_SEASONS: 'crown_held_three_seasons',
    /** Ratified a crown in a season the faction started no war. */
    CROWN_WON_WITHOUT_WAR: 'crown_won_without_war',
    /** Broke a treaty inside one season of signing it. */
    TREATY_BROKEN_WITHIN_SEASON: 'treaty_broken_within_season',
    /** Annexed a third planet, all of them from factions in DYING status. */
    THIRD_PLANET_TAKEN_FROM_DYING: 'third_planet_taken_from_dying',

    // ── Leader epithets ──────────────────────────────────────────────────────
    /** Leader took head-of-state office via coup. */
    LEADER_TOOK_OFFICE_BY_COUP: 'leader_took_office_by_coup',
    /** Leader brokered three or more treaties. */
    LEADER_BROKERED_THREE_TREATIES: 'leader_brokered_three_treaties',
    /** Leader commanded a ground campaign that left mass unrest behind. */
    LEADER_GROUND_CAMPAIGN_UNREST: 'leader_ground_campaign_unrest',
    /** Spymaster leader whose operations were never attributed for a season. */
    LEADER_UNATTRIBUTED_SEASON: 'leader_unattributed_season',
    /** Leader assassinated while in office. Posthumous. */
    LEADER_ASSASSINATED_IN_OFFICE: 'leader_assassinated_in_office',
    /** Leader retook an occupied planet and returned it to its original owner. */
    LEADER_LIBERATED_PLANET: 'leader_liberated_planet',
} as const;

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** Held-title defaults. A challenger needs a clear lead, sustained. */
const CROWN_MARGIN = 0.10;
const CROWN_DWELL = 3;

function crown(
    id: string,
    name: string,
    description: string,
    metricId: string,
    badge: string,
    mastheadLine: string
): TitleDefinition {
    return {
        id, kind: 'held', subject: 'faction', name, description, metricId,
        challengeMargin: CROWN_MARGIN, challengeDwell: CROWN_DWELL,
        prestige: 15, cosmetic: { badge, mastheadLine },
    };
}

export const TITLE_CATALOG: Record<string, TitleDefinition> = {
    // ── Crowns ───────────────────────────────────────────────────────────────
    // Metrics deliberately measure different *ways of playing*, not one ladder
    // with seven rungs. A crown nobody can hold while warmongering is doing its
    // job; so is one a two-system minor can take off an empire.
    held_trade_dominance: crown(
        'held_trade_dominance', 'Dominant Trade Power',
        'Largest share of total trade-route flow.',
        'trade_flow_share', 'scales', 'the lanes answer to'),
    held_arsenal: crown(
        'held_arsenal', 'The Galactic Arsenal',
        'Greatest total fleet power in commission.',
        'fleet_power_total', 'anvil-and-star', 'the guns of'),
    held_tech_web: crown(
        'held_tech_web', 'Master of the Web',
        'Deepest technology base, weighted by what has diffused outward.',
        'tech_web_weight', 'lattice', 'the mind of'),
    held_open_hand: crown(
        'held_open_hand', 'The Open Hand',
        'Highest average planetary happiness across at least three worlds.',
        'avg_happiness', 'open-palm', 'the contented worlds of'),
    held_shadow_broker: crown(
        'held_shadow_broker', 'Shadow Broker',
        'Widest active espionage network reach.',
        'espionage_reach', 'unblinking-eye', 'whatever is known to'),
    // The one crown whose subject is not a state. A lane the Crimson Corsairs
    // tax is a lane the empire does not hold, and the board says so in public.
    held_scourge: {
        ...crown('held_scourge', 'Scourge of the Lanes',
            'Greatest pirate infamy.',
            'infamy', 'broken-chain', 'the terror of'),
        subject: 'pirate_org',
    },
    held_voice: crown(
        'held_voice', 'Voice of the Galaxy',
        'Highest press credibility multiplied by reach.',
        'press_reach', 'horn', 'as reported by'),

    // Geography, not size: two systems in the right place beat twenty in the
    // wrong one, and everyone resents whoever worked that out.
    held_warden_of_gates: crown(
        'held_warden_of_gates', 'Warden of the Gates',
        'Controls the most gate and chokepoint systems.',
        'chokepoint_control', 'portcullis', 'by leave of'),
    // The quiet economy: output, not turnover.
    held_anvil: crown(
        'held_anvil', 'The Anvil',
        'Largest share of galactic industrial output.',
        'industrial_share', 'hammer', 'forged by'),
    // Fragile by design — one opportunistic strike ends a three-season streak
    // in a headline, which is the entire point.
    held_long_peace: crown(
        'held_long_peace', 'Keeper of the Long Peace',
        'Longest unbroken streak without initiating a war.',
        'peace_streak_seconds', 'olive-branch', 'at peace under'),
    held_kingmaker: crown(
        'held_kingmaker', 'The Kingmaker',
        'Largest active diplomatic web, weighted by partner prestige.',
        'diplomatic_web_weight', 'knotted-cord', 'consulted first by'),
    held_speaker: crown(
        'held_speaker', 'Speaker of the Houses',
        'Highest average approval across all population blocs.',
        'bloc_approval_avg', 'assembly', 'with the consent of'),
    // You win this one by being useful to your rivals.
    held_free_port: crown(
        'held_free_port', 'The Free Port',
        'Most foreign trade volume moving through your territory.',
        'foreign_transit_volume', 'open-gate', 'through the ports of'),
    // The villain crown. Rolling season window, so it resets on its own.
    held_reapers_toll: crown(
        'held_reapers_toll', "The Reaper's Toll",
        'Most enemy fleet power destroyed this season.',
        'fleet_power_destroyed_season', 'scythe', 'paid in full to'),

    // Galactic firsts — migrated from MILESTONE_DEFINITIONS (lib/victory/
    // milestone-service.ts). Unique: one award galaxy-wide, ever.
    earned_first_hegemon: {
        id: 'earned_first_hegemon',
        kind: 'earned',
        subject: 'faction',
        name: 'Galactic Hegemon',
        description: 'First to control 10 star systems.',
        prestige: 25,
        uniqueness: 'unique',
    },
    earned_first_tycoon: {
        id: 'earned_first_tycoon',
        kind: 'earned',
        subject: 'faction',
        name: 'Economic Tycoon',
        description: 'First to reach 50,000 credits in reserves.',
        prestige: 25,
        uniqueness: 'unique',
    },
    earned_first_oracle: {
        id: 'earned_first_oracle',
        kind: 'earned',
        subject: 'faction',
        name: 'The Oracle',
        description: 'First to research 15 advanced technologies.',
        prestige: 25,
        uniqueness: 'unique',
    },
    earned_first_titan: {
        id: 'earned_first_titan',
        kind: 'earned',
        subject: 'faction',
        name: 'Military Titan',
        description: 'First to command a fleet with over 1500 total power.',
        prestige: 25,
        uniqueness: 'unique',
    },

    // Event-triggered achievements. Hooks land in later phases; the catalog and
    // trigger plumbing are ready now.
    earned_phoenix: {
        id: 'earned_phoenix',
        kind: 'earned',
        subject: 'faction',
        name: 'The Phoenix',
        description: 'Regained a homeworld after losing every planet.',
        triggerId: TRIGGER.FACTION_REGAINED_LAST_PLANET,
        prestige: 30,
    },
    earned_ironbound: {
        id: 'earned_ironbound',
        kind: 'earned',
        subject: 'faction',
        name: 'Ironbound',
        description: 'Survived a civil war without territorial loss.',
        triggerId: TRIGGER.CIVIL_WAR_SURVIVED_INTACT,
        prestige: 20,
    },
    earned_kingbreaker: {
        id: 'earned_kingbreaker',
        kind: 'earned',
        subject: 'faction',
        name: 'Kingbreaker',
        description: 'Dismantled a Stage III or greater pirate organization.',
        triggerId: TRIGGER.PIRATE_ORG_DISMANTLED,
        prestige: 20,
    },
    earned_giantslayer: {
        id: 'earned_giantslayer',
        kind: 'earned',
        subject: 'faction',
        name: 'Giantslayer',
        description: 'Won a war against a faction holding twice your prestige at war start.',
        triggerId: TRIGGER.WAR_WON_AGAINST_GIANT,
        prestige: 30,
    },
    // Regicide and Dynasty chase each other: the longer a crown is defended,
    // the richer taking it becomes.
    earned_regicide: {
        id: 'earned_regicide',
        kind: 'earned',
        subject: 'faction',
        name: 'Regicide',
        description: 'Took a crown from a holder who had kept it two or more seasons.',
        triggerId: TRIGGER.CROWN_TAKEN_FROM_LONG_HOLDER,
        prestige: 25,
    },
    earned_dynasty: {
        id: 'earned_dynasty',
        kind: 'earned',
        subject: 'faction',
        name: 'Dynasty',
        description: 'Held the same crown across three consecutive seasons.',
        triggerId: TRIGGER.CROWN_HELD_THREE_SEASONS,
        prestige: 30,
    },
    earned_silent_coup: {
        id: 'earned_silent_coup',
        kind: 'earned',
        subject: 'faction',
        name: 'The Silent Coup',
        description: 'Took a crown in a season without starting a single war.',
        triggerId: TRIGGER.CROWN_WON_WITHOUT_WAR,
        prestige: 20,
    },

    // ── Disgraces ────────────────────────────────────────────────────────────
    // The ledger is append-only, so these are permanent. That is the feature:
    // a reputation the press can reach for years later.
    earned_oathbreaker: {
        id: 'earned_oathbreaker',
        kind: 'earned',
        subject: 'faction',
        name: 'Oathbreaker',
        description: 'Broke a treaty within a season of signing it.',
        triggerId: TRIGGER.TREATY_BROKEN_WITHIN_SEASON,
        valence: 'disgrace',
        prestige: -15,
    },
    earned_vulture: {
        id: 'earned_vulture',
        kind: 'earned',
        subject: 'faction',
        name: 'The Vulture',
        description: 'Annexed three or more planets, every one of them from a dying faction.',
        triggerId: TRIGGER.THIRD_PLANET_TAKEN_FROM_DYING,
        valence: 'disgrace',
        prestige: -10,
    },

    // ── Leader epithets ──────────────────────────────────────────────────────
    epithet_usurper: {
        id: 'epithet_usurper',
        kind: 'earned',
        subject: 'leader',
        name: 'the Usurper',
        description: 'Took office via coup.',
        triggerId: TRIGGER.LEADER_TOOK_OFFICE_BY_COUP,
        prestige: 5,
    },
    epithet_silvertongue: {
        id: 'epithet_silvertongue',
        kind: 'earned',
        subject: 'leader',
        name: 'the Silvertongue',
        description: 'Brokered three or more treaties.',
        triggerId: TRIGGER.LEADER_BROKERED_THREE_TREATIES,
        prestige: 5,
    },
    epithet_butcher: {
        id: 'epithet_butcher',
        kind: 'earned',
        subject: 'leader',
        name: 'the Butcher',
        description: 'Ground campaigns that left mass unrest behind them.',
        triggerId: TRIGGER.LEADER_GROUND_CAMPAIGN_UNREST,
        valence: 'disgrace',
        prestige: -5,
    },
    epithet_grey_cardinal: {
        id: 'epithet_grey_cardinal',
        kind: 'earned',
        subject: 'leader',
        name: 'the Grey Cardinal',
        description: 'A spymaster whose operations were never once attributed.',
        triggerId: TRIGGER.LEADER_UNATTRIBUTED_SEASON,
        prestige: 10,
    },
    // Posthumous. The obituary pipeline carries it into faction lore.
    epithet_martyr: {
        id: 'epithet_martyr',
        kind: 'earned',
        subject: 'leader',
        name: 'the Martyr',
        description: 'Assassinated in office.',
        triggerId: TRIGGER.LEADER_ASSASSINATED_IN_OFFICE,
        prestige: 10,
    },
    epithet_liberator: {
        id: 'epithet_liberator',
        kind: 'earned',
        subject: 'leader',
        name: 'the Liberator',
        description: 'Retook an occupied planet and returned it to its original owner.',
        triggerId: TRIGGER.LEADER_LIBERATED_PLANET,
        prestige: 10,
    },

    // ── Awarded by the season closer ─────────────────────────────────────────
    // Rank titles are per-season and repeatable: you can be Grand Sovereign of
    // three seasons, and each is its own line in the record.
    season_grand_sovereign: {
        id: 'season_grand_sovereign', kind: 'earned', subject: 'faction',
        name: 'Grand Sovereign', description: 'Ranked first in the galaxy at a season close.',
        uniqueness: 'per_season', prestige: 40,
    },
    season_exarch: {
        id: 'season_exarch', kind: 'earned', subject: 'faction',
        name: 'Exarch', description: 'Ranked second in the galaxy at a season close.',
        uniqueness: 'per_season', prestige: 25,
    },
    season_legate: {
        id: 'season_legate', kind: 'earned', subject: 'faction',
        name: 'Legate', description: 'Ranked third in the galaxy at a season close.',
        uniqueness: 'per_season', prestige: 15,
    },
    // Endurance pool: awarded for holding up under the season's own modifiers,
    // which is a different question from who ended up on top.
    season_pioneer: {
        id: 'season_pioneer', kind: 'earned', subject: 'faction',
        name: 'Pioneer', description: 'Weathered a season of pressure and kept expanding.',
        uniqueness: 'per_season', prestige: 10,
    },
    season_merchant_prince: {
        id: 'season_merchant_prince', kind: 'earned', subject: 'faction',
        name: 'Merchant Prince', description: 'Held trade together through a season of pressure.',
        uniqueness: 'per_season', prestige: 10,
    },
    season_warlord: {
        id: 'season_warlord', kind: 'earned', subject: 'faction',
        name: 'Warlord', description: 'Held stability together through a season of escalation.',
        uniqueness: 'per_season', prestige: 10,
    },
    season_pathfinder: {
        id: 'season_pathfinder', kind: 'earned', subject: 'faction',
        name: 'Pathfinder', description: 'Kept the infrastructure standing through a season of flux.',
        uniqueness: 'per_season', prestige: 10,
    },
    season_chronicler: {
        id: 'season_chronicler', kind: 'earned', subject: 'faction',
        name: 'Chronicler', description: 'Came through a season of pressure on every front at once.',
        uniqueness: 'per_season', prestige: 10,
    },
};

/** Season-close rank titles, best first. Index = finishing position. */
export const SEASON_RANK_TITLES = [
    'season_grand_sovereign',
    'season_exarch',
    'season_legate',
] as const;

/** Endurance pool, indexed by how many modifiers the faction weathered. */
export const SEASON_ENDURANCE_TITLES = [
    'season_pioneer',
    'season_merchant_prince',
    'season_warlord',
    'season_pathfinder',
    'season_chronicler',
] as const;

// ─── Milestone-first evaluation table ─────────────────────────────────────────
// Threshold checks run in the tick (title-service.checkMilestoneFirsts).
// legacyId maps entries in the retired world.milestones map onto the registry.

export interface MilestoneFirstDef {
    titleId: string;
    legacyId: string;
    threshold: number;
    type: 'systems' | 'credits' | 'tech' | 'power';
}

export const MILESTONE_FIRSTS: MilestoneFirstDef[] = [
    { titleId: 'earned_first_hegemon', legacyId: 'HEGEMON_10_SYSTEMS', threshold: 10, type: 'systems' },
    { titleId: 'earned_first_tycoon', legacyId: 'TYCOON_50K_CREDITS', threshold: 50000, type: 'credits' },
    { titleId: 'earned_first_oracle', legacyId: 'ORACLE_15_TECHS', threshold: 15, type: 'tech' },
    { titleId: 'earned_first_titan', legacyId: 'TITAN_1500_POWER', threshold: 1500, type: 'power' },
];
