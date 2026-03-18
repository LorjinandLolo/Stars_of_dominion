
import { DefeatTrigger, ComebackPath } from '@/types/comeback';

export const DEFEAT_TRIGGERS: Record<string, DefeatTrigger> = {
    'MILITARY_DEFEAT': {
        id: 'MILITARY_DEFEAT',
        name: 'Total Military Defeat',
        description: 'Your fleet power has been decimated and you have lost significant territory.',
        window_days: 90,
        thresholds: {
            fleet_power_loss: 0.8, // 80% loss
            planet_loss_rate: 0.5   // 50% planets lost
        },
        min_duration_hours: 24,
        severity: 4,
        cooldown_days: 180
    },
    'ECONOMIC_COLLAPSE': {
        id: 'ECONOMIC_COLLAPSE',
        name: 'Economic Collapse',
        description: 'Sustained bankruptcy and inability to produce.',
        window_days: 60,
        thresholds: {
            net_income_ratio: -0.5, // losing 50% of revenue
            debt_duration: 14 // days in debt
        },
        min_duration_hours: 48,
        severity: 5,
        cooldown_days: 120
    }
    // Add more...
};

export const COMEBACK_PATHS: Record<string, ComebackPath> = {
    'GUERRILLA_DOCTRINE': {
        id: 'GUERRILLA_DOCTRINE',
        defeat_type: 'MILITARY_DEFEAT',
        name: 'Guerrilla Doctrine',
        description: 'Embrace asymmetrical warfare. Hide in the shadows, strike where they are weak.',
        perks: [
            {
                id: 'shadow_strike',
                name: 'Shadow Strike',
                description: 'First strike from stealth deals 200% damage.',
                tier: 1,
                effect_type: 'PASSIVE',
                effect_config: { damage_mult: 2.0, condition: 'stealth' },
                unlock_cost_xp: 0
            },
            {
                id: 'cell_network',
                name: 'Cell Network',
                description: 'Planets cannot be fully blockaded; 20% trade always gets through.',
                tier: 2,
                effect_type: 'PASSIVE',
                effect_config: { blockade_pierce: 0.2 },
                unlock_cost_xp: 100
            }
        ]
    },
    'SURVIVAL_ECONOMY': {
        id: 'SURVIVAL_ECONOMY',
        defeat_type: 'ECONOMIC_COLLAPSE',
        name: 'Survival Economy',
        description: 'Scrap luxury. Recycle everything. Survive at all costs.',
        perks: [
            {
                id: 'scrap_protocol',
                name: 'Scrap Protocol',
                description: 'Deconstruct buildings for 90% refund (up from 50%).',
                tier: 1,
                effect_type: 'PASSIVE',
                effect_config: { refund_rate: 0.9 },
                unlock_cost_xp: 0
            },
            {
                id: 'black_market',
                name: 'Black Market Ties',
                description: 'Access to smuggling routes that bypass embargoes.',
                tier: 2,
                effect_type: 'PASSIVE',
                effect_config: { smugglers: true },
                unlock_cost_xp: 150
            }
        ]
    }
};
