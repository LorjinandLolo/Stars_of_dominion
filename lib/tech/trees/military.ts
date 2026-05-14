import { Tech, TechTreeType, TechTier, TechEffectType, SeasonScoreCategory } from '../types';

export const militaryTree: Tech[] = [
    // ============================================
    // TIER 1 - EXPANSION: BASIC COMBAT CAPABILITY
    // Theme: "Build a functioning military"
    // ============================================
    {
        id: 'mil_t1_1', name: 'Standardized Fleet Formations',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Establish standard operational protocols for fleet spacing and engagement vectors.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 0, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves coordination in orbital combat. +10% base fleet strength.',
        tags: ['military', 'orbital'], aiTags: ['military']
    },
    {
        id: 'mil_t1_2', name: 'Planetary Assault Protocols',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Develop standardized atmospheric entry and drop-pod deployment procedures.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 2, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks planetary invasion mechanics with a 5% efficiency bonus.',
        tags: ['military', 'ground'], aiTags: ['military']
    },
    {
        id: 'mil_t1_3', name: 'Combined Arms Training',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Train different unit branches to support each other on the battlefield.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 4, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Enables synergy bonuses between diverse unit types in combat.',
        tags: ['military', 'doctrine'], aiTags: ['military']
    },
    {
        id: 'mil_t1_4', name: 'Logistics Chain I',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Streamline the supply chain to support extended combat operations.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 6, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves supply limits to fleets and reduces attrition during invasions.',
        tags: ['military', 'logistics'], aiTags: ['logistics']
    },
    {
        id: 'mil_t1_5', name: 'Basic Targeting Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Upgrade the baseline targeting subroutines for all weapon platforms.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 8, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Slightly improves hit consistency across all units.',
        tags: ['military', 'weapons'], aiTags: ['military']
    },
    {
        id: 'mil_t1_6', name: 'Rapid Deployment Bays',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Redesign transport bays to allow for faster offloading of ground troops.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 10, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Faster troop deployment during invasions, gaining early phase momentum.',
        tags: ['military', 'ground'], aiTags: ['military']
    },
    {
        id: 'mil_t1_7', name: 'Orbital Bombardment I',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Outfit capital ships with dedicated orbital-to-surface weaponry.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 12, y: 0 },
        unlockFlags: ['ENABLE_ORBITAL_BOMBARDMENT'],
        mechanicalEffect: 'Unlocks basic planetary bombardment to soften defenses.',
        tags: ['military', 'orbital'], aiTags: ['offensive']
    },
    {
        id: 'mil_t1_8', name: 'Defensive Grid Networks',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Integrate planetary defenses into a unified, hardened command grid.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves planetary defense baseline and structure health.',
        tags: ['military', 'defense'], aiTags: ['defense']
    },
    {
        id: 'mil_t1_9', name: 'Unit Discipline Protocols',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Instill rigorous discipline to reduce chaos in the fog of war.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 16, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces combat randomness and standardizes damage output.',
        tags: ['military', 'doctrine'], aiTags: ['military']
    },
    {
        id: 'mil_t1_10', name: 'Combat Telemetry',
        tree: TechTreeType.MILITARY, tier: TechTier.EXPANSION, branch: 'expansion_doctrine',
        description: 'Record and process battle data in real-time.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 18, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Provides detailed combat data feedback. Required for advanced prediction systems.',
        tags: ['military', 'intel'], aiTags: ['intel']
    },

    // ============================================
    // TIER 2 - SPECIALIZATION: COMBAT IDENTITY
    // Theme: "What kind of war do I fight?"
    // ============================================
    // PATH A: OVERWHELMING FORCE
    {
        id: 'mil_t2_ovr_1', name: 'Heavy Armor Doctrine',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'overwhelming_force',
        description: 'Focus industrial output on sheer survivability and mass.',
        effects: [],
        prerequisites: ['mil_t1_1'], researchCost: 150,
        mutuallyExclusiveGroup: 'military_t2_path',
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.STABILITY],
        position: { x: 0, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces all incoming damage by 15%. Locks out Precision and Adaptive doctrines early.',
        tags: ['military', 'armor'], aiTags: ['military']
    },
    {
        id: 'mil_t2_ovr_2', name: 'Siege Warfare Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'overwhelming_force',
        description: 'Specialized ordnance designed to crack hardened planetary shields.',
        effects: [],
        prerequisites: ['mil_t2_ovr_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Increases orbital bombardment efficiency by 30%.',
        tags: ['military', 'orbital'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_ovr_3', name: 'Reinforced Infantry Waves',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'overwhelming_force',
        description: 'Deploy overwhelming numbers of heavily armored troops.',
        effects: [],
        prerequisites: ['mil_t2_ovr_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 4, y: 3 },
        unlockFlags: [],
        mechanicalEffect: '+20% ground invasion strength.',
        tags: ['military', 'ground'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_ovr_4', name: 'Attrition Strategy',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'overwhelming_force',
        description: 'Grind the enemy down. Losses are acceptable if the enemy breaks first.',
        effects: [],
        prerequisites: ['mil_t2_ovr_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 1, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Enemy units suffer additional casualties over time in drawn-out battles.',
        tags: ['military', 'doctrine'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_ovr_5', name: 'Sustained Bombardment',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'overwhelming_force',
        description: 'Never stop firing. Turn the enemy world to ash.',
        effects: [],
        prerequisites: ['mil_t2_ovr_1', 'mil_t2_ovr_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 3, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Bombardment bypasses minor planetary shields completely.',
        tags: ['military', 'orbital'], aiTags: ['offensive']
    },

    // PATH B: PRECISION WARFARE
    {
        id: 'mil_t2_pre_1', name: 'Surgical Strike Protocols',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'precision_warfare',
        description: 'Focus on precision over mass. Hit the enemy where they are weak.',
        effects: [],
        prerequisites: ['mil_t1_5'], researchCost: 150,
        mutuallyExclusiveGroup: 'military_t2_path',
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 6, y: 3 },
        unlockFlags: [],
        mechanicalEffect: '+25% critical hit chance. Locks out Overwhelming and Adaptive doctrines early.',
        tags: ['military', 'weapons'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_pre_2', name: 'Weak-Point Targeting',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'precision_warfare',
        description: 'Sensors dynamically identify and highlight structural vulnerabilities in enemy armor.',
        effects: [],
        prerequisites: ['mil_t2_pre_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 8, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Attacks bypass 20% of enemy armor mitigation.',
        tags: ['military', 'weapons'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_pre_3', name: 'Rapid Assault Units',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'precision_warfare',
        description: 'Highly mobile infantry designed to bypass frontlines entirely.',
        effects: [],
        prerequisites: ['mil_t2_pre_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 10, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Ground forces deal heavy damage in the first phase of combat.',
        tags: ['military', 'ground'], aiTags: ['offensive']
    },
    {
        id: 'mil_t2_pre_4', name: 'Tactical Mobility Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'precision_warfare',
        description: 'Advanced thrusters allowing fleets to disengage and reposition rapidly.',
        effects: [],
        prerequisites: ['mil_t2_pre_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 7, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Fleets can retreat with minimal casualties.',
        tags: ['military', 'orbital'], aiTags: ['defense']
    },
    {
        id: 'mil_t2_pre_5', name: 'Coordinated Strike AI',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'precision_warfare',
        description: 'Sync all firing solutions across the fleet for simultaneous impact.',
        effects: [],
        prerequisites: ['mil_t2_pre_1', 'mil_t2_pre_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 9, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Increases burst damage significantly at the start of combat.',
        tags: ['military', 'weapons'], aiTags: ['offensive']
    },

    // PATH C: ADAPTIVE WARFARE
    {
        id: 'mil_t2_adp_1', name: 'Counter-Unit Training',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'adaptive_warfare',
        description: 'Train soldiers and fleet commanders to dynamically shift tactics against specific enemies.',
        effects: [],
        prerequisites: ['mil_t1_9'], researchCost: 150,
        mutuallyExclusiveGroup: 'military_t2_path',
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.STABILITY],
        position: { x: 12, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Increases rock-paper-scissors counter bonuses by 50%. Locks out Overwhelming and Precision doctrines early.',
        tags: ['military', 'doctrine'], aiTags: ['defense']
    },
    {
        id: 'mil_t2_adp_2', name: 'Dynamic Loadouts',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'adaptive_warfare',
        description: 'Modular weapon systems that can be reconfigured before battle.',
        effects: [],
        prerequisites: ['mil_t2_adp_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 14, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Allows fleets to swap damage types without refitting.',
        tags: ['military', 'weapons'], aiTags: ['military']
    },
    {
        id: 'mil_t2_adp_3', name: 'Reactive Defense Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'adaptive_warfare',
        description: 'Shields and armor that adapt their resonance based on incoming damage types.',
        effects: [],
        prerequisites: ['mil_t2_adp_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 16, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces damage from repeated weapon types during a single combat.',
        tags: ['military', 'defense'], aiTags: ['defense']
    },
    {
        id: 'mil_t2_adp_4', name: 'Tactical Flexibility Doctrine',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'adaptive_warfare',
        description: 'Empower lower-tier commanders to make split-second strategic shifts.',
        effects: [],
        prerequisites: ['mil_t2_adp_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 13, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Halves the negative penalty of being countered in combat.',
        tags: ['military', 'doctrine'], aiTags: ['defense']
    },
    {
        id: 'mil_t2_adp_5', name: 'Battlefield Learning Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.SPECIALIZATION, branch: 'adaptive_warfare',
        description: 'A combat AI that analyzes the enemy’s tactics as they unfold.',
        effects: [],
        prerequisites: ['mil_t2_adp_1', 'mil_t2_adp_3'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.INTEL],
        position: { x: 15, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Your units gain an escalating combat bonus the longer a battle lasts.',
        tags: ['military', 'intel'], aiTags: ['defense']
    },

    // ============================================
    // TIER 3 - DOMINANCE: STRATEGIC DOMINANCE
    // Theme: "Win battles through decisions"
    // ============================================
    {
        id: 'mil_t3_1', name: 'Predictive Combat Algorithms',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Feed espionage data into tactical firing computers to anticipate enemy maneuvers.',
        effects: [],
        prerequisites: ['mil_t1_10'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.INTEL],
        position: { x: 0, y: 7 },
        unlockFlags: ['PREDICTIVE_COMBAT_BONUS'],
        mechanicalEffect: 'Massive bonus damage if you correctly predict enemy tactics in combat lock-in.',
        tags: ['military', 'intel'], aiTags: ['offensive']
    },
    {
        id: 'mil_t3_2', name: 'Counter-Tactic Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Randomize sub-routines to make your forces impossible to predict mathematically.',
        effects: [],
        prerequisites: ['mil_t1_10'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 2, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Significantly reduces damage taken if the enemy correctly predicts your tactics.',
        tags: ['military', 'doctrine'], aiTags: ['defense']
    },
    {
        id: 'mil_t3_3', name: 'Shock Assault Protocols',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Coordinate simultaneous orbital and ground strikes to shatter the enemy instantly.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 4, y: 7 },
        unlockFlags: ['SHOCK_ASSAULT_PHASE_1'],
        mechanicalEffect: 'Extra devastating impact during the first combat engagement phase.',
        tags: ['military', 'doctrine'], aiTags: ['offensive']
    },
    {
        id: 'mil_t3_4', name: 'Fortification Breakers',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Specialized bunker-busting tech and orbital kinetic strikes.',
        effects: [],
        prerequisites: [], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 6, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Strong damage bonus against defensive structures and fortified planets.',
        tags: ['military', 'weapons'], aiTags: ['offensive']
    },
    {
        id: 'mil_t3_5', name: 'Orbital-Ground Coordination',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Seamlessly link fleet sensors with ground infantry HUDs.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 8, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Synergy bonus between fleet in orbit and ground combat efficiency.',
        tags: ['military', 'doctrine'], aiTags: ['military']
    },
    {
        id: 'mil_t3_6', name: 'Morale Collapse Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Broadcast psychological terror alongside kinetic strikes.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 10, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Enemy ground units degrade faster under pressure, retreating early.',
        tags: ['military', 'doctrine'], aiTags: ['offensive']
    },
    {
        id: 'mil_t3_7', name: 'Battlefield Disruption',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Target enemy communications and officer corps specifically to sow chaos.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.MILITARY],
        position: { x: 12, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces enemy coordination bonuses and nullifies their Combined Arms.',
        tags: ['military', 'doctrine'], aiTags: ['defense']
    },
    {
        id: 'mil_t3_8', name: 'Overextension Punishment',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Master the art of the feigned retreat, luring the enemy into kill zones.',
        effects: [],
        prerequisites: [], researchCost: 450,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.MILITARY],
        position: { x: 14, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Massive bonus damage when fighting enemies employing Aggressive strategies.',
        tags: ['military', 'doctrine'], aiTags: ['defense']
    },
    {
        id: 'mil_t3_9', name: 'Command Chain Optimization',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Flatten the military hierarchy through AI-assisted decision making.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 16, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Faster combat resolution cycles, granting extra maneuvers per phase.',
        tags: ['military', 'doctrine'], aiTags: ['military']
    },
    {
        id: 'mil_t3_10', name: 'Combat Deception Integration',
        tree: TechTreeType.MILITARY, tier: TechTier.DOMINANCE, branch: 'strategic_dominance',
        description: 'Fully integrate espionage deception tactics into front-line combat.',
        effects: [],
        prerequisites: [], researchCost: 500,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 18, y: 7 },
        unlockFlags: ['COMBAT_DECEPTION_SYNC'],
        mechanicalEffect: 'Syncs with espionage: Fake tactics and misreads significantly influence combat outcomes.',
        tags: ['military', 'intel'], aiTags: ['offensive']
    },

    // ============================================
    // TIER 4 - TRANSFORMATION: WAR IDENTITY
    // Theme: "Become a war machine of a specific type"
    // ============================================
    
    // PATH A: TOTAL WAR ENGINE (Brutal Domination)
    {
        id: 'mil_t4_tot_1', name: 'Planetary Devastation Protocols',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'total_war_machine',
        description: 'You do not outplay your enemy. You overwhelm them. Finesse is irrelevant when the sky falls.',
        effects: [],
        prerequisites: ['mil_t3_3'], researchCost: 1000,
        mutuallyExclusiveGroup: 'military_t4_path',
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 2, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DOCTRINE'],
        mechanicalEffect: 'HUGE raw damage scaling. Ignores finesse mechanics. Greatly increased vulnerability to sabotage and misdirection. Can misread opponent and still win via raw power.',
        tags: ['military', 'total_war', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'mil_t4_tot_2', name: 'Endless War Economy',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'total_war_machine',
        description: 'The entire civilization is re-geared for a single purpose: feeding the war machine.',
        effects: [],
        prerequisites: ['mil_t4_tot_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.PRODUCTION],
        position: { x: 1, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Massively reduces military upkeep, but generates constant unrest if not at war.',
        tags: ['military', 'total_war'], aiTags: ['offensive']
    },
    {
        id: 'mil_t4_tot_3', name: 'Irreversible Assault Doctrine',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'total_war_machine',
        description: 'Once the order is given, there is no retreat. Victory or annihilation.',
        effects: [],
        prerequisites: ['mil_t4_tot_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.MILITARY],
        position: { x: 3, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Units cannot retreat. +50% damage bonus until destruction.',
        tags: ['military', 'total_war'], aiTags: ['offensive']
    },

    // PATH B: ELITE PRECISION FORCE (High-Skill Warfare)
    {
        id: 'mil_t4_pre_1', name: 'Perfect Strike Systems',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'elite_precision_force',
        description: 'If you read the enemy correctly, they lose instantly. If you are wrong, you are punished.',
        effects: [],
        prerequisites: ['mil_t3_1'], researchCost: 1000,
        mutuallyExclusiveGroup: 'military_t4_path',
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.INTEL],
        position: { x: 9, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DOCTRINE'],
        mechanicalEffect: 'Massive reward (+100% damage) for correct prediction. Punishing penalties (-50% stats) if prediction fails. Operates with smaller, elite forces.',
        tags: ['military', 'precision', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'mil_t4_pre_2', name: 'Minimal Loss Warfare',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'elite_precision_force',
        description: 'Every life is a critical asset. Combat is a scalpel, not a hammer.',
        effects: [],
        prerequisites: ['mil_t4_pre_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 8, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Takes almost zero casualties from engagements where you win the prediction.',
        tags: ['military', 'precision'], aiTags: ['defense']
    },
    {
        id: 'mil_t4_pre_3', name: 'Surgical Domination',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'elite_precision_force',
        description: 'Disable an enemy empire’s entire military infrastructure in a single synchronized strike.',
        effects: [],
        prerequisites: ['mil_t4_pre_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.DISRUPTION],
        position: { x: 10, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Action to completely disable a target system\'s defenses if you have max Intel.',
        tags: ['military', 'precision'], aiTags: ['offensive']
    },

    // PATH C: ADAPTIVE FORTRESS NETWORK (Counterplay Mastery)
    {
        id: 'mil_t4_adp_1', name: 'Self-Learning Army Networks',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'adaptive_fortress_network',
        description: 'You cannot be exploited. Your army adapts in real-time, neutralizing enemy advantages.',
        effects: [],
        prerequisites: ['mil_t3_2'], researchCost: 1000,
        mutuallyExclusiveGroup: 'military_t4_path',
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.MILITARY],
        position: { x: 15, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_DOCTRINE'],
        mechanicalEffect: 'Reduces enemy bonuses (including prediction bonuses) to 0. Extremely stable combat performance, but lower peak power. Survives mistakes easily.',
        tags: ['military', 'adaptive', 'global_alert'], aiTags: ['defense']
    },
    {
        id: 'mil_t4_adp_2', name: 'Perfect Counter Doctrine',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'adaptive_fortress_network',
        description: 'Instantly re-orient fleet configurations mid-battle to permanently hard-counter the enemy.',
        effects: [],
        prerequisites: ['mil_t4_adp_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'You automatically count as correctly predicting the enemy for defensive purposes.',
        tags: ['military', 'adaptive'], aiTags: ['defense']
    },
    {
        id: 'mil_t4_adp_3', name: 'Tactical Omniscience',
        tree: TechTreeType.MILITARY, tier: TechTier.TRANSFORMATION, branch: 'adaptive_fortress_network',
        description: 'The battlefield holds no surprises. Every variable has been accounted for.',
        effects: [],
        prerequisites: ['mil_t4_adp_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.MILITARY],
        position: { x: 16, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Immune to all combat deception, fake fleets, and espionage disruption during battles.',
        tags: ['military', 'adaptive'], aiTags: ['defense']
    }
];
