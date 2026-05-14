import { Tech, TechTreeType, TechTier, TechEffectType, SeasonScoreCategory } from '../types';

export const infrastructureTree: Tech[] = [
    // ============================================
    // TIER 1 - EXPANSION: BASIC PLANET SYSTEMS
    // Theme: "Make planets functional"
    // ============================================
    {
        id: 'inf_t1_1', name: 'Basic Energy Grid',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Standardize planetary power distribution to support emerging industrial sectors.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 0, y: 0 },
        unlockFlags: ['ENABLE_PLANETARY_GRID'],
        mechanicalEffect: 'Unlocks planetary energy distribution system, improving baseline output.',
        tags: ['infrastructure', 'energy'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_2', name: 'Food Production Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Automated hydroponics and synthetic nutrient synthesizers.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 2, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Stabilizes population growth and prevents starvation events.',
        tags: ['infrastructure', 'agriculture'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_3', name: 'Urban Development I',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Construct arcologies designed to pack millions into highly efficient vertical living spaces.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.POPULATION],
        position: { x: 4, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Increases planetary population capacity by 20%.',
        tags: ['infrastructure', 'housing'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_4', name: 'Basic Healthcare Networks',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Distribute baseline medical services and synthetic disease resistances.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 6, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves population stability and reduces random mortality events.',
        tags: ['infrastructure', 'welfare'], aiTags: ['defense']
    },
    {
        id: 'inf_t1_5', name: 'Waste Management Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Advanced molecular deconstruction plants that turn garbage back into raw matter.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 8, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Prevents efficiency loss from high planetary population.',
        tags: ['infrastructure', 'utilities'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_6', name: 'Housing Expansion Protocols',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Streamline the rapid deployment of civilian housing in newly colonized sectors.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.POPULATION],
        position: { x: 10, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Supports rapid population scaling on newly established colonies.',
        tags: ['infrastructure', 'housing'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_7', name: 'Infrastructure Maintenance',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Deploy swarms of automated repair drones to service failing atmospheric scrubbers and transit lines.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 12, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces building degradation over time, lowering maintenance costs.',
        tags: ['infrastructure', 'utilities'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_8', name: 'Local Governance Structures',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Establish functional bureaucratic layers to manage planetary disputes locally.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves baseline stability across all planets.',
        tags: ['infrastructure', 'governance'], aiTags: ['defense']
    },
    {
        id: 'inf_t1_9', name: 'Service Distribution Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Optimize the delivery of consumer goods and civic services to the population.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 16, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves access to basic services, boosting happiness slightly.',
        tags: ['infrastructure', 'welfare'], aiTags: ['economy']
    },
    {
        id: 'inf_t1_10', name: 'Planetary Overview UI',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.EXPANSION, branch: 'planetary_foundations',
        description: 'Connect all planetary governors to a centralized holographic command interface.',
        effects: [],
        prerequisites: [], researchCost: 40,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 18, y: 0 },
        unlockFlags: ['UNLOCK_PLANETARY_DASHBOARD'],
        mechanicalEffect: 'Centralized infrastructure management and planetary tracking.',
        tags: ['infrastructure', 'governance'], aiTags: ['intel']
    },

    // ============================================
    // TIER 2 - SPECIALIZATION: PLANET IDENTITY
    // Theme: "What kind of planets do I build?"
    // ============================================
    // PATH A: FORTRESS WORLDS (High Output, Heavy Systems)
    {
        id: 'inf_t2_ind_1', name: 'Mega-City Complexes',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'fortress_worlds',
        description: 'Cover entire continents in unbroken layers of durasteel and concrete.',
        effects: [],
        prerequisites: ['inf_t1_3'], researchCost: 150,
        mutuallyExclusiveGroup: 'infrastructure_t2_path',
        seasonScoreTags: [SeasonScoreCategory.POPULATION, SeasonScoreCategory.TERRITORY],
        position: { x: 0, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Massively increases planetary housing and building slots. Locks out Welfare and Specialized paths early.',
        tags: ['infrastructure', 'housing'], aiTags: ['economy']
    },
    {
        id: 'inf_t2_ind_2', name: 'Industrial District Expansion',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'fortress_worlds',
        description: 'Re-zone residential and ecological sectors entirely for heavy industry.',
        effects: [],
        prerequisites: ['inf_t2_ind_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 3 },
        unlockFlags: [],
        mechanicalEffect: '+25% industrial output at the cost of -10% planetary stability.',
        tags: ['infrastructure', 'industry'], aiTags: ['offensive']
    },
    {
        id: 'inf_t2_ind_3', name: 'Heavy Infrastructure Grids',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'fortress_worlds',
        description: 'Reinforce planetary crusts to support the weight of orbital tethers and mega-forges.',
        effects: [],
        prerequisites: ['inf_t2_ind_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 4, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks Tier 3 Industrial Buildings.',
        tags: ['infrastructure', 'industry'], aiTags: ['economy']
    },
    {
        id: 'inf_t2_ind_4', name: 'High-Capacity Energy Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'fortress_worlds',
        description: 'Tap directly into the planet’s mantle for endless, highly volatile geothermal energy.',
        effects: [],
        prerequisites: ['inf_t2_ind_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 1, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Triples planetary energy output, but introduces a risk of catastrophic industrial accidents.',
        tags: ['infrastructure', 'energy'], aiTags: ['economy']
    },
    {
        id: 'inf_t2_ind_5', name: 'Resource-Intensive Growth',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'fortress_worlds',
        description: 'Fuel population growth artificially with massive caloric and chemical supplements.',
        effects: [],
        prerequisites: ['inf_t2_ind_1', 'inf_t2_ind_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.POPULATION],
        position: { x: 3, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Doubles population growth rate, but increases food and water consumption by 50%.',
        tags: ['infrastructure', 'population'], aiTags: ['offensive']
    },

    // PATH B: UTOPIAN SOCIETIES (Stability, Happiness, Growth)
    {
        id: 'inf_t2_wel_1', name: 'Advanced Healthcare Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'utopian_societies',
        description: 'Eradicate disease through gene-tailored immune boosters and universal medical access.',
        effects: [],
        prerequisites: ['inf_t1_4'], researchCost: 150,
        mutuallyExclusiveGroup: 'infrastructure_t2_path',
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 6, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Greatly increases population happiness and lifespan. Locks out Industrial and Specialized paths early.',
        tags: ['infrastructure', 'welfare'], aiTags: ['defense']
    },
    {
        id: 'inf_t2_wel_2', name: 'Cultural Development Networks',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'utopian_societies',
        description: 'Construct sprawling museums, theaters, and digital sensory-scapes.',
        effects: [],
        prerequisites: ['inf_t2_wel_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.STABILITY],
        position: { x: 8, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Generates passive Influence points from highly populated worlds.',
        tags: ['infrastructure', 'culture'], aiTags: ['diplomacy']
    },
    {
        id: 'inf_t2_wel_3', name: 'Population Optimization',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'utopian_societies',
        description: 'Design cities entirely around the psychological comfort of the inhabitants.',
        effects: [],
        prerequisites: ['inf_t2_wel_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.POPULATION, SeasonScoreCategory.STABILITY],
        position: { x: 10, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Maximum population cap is increased without incurring crowding penalties.',
        tags: ['infrastructure', 'housing'], aiTags: ['defense']
    },
    {
        id: 'inf_t2_wel_4', name: 'Happiness Management Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'utopian_societies',
        description: 'Deploy advanced AI to preemptively satisfy citizen desires before they form.',
        effects: [],
        prerequisites: ['inf_t2_wel_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 7, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Planetary unrest is virtually eliminated.',
        tags: ['infrastructure', 'welfare'], aiTags: ['defense']
    },
    {
        id: 'inf_t2_wel_5', name: 'Social Stability Protocols',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'utopian_societies',
        description: 'Ensure a perfectly even distribution of resources so no citizen wants for anything.',
        effects: [],
        prerequisites: ['inf_t2_wel_1', 'inf_t2_wel_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.DISRUPTION],
        position: { x: 9, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Planets become highly resistant to enemy espionage, propaganda, and ideological subversion.',
        tags: ['infrastructure', 'governance'], aiTags: ['defense']
    },

    // PATH C: INDUSTRIAL HUBS (Focused, Optimized Planets)
    {
        id: 'inf_t2_spc_1', name: 'Planetary Specialization Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'industrial_hubs',
        description: 'Designate entire worlds for a single, unified purpose to maximize efficiency.',
        effects: [],
        prerequisites: ['inf_t1_10'], researchCost: 150,
        mutuallyExclusiveGroup: 'infrastructure_t2_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 12, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks planetary designations (Forge, Agri, Tech, Fortress). Locks out Industrial and Welfare paths early.',
        tags: ['infrastructure', 'governance'], aiTags: ['economy']
    },
    {
        id: 'inf_t2_spc_2', name: 'Research Hub Integration',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'industrial_hubs',
        description: 'Turn entire continents into interconnected academic campuses and server farms.',
        effects: [],
        prerequisites: ['inf_t2_spc_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.PRODUCTION],
        position: { x: 14, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Massively boosts science output on planets designated as Tech Worlds.',
        tags: ['infrastructure', 'science'], aiTags: ['intel']
    },
    {
        id: 'inf_t2_spc_3', name: 'Military Base Integration',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'industrial_hubs',
        description: 'Hollow out planetary crusts to serve as impenetrable fleet anchorages.',
        effects: [],
        prerequisites: ['inf_t2_spc_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.TERRITORY],
        position: { x: 16, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Planets designated as Fortress Worlds gain enormous defensive bonuses and deploy troops faster.',
        tags: ['infrastructure', 'military'], aiTags: ['defense']
    },
    {
        id: 'inf_t2_spc_4', name: 'Economic Zone Optimization',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'industrial_hubs',
        description: 'Abolish all taxes and regulations on a specific world to create an interstellar free-trade haven.',
        effects: [],
        prerequisites: ['inf_t2_spc_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.TRADE],
        position: { x: 13, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Trade value generated by Economic Worlds is doubled.',
        tags: ['infrastructure', 'trade'], aiTags: ['economy']
    },
    {
        id: 'inf_t2_spc_5', name: 'Adaptive Planet Design',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.SPECIALIZATION, branch: 'industrial_hubs',
        description: 'Modular planetary infrastructure that can be rapidly swapped out as needs change.',
        effects: [],
        prerequisites: ['inf_t2_spc_1', 'inf_t2_spc_3'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 15, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Allows changing a planet\'s designation instantly without cost or cooldown.',
        tags: ['infrastructure', 'governance'], aiTags: ['defense']
    },

    // ============================================
    // TIER 3 - DOMINANCE: PLANETARY DOMINANCE
    // Theme: "My planets outperform yours"
    // ============================================
    {
        id: 'inf_t3_1', name: 'Planetary Efficiency Overdrive',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Push a planet\'s entire infrastructure grid past 100% load.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 0, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Temporarily boost output of a planet by 50% at the cost of heavily degrading its buildings.',
        tags: ['infrastructure', 'industry'], aiTags: ['offensive']
    },
    {
        id: 'inf_t3_2', name: 'Crisis Stability Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Hardened psychological and physical bunkers that activate during times of war.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Significantly reduces the impact of unrest and planetary bombardment.',
        tags: ['infrastructure', 'defense'], aiTags: ['defense']
    },
    {
        id: 'inf_t3_3', name: 'Rapid Reconstruction Protocols',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Nanite swarms that instantly rebuild shattered skyscrapers and power relays.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 4, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Faster recovery from damage. Buildings repair themselves at the end of each turn.',
        tags: ['infrastructure', 'utilities'], aiTags: ['defense']
    },
    {
        id: 'inf_t3_4', name: 'Integrated Service Networks',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Connect medical, transit, and energy grids into a single hypersensitive AI network.',
        effects: [],
        prerequisites: [], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.POPULATION, SeasonScoreCategory.STABILITY],
        position: { x: 6, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Improves synergy between systems; buildings of the same type adjacent to each other gain adjacency bonuses.',
        tags: ['infrastructure', 'welfare'], aiTags: ['economy']
    },
    {
        id: 'inf_t3_5', name: 'Planetary Defense Integration',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Weapons platforms that draw power directly from the civilian grid.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.STABILITY],
        position: { x: 8, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Stronger resistance to invasion; civilian population joins the defense automatically.',
        tags: ['infrastructure', 'military'], aiTags: ['defense']
    },
    {
        id: 'inf_t3_6', name: 'Population Surge Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Mandate aggressive cloning and fertility programs to populate empty sectors overnight.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.POPULATION, SeasonScoreCategory.STABILITY],
        position: { x: 10, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Burst population growth on a target planet, maxing it out instantly at the cost of Influence.',
        tags: ['infrastructure', 'population'], aiTags: ['offensive']
    },
    {
        id: 'inf_t3_7', name: 'Infrastructure Shielding',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Physical and cryptographic barriers around water supplies, reactors, and transit hubs.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.DISRUPTION],
        position: { x: 12, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces enemy sabotage effectiveness by 75%. Espionage actions against your planets frequently fail.',
        tags: ['infrastructure', 'security'], aiTags: ['defense']
    },
    {
        id: 'inf_t3_8', name: 'Centralized Control Networks',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Rule all planets from a single room. The governor\'s word is law, executed instantaneously.',
        effects: [],
        prerequisites: [], researchCost: 450,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Improves coordination across planets. Edicts apply to all planets simultaneously for half the cost.',
        tags: ['infrastructure', 'governance'], aiTags: ['economy']
    },
    {
        id: 'inf_t3_9', name: 'Resource Flow Optimization',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'Magnetic catapults and space elevators perfectly sync to orbital transport schedules.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.TRADE],
        position: { x: 16, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Better internal logistics. Resources generated on one planet are instantly available empire-wide without transit delay.',
        tags: ['infrastructure', 'logistics'], aiTags: ['economy']
    },
    {
        id: 'inf_t3_10', name: 'Emergency Response Systems',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.DOMINANCE, branch: 'planetary_dominance',
        description: 'A dedicated fleet of disaster-relief vessels and rapid-deployment medical troops.',
        effects: [],
        prerequisites: [], researchCost: 500,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 18, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces crisis penalties. Famines, plagues, and natural disasters resolve in half the time.',
        tags: ['infrastructure', 'welfare'], aiTags: ['defense']
    },

    // ============================================
    // TIER 4 - TRANSFORMATION: EMPIRE IDENTITY
    // Theme: "What kind of civilization are you?"
    // ============================================
    
    // PATH A: MACHINE WORLD ASCENSION (Maximum Production, Minimal Humanity)
    {
        id: 'inf_t4_mac_1', name: 'Machine World Ascension',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'machine_world_ascension',
        description: 'My empire is a perfectly optimized machine. Flesh is weak; gears are eternal.',
        effects: [],
        prerequisites: ['inf_t3_1'], researchCost: 1000,
        mutuallyExclusiveGroup: 'infrastructure_t4_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_INFRASTRUCTURE'],
        mechanicalEffect: 'Converts planets into Machine Worlds. Extremely high output and minimal inefficiency. Trade-off: Low happiness, high instability risk, and vulnerable to disruption of central systems.',
        tags: ['infrastructure', 'industry', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'inf_t4_mac_2', name: 'Absolute Output Algorithms',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'machine_world_ascension',
        description: 'Every second of every citizen\'s life is scheduled to maximize GDP.',
        effects: [],
        prerequisites: ['inf_t4_mac_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 1, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Base output of all resource-generating buildings is doubled.',
        tags: ['infrastructure', 'industry'], aiTags: ['offensive']
    },
    {
        id: 'inf_t4_mac_3', name: 'Biosphere Elimination',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'machine_world_ascension',
        description: 'Oceans are drained for coolant. Forests are paved for server racks.',
        effects: [],
        prerequisites: ['inf_t4_mac_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.TERRITORY],
        position: { x: 3, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Planets no longer require Food or habitability. Maximum population cap is removed.',
        tags: ['infrastructure', 'population'], aiTags: ['offensive']
    },

    // PATH B: GALACTIC UTOPIA PROJECT (Perfect Living Conditions)
    {
        id: 'inf_t4_uto_1', name: 'Galactic Utopia Project',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'galactic_utopia_project',
        description: 'My people are my strength. No one hungers, no one hurts.',
        effects: [],
        prerequisites: ['inf_t3_4'], researchCost: 1000,
        mutuallyExclusiveGroup: 'infrastructure_t4_path',
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 9, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_INFRASTRUCTURE'],
        mechanicalEffect: 'High happiness and absolute stability. Strong resistance to unrest and ideological attacks. Trade-off: Lower raw production and slower expansion.',
        tags: ['infrastructure', 'welfare', 'global_alert'], aiTags: ['defense']
    },
    {
        id: 'inf_t4_uto_2', name: 'Post-Scarcity Automation',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'galactic_utopia_project',
        description: 'The concept of labor is obsolete. Machines provide for all basic needs.',
        effects: [],
        prerequisites: ['inf_t4_uto_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.WEALTH],
        position: { x: 8, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Population upkeep is reduced to zero. Unrest from lack of resources is impossible.',
        tags: ['infrastructure', 'economy'], aiTags: ['defense']
    },
    {
        id: 'inf_t4_uto_3', name: 'Absolute Contentment',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'galactic_utopia_project',
        description: 'A society so perfect, citizens of other empires will overthrow their leaders to join it.',
        effects: [],
        prerequisites: ['inf_t4_uto_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE, SeasonScoreCategory.POPULATION],
        position: { x: 10, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Generates immense passive Influence. Nearby rival planets constantly lose Loyalty towards you.',
        tags: ['infrastructure', 'culture'], aiTags: ['diplomacy']
    },

    // PATH C: HYPER-SPECIALIZED EMPIRE (Extreme Optimization)
    {
        id: 'inf_t4_hyp_1', name: 'Hyper-Specialized Empire',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'hyper_specialized_empire',
        description: 'Each world is perfect at one thing. We are a symphony of distinct instruments.',
        effects: [],
        prerequisites: ['inf_t3_8'], researchCost: 1000,
        mutuallyExclusiveGroup: 'infrastructure_t4_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 15, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_INFRASTRUCTURE'],
        mechanicalEffect: 'Planets gain massive bonuses (+100%) when designated for a specific role. Trade-off: Less adaptable. Extremely vulnerable if key specialized planets are captured or destroyed.',
        tags: ['infrastructure', 'governance', 'global_alert'], aiTags: ['economy']
    },
    {
        id: 'inf_t4_hyp_2', name: 'Planetary Designation Edicts',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'hyper_specialized_empire',
        description: 'Laws tailored specifically to the unique biome and purpose of each world.',
        effects: [],
        prerequisites: ['inf_t4_hyp_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.INFLUENCE],
        position: { x: 14, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Unlocks powerful edicts that can only be enacted on correctly specialized planets.',
        tags: ['infrastructure', 'governance'], aiTags: ['economy']
    },
    {
        id: 'inf_t4_hyp_3', name: 'System-Wide Synergy',
        tree: TechTreeType.INFRASTRUCTURE, tier: TechTier.TRANSFORMATION, branch: 'hyper_specialized_empire',
        description: 'Specialized planets share their extreme efficiency bonuses with all other planets in the same system.',
        effects: [],
        prerequisites: ['inf_t4_hyp_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 16, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'A system with a Forge World and an Agri World grants both planets massive synergy bonuses.',
        tags: ['infrastructure', 'logistics'], aiTags: ['economy']
    }
];
