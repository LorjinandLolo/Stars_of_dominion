import { Tech, TechTreeType, TechTier, TechEffectType, SeasonScoreCategory } from '../types';

export const economyTree: Tech[] = [
    // ============================================
    // TIER 1 - EXPANSION: ECONOMIC FOUNDATIONS
    // Theme: "Make your economy function"
    // ============================================
    {
        id: 'eco_t1_1', name: 'Automated Mining Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Deploy advanced autonomous subroutines to manage extraction facilities without biological supervision.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 0, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Increases base resource extraction reliability and slightly boosts raw yield.',
        tags: ['economy', 'mining'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_2', name: 'Trade Route Initialization',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Establish the core navigational charts and protocols required for regular interstellar shipments.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.TRADE],
        position: { x: 2, y: 0 },
        unlockFlags: ['ENABLE_TRADE_ROUTES'],
        mechanicalEffect: 'Unlocks interplanetary trade routes.',
        tags: ['economy', 'trade'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_3', name: 'Basic Logistics Networks',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Standardize shipping containers and transit lanes across controlled space.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 4, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves resource transfer speed across all trade routes.',
        tags: ['economy', 'logistics'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_4', name: 'Storage Optimization',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Implement quantum-compression storage techniques in major hubs.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.WEALTH],
        position: { x: 6, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Increases planetary and empire-wide resource storage capacity by 25%.',
        tags: ['economy', 'infrastructure'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_5', name: 'Resource Conversion I',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Adapt industrial replicators for basic raw-to-manufactured material processing.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 8, y: 0 },
        unlockFlags: ['ENABLE_RESOURCE_CONVERSION'],
        mechanicalEffect: 'Unlocks basic conversion (e.g., metal to ammo) in industrial hubs.',
        tags: ['economy', 'industry'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_6', name: 'Supply Chain Tracking',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Mandate digital signatures for all cargo to prevent loss and piracy.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 10, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Provides UI visibility on incoming/outgoing resources and predicts shortfalls.',
        tags: ['economy', 'logistics'], aiTags: ['intel']
    },
    {
        id: 'eco_t1_7', name: 'Maintenance Protocols',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Standardize replacement parts across military and civilian fleets.',
        effects: [],
        prerequisites: [], researchCost: 60,
        seasonScoreTags: [SeasonScoreCategory.WEALTH],
        position: { x: 12, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces fleet and building upkeep inefficiency by 10%.',
        tags: ['economy', 'infrastructure'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_8', name: 'Freighter Fleets I',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Design and mass-produce dedicated super-heavy transport vessels.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.TRADE],
        position: { x: 14, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Enables bulk transport capacity, significantly raising the cap on trade volume.',
        tags: ['economy', 'trade'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_9', name: 'Local Market Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'Establish decentralized markets to distribute resources locally before lifting to orbit.',
        effects: [],
        prerequisites: [], researchCost: 50,
        seasonScoreTags: [SeasonScoreCategory.WEALTH],
        position: { x: 16, y: 0 },
        unlockFlags: [],
        mechanicalEffect: 'Improves intra-planet resource efficiency, reducing local waste.',
        tags: ['economy', 'civilian'], aiTags: ['economy']
    },
    {
        id: 'eco_t1_10', name: 'Economic Overview UI',
        tree: TechTreeType.ECONOMY, tier: TechTier.EXPANSION, branch: 'economic_foundations',
        description: 'A unified digital ledger connecting all planetary governors directly to the central authority.',
        effects: [],
        prerequisites: [], researchCost: 40,
        seasonScoreTags: [SeasonScoreCategory.INTEL],
        position: { x: 18, y: 0 },
        unlockFlags: ['UNLOCK_ECONOMIC_DASHBOARD'],
        mechanicalEffect: 'Grants access to the Centralized Economic Dashboard.',
        tags: ['economy', 'infrastructure'], aiTags: ['intel']
    },

    // ============================================
    // TIER 2 - SPECIALIZATION: ECONOMIC IDENTITY
    // Theme: "How do I generate power?"
    // ============================================
    // PATH A: INDUSTRIAL OUTPUT
    {
        id: 'eco_t2_ind_1', name: 'Mega-Extraction Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'industrial_output',
        description: 'Strip-mine planets to their mantle to fuel the war machine.',
        effects: [],
        prerequisites: ['eco_t1_1'], researchCost: 150,
        mutuallyExclusiveGroup: 'economy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 0, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Massively increases raw resource output. Locks out Trade and Efficiency paths early.',
        tags: ['economy', 'mining'], aiTags: ['economy']
    },
    {
        id: 'eco_t2_ind_2', name: 'Industrial Overdrive',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'industrial_output',
        description: 'Run factories past safety tolerances. The quotas must be met.',
        effects: [],
        prerequisites: ['eco_t2_ind_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 2, y: 3 },
        unlockFlags: ['ENABLE_INDUSTRIAL_OVERDRIVE'],
        mechanicalEffect: 'Unlocks planetary action: +50% production speed for 3 turns, but reduces stability.',
        tags: ['economy', 'industry'], aiTags: ['offensive']
    },
    {
        id: 'eco_t2_ind_3', name: 'Planetary Factory Networks',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'industrial_output',
        description: 'Cover entire continents in automated assembly lines.',
        effects: [],
        prerequisites: ['eco_t2_ind_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 4, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Allows construction of overlapping industrial sectors on a single planet.',
        tags: ['economy', 'infrastructure'], aiTags: ['economy']
    },
    {
        id: 'eco_t2_ind_4', name: 'Mass Production Doctrine',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'industrial_output',
        description: 'Standardize everything. Quantity has a quality all its own.',
        effects: [],
        prerequisites: ['eco_t2_ind_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 1, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces the cost of building basic military units by 20%.',
        tags: ['economy', 'military'], aiTags: ['offensive']
    },
    {
        id: 'eco_t2_ind_5', name: 'Resource Throughput Optimization',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'industrial_output',
        description: 'Widen the bottlenecks in your logistical pipelines.',
        effects: [],
        prerequisites: ['eco_t2_ind_1', 'eco_t2_ind_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 3, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Vastly increases the maximum bandwidth of all internal trade routes.',
        tags: ['economy', 'logistics'], aiTags: ['economy']
    },

    // PATH B: TRADE & WEALTH
    {
        id: 'eco_t2_trd_1', name: 'Interstellar Trade Hubs',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'trade_and_wealth',
        description: 'Construct massive orbital stations to facilitate multi-system commerce.',
        effects: [],
        prerequisites: ['eco_t1_2'], researchCost: 150,
        mutuallyExclusiveGroup: 'economy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.TRADE, SeasonScoreCategory.WEALTH],
        position: { x: 6, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Greatly increases income from foreign trade routes. Locks out Industry and Efficiency paths early.',
        tags: ['economy', 'trade'], aiTags: ['diplomacy']
    },
    {
        id: 'eco_t2_trd_2', name: 'Trade Pact Optimization',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'trade_and_wealth',
        description: 'Legislate favorable tariffs and customs regulations with allied factions.',
        effects: [],
        prerequisites: ['eco_t2_trd_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.TRADE, SeasonScoreCategory.INFLUENCE],
        position: { x: 8, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Trade pacts generate additional diplomatic influence over time.',
        tags: ['economy', 'diplomacy'], aiTags: ['diplomacy']
    },
    {
        id: 'eco_t2_trd_3', name: 'Dynamic Pricing Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'trade_and_wealth',
        description: 'Algorithmic market adjustments that always sell high and buy low.',
        effects: [],
        prerequisites: ['eco_t2_trd_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.WEALTH],
        position: { x: 10, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Improves credit conversion rates when selling excess resources to the market.',
        tags: ['economy', 'markets'], aiTags: ['economy']
    },
    {
        id: 'eco_t2_trd_4', name: 'Commercial Influence Networks',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'trade_and_wealth',
        description: 'Leverage corporate monopolies to exert soft power on foreign governments.',
        effects: [],
        prerequisites: ['eco_t2_trd_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.INFLUENCE],
        position: { x: 7, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Rivals reliant on your exports suffer a penalty to hostility actions against you.',
        tags: ['economy', 'diplomacy'], aiTags: ['defense']
    },
    {
        id: 'eco_t2_trd_5', name: 'Luxury Resource Markets',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'trade_and_wealth',
        description: 'Capitalize on the desires of the elite across the galaxy.',
        effects: [],
        prerequisites: ['eco_t2_trd_1', 'eco_t2_trd_2'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.STABILITY],
        position: { x: 9, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Selling rare resources generates immense credit bursts and boosts local stability.',
        tags: ['economy', 'markets'], aiTags: ['economy']
    },

    // PATH C: EFFICIENCY & SUSTAINABILITY
    {
        id: 'eco_t2_eff_1', name: 'Closed-Loop Resource Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'efficiency_and_sustainability',
        description: 'Recycle everything. Every byproduct is fuel for another process.',
        effects: [],
        prerequisites: ['eco_t1_7'], researchCost: 150,
        mutuallyExclusiveGroup: 'economy_t2_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.WEALTH],
        position: { x: 12, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Slashes all empire upkeep costs by 20%. Locks out Industry and Trade paths early.',
        tags: ['economy', 'infrastructure'], aiTags: ['defense']
    },
    {
        id: 'eco_t2_eff_2', name: 'Precision Resource Allocation',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'efficiency_and_sustainability',
        description: 'AI-driven logistics ensuring not a single crate is misplaced or delayed.',
        effects: [],
        prerequisites: ['eco_t2_eff_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Prevents any resource loss from piracy or black market drains within your borders.',
        tags: ['economy', 'logistics'], aiTags: ['defense']
    },
    {
        id: 'eco_t2_eff_3', name: 'Waste Elimination Protocols',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'efficiency_and_sustainability',
        description: 'Zero tolerance for inefficiency in manufacturing or civic life.',
        effects: [],
        prerequisites: ['eco_t2_eff_1'], researchCost: 180,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 16, y: 3 },
        unlockFlags: [],
        mechanicalEffect: 'Increases output of all existing buildings by 10% without increasing upkeep.',
        tags: ['economy', 'industry'], aiTags: ['economy']
    },
    {
        id: 'eco_t2_eff_4', name: 'Energy Efficiency Grids',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'efficiency_and_sustainability',
        description: 'Harness geothermal and solar phenomena to power planetary infrastructure indefinitely.',
        effects: [],
        prerequisites: ['eco_t2_eff_1'], researchCost: 200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 13, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'Buildings no longer require energy upkeep, freeing resources for other uses.',
        tags: ['economy', 'infrastructure'], aiTags: ['defense']
    },
    {
        id: 'eco_t2_eff_5', name: 'Sustainable Growth Models',
        tree: TechTreeType.ECONOMY, tier: TechTier.SPECIALIZATION, branch: 'efficiency_and_sustainability',
        description: 'Ensure expansion never outpaces the capacity to maintain it.',
        effects: [],
        prerequisites: ['eco_t2_eff_1', 'eco_t2_eff_3'], researchCost: 250,
        seasonScoreTags: [SeasonScoreCategory.POPULATION, SeasonScoreCategory.STABILITY],
        position: { x: 15, y: 4 },
        unlockFlags: [],
        mechanicalEffect: 'New colonies start with basic infrastructure already built and suffer no early stability penalties.',
        tags: ['economy', 'colonization'], aiTags: ['economy']
    },

    // ============================================
    // TIER 3 - DOMINANCE: ECONOMIC PRESSURE
    // Theme: "Use your economy against others"
    // ============================================
    {
        id: 'eco_t3_1', name: 'War Economy Mobilization',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Redirect civilian manufacturing entirely toward military applications.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.MILITARY, SeasonScoreCategory.PRODUCTION],
        position: { x: 0, y: 7 },
        unlockFlags: ['ENABLE_WAR_ECONOMY'],
        mechanicalEffect: 'Action: Temporarily double ship production speed at the cost of immense stability loss.',
        tags: ['economy', 'military'], aiTags: ['offensive']
    },
    {
        id: 'eco_t3_2', name: 'Economic Sanctions',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Leverage the galactic market to embargo a specific rival.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.INFLUENCE],
        position: { x: 2, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Action: Target rival suffers a 50% penalty to all trade efficiency for 3 turns.',
        tags: ['economy', 'diplomacy'], aiTags: ['offensive']
    },
    {
        id: 'eco_t3_3', name: 'Supply Line Disruption',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Fund privateers to quietly choke off an enemy’s logistics.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION],
        position: { x: 4, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Target fleet suffers massive attrition and combat penalties due to lack of supply.',
        tags: ['economy', 'covert'], aiTags: ['offensive']
    },
    {
        id: 'eco_t3_4', name: 'Strategic Stockpiling',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Hoard critical materials to artificially inflate prices before a war.',
        effects: [],
        prerequisites: [], researchCost: 350,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.PRODUCTION],
        position: { x: 6, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Allows you to exceed storage caps temporarily, then unleash a massive burst of production.',
        tags: ['economy', 'markets'], aiTags: ['defense']
    },
    {
        id: 'eco_t3_5', name: 'Resource Denial Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Aggressively purchase or destroy key deposits right on the enemy border.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.DISRUPTION, SeasonScoreCategory.PRODUCTION],
        position: { x: 8, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Reduces an adjacent rival\'s resource extraction rate.',
        tags: ['economy', 'sabotage'], aiTags: ['offensive']
    },
    {
        id: 'eco_t3_6', name: 'Black Market Operations',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Bypass embargoes and tariffs through an established underworld.',
        effects: [],
        prerequisites: [], researchCost: 380,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.TRADE],
        position: { x: 10, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Allows trading with hostile factions or embargoed systems securely in secret.',
        tags: ['economy', 'covert'], aiTags: ['intel']
    },
    {
        id: 'eco_t3_7', name: 'Emergency Resource Conversion',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Melt down civilian infrastructure to build battleships if the need is dire.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 12, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Convert any resource into any other resource instantly, at a harsh penalty.',
        tags: ['economy', 'industry'], aiTags: ['defense']
    },
    {
        id: 'eco_t3_8', name: 'Trade Route Manipulation',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Reroute the flow of goods dynamically to starve enemies or enrich allies.',
        effects: [],
        prerequisites: [], researchCost: 450,
        seasonScoreTags: [SeasonScoreCategory.TRADE, SeasonScoreCategory.DISRUPTION],
        position: { x: 14, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Instantly sever or redirect enemy trade routes passing near your territory.',
        tags: ['economy', 'trade'], aiTags: ['offensive']
    },
    {
        id: 'eco_t3_9', name: 'Economic Intelligence Integration',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Sync your markets directly with espionage networks to foresee crashes.',
        effects: [],
        prerequisites: [], researchCost: 400,
        seasonScoreTags: [SeasonScoreCategory.INTEL, SeasonScoreCategory.TRADE],
        position: { x: 16, y: 7 },
        unlockFlags: ['ECONOMIC_ESPIONAGE_SYNC'],
        mechanicalEffect: 'Reveals the exact resource deficits of all rivals in the diplomacy panel.',
        tags: ['economy', 'intel'], aiTags: ['intel']
    },
    {
        id: 'eco_t3_10', name: 'Upkeep Suppression Systems',
        tree: TechTreeType.ECONOMY, tier: TechTier.DOMINANCE, branch: 'economic_pressure',
        description: 'Subsidize the military via corporate sponsorships and shadow funds.',
        effects: [],
        prerequisites: [], researchCost: 500,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.MILITARY],
        position: { x: 18, y: 7 },
        unlockFlags: [],
        mechanicalEffect: 'Prevents upkeep costs from spiking when deploying fleets outside your territory.',
        tags: ['economy', 'military'], aiTags: ['offensive']
    },

    // ============================================
    // TIER 4 - TRANSFORMATION: ECONOMIC IDENTITY
    // Theme: "What kind of economic empire are you?"
    // ============================================
    
    // PATH A: GALACTIC INDUSTRIAL COMPLEX (Raw Production Dominance)
    {
        id: 'eco_t4_ind_1', name: 'Galactic Industrial Complex',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'galactic_industrial_complex',
        description: 'I outproduce the galaxy. Every world is a factory, every citizen a worker.',
        effects: [],
        prerequisites: ['eco_t3_1'], researchCost: 1000,
        mutuallyExclusiveGroup: 'economy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 2, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_ECONOMY'],
        mechanicalEffect: 'Massive production scaling. Can sustain colossal fleets easily. Trade-off: High upkeep, systemic instability, and extremely vulnerable to supply line disruption.',
        tags: ['economy', 'industry', 'global_alert'], aiTags: ['offensive']
    },
    {
        id: 'eco_t4_ind_2', name: 'Unbound Extraction',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'galactic_industrial_complex',
        description: 'Harvest planets until they break. There is always another rock.',
        effects: [],
        prerequisites: ['eco_t4_ind_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION],
        position: { x: 1, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Gain a permanent +100% extraction rate, but your planets slowly lose habitability.',
        tags: ['economy', 'mining'], aiTags: ['offensive']
    },
    {
        id: 'eco_t4_ind_3', name: 'War-Forge Integration',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'galactic_industrial_complex',
        description: 'The moment a ship is destroyed, another is already rolling off the line to replace it.',
        effects: [],
        prerequisites: ['eco_t4_ind_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.MILITARY],
        position: { x: 3, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'When your fleets are destroyed, you automatically recoup 50% of their construction cost.',
        tags: ['economy', 'military'], aiTags: ['offensive']
    },

    // PATH B: TRADE HEGEMONY (Market Control)
    {
        id: 'eco_t4_trd_1', name: 'Trade Hegemony',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'trade_hegemony',
        description: 'I control the flow of wealth. The galaxy fights with weapons I sold them.',
        effects: [],
        prerequisites: ['eco_t3_8'], researchCost: 1000,
        mutuallyExclusiveGroup: 'economy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.TRADE, SeasonScoreCategory.WEALTH],
        position: { x: 9, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_ECONOMY'],
        mechanicalEffect: 'Dominates trade networks, gaining a percentage of all commerce in the galaxy. Trade-off: Completely dependent on diplomacy. Devastated by sanctions and isolation.',
        tags: ['economy', 'trade', 'global_alert'], aiTags: ['diplomacy']
    },
    {
        id: 'eco_t4_trd_2', name: 'Monopolistic Cartels',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'trade_hegemony',
        description: 'Ensure no one else can legally sell certain strategic materials.',
        effects: [],
        prerequisites: ['eco_t4_trd_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.TRADE],
        position: { x: 8, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'You set the market price for rare resources. Rivals must pay you a premium or face shortages.',
        tags: ['economy', 'markets'], aiTags: ['diplomacy']
    },
    {
        id: 'eco_t4_trd_3', name: 'Interstellar Reserve Currency',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'trade_hegemony',
        description: 'Your fiat becomes the baseline for all galactic transactions.',
        effects: [],
        prerequisites: ['eco_t4_trd_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.WEALTH, SeasonScoreCategory.INFLUENCE],
        position: { x: 10, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'You can print credits at will without inflation, and other empires pay a tax on every trade.',
        tags: ['economy', 'markets'], aiTags: ['diplomacy']
    },

    // PATH C: PERFECT EFFICIENCY NETWORK (Self-Sustaining System)
    {
        id: 'eco_t4_eff_1', name: 'Perfect Efficiency Network',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'perfect_efficiency_network',
        description: 'I don’t waste anything. A perfectly balanced system that cannot be starved.',
        effects: [],
        prerequisites: ['eco_t3_10'], researchCost: 1000,
        mutuallyExclusiveGroup: 'economy_t4_path',
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 15, y: 11 },
        unlockFlags: ['GLOBAL_ALERT_ECONOMY'],
        mechanicalEffect: 'Minimal losses and upkeep. Immune to blockades and economic sabotage. Trade-off: Lower peak output and much slower aggressive scaling.',
        tags: ['economy', 'infrastructure', 'global_alert'], aiTags: ['defense']
    },
    {
        id: 'eco_t4_eff_2', name: 'Absolute Resource Cycles',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'perfect_efficiency_network',
        description: 'Matter is never lost, only reformed. Ships recycle their own damage.',
        effects: [],
        prerequisites: ['eco_t4_eff_1'], researchCost: 1200,
        seasonScoreTags: [SeasonScoreCategory.PRODUCTION, SeasonScoreCategory.STABILITY],
        position: { x: 14, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Your fleets passively regenerate armor outside of combat at zero cost.',
        tags: ['economy', 'military'], aiTags: ['defense']
    },
    {
        id: 'eco_t4_eff_3', name: 'Post-Scarcity Foundations',
        tree: TechTreeType.ECONOMY, tier: TechTier.TRANSFORMATION, branch: 'perfect_efficiency_network',
        description: 'Citizens want for nothing. Stability is absolute and eternal.',
        effects: [],
        prerequisites: ['eco_t4_eff_1'], researchCost: 1500,
        seasonScoreTags: [SeasonScoreCategory.STABILITY, SeasonScoreCategory.POPULATION],
        position: { x: 16, y: 12 },
        unlockFlags: [],
        mechanicalEffect: 'Planetary stability is locked at 100%. Rebellions and strikes are impossible.',
        tags: ['economy', 'civilian'], aiTags: ['defense']
    }
];
