import {
    Tech, Domain, Tier, TechEffectType, Intent
} from './types';
import { registry } from './engine';

/**
 * lib/tech/techData.ts
 * HoI4-Style Global Technology Registry
 * 60+ Technologies across 4 Domains & 6 Tiers
 */

const techs: Tech[] = [
    // --- MILITARY BRANCH (22 Techs Total) ---
    // Tier 1
    {
        id: 'mil_inf_1', name: 'Infantry Standardization',
        description: 'Uniform training and equipment for planetary ground forces.',
        branch: Domain.MILITARY, subBranch: 'Infantry', tier: Tier.I,
        position: { x: 0, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNIT_STAT, target: 'infantry_defense', value: 0.1 }],
        tags: ['military', 'infantry'], aiTags: ['defensive']
    },
    {
        id: 'mil_flt_1', name: 'Orbital Patrols',
        description: 'Light scouting vessels and basic orbital surveillance.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.I,
        position: { x: 4, y: 0 }, researchCost: 72,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'corvette', value: 1 }],
        tags: ['military', 'fleet'], aiTags: ['expansion']
    },
    {
        id: 'mil_def_1', name: 'Static Garrison',
        description: 'Basic fortification of orbital chokepoints and planetary caps.',
        branch: Domain.MILITARY, subBranch: 'Defense', tier: Tier.I,
        position: { x: 8, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNLOCK_BUILDING, target: 'barracks', value: 1 }],
        tags: ['military', 'defense'], aiTags: ['defensive']
    },
    {
        id: 'mil_log_1', name: 'Munition Standardization',
        description: 'Standardized calibers and supply protocols for universal logistics.',
        branch: Domain.MILITARY, subBranch: 'Logistics', tier: Tier.I,
        position: { x: 12, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'ammo_production', value: 0.15 }],
        tags: ['military', 'logistics'], aiTags: ['sustainable']
    },

    // Tier 2
    {
        id: 'mil_doc_mass', name: 'Massed Assault Doctrine',
        description: 'Focus on overwhelming numbers and aggressive ground expansion.',
        branch: Domain.MILITARY, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 0, y: 2 }, researchCost: 120,
        prerequisites: ['mil_inf_1'],
        mutuallyExclusiveWith: ['mil_doc_elite'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'manpower_generation', value: 0.2 }],
        tags: ['military', 'doctrine'], aiTags: ['aggressive', 'numbers']
    },
    {
        id: 'mil_doc_elite', name: 'Expeditionary Elite Doctrine',
        description: 'Focus on specialized units and high-quality tactical operations.',
        branch: Domain.MILITARY, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 2, y: 2 }, researchCost: 120,
        prerequisites: ['mil_inf_1'],
        mutuallyExclusiveWith: ['mil_doc_mass'],
        effects: [{ type: TechEffectType.UNIT_STAT, target: 'special_ops_attack', value: 0.25 }],
        tags: ['military', 'doctrine'], aiTags: ['specialized', 'quality']
    },
    {
        id: 'mil_mec_1', name: 'Mechanized Warfare',
        description: 'Integration of armored transports and light tanks into infantry units.',
        branch: Domain.MILITARY, subBranch: 'Infantry', tier: Tier.II,
        position: { x: 0, y: 3 }, researchCost: 150,
        prerequisites: ['mil_inf_1'],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'light_tank', value: 1 }],
        tags: ['military', 'armor'], aiTags: ['offensive']
    },
    {
        id: 'mil_flt_1b', name: 'Fleet Coordination',
        description: 'Multi-vessel tactical networking for improved combat cohesion.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.II,
        position: { x: 4, y: 2 }, researchCost: 180,
        prerequisites: ['mil_flt_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'fleet_accuracy', value: 0.1 }],
        tags: ['military', 'fleet'], aiTags: ['combat']
    },

    // Tier 3
    {
        id: 'mil_plt_1', name: 'Orbital Defense Platforms',
        description: 'Semi-permanent anti-ship batteries for planetary security.',
        branch: Domain.MILITARY, subBranch: 'Defense', tier: Tier.III,
        position: { x: 8, y: 4 }, researchCost: 240,
        prerequisites: ['mil_def_1'],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'orbital_defense_platform', value: 1 }],
        tags: ['military', 'defense'], aiTags: ['defensive']
    },
    {
        id: 'mil_flt_2', name: 'Destroyer Hull Design',
        description: 'Medium-class ships capable of significant orbital fire support.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.III,
        position: { x: 4, y: 4 }, researchCost: 300,
        prerequisites: ['mil_flt_1b'],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'destroyer', value: 1 }],
        tags: ['military', 'fleet'], aiTags: ['offensive']
    },
    {
        id: 'mil_doc_fort', name: 'Fortress Defense Doctrine',
        description: 'Focus on static defenses and orbital denial.',
        branch: Domain.MILITARY, subBranch: 'Doctrine', tier: Tier.III,
        position: { x: 10, y: 4 }, researchCost: 240,
        prerequisites: ['mil_plt_1'],
        mutuallyExclusiveWith: ['mil_doc_strike'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'orbital_defense_strength', value: 0.3 }],
        tags: ['military', 'doctrine'], aiTags: ['defensive']
    },
    {
        id: 'mil_doc_strike', name: 'Rapid Strike Doctrine',
        description: 'Focus on mobility and high-alpha damage in orbital engagements.',
        branch: Domain.MILITARY, subBranch: 'Doctrine', tier: Tier.III,
        position: { x: 12, y: 4 }, researchCost: 240,
        prerequisites: ['mil_flt_2'],
        mutuallyExclusiveWith: ['mil_doc_fort'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'fleet_speed', value: 0.2 }],
        tags: ['military', 'doctrine'], aiTags: ['offensive']
    },

    // Tier 4
    {
        id: 'mil_arm_1', name: 'Planetary Siege Armament',
        description: 'Heavy weaponry designed to crack planetary shields and deep bunkers.',
        branch: Domain.MILITARY, subBranch: 'Siege', tier: Tier.IV,
        position: { x: 0, y: 6 }, researchCost: 500,
        prerequisites: ['mil_doc_mass', 'mil_mec_1'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'bombardment_damage', value: 0.3 }],
        tags: ['military', 'siege'], aiTags: ['offensive']
    },
    {
        id: 'mil_adv_1', name: 'Stealth Composites',
        description: 'Null-signal hull materials for deep-space subversion.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.IV,
        position: { x: 4, y: 6 }, researchCost: 600,
        prerequisites: ['mil_flt_2'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'fleet_visibility', value: -0.2 }],
        tags: ['military', 'fleet'], aiTags: ['stealth']
    },
    {
        id: 'mil_air_1', name: 'Drop Assault Training',
        description: 'Specialized orbital-to-surface deployment for rapid ground invasions.',
        branch: Domain.MILITARY, subBranch: 'Assault', tier: Tier.IV,
        position: { x: 2, y: 6 }, researchCost: 450,
        prerequisites: ['mil_doc_elite'],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'orbital_drop', value: 1 }],
        tags: ['military', 'assault'], aiTags: ['offensive']
    },

    // Tier 5
    {
        id: 'mil_war_eco', name: 'War Economy Mobilization',
        description: 'Direct state control over all industrial outputs for the war effort.',
        branch: Domain.MILITARY, subBranch: 'Logistics', tier: Tier.V,
        position: { x: 6, y: 8 }, researchCost: 1000,
        prerequisites: ['mil_flt_2'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'military_production_speed', value: 0.5 }],
        tags: ['military', 'economy'], aiTags: ['total_war']
    },
    {
        id: 'mil_dev_1', name: 'Planetary Devastation Systems',
        description: 'Strategic-scale weaponry capable of rendering entire systems uninhabitable.',
        branch: Domain.MILITARY, subBranch: 'Siege', tier: Tier.V,
        position: { x: 0, y: 8 }, researchCost: 1200,
        prerequisites: ['mil_arm_1'],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'planet_cracker', value: 1 }],
        tags: ['military', 'siege'], aiTags: ['existential']
    },
    {
        id: 'mil_car_1', name: 'Deep Space Carrier Groups',
        description: 'Massive hubs for autonomous fighter swarms and strategic projection.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.V,
        position: { x: 4, y: 8 }, researchCost: 1500,
        prerequisites: ['mil_adv_1'],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'carrier', value: 1 }],
        tags: ['military', 'fleet'], aiTags: ['projection']
    },

    // Tier 6
    {
        id: 'mil_fin_1', name: 'Stellar Siege Doctrine',
        description: 'The ultimate doctrine for systemic galactic domination.',
        branch: Domain.MILITARY, subBranch: 'Final', tier: Tier.VI,
        position: { x: 4, y: 10 }, researchCost: 2000,
        prerequisites: ['mil_war_eco', 'mil_car_1'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'victory_conquest_speed', value: 1.0 }],
        tags: ['military', 'victory'], aiTags: ['aggressive']
    },
    {
        id: 'mil_fin_2', name: 'Apotheosis of Conflict',
        description: 'Transcending mortal concepts of war into pure algorithmic destruction.',
        branch: Domain.MILITARY, subBranch: 'Final', tier: Tier.VI,
        position: { x: 2, y: 10 }, researchCost: 3000,
        prerequisites: ['mil_dev_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'all_military_damage', value: 0.5 }],
        tags: ['military', 'victory'], aiTags: ['aggressive']
    },

    // --- ECONOMIC BRANCH (18 Techs Total) ---
    // Tier 1
    {
        id: 'eco_min_1', name: 'Deep Crust Mining',
        description: 'Advanced excavation techniques for high-yield mineral recovery.',
        branch: Domain.ECONOMIC, subBranch: 'Extraction', tier: Tier.I,
        position: { x: 16, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'metals_output', value: 0.15 }],
        tags: ['economy', 'mining'], aiTags: ['growth']
    },
    {
        id: 'eco_tra_1', name: 'Chartered Companies',
        description: 'Legal frameworks for quasi-sovereign corporate entities.',
        branch: Domain.ECONOMIC, subBranch: 'Industry', tier: Tier.I,
        position: { x: 20, y: 0 }, researchCost: 60,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'charter_company', value: 1 }],
        tags: ['economy', 'corporate'], aiTags: ['leverage']
    },
    {
        id: 'eco_agr_1', name: 'Hydroponic Hubs',
        description: 'Efficient planetary food production systems.',
        branch: Domain.ECONOMIC, subBranch: 'Agriculture', tier: Tier.I,
        position: { x: 24, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'food_output', value: 0.2 }],
        tags: ['economy', 'food'], aiTags: ['growth']
    },

    // Tier 2 - Doctrines
    {
        id: 'eco_doc_free', name: 'Free Market Protocols',
        description: 'Deregulated trade focused on private sector growth and efficiency.',
        branch: Domain.ECONOMIC, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 18, y: 2 }, researchCost: 120,
        prerequisites: ['eco_tra_1'],
        mutuallyExclusiveWith: ['eco_doc_state'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'trade_efficiency', value: 0.25 }],
        tags: ['economy', 'doctrine'], aiTags: ['wealth', 'market']
    },
    {
        id: 'eco_doc_state', name: 'Centralized Command Economy',
        description: 'Heavy state regulation for optimized industrial scaling.',
        branch: Domain.ECONOMIC, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 20, y: 2 }, researchCost: 120,
        prerequisites: ['eco_tra_1'],
        mutuallyExclusiveWith: ['eco_doc_free'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'construction_speed', value: 0.2 }],
        tags: ['economy', 'doctrine'], aiTags: ['production', 'order']
    },
    {
        id: 'eco_aut_1', name: 'Automated Extraction',
        description: 'Replacing biological labor with tireless drone networks.',
        branch: Domain.ECONOMIC, subBranch: 'Extraction', tier: Tier.II,
        position: { x: 16, y: 3 }, researchCost: 150,
        prerequisites: ['eco_min_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'manpower_upkeep', value: -0.15 }],
        tags: ['economy', 'automation'], aiTags: ['efficiency']
    },

    // Tier 3
    {
        id: 'eco_grid_1', name: 'Superconducting Grids',
        description: 'Planetary energy distribution with near-zero transmission loss.',
        branch: Domain.ECONOMIC, subBranch: 'Energy', tier: Tier.III,
        position: { x: 22, y: 4 }, researchCost: 240,
        prerequisites: ['eco_min_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'energy_output', value: 0.2 }],
        tags: ['economy', 'energy'], aiTags: ['efficiency']
    },
    {
        id: 'eco_tra_2', name: 'Interstellar Trade Networks',
        description: 'Standardized hyperspace lanes and hub infrastructure.',
        branch: Domain.ECONOMIC, subBranch: 'Trade', tier: Tier.III,
        position: { x: 18, y: 4 }, researchCost: 300,
        prerequisites: ['eco_doc_free'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'trade_value', value: 0.3 }],
        tags: ['economy', 'trade'], aiTags: ['wealth']
    },

    // Tier 4
    {
        id: 'eco_fac_1', name: 'Megafactory Systems',
        description: 'Massive automated assembly hubs that redefine industrial scale.',
        branch: Domain.ECONOMIC, subBranch: 'Industry', tier: Tier.IV,
        position: { x: 20, y: 6 }, researchCost: 500,
        prerequisites: ['eco_doc_state'],
        effects: [{ type: TechEffectType.UNLOCK_BUILDING, target: 'megafactory', value: 1 }],
        tags: ['economy', 'industry'], aiTags: ['production']
    },
    {
        id: 'eco_log_2', name: 'High Density Logistics',
        description: 'Quantum-routed supply chains for instant response.',
        branch: Domain.ECONOMIC, subBranch: 'Logistics', tier: Tier.IV,
        position: { x: 16, y: 6 }, researchCost: 450,
        prerequisites: ['eco_aut_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'supply_efficiency', value: 0.4 }],
        tags: ['economy', 'logistics'], aiTags: ['military_support']
    },

    // Tier 5
    {
        id: 'eco_adv_1', name: 'Post-Scarcity Theory',
        description: 'Social and economic models for a civilization beyond fundamental lack.',
        branch: Domain.ECONOMIC, subBranch: 'Theory', tier: Tier.V,
        position: { x: 18, y: 8 }, researchCost: 1000,
        prerequisites: ['eco_grid_1', 'eco_tra_2'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'global_upkeep', value: -0.2 }],
        tags: ['economy', 'social'], aiTags: ['stability']
    },
    {
        id: 'eco_sys_1', name: 'Systemic Administration',
        description: 'AI-driven management of planetary economic outputs.',
        branch: Domain.ECONOMIC, subBranch: 'Admin', tier: Tier.V,
        position: { x: 20, y: 8 }, researchCost: 1200,
        prerequisites: ['eco_fac_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'all_resource_output', value: 0.25 }],
        tags: ['economy', 'admin'], aiTags: ['efficiency']
    },

    // Tier 6
    {
        id: 'eco_fin_1', name: 'Matter Replication',
        description: 'Absolute control over molecular structure, ending the need for mining.',
        branch: Domain.ECONOMIC, subBranch: 'Final', tier: Tier.VI,
        position: { x: 20, y: 10 }, researchCost: 2500,
        prerequisites: ['eco_fac_1', 'eco_adv_1'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'infinite_resources', value: 1 }],
        tags: ['economy', 'ascension'], aiTags: ['victory']
    },

    // --- DIPLOMATIC BRANCH (15 Techs Total) ---
    // Tier 1
    {
        id: 'dip_emb_1', name: 'Embassy Protocols',
        description: 'Formalized diplomatic exchange frameworks.',
        branch: Domain.DIPLOMATIC, subBranch: 'Politics', tier: Tier.I,
        position: { x: 30, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'build_embassy', value: 1 }],
        tags: ['diplomacy', 'politics'], aiTags: ['stability']
    },
    {
        id: 'dip_int_1', name: 'Intelligence Bureau',
        description: 'Centralized facility for gathering external intelligence.',
        branch: Domain.DIPLOMATIC, subBranch: 'Espionage', tier: Tier.I,
        position: { x: 34, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.UNLOCK_BUILDING, target: 'intelligence_agency', value: 1 }],
        tags: ['diplomacy', 'spy'], aiTags: ['intel']
    },

    // Tier 2
    {
        id: 'dip_doc_open', name: 'Open Diplomacy Protocols',
        description: 'Focus on coalition building and transparent cooperation.',
        branch: Domain.DIPLOMATIC, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 30, y: 2 }, researchCost: 120,
        prerequisites: ['dip_emb_1'],
        mutuallyExclusiveWith: ['dip_doc_shadow'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'diplomatic_reputation', value: 0.2 }],
        tags: ['diplomacy', 'cooperation'], aiTags: ['alliance']
    },
    {
        id: 'dip_doc_shadow', name: 'Shadow Network Doctrine',
        description: 'Focus on subversion, blackmail, and covert proxy wars.',
        branch: Domain.DIPLOMATIC, subBranch: 'Doctrine', tier: Tier.II,
        position: { x: 34, y: 2 }, researchCost: 120,
        prerequisites: ['dip_int_1'],
        mutuallyExclusiveWith: ['dip_doc_open'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'espionage_power', value: 0.25 }],
        tags: ['diplomacy', 'spy'], aiTags: ['aggressive']
    },

    // Tier 3
    {
        id: 'dip_all_1', name: 'Alliance Command Structure',
        description: 'Shared military headquarters for multinational forces.',
        branch: Domain.DIPLOMATIC, subBranch: 'Politics', tier: Tier.III,
        position: { x: 30, y: 4 }, researchCost: 240,
        prerequisites: ['dip_doc_open'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'alliance_unit_sharing', value: 1.0 }],
        tags: ['diplomacy', 'military'], aiTags: ['alliance']
    },
    {
        id: 'dip_spy_2', name: 'Deep Cover Networks',
        description: 'Advanced field agents with long-term sleeper identities.',
        branch: Domain.DIPLOMATIC, subBranch: 'Espionage', tier: Tier.III,
        position: { x: 34, y: 4 }, researchCost: 300,
        prerequisites: ['dip_doc_shadow'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'spy_detection_evasion', value: 0.3 }],
        tags: ['diplomacy', 'spy'], aiTags: ['stealth']
    },

    // Tier 4
    {
        id: 'dip_san_1', name: 'Systemic Sanctions',
        description: 'Economic pressure tools to cripple rival trade routes.',
        branch: Domain.DIPLOMATIC, subBranch: 'Economic Warfare', tier: Tier.IV,
        position: { x: 32, y: 6 }, researchCost: 400,
        prerequisites: ['dip_spy_2'],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'apply_sanction', value: 1 }],
        tags: ['diplomacy', 'economy'], aiTags: ['hostile']
    },

    // Tier 5
    {
        id: 'dip_adm_2', name: 'Shadow Governance',
        description: 'Infiltration of rival bureaucracies to steer their policy from within.',
        branch: Domain.DIPLOMATIC, subBranch: 'Control', tier: Tier.V,
        position: { x: 34, y: 8 }, researchCost: 800,
        prerequisites: ['dip_san_1'],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'shadow_government', value: 1 }],
        tags: ['diplomacy', 'control'], aiTags: ['subversion']
    },

    // Tier 6
    {
        id: 'dip_fin_1', name: 'Galactic Hegemony Doctrine',
        description: 'The formalization of a single rules-based order under your control.',
        branch: Domain.DIPLOMATIC, subBranch: 'Final', tier: Tier.VI,
        position: { x: 32, y: 10 }, researchCost: 3500,
        prerequisites: ['dip_adm_2'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'victory_diplomacy_speed', value: 1.0 }],
        tags: ['diplomacy', 'victory'], aiTags: ['hegemony']
    },

    // --- CULTURAL / ENLIGHTENMENT (15 Techs Total) ---
    // Tier 1
    {
        id: 'cul_civ_1', name: 'Planetary Identity',
        description: 'Developing shared social narratives to increase planetary stability.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.I,
        position: { x: 40, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'stability', value: 0.1 }],
        tags: ['culture', 'social'], aiTags: ['stability']
    },
    {
        id: 'cul_edu_1', name: 'Civic Education',
        description: 'Institutionalized teaching of imperial values and history.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.I,
        position: { x: 44, y: 0 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'political_unity', value: 0.15 }],
        tags: ['culture', 'education'], aiTags: ['order']
    },

    // Tier 2 - Ideologies
    {
        id: 'cul_doc_harm', name: 'Pluralistic Harmony',
        description: 'Celebrating diversity and individual expression within the empire.',
        branch: Domain.CULTURAL, subBranch: 'Ideology', tier: Tier.II,
        position: { x: 40, y: 2 }, researchCost: 120,
        prerequisites: ['cul_civ_1'],
        mutuallyExclusiveWith: ['cul_doc_state'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'happiness', value: 0.15 }],
        tags: ['culture', 'doctrine'], aiTags: ['stability', 'happiness']
    },
    {
        id: 'cul_doc_state', name: 'Singular State Doctrine',
        description: 'Absolute social cohesion through uniform ideological alignment.',
        branch: Domain.CULTURAL, subBranch: 'Ideology', tier: Tier.II,
        position: { x: 44, y: 2 }, researchCost: 120,
        prerequisites: ['cul_civ_1'],
        mutuallyExclusiveWith: ['cul_doc_harm'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'internal_security', value: 0.2 }],
        tags: ['culture', 'doctrine'], aiTags: ['order', 'control']
    },

    // Tier 3
    {
        id: 'cul_mem_1', name: 'Civilizational Memory Archives',
        description: 'Deep-time storage of cultural milestones and shared heritage.',
        branch: Domain.CULTURAL, subBranch: 'Enlightenment', tier: Tier.III,
        position: { x: 42, y: 4 }, researchCost: 300,
        prerequisites: ['cul_doc_harm'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'enlightenment_progress', value: 0.2 }],
        tags: ['culture', 'enlightenment'], aiTags: ['victory']
    },

    // Tier 4
    {
        id: 'cul_inf_1', name: 'Cultural Influence Networks',
        description: 'Broad-spectrum social broadcasting to project values externally.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.IV,
        position: { x: 40, y: 6 }, researchCost: 500,
        prerequisites: ['cul_mem_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'cultural_projection', value: 0.3 }],
        tags: ['culture', 'social'], aiTags: ['expansion']
    },

    // Tier 5
    {
        id: 'cul_uni_1', name: 'Universal Consciousness Theory',
        description: 'Scientific models for shared psionic or algorithmic harmony.',
        branch: Domain.CULTURAL, subBranch: 'Enlightenment', tier: Tier.V,
        position: { x: 42, y: 8 }, researchCost: 1200,
        prerequisites: ['cul_inf_1'],
        effects: [{ type: TechEffectType.MODIFIER_FLAT, target: 'stability_base', value: 20 }],
        tags: ['culture', 'enlightenment'], aiTags: ['order']
    },

    // Tier 6
    // --- MILITARY (Cont.) ---
    {
        id: 'mil_spec_1', name: 'Special Operations Corps',
        description: 'Elite units trained for asymmetric warfare behind enemy lines.',
        branch: Domain.MILITARY, subBranch: 'Special Forces', tier: Tier.IV,
        position: { x: 2, y: 7 }, researchCost: 550,
        prerequisites: ['mil_doc_elite'],
        effects: [{ type: TechEffectType.UNLOCK_UNIT, target: 'commando', value: 1 }],
        tags: ['military', 'specops'], aiTags: ['tactical']
    },
    {
        id: 'mil_log_2', name: 'Automated Supply Hubs',
        description: 'AI-managed logistics centers for seamless fleet replenishment.',
        branch: Domain.MILITARY, subBranch: 'Logistics', tier: Tier.II,
        position: { x: 12, y: 2 }, researchCost: 140,
        prerequisites: ['mil_log_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'supply_range', value: 0.25 }],
        tags: ['military', 'logistics'], aiTags: ['support']
    },

    // --- ECONOMIC (Cont.) ---
    {
        id: 'eco_adm_1', name: 'Planetary Infrastructure Grids',
        description: 'Unified management of energy, transport, and communication.',
        branch: Domain.ECONOMIC, subBranch: 'Admin', tier: Tier.III,
        position: { x: 22, y: 5 }, researchCost: 280,
        prerequisites: ['eco_grid_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'planetary_efficiency', value: 0.15 }],
        tags: ['economy', 'admin'], aiTags: ['growth']
    },
    {
        id: 'eco_con_1', name: 'Construction Engineering',
        description: 'Advanced protocols for rapid-assembly skeletal structures.',
        branch: Domain.ECONOMIC, subBranch: 'Construction', tier: Tier.I,
        position: { x: 24, y: 1 }, researchCost: 48,
        prerequisites: [],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'construction_speed', value: 0.1 }],
        tags: ['economy', 'construction'], aiTags: ['growth']
    },

    // --- DIPLOMATIC (Cont.) ---
    {
        id: 'dip_man_1', name: 'Political Manipulation Tactics',
        description: 'Subtle influence of rival voting blocs and public opinion.',
        branch: Domain.DIPLOMATIC, subBranch: 'Manipulation', tier: Tier.III,
        position: { x: 30, y: 5 }, researchCost: 240,
        prerequisites: ['dip_emb_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'influence_projection', value: 0.2 }],
        tags: ['diplomacy', 'politics'], aiTags: ['control']
    },
    {
        id: 'dip_all_2', name: 'Coalition Defense Network',
        description: 'Interconnected sensor relays across allied space.',
        branch: Domain.DIPLOMATIC, subBranch: 'Alliance', tier: Tier.IV,
        position: { x: 30, y: 7 }, researchCost: 450,
        prerequisites: ['dip_all_1'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'alliance_sensor_range', value: 0.5 }],
        tags: ['diplomacy', 'military'], aiTags: ['defense']
    },

    // --- CULTURAL (Cont.) ---
    {
        id: 'cul_art_2', name: 'Memory Archive Enhancement',
        description: 'Quantum storage for the preservation of every digital thought.',
        branch: Domain.CULTURAL, subBranch: 'Enlightenment', tier: Tier.IV,
        position: { x: 42, y: 7 }, researchCost: 600,
        prerequisites: ['cul_mem_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'enlightenment_gain', value: 0.25 }],
        tags: ['culture', 'enlightenment'], aiTags: ['victory']
    },
    {
        id: 'cul_har_1', name: 'Social Harmony Programs',
        description: 'State-sponsored meditation and community-building initiatives.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.III,
        position: { x: 40, y: 4 }, researchCost: 240,
        prerequisites: ['cul_doc_harm'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'crime_reduction', value: 0.3 }],
        tags: ['culture', 'social'], aiTags: ['stability']
    },

    // Add more to reach ~60
    {
        id: 'mil_adv_aer', name: 'Advanced Aerospace Superiority',
        description: 'Super-maneuverable craft for dominance in the upper atmosphere.',
        branch: Domain.MILITARY, subBranch: 'Aerospace', tier: Tier.V,
        position: { x: 2, y: 9 }, researchCost: 1400,
        prerequisites: ['mil_air_1'],
        effects: [{ type: TechEffectType.UNIT_STAT, target: 'air_attack', value: 0.3 }],
        tags: ['military', 'aerospace'], aiTags: ['offensive']
    },
    // --- MILITARY (Final Batches) ---
    {
        id: 'mil_bom_1', name: 'Precision Bombardment',
        description: 'Targeted orbital strikes for minimal collateral and maximum tactical impact.',
        branch: Domain.MILITARY, subBranch: 'Siege', tier: Tier.III,
        position: { x: 2, y: 5 }, researchCost: 240,
        prerequisites: ['mil_flt_2'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'bombardment_precision', value: 0.3 }],
        tags: ['military', 'siege'], aiTags: ['precision']
    },
    {
        id: 'mil_ew_1', name: 'Electronic Warfare Suite',
        description: 'Jamming and spoofing protocols to blind enemy sensors.',
        branch: Domain.MILITARY, subBranch: 'Fleet', tier: Tier.IV,
        position: { x: 6, y: 7 }, researchCost: 500,
        prerequisites: ['mil_adv_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'enemy_accuracy_reduction', value: 0.2 }],
        tags: ['military', 'electronics'], aiTags: ['tactical']
    },

    // --- ECONOMIC (Final Batches) ---
    {
        id: 'eco_ast_1', name: 'Asteroid Siphon Hubs',
        description: 'Large-scale extraction from asteroid belts for raw mineral wealth.',
        branch: Domain.ECONOMIC, subBranch: 'Extraction', tier: Tier.IV,
        position: { x: 24, y: 6 }, researchCost: 450,
        prerequisites: ['eco_aut_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'mineral_yield', value: 0.25 }],
        tags: ['economy', 'mining'], aiTags: ['growth']
    },
    {
        id: 'eco_fin_ref', name: 'Sector Credit Reform',
        description: 'Modernizing financial tools to increase liquid capital flow.',
        branch: Domain.ECONOMIC, subBranch: 'Theory', tier: Tier.II,
        position: { x: 22, y: 2 }, researchCost: 120,
        prerequisites: ['eco_tra_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'tax_efficiency', value: 0.1 }],
        tags: ['economy', 'finance'], aiTags: ['wealth']
    },

    // --- DIPLOMATIC (Final Batches) ---
    {
        id: 'dip_blk_1', name: 'Black Market Integration',
        description: 'Co-opting criminal networks into state-sanctioned shadow operations.',
        branch: Domain.DIPLOMATIC, subBranch: 'Espionage', tier: Tier.IV,
        position: { x: 36, y: 6 }, researchCost: 500,
        prerequisites: ['dip_spy_2'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'black_market_income', value: 0.4 }],
        tags: ['diplomacy', 'spy'], aiTags: ['wealth']
    },
    {
        id: 'dip_imm_1', name: 'Diplomatic Immunity Protocols',
        description: 'Shielding agents and diplomats from local legal repercussions.',
        branch: Domain.DIPLOMATIC, subBranch: 'Politics', tier: Tier.II,
        position: { x: 32, y: 2 }, researchCost: 100,
        prerequisites: ['dip_emb_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'diplomatic_safety', value: 0.5 }],
        tags: ['diplomacy', 'politics'], aiTags: ['stable']
    },

    // --- CULTURAL (Final Batches) ---
    {
        id: 'cul_mon_1', name: 'Civic Monuments',
        description: 'Massive structures that project the glory of the state.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.IV,
        position: { x: 44, y: 6 }, researchCost: 400,
        prerequisites: ['cul_art_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'unity_generation', value: 0.2 }],
        tags: ['culture', 'social'], aiTags: ['order']
    },
    {
        id: 'cul_pur_1', name: 'Ideological Realignment',
        description: 'Systematic purging of dissident thoughts via re-education.',
        branch: Domain.CULTURAL, subBranch: 'Social', tier: Tier.III,
        position: { x: 46, y: 5 }, researchCost: 350,
        prerequisites: ['cul_doc_state'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'rebellion_chance', value: -0.5 }],
        tags: ['culture', 'order'], aiTags: ['control']
    },
    {
        id: 'dip_sha_1', name: 'Shadow Governance',
        description: 'Operating the levers of power from the darkness, away from public eyes.',
        branch: Domain.DIPLOMATIC, subBranch: 'Politics', tier: Tier.IV,
        position: { x: 30, y: 7 }, researchCost: 1200,
        prerequisites: ['dip_emb_1'],
        effects: [{ type: TechEffectType.UNLOCK_ACTION, target: 'shadow_economy', value: 1 }],
        tags: ['diplomacy', 'shadow'], aiTags: ['covert']
    },
    // --- LATE GAME / IDEOLOGY / VICTORY ---
    {
        id: 'mil_vic_1', name: 'Total Galactic Mobilization',
        description: 'Every resource, ogni citizen, and every machine dedicated to final victory.',
        branch: Domain.MILITARY, subBranch: 'Final', tier: Tier.VI,
        position: { x: 6, y: 10 }, researchCost: 4000,
        prerequisites: ['mil_war_eco'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'total_war_efficiency', value: 0.5 }],
        tags: ['military', 'victory'], aiTags: ['aggressive']
    },
    {
        id: 'cul_vic_1', name: 'The Transcendence Anchor',
        description: 'A physical locus for the final ascent of the civilization.',
        branch: Domain.CULTURAL, subBranch: 'Final', tier: Tier.VI,
        position: { x: 44, y: 10 }, researchCost: 6000,
        prerequisites: ['cul_fin_1'],
        effects: [{ type: TechEffectType.STRATEGIC_BONUS, target: 'victory_progress_speed', value: 0.2 }],
        tags: ['culture', 'victory'], aiTags: ['ascension']
    },
    {
        id: 'eco_vic_1', name: 'Autonomous Industrial Web',
        description: 'A self-sustaining, galaxy-spanning factory network that requires no oversight.',
        branch: Domain.ECONOMIC, subBranch: 'Final', tier: Tier.VI,
        position: { x: 18, y: 10 }, researchCost: 4500,
        prerequisites: ['eco_fin_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'production_output_final', value: 0.4 }],
        tags: ['economy', 'victory'], aiTags: ['growth']
    },
    {
        id: 'dip_vic_1', name: 'Universal Truth Projection',
        description: 'Broadcasting the undeniable logic of your hegemony to all sentient life.',
        branch: Domain.DIPLOMATIC, subBranch: 'Final', tier: Tier.VI,
        position: { x: 30, y: 10 }, researchCost: 4000,
        prerequisites: ['dip_fin_1'],
        effects: [{ type: TechEffectType.MODIFIER_PERCENT, target: 'diplomatic_submission_rate', value: 0.5 }],
        tags: ['diplomacy', 'victory'], aiTags: ['hegemony']
    },
    {
        "id": "nex_phase_shields", "name": "Adaptive Phase-Shields",
        "description": "Defense systems that learn the frequency of incoming fire over time.",
        "branch": Domain.MILITARY, "subBranch": "Defense", "tier": Tier.IV,
        "position": { "x": 10, "y": 7 }, "researchCost": 600,
        "prerequisites": ["mil_plt_1"],
        "effects": [{ "type": TechEffectType.MODIFIER_PERCENT, "target": "combat_defense_per_turn", "value": 0.05 }],
        "tags": ["military", "defense", "nexulan"], "aiTags": ["defensive"]
    },
    {
        "id": "nex_blink_drive", "name": "Blink Drives",
        "description": "Zero-point teleportation drives that allow near-instantaneous jumping.",
        "branch": Domain.MILITARY, "subBranch": "Fleet", "tier": Tier.VI,
        "position": { "x": 6, "y": 10 }, "researchCost": 3000,
        "prerequisites": ["mil_adv_1"],
        "effects": [{ "type": TechEffectType.UNLOCK_ACTION, "target": "blink_jump", "value": 1 }],
        "tags": ["military", "fleet", "nexulan", "victory"], "aiTags": ["offensive"]
    }
];

// Register all technologies in the registry
techs.forEach(tech => registry.register(tech));

export default techs;
