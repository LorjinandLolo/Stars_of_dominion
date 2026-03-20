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
  }
];
