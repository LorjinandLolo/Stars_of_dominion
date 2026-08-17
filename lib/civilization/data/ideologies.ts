// lib/civilization/data/ideologies.ts

import { IdeologyDefinition } from '../types';

export const IDEOLOGIES: IdeologyDefinition[] = [
  {
    id: 'ideo-capitalist',
    name: 'Free-Market Capitalist',
    description: 'Prioritizes individual enterprise and trade efficiency. High wealth generation with risk of social inequality.',
    modifiers: {
      'trade_value': 0.2,
      'market_efficiency': 0.15,
      'credits_generation': 0.1,
      'happiness': 0.05
    },
    policyAccess: ['corporate_charter', 'unregulated_markets'],
    doctrineBiases: ['mercenary_support', 'trade_monopoly']
  },
  {
    id: 'ideo-socialist',
    name: 'Distributed Socialist',
    description: 'Focuses on equitable resource distribution and public welfare. High stability and happiness with slower growth.',
    modifiers: {
      'happiness': 0.2,
      'stability': 0.15,
      'planetary_efficiency': 0.1,
      'credits_generation': -0.1
    },
    policyAccess: ['universal_basic_income', 'worker_cooperatives'],
    doctrineBiases: ['public_welfare', 'cooperative_defense']
  },
  {
    id: 'ideo-imperialist',
    name: 'Totalitarian Imperialist',
    description: 'Centralized power focused on expansion and dominance. Strong military and fast construction.',
    modifiers: {
      'construction_speed': 0.2,
      'military_production_speed': 0.15,
      'stability': 0.1,
      'manpower_generation': 0.1
    },
    policyAccess: ['forced_conscription', 'absolute_executive'],
    doctrineBiases: ['overwhelming_force', 'total_war']
  },
  {
    id: 'ideo-technocratic',
    name: 'Rational Technocratic',
    description: 'Rule by expertise and scientific advancement. Highest research speed but less diplomatic flexibility.',
    modifiers: {
      'research_speed': 0.3,
      'energy_efficiency': 0.2,
      'resource_output_final': 0.05,
      'diplomatic_influence': -0.15
    },
    policyAccess: ['scientific_oversight', 'automated_governance'],
    doctrineBiases: ['tech_supremacy', 'signals_analysis']
  },
  {
    id: 'ideo-theocratic',
    name: 'Divine Theocratic',
    description: 'Unity through shared faith and spiritual purpose. High political unity and resilience.',
    modifiers: {
      'political_unity': 0.3,
      'rebellion_chance': -0.2,
      'happiness': 0.1,
      'construction_speed': -0.1
    },
    policyAccess: ['ecclesiastical_law', 'holy_war'],
    doctrineBiases: ['zealous_crusade', 'martyrdom_protocol']
  },
  {
    id: 'ideo-anarchic',
    name: 'Autonomous Anarchic',
    description: 'Decentralized communes with maximum autonomy. Exceptional local resilience and evasion.',
    modifiers: {
      'autonomy_boost': 0.4,
      'espionage_detection_evasion': 0.2,
      'happiness': 0.15,
      'diplomatic_influence': -0.3
    },
    policyAccess: ['voluntary_association', 'black_market_integration'],
    doctrineBiases: ['guerilla_warfare', 'asymmetric_resilience']
  },
  {
    id: 'ideo-ecological',
    name: 'Balanced Ecological',
    description: 'Symbiosis with planetary biospheres. High food production and long-term sustainability.',
    modifiers: {
      'food_output': 0.3,
      'planetary_efficiency': 0.2,
      'stability': 0.1,
      'metals_output': -0.2
    },
    policyAccess: ['biosphere_preservation', 'renewable_energy_mandate'],
    doctrineBiases: ['nature_symbiosis', 'sustainable_growth']
  },

  // ── The seven the world seed already referenced ──────────────────────────
  // buildEmptyEconomyState assigned these ids to eleven of the fourteen
  // factions and none of them existed, so `getIdeology` returned undefined for
  // all eleven. They are authored here rather than remapped onto the seven
  // above, because each is referenced by a faction whose design text describes
  // exactly that outlook and collapsing them would flatten distinctions the
  // players wrote on purpose.
  //
  // Modifier keys are drawn only from the vocabulary that reaches a live
  // consumer — see CIV_MODIFIER_MAP in lib/civilization/modifiers.ts. Anything
  // outside it is decoration, and this file has enough of that already.
  {
    id: 'ideo-individualist',
    name: 'Individualist Compact',
    description: 'The person outranks the plan. Inventive and wealthy, but it will not hold a line it did not choose.',
    modifiers: {
      'happiness': 0.15,
      'credits_generation': 0.15,
      'research_speed': 0.1,
      'political_unity': -0.15
    },
    policyAccess: ['voluntary_association', 'unregulated_markets'],
    doctrineBiases: ['free_market']
  },
  {
    id: 'ideo-mercantile',
    name: 'Mercantile Republic',
    description: 'Power measured in ledgers and shipping lanes. Buys what it needs, including soldiers.',
    modifiers: {
      'trade_value': 0.25,
      'market_efficiency': 0.2,
      'credits_generation': 0.15,
      'combat_strength': -0.1
    },
    policyAccess: ['corporate_charter', 'open_trade'],
    doctrineBiases: ['mercantile']
  },
  {
    id: 'ideo-collectivist',
    name: 'Collectivist Union',
    description: 'One body, many hands. Enormous mobilisation and near-total unity at the cost of private wealth.',
    modifiers: {
      'manpower_generation': 0.2,
      'stability': 0.15,
      'political_unity': 0.15,
      'credits_generation': -0.15
    },
    policyAccess: ['worker_cooperatives', 'equal_citizenship'],
    doctrineBiases: ['resource_tribute']
  },
  {
    id: 'ideo-militaristic',
    name: 'Martial Order',
    description: 'The state is an army that happens to hold territory. Everything bends toward the next campaign.',
    modifiers: {
      'combat_strength': 0.2,
      'military_production_speed': 0.2,
      'ammo_production': 0.15,
      'happiness': -0.15
    },
    policyAccess: ['war_mobilization', 'forced_conscription'],
    doctrineBiases: ['aggressive']
  },
  {
    id: 'ideo-industrialist',
    name: 'Industrial Directorate',
    description: 'Output above all. Foundries and rail before farms and festivals.',
    modifiers: {
      'metals_output': 0.25,
      'construction_speed': 0.2,
      'military_production_speed': 0.15,
      'food_output': -0.15
    },
    policyAccess: ['emergency_fleet_expansion', 'expand_frontier'],
    doctrineBiases: ['expansionist']
  },
  {
    id: 'ideo-diplomatic',
    name: 'Concordat Diplomacy',
    description: 'Wins by being the party everyone would rather not fight. Slow to strike, hard to isolate.',
    modifiers: {
      'happiness': 0.2,
      'stability': 0.2,
      'trade_value': 0.15,
      'military_offensive_strength': -0.2
    },
    policyAccess: ['open_trade', 'civil_reforms'],
    doctrineBiases: ['active_defense']
  },
  {
    id: 'ideo-traditionalist',
    name: 'Traditionalist Assembly',
    description: 'Continuity is the highest good. Exceptionally settled, and slow to accept a new idea.',
    modifiers: {
      'stability': 0.25,
      'political_unity': 0.15,
      'rebellion_chance': -0.15,
      'research_speed': -0.15
    },
    policyAccess: ['state_religion', 'civil_reforms'],
    doctrineBiases: ['defensive']
  }
];
