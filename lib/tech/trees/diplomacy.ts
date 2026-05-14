import { Tech, TechTreeType, TechTier, TechEffectType, SeasonScoreCategory } from '../types';

export const diplomacyTree: Tech[] = [
    // ============================================
    // TIER 1 - EXPANSION: BASIC DIPLOMACY TOOLS
    // Theme: "I can interact with others"
    // ============================================
    {
        id: 'dip_t1_1', name: 'Basic Diplomatic Channels',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Establish standard communication protocols for interacting with rival empires.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 0, y: 0 },
        unlockFlags: ['UNLOCK_DIPLOMACY_UI'],
        mechanicalEffect: 'Unlock player-to-player diplomacy interface.',
        tags: ['diplomacy', 'comms'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_2', name: 'Trade Agreements I',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Draft the legal frameworks required for basic exchange of goods and currency.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.TRADE, SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Enables simple bilateral trade deals.',
        tags: ['diplomacy', 'trade'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_3', name: 'Non-Aggression Pacts',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Formalize temporary ceasefire agreements with verifiable border boundaries.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE],
        position: { x: 4, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Enables temporary peace agreements that penalize the aggressor if broken.',
        tags: ['diplomacy', 'treaty'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_4', name: 'Reputation Tracking',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Quantify trust using an inter-faction ledger of kept and broken promises.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 6, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Displays a visible trust/reputation score for all known factions.',
        tags: ['diplomacy', 'intel'], aiTags: ['intel']
    },
    {
        id: 'dip_t1_5', name: 'Envoy Deployment',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Train specialized ambassadors to represent your interests in foreign courts.',
        effects: [{ type: TechEffectType.UNLOCK_ACTION, targetSystem: 'actions', modifierKey: 'deploy_envoy', value: 1 }],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.ALLIANCE],
        position: { x: 8, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Assign envoys to other players to slowly generate Influence and Trust.',
        tags: ['diplomacy', 'agents'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_6', name: 'Shared Intelligence I',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Establish secure channels to selectively share sensor data with trusted allies.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.ALLIANCE],
        position: { x: 10, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Allows limited intel sharing between allies (e.g. sharing adjacent system vision).',
        tags: ['diplomacy', 'intel'], aiTags: ['intel']
    },
    {
        id: 'dip_t1_7', name: 'Influence Points System',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Formalize political capital into a quantifiable and spendable resource.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 12, y: 0 },
        unlockFlags: ['ENABLE_INFLUENCE_CURRENCY'],
        mechanicalEffect: 'Unlocks Influence Points as a currency for advanced diplomatic actions.',
        tags: ['diplomacy', 'economy'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_8', name: 'Message Framing Tools',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'Employ algorithmic sentiment analysis to perfectly phrase diplomatic proposals.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 14, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Slight boost to AI persuasion success and AI acceptance of treaties.',
        tags: ['diplomacy', 'comms'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t1_9', name: 'Treaty Logging System',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'An immutable blockchain ledger recording every diplomatic promise made.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.ALLIANCE],
        position: { x: 16, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Track past agreements and betrayals. Makes breaking treaties generate greater penalties.',
        tags: ['diplomacy', 'infrastructure'], aiTags: ['defense']
    },
    {
        id: 'dip_t1_10', name: 'Diplomatic Overview UI',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.EXPANSION, branch: 'basic_diplomacy',
        description: 'A comprehensive dashboard showing the tangled web of galactic relations.',
        effects: [],
        prerequisites: [], researchCost: 40,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 18, y: 0 },
        unlockFlags: ['UNLOCK_DIPLOMACY_DASHBOARD'],
        mechanicalEffect: 'Centralized diplomacy dashboard displaying all alliances and wars globally.',
        tags: ['diplomacy', 'intel'], aiTags: ['intel']
    },

    // ============================================
    // TIER 2 - SPECIALIZATION: DIPLOMATIC IDENTITY
    // Theme: "How do I deal with others?"
    // ============================================
    // PATH A: ALLIANCE LEADERSHIP (Cooperation & Trust)
    {
        id: 'dip_t2_all_1', name: 'Coalition Frameworks',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'alliance_leadership',
        description: 'Draft the foundation for multi-faction alliances and joint military commands.',
        effects: [],
        prerequisites: ['dip_t1_1'], researchCost: 150,
        mutuallyExclusiveGroup: 'diplomacy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.INFLUENCE],
        position: { x: 0, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks multi-faction Coalitions. Alliance = stable but predictable. Locks out Manipulator and Opportunist paths early.',
        tags: ['diplomacy', 'alliance'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t2_all_2', name: 'Defensive Pact Networks',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'alliance_leadership',
        description: 'An attack on one is an attack on all.',
        effects: [],
        prerequisites: ['dip_t2_all_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Defensive pacts generate passive Influence and reduce military upkeep for all members.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },
    {
        id: 'dip_t2_all_3', name: 'Alliance Stability Protocols',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'alliance_leadership',
        description: 'Establish joint arbitration boards to peacefully resolve disputes between allies.',
        effects: [],
        prerequisites: ['dip_t2_all_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.STABILITY],
        position: { x: 4, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Allies cannot easily break treaties with you without suffering massive planetary unrest.',
        tags: ['diplomacy', 'treaty'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t2_all_4', name: 'Shared Resource Agreements',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'alliance_leadership',
        description: 'Integrate civilian economies to buffer against resource shortages.',
        effects: [],
        prerequisites: ['dip_t2_all_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.WEALTH],
        position: { x: 1, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Automatically cover allied resource deficits at a reduced cost.',
        tags: ['diplomacy', 'economy'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t2_all_5', name: 'Trust Reinforcement Systems',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'alliance_leadership',
        description: 'Continuous cultural exchange programs to ensure populations view each other favorably.',
        effects: [],
        prerequisites: ['dip_t2_all_1', 'dip_t2_all_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.POPULATION],
        position: { x: 3, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Max Trust cap is increased. High Trust yields scaling bonuses to Trade and Science.',
        tags: ['diplomacy', 'culture'], aiTags: ['diplomacy']
    },

    // PATH B: SHADOW POLITICS (Control through deception & pressure)
    {
        id: 'dip_t2_man_1', name: 'Coercive Diplomacy',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'shadow_politics',
        description: 'Diplomacy is just war by other means. Use fleet positioning to force treaty acceptance.',
        effects: [],
        prerequisites: ['dip_t1_8'], researchCost: 150,
        mutuallyExclusiveGroup: 'diplomacy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.MILITARY],
        position: { x: 6, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Significantly boosts negotiation leverage based on relative fleet power. Locks out Alliance and Opportunist paths early.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },
    {
        id: 'dip_t2_man_2', name: 'Hidden Agenda Negotiation',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'shadow_politics',
        description: 'Embed secondary clauses in treaties that benefit you covertly.',
        effects: [],
        prerequisites: ['dip_t2_man_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.DISRUPTION],
        position: { x: 8, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Siphon a small amount of resources/credits from any active treaty without the partner knowing.',
        tags: ['diplomacy', 'covert'], aiTags: ['offensive']
    },
    {
        id: 'dip_t2_man_3', name: 'Threat-Based Bargaining',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'shadow_politics',
        description: 'Issue public ultimatums. Submit, or burn.',
        effects: [],
        prerequisites: ['dip_t2_man_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.INFLUENCE],
        position: { x: 10, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks Ultimatum action. Gain massive short-term concessions at the cost of permanent reputation damage.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },
    {
        id: 'dip_t2_man_4', name: 'Reputation Masking',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'shadow_politics',
        description: 'Use propaganda to scrub records of your past betrayals.',
        effects: [],
        prerequisites: ['dip_t2_man_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 7, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Reputation recovers much faster after breaking treaties or betraying allies.',
        tags: ['diplomacy', 'propaganda'], aiTags: ['defense']
    },
    {
        id: 'dip_t2_man_5', name: 'Conditional Alliances',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'shadow_politics',
        description: 'Alliances with built-in exit clauses triggering the moment you are no longer benefiting.',
        effects: [],
        prerequisites: ['dip_t2_man_1', 'dip_t2_man_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.ALLIANCE],
        position: { x: 9, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'You suffer zero penalties for breaking an alliance if your partner is losing a war.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },

    // PATH C: LONE POWER BROKER (Flexible, self-serving)
    {
        id: 'dip_t2_opp_1', name: 'Dynamic Treaty Switching',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'lone_power_broker',
        description: 'Loyalty is an anchor. Maintain the agility to ally with whoever is currently winning.',
        effects: [],
        prerequisites: ['dip_t1_9'], researchCost: 150,
        mutuallyExclusiveGroup: 'diplomacy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 12, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces the cooldown and cost of proposing/breaking treaties. Locks out Alliance and Manipulator paths early.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },
    {
        id: 'dip_t2_opp_2', name: 'Short-Term Contracts',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'lone_power_broker',
        description: 'Engage in mercenary diplomacy. Aid is provided for a set number of turns, no questions asked.',
        effects: [],
        prerequisites: ['dip_t2_opp_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE],
        position: { x: 14, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks fixed-duration alliances that automatically expire without penalty.',
        tags: ['diplomacy', 'treaty'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t2_opp_3', name: 'Opportunistic Trade Deals',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'lone_power_broker',
        description: 'Capitalize on others’ crises by price-gouging essential resources.',
        effects: [],
        prerequisites: ['dip_t2_opp_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.TRADE],
        position: { x: 16, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Selling resources to factions at war yields +50% credit returns.',
        tags: ['diplomacy', 'trade'], aiTags: ['economy']
    },
    {
        id: 'dip_t2_opp_4', name: 'Rapid Alignment Shifts',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'lone_power_broker',
        description: 'Instantly re-brand your faction’s ideology to match a new powerful neighbor.',
        effects: [],
        prerequisites: ['dip_t2_opp_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.STABILITY],
        position: { x: 13, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Action to instantly reset negative diplomatic modifiers with a single AI faction.',
        tags: ['diplomacy', 'culture'], aiTags: ['defense']
    },
    {
        id: 'dip_t2_opp_5', name: 'Exit Strategy Protocols',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.SPECIALIZATION, branch: 'lone_power_broker',
        description: 'Always have a bag packed and a hyper-lane mapped out when things go south.',
        effects: [],
        prerequisites: ['dip_t2_opp_1', 'dip_t2_opp_3'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.INFLUENCE],
        position: { x: 15, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'If an ally is attacked, you can instantly break the alliance and gain temporary stealth.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },

    // ============================================
    // TIER 3 - DOMINANCE: DIPLOMATIC LEVERAGE
    // Theme: "Control the diplomatic landscape"
    // ============================================
    {
        id: 'dip_t3_1', name: 'Sanction Systems',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Weaponize the galactic market to embargo and penalize specific rivals.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.TRADE],
        position: { x: 0, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Penalize targeted players economically, reducing their trade efficiency globally.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },
    {
        id: 'dip_t3_2', name: 'Coalition Enforcement',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Legally bind multiple factions into a coordinated strike against a common threat.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Coordinate multiple AI/Players to declare war simultaneously on a single target.',
        tags: ['diplomacy', 'alliance'], aiTags: ['offensive']
    },
    {
        id: 'dip_t3_3', name: 'Reputation Warfare',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Sponsor galactic news networks to paint your enemies as war criminals.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.INFLUENCE],
        position: { x: 4, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Damage an enemy’s global reputation, making AIs refuse to trade with them.',
        tags: ['diplomacy', 'propaganda'], aiTags: ['offensive']
    },
    {
        id: 'dip_t3_4', name: 'Diplomatic Immunity',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Your political leverage is so vast that international law no longer applies to you.',
        effects: [],
        prerequisites: [], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 6, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces reputation penalties for aggressive actions (unjustified wars, bombardment) by 75%.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },
    {
        id: 'dip_t3_5', name: 'Forced Mediation',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Intervene in foreign conflicts, forcing a ceasefire through sheer political weight.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.STABILITY],
        position: { x: 8, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Force a white peace between two other factions at war.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    },
    {
        id: 'dip_t3_6', name: 'Influence Overload',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Flood a negotiation with so much political capital the opponent cannot refuse.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.ALLIANCE],
        position: { x: 10, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Spend massive Influence to guarantee a 100% success rate on any single diplomatic proposal.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },
    {
        id: 'dip_t3_7', name: 'Alliance Disruption',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Sow discord and paranoia to shatter enemy coalitions from the inside.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.ALLIANCE],
        position: { x: 12, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Break or weaken enemy alliances, severely reducing their Trust scores with each other.',
        tags: ['diplomacy', 'covert'], aiTags: ['offensive']
    },
    {
        id: 'dip_t3_8', name: 'Global Messaging Networks',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'A monopoly on interstellar communications, allowing you to shape the galactic narrative.',
        effects: [],
        prerequisites: [], researchCost: 450,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 14, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Broadcast influence to all players simultaneously, generating passive Influence points per turn.',
        tags: ['diplomacy', 'propaganda'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t3_9', name: 'Favor Trading Systems',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Standardize the exchange of political favors, treating them as hard currency.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.WEALTH],
        position: { x: 16, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Exchange Influence points directly for resources, ships, or AI actions.',
        tags: ['diplomacy', 'economy'], aiTags: ['diplomacy']
    },
    {
        id: 'dip_t3_10', name: 'Political Leverage Mechanics',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.DOMINANCE, branch: 'diplomatic_leverage',
        description: 'Exploit the geopolitical landscape, taxing those with lower standing than you.',
        effects: [],
        prerequisites: [], researchCost: 500,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.WEALTH],
        position: { x: 18, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Gain passive advantages (cheaper treaties, better trade) against any faction with a lower Reputation than yours.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },

    // ============================================
    // TIER 4 - TRANSFORMATION: DIPLOMATIC IDENTITY
    // Theme: "What kind of political force are you?"
    // ============================================
    
    // PATH A: COALITION OVERLORD (Stability & Alliances)
    {
        id: 'dip_t4_coa_1', name: 'Coalition Overlord',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'coalition_overlord',
        description: 'I unite the galaxy under my leadership. Peace through superior coordination.',
        effects: [],
        prerequisites: ['dip_t3_2'], researchCost: 1000,
        mutuallyExclusiveGroup: 'diplomacy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.ALLIANCE, SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DIPLOMACY'],
        mechanicalEffect: 'Grants immense alliance bonuses and coalition-wide coordination. Trade-off: Highly visible, cannot declare surprise wars, and devastatingly vulnerable to betrayal from within.',
        tags: ['diplomacy', 'alliance', 'global_alert'], aiTags: ['defense']
    },
    {
        id: 'dip_t4_coa_2', name: 'United Front Doctrine',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'coalition_overlord',
        description: 'An attack on one member of the Coalition triggers an automatic, unified response.',
        effects: [],
        prerequisites: ['dip_t4_coa_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.ALLIANCE],
        position: { x: 1, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Allies automatically join your defensive wars without costing Influence.',
        tags: ['diplomacy', 'alliance'], aiTags: ['defense']
    },
    {
        id: 'dip_t4_coa_3', name: 'Hegemonic Integration',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'coalition_overlord',
        description: 'Lesser members of the Coalition eventually dissolve their borders into yours.',
        effects: [],
        prerequisites: ['dip_t4_coa_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.TERRITORY, SeasonScoreCategory.INFLUENCE],
        position: { x: 3, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'AI allies with 100 Trust can be peacefully annexed into your empire.',
        tags: ['diplomacy', 'alliance'], aiTags: ['diplomacy']
    },

    // PATH B: GALACTIC SHADOW BROKER (Hidden Manipulation)
    {
        id: 'dip_t4_shd_1', name: 'Galactic Shadow Broker',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'galactic_shadow_broker',
        description: 'I control everything without being seen. The true throne is always in the shadows.',
        effects: [],
        prerequisites: ['dip_t3_7'], researchCost: 1000,
        mutuallyExclusiveGroup: 'diplomacy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.INTEL],
        position: { x: 9, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DIPLOMACY'],
        mechanicalEffect: 'Enables secret deals, hidden influence, and behind-the-scenes manipulation of outcomes. Trade-off: Extremely weak if exposed. Relies entirely on secrecy; direct combat stats are reduced.',
        tags: ['diplomacy', 'covert', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'dip_t4_shd_2', name: 'Master of Puppets',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'galactic_shadow_broker',
        description: 'Manipulate AI factions into fighting your wars for you.',
        effects: [],
        prerequisites: ['dip_t4_shd_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.MILITARY],
        position: { x: 8, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Force two AI factions into war with each other, keeping your own hands clean.',
        tags: ['diplomacy', 'coercion'], aiTags: ['offensive']
    },
    {
        id: 'dip_t4_shd_3', name: 'Unseen Hand',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'galactic_shadow_broker',
        description: 'Your diplomatic actions leave no trace. Your assassinations look like accidents.',
        effects: [],
        prerequisites: ['dip_t4_shd_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.STABILITY],
        position: { x: 10, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Hostile espionage and diplomatic actions generate zero Reputation penalty.',
        tags: ['diplomacy', 'covert'], aiTags: ['defense']
    },

    // PATH C: UNBOUND SOVEREIGNTY (Independent Dominance)
    {
        id: 'dip_t4_lon_1', name: 'Unbound Sovereignty',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'unbound_sovereignty',
        description: 'I don’t need allies—I control outcomes myself. I am the fulcrum on which the galaxy balances.',
        effects: [],
        prerequisites: ['dip_t3_10'], researchCost: 1000,
        mutuallyExclusiveGroup: 'diplomacy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.WEALTH],
        position: { x: 15, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DIPLOMACY'],
        mechanicalEffect: 'Gains massive influence from others’ conflicts. Unmatched individual negotiation leverage. Trade-off: Suffers severe penalties to all cooperation bonuses. Likely to be targeted by Coalitions.',
        tags: ['diplomacy', 'coercion', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'dip_t4_lon_2', name: 'Kingmaker Protocols',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'unbound_sovereignty',
        description: 'You decide who wins the wars you don\'t fight.',
        effects: [],
        prerequisites: ['dip_t4_lon_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.MILITARY],
        position: { x: 14, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Selling weapons or resources to factions at war grants you a portion of their Seasonal Military Score.',
        tags: ['diplomacy', 'trade'], aiTags: ['economy']
    },
    {
        id: 'dip_t4_lon_3', name: 'Absolute Autonomy',
        tree: TechTreeType.DIPLOMACY, tier: TechTier.TRANSFORMATION, branch: 'unbound_sovereignty',
        description: 'Your empire is a fortress, economically and politically immune to foreign pressure.',
        effects: [],
        prerequisites: ['dip_t4_lon_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.INFLUENCE],
        position: { x: 16, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Completely immune to Sanctions, Forced Mediation, and Reputation Warfare.',
        tags: ['diplomacy', 'treaty'], aiTags: ['defense']
    }
];
