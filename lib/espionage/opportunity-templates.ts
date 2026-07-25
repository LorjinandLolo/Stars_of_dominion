/**
 * lib/espionage/opportunity-templates.ts
 * Intelligence Operations Board — opportunity/threat catalog.
 *
 * HAND-AUTHORABLE: add a template here and the board spawner picks it up.
 * Placeholders in title/description: {target} = target faction name,
 * {system} = system name (when a system is involved).
 *
 * `weight` biases random selection. `requires` (optional) gates spawning on
 * world context. TTL is rolled between ttlHoursMin/Max. One reward per entry.
 */

import type { GameWorldState } from '../game-world-state';
import type { OpportunityKind, OpportunityReward } from './espionage-types';
import type { NetworkStage } from './network-stages';

export interface OpportunitySpawnContext {
    world: GameWorldState;
    ownerFactionId: string;
    targetFactionId: string;
}

export interface OpportunityTemplate {
    id: string;
    kind: OpportunityKind;
    title: string;
    description: string;
    weight: number;
    ttlHoursMin: number;
    ttlHoursMax: number;
    cost: { intelPoints?: number; credits?: number };
    reward: OpportunityReward;
    /** Minimum network stage vs the target for this to surface. */
    minStage?: NetworkStage;
    /** Extra spawn condition beyond stage/target checks. */
    requires?: (ctx: OpportunitySpawnContext) => boolean;
}

/** True when at least one active hostile op targets the owner. */
function underAttack({ world, ownerFactionId }: OpportunitySpawnContext): boolean {
    for (const op of world.espionage.operations.values()) {
        if (op.targetFactionId === ownerFactionId && op.status === 'active') return true;
    }
    return false;
}

export const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
    // ─── Opportunities (windows into rival empires) ──────────────────────────
    {
        id: 'defecting_official',
        kind: 'opportunity',
        title: 'Governor Willing to Defect',
        description: 'A disillusioned {target} official offers administrative access codes in exchange for extraction and a new identity.',
        weight: 2,
        ttlHoursMin: 12, ttlHoursMax: 36,
        cost: { credits: 2000, intelPoints: 30 },
        reward: { type: 'infiltration', amount: 12 },
        minStage: 'recon_cell',
    },
    {
        id: 'pirate_contact',
        kind: 'opportunity',
        title: 'Pirate Contact Established',
        description: 'A smuggler captain operating in {target} space will fence confiscated cargo through our shell companies — for a cut.',
        weight: 3,
        ttlHoursMin: 12, ttlHoursMax: 24,
        cost: { intelPoints: 15 },
        reward: { type: 'credits', amount: 1800 },
    },
    {
        id: 'smuggling_route',
        kind: 'opportunity',
        title: 'Smuggling Route Opens',
        description: 'Patrol rotations near {system} leave a corridor unwatched. Contraband runs are viable while it lasts.',
        weight: 3,
        ttlHoursMin: 8, ttlHoursMax: 24,
        cost: { credits: 500 },
        reward: { type: 'credits', amount: 2500 },
    },
    {
        id: 'blackmail_material',
        kind: 'opportunity',
        title: 'Blackmail Material Acquired',
        description: 'Compromising records on a senior {target} minister have surfaced. Leverage like this opens doors.',
        weight: 2,
        ttlHoursMin: 24, ttlHoursMax: 48,
        cost: { intelPoints: 40 },
        reward: { type: 'infiltration', amount: 8 },
        minStage: 'recon_cell',
    },
    {
        id: 'stolen_research_cache',
        kind: 'opportunity',
        title: 'Stolen Research Offered',
        description: 'A data broker is auctioning research archives lifted from {target} laboratories. Provenance unverifiable.',
        weight: 2,
        ttlHoursMin: 12, ttlHoursMax: 30,
        cost: { credits: 1500 },
        reward: { type: 'report', domain: 'scientific' },
    },
    {
        id: 'security_vulnerability',
        kind: 'opportunity',
        title: 'Security Vulnerability Window',
        description: '{target} fleet IFF certificates rotate in hours. Until then, their military traffic reads like plaintext.',
        weight: 2,
        ttlHoursMin: 6, ttlHoursMax: 18,
        cost: { intelPoints: 25 },
        reward: { type: 'report', domain: 'military' },
        minStage: 'recon_cell',
    },
    {
        id: 'summit_intercept',
        kind: 'opportunity',
        title: 'Secret Meeting Intercepted',
        description: 'A closed-door {target} cabinet session convenes at {system}. A listening device is already in the room.',
        weight: 2,
        ttlHoursMin: 6, ttlHoursMax: 16,
        cost: { intelPoints: 20 },
        reward: { type: 'report', domain: 'political' },
        minStage: 'recon_cell',
    },
    {
        id: 'labour_strike',
        kind: 'opportunity',
        title: 'Labour Strike Brewing',
        description: 'Dockworkers on {system} are one grievance away from walking out. A modest strike fund tips the balance.',
        weight: 2,
        ttlHoursMin: 12, ttlHoursMax: 36,
        cost: { credits: 1000 },
        reward: { type: 'instability', amount: 15 },
        minStage: 'embedded_network',
    },

    // ─── Threats (fires on your own board — respond or absorb the risk) ─────
    {
        id: 'double_agent_suspected',
        kind: 'threat',
        title: 'Double Agent Suspected',
        description: 'Counter-intelligence flags anomalies in our field traffic. Fund an internal audit before the rot spreads.',
        weight: 1,
        ttlHoursMin: 12, ttlHoursMax: 24,
        cost: { credits: 1200 },
        reward: { type: 'counterIntel', amount: 10 },
    },
    {
        id: 'cyber_attack',
        kind: 'threat',
        title: 'Cyber Attack in Progress',
        description: 'Hostile intrusion detected across our networks. Emergency hardening will blunt it — if funded now.',
        weight: 2,
        ttlHoursMin: 4, ttlHoursMax: 12,
        cost: { credits: 800, intelPoints: 10 },
        reward: { type: 'counterIntel', amount: 8 },
        requires: underAttack,
    },
    {
        id: 'enemy_network_detected',
        kind: 'threat',
        title: 'Enemy Network Detected',
        description: 'Signal analysis places a foreign cell inside our borders. A sweep now maps their operation before they relocate.',
        weight: 2,
        ttlHoursMin: 8, ttlHoursMax: 20,
        cost: { intelPoints: 20 },
        reward: { type: 'counterIntel', amount: 12 },
        requires: underAttack,
    },
];
