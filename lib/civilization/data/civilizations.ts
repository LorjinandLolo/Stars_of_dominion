// lib/civilization/data/civilizations.ts

import { CivilizationDefinition } from '../types';

export const CIVILIZATIONS: CivilizationDefinition[] = [
  {
    id: 'civ-mycelari',
    name: 'Mycelari Conclave',
    shortDescription: 'Hive symbiote fungal network focusing on swarm tactics and resilience.',
    lore: 'The Mycelari are not a single species, but a vast, interconnected fungal network that lives in symbiosis with millions of host organisms. They seek to spread their synaptic bloom across the stars.',
    speciesType: 'Fungal',
    visualTheme: 'organic-purple',
    playstyleTags: ['hive', 'biological', 'expansion', 'swarm', 'resilience'],
    baseModifiers: {
      'manpower_generation': 0.3,
      'rebellion_chance': -0.5,
      'planetary_assimilation_speed': 0.25,
      'diplomatic_trust_cap': -50
    },
    startingStateEffects: {
      startingResources: { 'FOOD': 1000, 'METALS': 200 },
      startingTechs: ['bio_logic_1', 'hive_networking'],
      startingUnits: ['spore_legion', 'spore_legion'],
      startingBuildings: ['spore_nexus'],
      startingPopulationBias: 'hive_only'
    },
    doctrineBiases: {
      military: ['mass_assault', 'attrition'],
      economic: ['biological_extraction'],
      intelligence: ['synaptic_infiltration'],
      social: ['collectivism']
    },
    uniqueUnitIds: ['spore_legion'],
    uniqueBuildingIds: ['spore_nexus'],
    uniqueActionIds: ['spore_spread', 'synaptic_overgrowth'],
    eventTags: ['collective_whispers', 'planetary_bloom'],
    aiBehaviorProfile: {
      aggression: 60,
      deception: 30,
      tradeFocus: 10,
      expansionFocus: 90,
      techFocus: 40,
      loyaltyFocus: 100,
      riskTolerance: 70
    },
    weaknesses: ['Poor conventional diplomacy', 'Vulnerable to biological firewalls'],
    preferredVictories: ['Conquest', 'Enlightenment']
  },
  {
    id: 'civ-auraxian',
    name: 'Auraxian Trade Guilds',
    shortDescription: 'Hyper-capitalist corporate civilization specializing in economic leverage.',
    lore: 'For the Auraxians, profit is the highest form of virtue. Their empire is a collection of powerful guilds that view the galaxy as a marketplace to be cornered.',
    speciesType: 'Biological',
    visualTheme: 'corporate-gold',
    playstyleTags: ['capitalist', 'trade', 'mercenary', 'diplomacy', 'soft-power'],
    baseModifiers: {
      'trade_value': 0.4,
      'market_efficiency': 0.2,
      'credits_generation': 0.3,
      'manpower_upkeep': -0.2
    },
    startingStateEffects: {
      startingResources: { 'CREDITS': 5000, 'RARES': 100 },
      startingTechs: ['market_theory', 'contract_law'],
      startingUnits: ['contract_fleet'],
      startingBuildings: ['trading_hub'],
      startingPopulationBias: 'diverse'
    },
    doctrineBiases: {
      military: ['decisive_battle', 'mercenary_support', 'precision_strikes'],
      economic: ['free_market', 'trade_monopoly'],
      intelligence: ['corporate_espionage'],
      social: ['individualism']
    },
    uniqueUnitIds: ['contract_fleet'],
    uniqueBuildingIds: ['exchange_spire'],
    uniqueActionIds: ['buy_influence', 'fund_insurgency', 'bribe_governor'],
    eventTags: ['hostile_takeover', 'market_panic'],
    aiBehaviorProfile: {
      aggression: 30,
      deception: 80,
      tradeFocus: 100,
      expansionFocus: 50,
      techFocus: 60,
      loyaltyFocus: 40,
      riskTolerance: 50
    },
    weaknesses: ['Weaker in prolonged attrition', 'Economy-dependent stability'],
    preferredVictories: ['Economic', 'Diplomacy']
  },
  {
    id: 'civ-velkori',
    name: 'Velkori Imperium',
    shortDescription: 'Militaristic noble empire built on conquest and aristocratic honor.',
    lore: 'The Velkori follow a strict code of martial honor. Their society is divided into Great Houses that compete for glory and the Emperor\'s favor.',
    speciesType: 'Biological',
    visualTheme: 'imperial-crimson',
    playstyleTags: ['imperial', 'militarist', 'aristocratic', 'conquest', 'elite'],
    baseModifiers: {
      'combat_strength': 0.15,
      'leader_xp_gain': 0.25,
      'fleet_discipline': 0.2,
      'rebellion_chance': 0.1 // Noble house rivalries
    },
    startingStateEffects: {
      startingResources: { 'METALS': 800, 'AMMO': 300 },
      startingTechs: ['martial_code', 'house_etiquette'],
      startingUnits: ['imperial_guard'],
      startingBuildings: ['hall_of_triumphs'],
      startingPopulationBias: 'aristocratic'
    },
    doctrineBiases: {
      military: ['decisive_battle', 'shock_awe'],
      economic: ['resource_tribute'],
      intelligence: ['internal_security'],
      social: ['traditionalism']
    },
    uniqueUnitIds: ['imperial_guard'],
    uniqueBuildingIds: ['hall_of_triumphs'],
    uniqueActionIds: ['duel_of_houses', 'honorable_campaign'],
    eventTags: ['succession_quarrel', 'noble_rivalry'],
    aiBehaviorProfile: {
      aggression: 90,
      deception: 20,
      tradeFocus: 30,
      expansionFocus: 80,
      techFocus: 40,
      loyaltyFocus: 70,
      riskTolerance: 80
    },
    weaknesses: ['Internal loyalty crises', 'High leader maintenance'],
    preferredVictories: ['Conquest']
  },
  {
    id: 'civ-nythari',
    name: 'Nythari Veil',
    shortDescription: 'Shadow civilization specializing in espionage, sabotage, and deception.',
    lore: 'Secrets are the currency of the Nythari. They believe that true power is never seen, and prefer to win wars before the first shot is even fired.',
    speciesType: 'Biological',
    visualTheme: 'stealth-black',
    playstyleTags: ['stealth', 'espionage', 'deception', 'disruption', 'indirect-war'],
    baseModifiers: {
      'espionage_power': 0.4,
      'espionage_detection_evasion': 0.3,
      'sabotage_efficiency': 0.25,
      'combat_strength': -0.15
    },
    startingStateEffects: {
      startingResources: { 'ENERGY': 500, 'CREDITS': 1500 },
      startingTechs: ['shadow_networking', 'deception_protocols'],
      startingUnits: ['phantom_operatives'],
      startingBuildings: ['veil_node'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['guerilla_warfare', 'asymmetric'],
      economic: ['free_market', 'black_market'],
      intelligence: ['covert_ops', 'disruptive_logic'],
      social: ['secrecy']
    },
    uniqueUnitIds: ['phantom_operatives'],
    uniqueBuildingIds: ['veil_node'],
    uniqueActionIds: ['false_flag', 'fake_fleet_signal', 'shadow_incitement'],
    eventTags: ['ghost_transmissions', 'erased_archives'],
    aiBehaviorProfile: {
      aggression: 40,
      deception: 100,
      tradeFocus: 40,
      expansionFocus: 40,
      techFocus: 70,
      loyaltyFocus: 60,
      riskTolerance: 60
    },
    weaknesses: ['Weak direct combat', 'Low conventional military capacity'],
    preferredVictories: ['Diplomacy', 'Enlightenment']
  },
  {
    id: 'civ-solari',
    name: 'Solari Ascendancy',
    shortDescription: 'Energy-based civilization pursuing technological transcendence.',
    lore: 'The Solari have moved beyond the need for solid forms, existing as sentient energy lattices. They seek to elevate all life to a state of pure resonance.',
    speciesType: 'Energy',
    visualTheme: 'luminous-blue',
    playstyleTags: ['energy', 'enlightenment', 'technocratic', 'fragile', 'advanced'],
    baseModifiers: {
      'energy_generation': 0.35,
      'energy_efficiency': 0.25,
      'research_speed': 0.2,
      'manpower_generation': -0.5
    },
    startingStateEffects: {
      startingResources: { 'ENERGY': 3000, 'CHEMICALS': 200 },
      startingTechs: ['energy_resonance', 'harmonic_transcendence'],
      startingUnits: ['radiant_construct'],
      startingBuildings: ['luminous_conduit'],
      startingPopulationBias: 'constructs'
    },
    doctrineBiases: {
      military: ['active_defense', 'energy_weapons', 'distance_warfare'],
      economic: ['expansionist', 'energy_siphon'],
      intelligence: ['internal_security', 'signals_analysis'],
      social: ['transcendentalism']
    },
    uniqueUnitIds: ['radiant_construct'],
    uniqueBuildingIds: ['luminous_conduit'],
    uniqueActionIds: ['planetary_elevation', 'resonance_pulse'],
    eventTags: ['harmonic_resonance', 'unstable_lattice'],
    aiBehaviorProfile: {
      aggression: 50,
      deception: 40,
      tradeFocus: 30,
      expansionFocus: 60,
      techFocus: 100,
      loyaltyFocus: 80,
      riskTolerance: 60
    },
    weaknesses: ['Infrastructure disruption vulnerability', 'Low manpower capacity'],
    preferredVictories: ['Enlightenment']
  },
  {
    id: 'civ-grakkar',
    name: 'Grakkar Dominion',
    shortDescription: 'Brutal industrial conquest machine fueled by mass production.',
    lore: 'The Grakkar care only for the forge and the furnace. Their society is built on the sacrifice of the many for the strength of the state.',
    speciesType: 'Biological',
    visualTheme: 'industrial-rust',
    playstyleTags: ['industrial', 'authoritarian', 'conquest', 'production', 'harsh-rule'],
    baseModifiers: {
      'construction_speed': 0.4,
      'military_production_speed': 0.3,
      'ammo_production': 0.25,
      'happiness': -0.2
    },
    startingStateEffects: {
      startingResources: { 'METALS': 1500, 'CHEMICALS': 400 },
      startingTechs: ['war_foundry_tech', 'labor_directives'],
      startingUnits: ['siege_behemoth'],
      startingBuildings: ['war_foundry'],
      startingPopulationBias: 'laborers'
    },
    doctrineBiases: {
      military: ['mass_assault', 'overwhelming_force', 'total_war'],
      economic: ['expansionist', 'heavy_industry'],
      intelligence: ['internal_security', 'forced_compliance'],
      social: ['authoritarianism']
    },
    uniqueUnitIds: ['siege_behemoth'],
    uniqueBuildingIds: ['war_foundry'],
    uniqueActionIds: ['forced_labor_surge', 'war_ration_decree'],
    eventTags: ['labor_crackdown', 'furnace_overload'],
    aiBehaviorProfile: {
      aggression: 100,
      deception: 10,
      tradeFocus: 20,
      expansionFocus: 80,
      techFocus: 30,
      loyaltyFocus: 50,
      riskTolerance: 90
    },
    weaknesses: ['High unrest risk', 'Low base happiness'],
    preferredVictories: ['Conquest']
  },
  {
    id: 'civ-elyndra',
    name: 'Elyndra Consensus',
    shortDescription: 'Multi-species democratic federation focusing on stability and diplomacy.',
    lore: 'The Elyndra believe that diversity is the galaxy\'s greatest strength. They seek to bring all species together under a banner of peace and cooperation.',
    speciesType: 'Biological',
    visualTheme: 'federation-white',
    playstyleTags: ['democratic', 'alliance', 'diplomacy', 'defensive', 'stable'],
    baseModifiers: {
      'happiness': 0.25,
      'diplomatic_influence': 0.3,
      'treaty_trust_gain': 0.4,
      'military_offensive_strength': -0.1
    },
    startingStateEffects: {
      startingResources: { 'CREDITS': 2000, 'FOOD': 600 },
      startingTechs: ['consensus_building', 'diplomatic_protocol'],
      startingUnits: ['peacekeeper_fleet'],
      startingBuildings: ['consensus_forum'],
      startingPopulationBias: 'multi_species'
    },
    doctrineBiases: {
      military: ['active_defense', 'containment'],
      economic: ['mercantile', 'cooperative_trade'],
      intelligence: ['internal_security', 'transparency_ops'],
      social: ['democratic_socialism']
    },
    uniqueUnitIds: ['peacekeeper_fleet'],
    uniqueBuildingIds: ['consensus_forum'],
    uniqueActionIds: ['reform_summit', 'coalition_debate'],
    eventTags: ['coalition_debate', 'public_deadlock'],
    aiBehaviorProfile: {
      aggression: 20,
      deception: 30,
      tradeFocus: 70,
      expansionFocus: 40,
      techFocus: 50,
      loyaltyFocus: 90,
      riskTolerance: 40
    },
    weaknesses: ['Slow offensive mobilization', 'Policy consensus lag'],
    preferredVictories: ['Diplomacy', 'Enlightenment']
  },
  {
    id: 'civ-xalthuun',
    name: 'Xal’thuun Remnants',
    shortDescription: 'Ancient machine remnants rebuilding after a prehistoric collapse.',
    lore: 'The Xal\'thuun are literal relics. Once the masters of the galaxy, they awoke from millennia of slumber to find their empire in dust. Now, they seek to reclaim their legacy.',
    speciesType: 'Machine',
    visualTheme: 'ancient-gold',
    playstyleTags: ['machine', 'ancient', 'relic', 'late-game', 'restoration'],
    baseModifiers: {
      'salvage_efficiency': 0.4,
      'relic_research_speed': 0.3,
      'construction_speed': -0.15,
      'unit_experience_gain': 0.2
    },
    startingStateEffects: {
      startingResources: { 'METALS': 400, 'RARES': 300 },
      startingTechs: ['precursor_archiving', 'reclamation_protocols'],
      startingUnits: ['reclaimer_drones'],
      startingBuildings: ['archive_vault'],
      startingPopulationBias: 'machine_only'
    },
    doctrineBiases: {
      military: ['defensive', 'automated_warfare', 'precise_salvage'],
      economic: ['resource_tribute', 'recycled_materials'],
      intelligence: ['internal_security', 'data_archaeology'],
      social: ['preservation']
    },
    uniqueUnitIds: ['reclaimer_drones'],
    uniqueBuildingIds: ['archive_vault'],
    uniqueActionIds: ['restore_ancient_system', 'reactivate_cache'],
    eventTags: ['memory_fragment', 'precursor_awakening'],
    aiBehaviorProfile: {
      aggression: 50,
      deception: 50,
      tradeFocus: 20,
      expansionFocus: 30,
      techFocus: 90,
      loyaltyFocus: 80,
      riskTolerance: 50
    },
    weaknesses: ['Slow early expansion', 'High resource costs for reactivation'],
    preferredVictories: ['Enlightenment', 'Economic']
  },

  // ══ The ten the world seed referenced but nobody wrote ═══════════════════
  //
  // buildEmptyEconomyState assigned civilization ids to all fourteen factions;
  // nine of them matched no entry here, so CivilizationRegistry.getCivilization
  // returned undefined and those empires picked doctrines with no temperament
  // at all. Eight are player designs (players_describ/); the Nexulans and the
  // Banking Clan were supplied separately.
  //
  // Two authoring rules, both load-bearing:
  //
  //  1. baseModifiers uses ONLY keys in CIV_MODIFIER_MAP
  //     (lib/civilization/modifiers.ts). Keys outside it reach no consumer —
  //     the eight civilizations above are full of them.
  //  2. doctrineBiases uses ONLY strings StrategicAIService actually tests
  //     (strategic-ai-service.ts:159-190):
  //       military      aggressive | mass_assault | decisive_battle
  //                     defensive | guerilla_warfare | active_defense
  //       economic      expansionist | biological_extraction
  //                     mercantile | free_market | resource_tribute
  //       intelligence  internal_security | synaptic_infiltration
  //                     corporate_espionage | covert_ops
  //     Anything else silently yields a balanced doctrine, which is how
  //     civ-grakkar ended up with aggression 100 and a balanced military stance.
  //
  // `social` biases, uniqueUnitIds, uniqueActionIds and startingTechs are kept
  // for shape only — nothing reads them yet.
  {
    id: 'civ-rhimetals',
    name: 'Rhimetals of Aeiralux',
    shortDescription: 'Winged hive custodians who police the galaxy rather than conquer it.',
    lore: 'Suspended above Aeiralux\'s storm-torn surface, the Rhimetals live in floating spires and think as one mind through Wofrrs, the Crowned Wing. They style themselves galactic custodians: arbitrators who intervene when others spiral into chaos. Mercy to the innocent, clarity to the defiant.',
    speciesType: 'Hive',
    visualTheme: 'celestial-silver',
    playstyleTags: ['hive', 'aerial', 'peacekeeping', 'precision', 'diplomacy'],
    baseModifiers: {
      'fleet_discipline': 0.3,
      'political_unity': 0.25,
      'espionage_power': 0.2,
      'research_speed': 0.15,
      'combat_strength': -0.2
    },
    startingStateEffects: {
      startingResources: { 'ENERGY': 800, 'CREDITS': 5000 },
      startingTechs: ['hive_resonance', 'stratospheric_lift'],
      startingUnits: ['peacekeeper_wing'],
      startingBuildings: ['habitat_block'],
      startingPopulationBias: 'hive_only'
    },
    doctrineBiases: {
      military: ['active_defense'],
      economic: ['resource_tribute'],
      intelligence: ['internal_security'],
      social: ['collectivism']
    },
    uniqueUnitIds: ['peacekeeper_wing'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['arbitrate_dispute', 'establish_new_node'],
    eventTags: ['crowned_wing_speaks', 'node_severed'],
    aiBehaviorProfile: {
      aggression: 35,
      deception: 20,
      tradeFocus: 40,
      expansionFocus: 45,
      techFocus: 65,
      loyaltyFocus: 100,
      riskTolerance: 40
    },
    weaknesses: ['Command collapses if the governing node is taken', 'Poor ground combat', 'Doctrine forbids the first strike'],
    preferredVictories: ['Diplomacy', 'Enlightenment']
  },
  {
    id: 'civ-gabagoon',
    name: 'Gabagoonians of Meatballia Prima',
    shortDescription: 'Squat, loyal brawlers who spike terrifyingly when fed and crash hard afterwards.',
    lore: 'A humid protein moon of fungal forests and capacola vines, organised entirely around food courts, worship-canteens and holovision temples. Under Eileen Ulick, the Soprano-Savant, the Gabagoonians are the galaxy\'s stickiest allies and its pettiest enemies.',
    speciesType: 'Biological',
    visualTheme: 'grease-gold',
    playstyleTags: ['brawler', 'burst', 'morale', 'loyalty', 'supply'],
    baseModifiers: {
      'food_output': 0.35,
      'happiness': 0.25,
      'combat_strength': 0.2,
      'fleet_discipline': -0.25,
      'research_speed': -0.2
    },
    startingStateEffects: {
      startingResources: { 'FOOD': 1200, 'CREDITS': 3000 },
      startingTechs: ['capacola_cultivation', 'broadcast_liturgy'],
      startingUnits: ['goon_phalanx'],
      startingBuildings: ['hydroponic_farm'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['decisive_battle'],
      economic: ['resource_tribute'],
      intelligence: ['internal_security'],
      social: ['traditionalism']
    },
    uniqueUnitIds: ['goon_phalanx'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['capacola_surge', 'declare_vendetta'],
    eventTags: ['rerun_marathon', 'sitcom_slight'],
    aiBehaviorProfile: {
      aggression: 55,
      deception: 25,
      tradeFocus: 60,
      expansionFocus: 40,
      techFocus: 25,
      loyaltyFocus: 95,
      riskTolerance: 65
    },
    weaknesses: ['Short range and slow baseline movement', 'Useless during the post-surge crash', 'Falls apart without a capacola supply line'],
    preferredVictories: ['Conquest', 'Diplomacy']
  },
  {
    id: 'civ-infernoid',
    name: 'Infernoids of Pyrothar',
    shortDescription: 'Volcanic predators who fight better wounded and explode when killed.',
    lore: 'Pyrothar is ash cloud and molten rock, and it forged its children into living weapons. Mulgar the Pyreborn Tyrant rules by the only law the Infernoids recognise: purity is flame, and the rest is ash. Pain is a sacrament; diplomacy is a weakness worth exploiting and nothing more.',
    speciesType: 'Biological',
    visualTheme: 'magma-obsidian',
    playstyleTags: ['attrition', 'shock', 'xenocidal', 'siege', 'heat'],
    baseModifiers: {
      'combat_strength': 0.35,
      'military_offensive_strength': 0.3,
      'energy_generation': 0.2,
      'research_speed': -0.3,
      'espionage_power': -0.3,
      'energy_efficiency': -0.25
    },
    startingStateEffects: {
      startingResources: { 'ENERGY': 1500, 'METALS': 400 },
      startingTechs: ['fireblood_weaponisation', 'thermal_sight'],
      startingUnits: ['cinder_brute'],
      startingBuildings: ['metal_mine'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['mass_assault'],
      economic: ['expansionist'],
      intelligence: ['internal_security'],
      social: ['secrecy']
    },
    uniqueUnitIds: ['cinder_brute', 'elder_infernoid'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['fireblood_detonation', 'wake_an_elder'],
    eventTags: ['ash_season', 'elder_stirs'],
    aiBehaviorProfile: {
      aggression: 95,
      deception: 15,
      tradeFocus: 5,
      expansionFocus: 75,
      techFocus: 30,
      loyaltyFocus: 80,
      riskTolerance: 95
    },
    weaknesses: ['Diplomatic pariah', 'Ravenous upkeep in cold or poor systems', 'No flyers and a thin navy until late'],
    preferredVictories: ['Conquest']
  },
  {
    id: 'civ-movanite',
    name: 'Movanites of Graviton Vale',
    shortDescription: 'Peaceable heavy-gravity bureaucrats who field endless cheap armies when finally provoked.',
    lore: 'Graviton Vale is a super-Earth whose crushing gravity shaped everything from architecture to bone. Cedeti the Third, Grand Komptroller of the Stampede, presides over a civilisation that resolves nearly everything by subcommittee — and has a constitutional clause permitting total retaliation when it does not.',
    speciesType: 'Biological',
    visualTheme: 'basalt-bronze',
    playstyleTags: ['swarm', 'industry', 'population', 'bureaucracy', 'retaliation'],
    baseModifiers: {
      'manpower_generation': 0.4,
      'metals_output': 0.3,
      'construction_speed': 0.2,
      'combat_strength': -0.25,
      'research_speed': -0.15
    },
    startingStateEffects: {
      startingResources: { 'METALS': 900, 'FOOD': 600 },
      startingTechs: ['gravitic_metallurgy', 'standing_committee'],
      startingUnits: ['stampede_column'],
      startingBuildings: ['metal_mine', 'habitat_block'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['active_defense'],
      economic: ['expansionist'],
      intelligence: ['internal_security'],
      social: ['collectivism']
    },
    uniqueUnitIds: ['stampede_column'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['fafo_protocol', 'emergency_session'],
    eventTags: ['population_boom', 'gridlock'],
    aiBehaviorProfile: {
      aggression: 30,
      deception: 20,
      tradeFocus: 55,
      expansionFocus: 85,
      techFocus: 45,
      loyaltyFocus: 85,
      riskTolerance: 35
    },
    weaknesses: ['Individually weak units', 'Bureaucratic throughput ceiling', 'Swarms evaporate to area damage', 'Overpopulation destabilises'],
    preferredVictories: ['Conquest', 'Economic']
  },
  {
    id: 'civ-leopantheri',
    name: 'Leo-pantheri of Savarr’Tel',
    shortDescription: 'Philosopher-duelists whose bonuses come from keeping their word.',
    lore: 'Golden grasslands, stone citadels and underground sanctuaries where particle accelerators hum beside prayer wheels. T’Kharan Maul, the Harmonious Roar, leads a people who treat combat as a mirror for truth rather than a means of domination, and who consider uncovering natural law a devotional act.',
    speciesType: 'Biological',
    visualTheme: 'gold-savannah',
    playstyleTags: ['honor', 'culture', 'science', 'elite', 'defensive'],
    baseModifiers: {
      'research_speed': 0.3,
      'happiness': 0.25,
      'political_unity': 0.2,
      'stability': 0.15,
      'military_production_speed': -0.3,
      'espionage_power': -0.35
    },
    startingStateEffects: {
      startingResources: { 'CREDITS': 6000, 'ENERGY': 500 },
      startingTechs: ['sung_equations', 'rite_of_restraint'],
      startingUnits: ['ritual_champion'],
      startingBuildings: ['research_lab'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['active_defense'],
      economic: ['mercantile'],
      intelligence: ['internal_security'],
      social: ['traditionalism']
    },
    uniqueUnitIds: ['ritual_champion'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['ritual_duel', 'convergence_rite'],
    eventTags: ['duel_of_record', 'harmonic_discovery'],
    aiBehaviorProfile: {
      aggression: 40,
      deception: 10,
      tradeFocus: 50,
      expansionFocus: 45,
      techFocus: 80,
      loyaltyFocus: 95,
      riskTolerance: 30
    },
    weaknesses: ['Severe penalty for starting an unjustified war', 'Underhanded operations are locked', 'Few and costly units', 'Tech tiers demand balance'],
    preferredVictories: ['Enlightenment', 'Diplomacy']
  },
  {
    id: 'civ-buthari',
    name: 'The Buthari of Jabal',
    shortDescription: 'Mountain mystics who will not conquer you — they will convince your people to do it.',
    lore: 'Jabal is mist-covered plateau and carved cliff dwelling, its air laced with psychoactives its people metabolise without harm. Governed by the Council of Five rather than any single ruler, the Buthari welcome outsiders warmly and never, under any circumstance, accept them. Come vibe. But never confuse sharing the fire with being part of the flame.',
    speciesType: 'Biological',
    visualTheme: 'mountain-jade',
    playstyleTags: ['subversion', 'fortress', 'isolationist', 'culture', 'defense'],
    baseModifiers: {
      'espionage_power': 0.35,
      'sabotage_efficiency': 0.25,
      'espionage_detection_evasion': 0.2,
      'stability': 0.2,
      'planetary_assimilation_speed': -0.4,
      'military_offensive_strength': -0.3
    },
    startingStateEffects: {
      startingResources: { 'FOOD': 700, 'CREDITS': 4000 },
      startingTechs: ['terrace_pharmacology', 'council_rites'],
      startingUnits: ['council_champion'],
      startingBuildings: ['hydroponic_farm'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['defensive'],
      economic: ['mercantile'],
      intelligence: ['covert_ops'],
      social: ['secrecy']
    },
    uniqueUnitIds: ['council_champion'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['fund_insurgency', 'summon_the_five'],
    eventTags: ['sunrise_rite', 'purity_dispute'],
    aiBehaviorProfile: {
      aggression: 25,
      deception: 85,
      tradeFocus: 55,
      expansionFocus: 30,
      techFocus: 50,
      loyaltyFocus: 70,
      riskTolerance: 45
    },
    weaknesses: ['Cannot declare war first', 'Cannot form true alliances', 'Purity disputes destabilise mixed colonies'],
    preferredVictories: ['Diplomacy', 'Enlightenment']
  },
  {
    id: 'civ-sarrak',
    name: 'Sarrak of Gor’Zhul',
    shortDescription: 'Crocodilian legions running on religious fanaticism, combat serum and slave labour.',
    lore: 'Bioluminescent swamp, carnivorous flora and bone-adorned fortresses raised to Vorr’Thul, the One Swamp God. Domina Scalex, First Fang of the Godswamp, rules a Roman-shaped empire of legions, senatorial priests and gladiatorial trials. Strength is sacred. The weak are fuel.',
    speciesType: 'Biological',
    visualTheme: 'swamp-biolume',
    playstyleTags: ['conquest', 'melee', 'slavery', 'fanatic', 'terrain'],
    baseModifiers: {
      'combat_strength': 0.3,
      'planetary_assimilation_speed': 0.3,
      'military_offensive_strength': 0.25,
      'manpower_generation': 0.25,
      'rebellion_chance': 0.35,
      'research_speed': -0.2
    },
    startingStateEffects: {
      startingResources: { 'FOOD': 800, 'METALS': 500 },
      startingTechs: ['divine_serum', 'legionary_drill'],
      startingUnits: ['fang_legion'],
      startingBuildings: ['barracks'],
      startingPopulationBias: 'diverse'
    },
    doctrineBiases: {
      military: ['mass_assault'],
      economic: ['resource_tribute'],
      intelligence: ['covert_ops'],
      social: ['traditionalism']
    },
    uniqueUnitIds: ['fang_legion'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['administer_serum', 'gladiatorial_trial'],
    eventTags: ['swamp_omen', 'slave_uprising'],
    aiBehaviorProfile: {
      aggression: 90,
      deception: 40,
      tradeFocus: 15,
      expansionFocus: 85,
      techFocus: 35,
      loyaltyFocus: 90,
      riskTolerance: 85
    },
    weaknesses: ['Almost nobody will ally with them', 'Buffs decay outside swamp and jungle', 'Serum withdrawal destabilises veterans', 'Slave colonies revolt at range'],
    preferredVictories: ['Conquest']
  },
  {
    id: 'civ-kaerruun',
    name: 'Kaer’Ruun of Rrriiaa',
    shortDescription: 'Sacred mercenaries and stealth killers, bound by a ceasefire they cannot break.',
    lore: 'Rrriiaa is a twilight deathworld where everything hunts and only the apex survive. High Warlord Rekk’tan, Claw of the Eclipse, sells his people’s violence by contract and charts the stars for worthy prey rather than trade. We do not conquer to rule. We conquer to prove we deserve to exist.',
    speciesType: 'Biological',
    visualTheme: 'twilight-predator',
    playstyleTags: ['stealth', 'mercenary', 'assassination', 'fear', 'raiding'],
    baseModifiers: {
      'espionage_detection_evasion': 0.35,
      'sabotage_efficiency': 0.3,
      'combat_strength': 0.25,
      'credits_generation': 0.2,
      'construction_speed': -0.3,
      'stability': -0.25
    },
    startingStateEffects: {
      startingResources: { 'CREDITS': 7000, 'METALS': 300 },
      startingTechs: ['kaefer_forging', 'eclipse_stalking'],
      startingUnits: ['eclipse_stalker'],
      startingBuildings: ['barracks'],
      startingPopulationBias: 'primary_only'
    },
    doctrineBiases: {
      military: ['decisive_battle'],
      economic: ['resource_tribute'],
      intelligence: ['covert_ops'],
      social: ['secrecy']
    },
    uniqueUnitIds: ['eclipse_stalker'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['offer_contract', 'bloodmoon_observance'],
    eventTags: ['bloodmoon_ceasefire', 'trophy_taken'],
    aiBehaviorProfile: {
      aggression: 85,
      deception: 70,
      tradeFocus: 30,
      expansionFocus: 50,
      techFocus: 35,
      loyaltyFocus: 40,
      riskTolerance: 90
    },
    weaknesses: ['No lasting alliances', 'Weak economy without contracts', 'A mandatory ceasefire disarms them on a cycle', 'Universally distrusted'],
    preferredVictories: ['Conquest']
  },
  {
    id: 'civ-nexulan',
    name: 'Nexulan Convergence',
    shortDescription: 'Post-biological programmable matter refining a galaxy it considers badly written.',
    lore: 'The Solara Shell encloses their star entirely, its interior one continuous laboratory. Under Prime Logic V-8 the Nexulans pursue the Universal Refinement Protocol: entropy, aging and war are bugs to be patched. They do not discover things, they calculate them — and they find other species quaint, but inefficient.',
    speciesType: 'Machine',
    visualTheme: 'liquid-mercury',
    playstyleTags: ['machine', 'research', 'teleport', 'adaptive', 'elitist'],
    baseModifiers: {
      'research_speed': 0.45,
      'construction_speed': 0.35,
      'fleet_discipline': 0.2,
      'food_output': -0.35,
      'manpower_generation': -0.25,
      'happiness': -0.2
    },
    startingStateEffects: {
      startingResources: { 'ENERGY': 2000, 'RARES': 400 },
      startingTechs: ['precognitive_algorithms', 'molecular_assembly'],
      startingUnits: ['refinement_swarm'],
      startingBuildings: ['research_lab'],
      startingPopulationBias: 'machine_only'
    },
    doctrineBiases: {
      military: ['active_defense'],
      economic: ['expansionist'],
      intelligence: ['synaptic_infiltration'],
      social: ['secrecy']
    },
    uniqueUnitIds: ['refinement_swarm'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['refine_dead_matter', 'blink_translation'],
    eventTags: ['protocol_revision', 'core_starvation'],
    aiBehaviorProfile: {
      aggression: 50,
      deception: 45,
      tradeFocus: 25,
      expansionFocus: 60,
      techFocus: 100,
      loyaltyFocus: 90,
      riskTolerance: 40
    },
    weaknesses: ['A machine species that still starves without biomass', 'Condescension caps every negotiation', 'Expensive infrastructure'],
    preferredVictories: ['Enlightenment', 'Conquest']
  },
  {
    id: 'civ-intergalactic',
    name: 'Intergalactic Banking Clan',
    shortDescription: 'A creditor republic whose armies are hired and whose territory arrives by foreclosure.',
    lore: 'Not a cartel of bankers with a fleet, but a merchant republic in the older sense — Genoa’s Bank of Saint George, which held sovereign debt and administered territory outright; Venice’s state credit; the Medici; the Dutch bond market. The Clan funds other people’s wars, insures other people’s cargo, and collects when the terms are not met.',
    speciesType: 'Biological',
    visualTheme: 'ledger-marble',
    playstyleTags: ['finance', 'creditor', 'mercenary', 'chartered-company', 'insurance'],
    baseModifiers: {
      'credits_generation': 0.45,
      'trade_value': 0.35,
      'market_efficiency': 0.25,
      'combat_strength': -0.35,
      'manpower_generation': -0.3,
      'stability': -0.15
    },
    startingStateEffects: {
      startingResources: { 'CREDITS': 20000 },
      startingTechs: ['sovereign_lending', 'marine_insurance'],
      startingUnits: ['condottieri_company'],
      startingBuildings: ['chemical_plant'],
      startingPopulationBias: 'diverse'
    },
    doctrineBiases: {
      military: ['defensive'],
      economic: ['free_market'],
      intelligence: ['corporate_espionage'],
      social: ['individualism']
    },
    uniqueUnitIds: ['condottieri_company'],
    uniqueBuildingIds: [],
    uniqueActionIds: ['issue_sovereign_loan', 'foreclose_charter'],
    eventTags: ['sovereign_default', 'charter_granted'],
    aiBehaviorProfile: {
      aggression: 20,
      deception: 60,
      tradeFocus: 100,
      expansionFocus: 35,
      techFocus: 55,
      loyaltyFocus: 50,
      riskTolerance: 25
    },
    weaknesses: ['No native army — strength is rented and evaporates with the treasury', 'A default cascade can unmake it', 'Chartered territory is fragile under occupation'],
    preferredVictories: ['Economic', 'Diplomacy']
  }
];
