import { Tech, TechTreeType, TechTier, TechEffectType, SeasonScoreCategory } from '../types';

export const espionageTree: Tech[] = [
    // ============================================
    // TIER 1 - EXPANSION: INFORMATION ACCESS
    // ============================================
    {
        id: 'esp_t1_1', name: 'Recon Drone Networks',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Deploy swarms of micro-drones across neighboring systems to passively gather basic presence data.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 0, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reveals adjacent system connections.',
        tags: ['espionage', 'intel'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_2', name: 'Signal Interception',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Tap into basic unencrypted comms arrays to intercept passing fleet movement vectors.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Detects fleets 1 jump away.',
        tags: ['espionage', 'intel'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_3', name: 'Basic Encryption',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Establish foundational communication security to prevent early interception.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 4, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Hides your fleet composition from basic scans.',
        tags: ['espionage', 'encryption'], aiTags: ['defense']
    },
    {
        id: 'esp_t1_4', name: 'Listening Posts',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Construct stealth relays on uninhabited moons to permanently monitor sector traffic.',
        effects: [{ type: TechEffectType.UNLOCK_BUILDING, targetSystem: 'buildings', modifierKey: 'listening_post', value: 1 }],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 6, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks Listening Post construction.',
        tags: ['espionage', 'infrastructure'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_5', name: 'Spy Deployment Protocols',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Formalize the training and insertion of covert operatives onto rival worlds.',
        effects: [{ type: TechEffectType.UNLOCK_ACTION, targetSystem: 'actions', modifierKey: 'deploy_spy', value: 1 }],
        prerequisites: [], researchCost: 70,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 8, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks Spy Agent system.',
        tags: ['espionage', 'agents'], aiTags: ['offensive']
    },
    {
        id: 'esp_t1_6', name: 'Trade Route Monitoring',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Infiltrate civilian cargo manifests to estimate an empire’s economic health.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.WEALTH],
        position: { x: 10, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reveals rival trade income in dossier.',
        tags: ['espionage', 'economy'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_7', name: 'Diplomatic Surveillance',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Bug foreign embassies to monitor their active treaties and alliances.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 12, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reveals hidden treaties between rivals.',
        tags: ['espionage', 'diplomacy'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_8', name: 'Behavioral Logging',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Compile basic statistical models of rival faction leaders to anticipate basic aggression.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 14, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks basic personality traits in diplomacy panel.',
        tags: ['espionage', 'analysis'], aiTags: ['intel']
    },
    {
        id: 'esp_t1_9', name: 'Fog Disruption',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Actively jam rival sensors to create localized blind spots in their network.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 16, y: 0 },
        unlockFlags: ['ENABLE_FOG_DISRUPTION'],
        mechanicalEffect: 'Unlocks action to reduce rival sensor range for 1 turn.',
        tags: ['espionage', 'electronic_warfare'], aiTags: ['offensive']
    },
    {
        id: 'esp_t1_10', name: 'Intel Reports UI',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.EXPANSION, branch: 'information_access',
        description: 'Centralize gathered data into actionable intelligence dashboards.',
        effects: [],
        prerequisites: [], researchCost: 40,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 18, y: 0 },
        unlockFlags: ['UNLOCK_INTEL_DASHBOARD'],
        mechanicalEffect: 'Grants access to the full Intel Reports interface.',
        tags: ['espionage', 'infrastructure'], aiTags: ['intel']
    },

    // ============================================
    // TIER 2 - SPECIALIZATION: INTELLIGENCE VS DECEPTION
    // ============================================
    // BRANCH A: INTELLIGENCE FOCUS
    {
        id: 'esp_t2_int_1', name: 'Predictive Analytics',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'intelligence_focus',
        description: 'Use vast data lakes to predict the most likely target of a rival fleet.',
        effects: [],
        prerequisites: ['esp_t1_8', 'esp_t1_10'], researchCost: 150,
        mutuallyExclusiveGroup: 'espionage_t2_path',
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 3 },
        unlockFlags: ['SHOW_FLEET_INTENT'],
        mechanicalEffect: 'Draws a probabilistic arrow for enemy fleet movement.',
        tags: ['espionage', 'analysis'], aiTags: ['intel']
    },
    {
        id: 'esp_t2_int_2', name: 'Pattern Recognition',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'intelligence_focus',
        description: 'Identify hidden economic and military build-ups before they materialize.',
        effects: [],
        prerequisites: ['esp_t2_int_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 0, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Alerts you when a rival starts building capital ships.',
        tags: ['espionage', 'analysis'], aiTags: ['intel']
    },
    {
        id: 'esp_t2_int_3', name: 'Deep Cover Agents',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'intelligence_focus',
        description: 'Embed operatives so deeply they can remain dormant for years.',
        effects: [],
        prerequisites: ['esp_t2_int_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 2, y: 5 },
        unlockFlags: [],
        mechanicalEffect: 'Agents generate passive Intel without triggering suspicion.',
        tags: ['espionage', 'agents'], aiTags: ['intel']
    },
    {
        id: 'esp_t2_int_4', name: 'Psychological Profiling',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'intelligence_focus',
        description: 'Build precise psychological models to perfectly anticipate diplomatic reactions.',
        effects: [],
        prerequisites: ['esp_t2_int_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 4, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Shows exact success chance of diplomatic proposals.',
        tags: ['espionage', 'diplomacy'], aiTags: ['intel']
    },
    {
        id: 'esp_t2_int_5', name: 'Crisis Data Modeling',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'intelligence_focus',
        description: 'Analyze crisis situations faster than opponents can react.',
        effects: [],
        prerequisites: ['esp_t2_int_1', 'esp_t2_int_4'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 2, y: 6 },
        unlockFlags: [],
        mechanicalEffect: 'Reveals opponent’s chosen Crisis Response before lock-in.',
        tags: ['espionage', 'crisis'], aiTags: ['intel']
    },

    // BRANCH B: DECEPTION FOCUS
    {
        id: 'esp_t2_dec_1', name: 'False Fleet Signatures',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'deception_focus',
        description: 'Broadcast spoofed transponder codes to make empty space look like an armada.',
        effects: [{ type: TechEffectType.UNLOCK_ACTION, targetSystem: 'actions', modifierKey: 'create_fake_fleet', value: 1 }],
        prerequisites: ['esp_t1_9'], researchCost: 150,
        mutuallyExclusiveGroup: 'espionage_t2_path',
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 16, y: 3 },
        unlockFlags: ['ENABLE_FAKE_FLEETS'],
        mechanicalEffect: 'Unlocks creation of Fake Fleets to bluff opponents.',
        tags: ['espionage', 'electronic_warfare'], aiTags: ['offensive']
    },
    {
        id: 'esp_t2_dec_2', name: 'Decoy Operations',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'deception_focus',
        description: 'Mask military buildups as civilian construction projects.',
        effects: [],
        prerequisites: ['esp_t2_dec_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 14, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Shipyards appear inactive to enemy Intel levels.',
        tags: ['espionage', 'obfuscation'], aiTags: ['defense']
    },
    {
        id: 'esp_t2_dec_3', name: 'Signal Spoofing',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'deception_focus',
        description: 'Intercept and replace enemy communications with forged orders.',
        effects: [],
        prerequisites: ['esp_t2_dec_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 16, y: 5 },
        unlockFlags: [],
        mechanicalEffect: 'Can redirect enemy fleets if their encryption is low.',
        tags: ['espionage', 'electronic_warfare'], aiTags: ['offensive']
    },
    {
        id: 'esp_t2_dec_4', name: 'Misinformation Campaigns',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'deception_focus',
        description: 'Seed false narratives to sow chaos in rival populations.',
        effects: [],
        prerequisites: ['esp_t2_dec_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 18, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Action to lower rival Stability via Fake News.',
        tags: ['espionage', 'propaganda'], aiTags: ['offensive']
    },
    {
        id: 'esp_t2_dec_5', name: 'Diplomatic Bluffing',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.SPECIALIZATION, branch: 'deception_focus',
        description: 'Falsify your resource stockpiles to intimidate or extort rivals.',
        effects: [],
        prerequisites: ['esp_t2_dec_1', 'esp_t2_dec_4'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 16, y: 6 },
        unlockFlags: [],
        mechanicalEffect: 'Display artificial wealth to force better treaty terms.',
        tags: ['espionage', 'diplomacy'], aiTags: ['offensive']
    },

    // ============================================
    // TIER 3 - DOMINANCE: MIND GAME CONTROL
    // ============================================
    {
        id: 'esp_t3_1', name: 'Crisis Prediction Engine',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'An AI engine that models entire conflicts, offering the optimal tactical choice.',
        effects: [],
        prerequisites: ['esp_t2_int_5'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 0, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Automatically highlights the winning Crisis Response.',
        tags: ['espionage', 'crisis'], aiTags: ['intel']
    },
    {
        id: 'esp_t3_2', name: 'Counter-Prediction AI',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Feed recursive garbage data into rival prediction engines to force errors.',
        effects: [],
        prerequisites: ['esp_t2_int_5', 'esp_t2_dec_5'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 2, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Inverts or obscures rival Crisis Prediction results against you.',
        tags: ['espionage', 'crisis'], aiTags: ['defense']
    },
    {
        id: 'esp_t3_3', name: 'Adaptive Deception',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Fake fleets now react dynamically to sensor sweeps, masking their true nature.',
        effects: [],
        prerequisites: ['esp_t2_dec_5'], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 4, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Fake fleets require max Intel level to distinguish from real ones.',
        tags: ['espionage', 'obfuscation'], aiTags: ['defense']
    },
    {
        id: 'esp_t3_4', name: 'Tactical Feint Protocols',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Automated fleet maneuvers designed specifically to draw enemies out of position.',
        effects: [],
        prerequisites: ['esp_t2_dec_3'], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 6, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Forces enemy fleets to engage fake fleets if in range.',
        tags: ['espionage', 'electronic_warfare'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_5', name: 'Sabotage Cells',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Equip sleeper agents with critical infrastructure explosive charges.',
        effects: [{ type: TechEffectType.UNLOCK_ACTION, targetSystem: 'actions', modifierKey: 'sabotage_infrastructure', value: 1 }],
        prerequisites: ['esp_t2_int_3'], researchCost: 450,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 8, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks Sabotage Action: temporarily disable rival buildings.',
        tags: ['espionage', 'agents'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_6', name: 'Intel Blackouts',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Emit absolute zero-point jamming fields across entire sectors.',
        effects: [],
        prerequisites: ['esp_t2_dec_1'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 10, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Completely blind a rival system from map view for 3 turns.',
        tags: ['espionage', 'electronic_warfare'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_7', name: 'Reaction Delay Systems',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Infect rival command networks to slow their strategic orders.',
        effects: [],
        prerequisites: ['esp_t2_int_5', 'esp_t2_dec_3'], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 12, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Increases action point cost for rivals responding to your actions.',
        tags: ['espionage', 'cyber'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_8', name: 'False Intent Broadcasting',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Broadcast war declarations against third parties to mask your true target.',
        effects: [],
        prerequisites: ['esp_t2_dec_5'], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.DISRUPTION],
        position: { x: 14, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Can fake Diplomatic stances, preventing defensive pact triggers.',
        tags: ['espionage', 'diplomacy'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_9', name: 'Loyalty Subversion',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Bribe, blackmail, or ideologically flip rival planetary governors.',
        effects: [{ type: TechEffectType.UNLOCK_ACTION, targetSystem: 'actions', modifierKey: 'flip_planet', value: 1 }],
        prerequisites: ['esp_t2_int_3', 'esp_t2_dec_4'], researchCost: 500,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.TERRITORY],
        position: { x: 16, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Action to slowly drain planetary loyalty until defection.',
        tags: ['espionage', 'agents'], aiTags: ['offensive']
    },
    {
        id: 'esp_t3_10', name: 'Strategic Confusion Matrix',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.DOMINANCE, branch: 'mind_game_control',
        description: 'Combine all disinformation campaigns into a unified matrix of lies.',
        effects: [],
        prerequisites: ['esp_t3_8', 'esp_t3_9'], researchCost: 550,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 18, y: 8 },
        unlockFlags: [],
        mechanicalEffect: 'Rivals generate a flat 30% error rate on all Intel about you.',
        tags: ['espionage', 'obfuscation'], aiTags: ['defense']
    },

    // ============================================
    // TIER 4 - TRANSFORMATION: INFORMATION WARFARE IDENTITY
    // ============================================
    
    // PATH A: OMNISCIENCE
    {
        id: 'esp_t4_omn_1', name: 'Total Surveillance Network',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'omniscience',
        description: 'A galaxy-spanning web of quantum-entangled sensors. Nothing moves unseen.',
        effects: [],
        prerequisites: ['esp_t3_1'], researchCost: 1000,
        mutuallyExclusiveGroup: 'espionage_t4_path',
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 11 },
        unlockFlags: ['REMOVE_FOG_OF_WAR'],
        mechanicalEffect: 'Permanently removes Fog of War globally.',
        tags: ['espionage', 'omniscience'], aiTags: ['intel']
    },
    {
        id: 'esp_t4_omn_2', name: 'Deterministic Prediction Models',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'omniscience',
        description: 'An AI that has mapped the mathematical certainty of the galaxy’s future.',
        effects: [],
        prerequisites: ['esp_t4_omn_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 1, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'See the outcome of all enemy actions 1 turn before they execute.',
        tags: ['espionage', 'omniscience'], aiTags: ['intel']
    },
    {
        id: 'esp_t4_omn_3', name: 'Absolute Intel Dominance',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'omniscience',
        description: 'You are the eye that sees all. Secrecy is a concept of the past.',
        effects: [],
        prerequisites: ['esp_t4_omn_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.INFLUENCE],
        position: { x: 3, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Gain massive seasonal Influence honors; automatically foil all rival espionage.',
        tags: ['espionage', 'omniscience'], aiTags: ['defense']
    },

    // PATH B: OBFUSCATION
    {
        id: 'esp_t4_obf_1', name: 'Quantum Misdirection',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'obfuscation',
        description: 'You exist in a state of probability until observed, making you impossible to target.',
        effects: [],
        prerequisites: ['esp_t3_3'], researchCost: 1000,
        mutuallyExclusiveGroup: 'espionage_t4_path',
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.STABILITY],
        position: { x: 9, y: 11 },
        unlockFlags: ['PERMANENT_STEALTH'],
        mechanicalEffect: 'Fleets are permanently invisible until they fire.',
        tags: ['espionage', 'obfuscation'], aiTags: ['stealth']
    },
    {
        id: 'esp_t4_obf_2', name: 'Reality Distortion Signals',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'obfuscation',
        description: 'Project impossible architectures and fleets directly into enemy sensor arrays.',
        effects: [],
        prerequisites: ['esp_t4_obf_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 8, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Fake fleets can now deal actual phantom damage in combat.',
        tags: ['espionage', 'obfuscation'], aiTags: ['offensive']
    },
    {
        id: 'esp_t4_obf_3', name: 'Phantom Empire Protocol',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'obfuscation',
        description: 'Your capital vanishes from the map. You rule from the shadows.',
        effects: [],
        prerequisites: ['esp_t4_obf_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.INFLUENCE],
        position: { x: 10, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Home system becomes untargetable and unsearchable.',
        tags: ['espionage', 'obfuscation'], aiTags: ['defense']
    },

    // PATH C: MANIPULATION
    {
        id: 'esp_t4_man_1', name: 'Behavioral Override Systems',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'manipulation',
        description: 'Broadcast frequencies that rewrite synaptic pathways in rival populations.',
        effects: [],
        prerequisites: ['esp_t3_9'], researchCost: 1000,
        mutuallyExclusiveGroup: 'espionage_t4_path',
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.INFLUENCE],
        position: { x: 15, y: 11 },
        unlockFlags: ['MIND_CONTROL'],
        mechanicalEffect: 'Force a rival fleet to fire upon its own allies once per game.',
        tags: ['espionage', 'manipulation'], aiTags: ['offensive']
    },
    {
        id: 'esp_t4_man_2', name: 'Induced Panic Networks',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'manipulation',
        description: 'Trigger galaxy-wide psychological collapse via algorithmic terror.',
        effects: [],
        prerequisites: ['esp_t4_man_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Instantly plunge a rival empire into civil war.',
        tags: ['espionage', 'manipulation'], aiTags: ['offensive']
    },
    {
        id: 'esp_t4_man_3', name: 'Puppet State Ascension',
        tree: TechTreeType.ESPIONAGE, tier: TechTier.TRANSFORMATION, branch: 'manipulation',
        description: 'The highest echelons of a rival empire now answer only to you.',
        effects: [],
        prerequisites: ['esp_t4_man_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.TERRITORY, SeasonScoreCategory.INFLUENCE],
        position: { x: 16, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Permanently annex an AI rival faction without firing a shot.',
        tags: ['espionage', 'manipulation'], aiTags: ['offensive']
    }
];
