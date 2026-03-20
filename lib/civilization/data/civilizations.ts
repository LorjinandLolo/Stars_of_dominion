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
      military: ['mercenary_support', 'precision_strikes'],
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
      economic: ['black_market'],
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
      military: ['energy_weapons', 'distance_warfare'],
      economic: ['energy_siphon'],
      intelligence: ['signals_analysis'],
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
      military: ['overwhelming_force', 'total_war'],
      economic: ['heavy_industry'],
      intelligence: ['forced_compliance'],
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
      economic: ['cooperative_trade'],
      intelligence: ['transparency_ops'],
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
      military: ['automated_warfare', 'precise_salvage'],
      economic: ['recycled_materials'],
      intelligence: ['data_archaeology'],
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
  }
];
