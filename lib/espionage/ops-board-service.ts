/**
 * lib/espionage/ops-board-service.ts
 * Intelligence Operations Board — spawning, expiry, and seizing of
 * time-limited opportunities and threats (see opportunity-templates.ts).
 */

import type { GameWorldState } from '../game-world-state';
import type { BoardOpportunity } from './espionage-types';
import { OPPORTUNITY_TEMPLATES, type OpportunityTemplate } from './opportunity-templates';
import { getOrCreateFactionIntel, updateInfiltration } from './faction-intel';
import { stageForInfiltration, meetsStage } from './network-stages';
import { generateImmediateReport } from './intel-reports';

// ─── Tuning ───────────────────────────────────────────────────────────────────

const MAX_ACTIVE_PER_FACTION = 4;
/** Chance per strategic tick (6h) per faction to spawn one entry when below cap. */
const SPAWN_CHANCE_PER_TICK = 0.5;
const STRATEGIC_TICK_SECONDS = 6 * 3600;

const EXCLUDED_FACTIONS = new Set(['faction-pirates', 'faction-neutral']);

// ─── Spawning & expiry ────────────────────────────────────────────────────────

function eligibleFactions(world: GameWorldState): string[] {
    return [...world.economy.factions.keys()].filter(f => !EXCLUDED_FACTIONS.has(f));
}

function fillPlaceholders(text: string, world: GameWorldState, targetFactionId: string, systemId?: string): string {
    const targetName = world.economy.factions.get(targetFactionId)?.name ?? targetFactionId;
    const systemName = systemId ? (world.movement.systems.get(systemId)?.name ?? systemId) : 'an unknown system';
    return text.replace(/\{target\}/g, targetName).replace(/\{system\}/g, systemName);
}

function pickWeighted(templates: OpportunityTemplate[]): OpportunityTemplate | null {
    const total = templates.reduce((s, t) => s + t.weight, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const t of templates) {
        roll -= t.weight;
        if (roll <= 0) return t;
    }
    return templates[templates.length - 1] ?? null;
}

function spawnForFaction(ownerFactionId: string, world: GameWorldState): BoardOpportunity | null {
    const others = eligibleFactions(world).filter(f => f !== ownerFactionId);
    if (others.length === 0) return null;
    const targetFactionId = others[Math.floor(Math.random() * others.length)];

    const intel = getOrCreateFactionIntel(world, ownerFactionId);
    const stage = stageForInfiltration(intel.infiltrationLevels[targetFactionId] ?? 0);

    const ctx = { world, ownerFactionId, targetFactionId };
    const candidates = OPPORTUNITY_TEMPLATES.filter(t => {
        if (t.minStage && !meetsStage(stage, t.minStage)) return false;
        if (t.requires && !t.requires(ctx)) return false;
        return true;
    });
    const template = pickWeighted(candidates);
    if (!template) return null;

    // Threats concern the owner itself; opportunities concern the rolled target.
    const subjectFactionId = template.kind === 'threat' ? ownerFactionId : targetFactionId;

    // Attach a system when the flavor references one: subject's capital, or any owned system.
    let systemId = world.economy.factions.get(subjectFactionId)?.capitalSystemId ?? undefined;
    if (!systemId) {
        systemId = [...world.movement.systems.values()]
            .find(s => (s as any).ownerFactionId === subjectFactionId)?.id;
    }

    const now = world.nowSeconds;
    const ttlHours = template.ttlHoursMin + Math.random() * (template.ttlHoursMax - template.ttlHoursMin);

    const entry: BoardOpportunity = {
        id: `opp-${ownerFactionId}-${template.id}-${now}-${Math.floor(Math.random() * 1e6)}`,
        ownerFactionId,
        templateId: template.id,
        kind: template.kind,
        targetFactionId: subjectFactionId,
        systemId,
        title: fillPlaceholders(template.title, world, subjectFactionId, systemId),
        description: fillPlaceholders(template.description, world, subjectFactionId, systemId),
        cost: { ...template.cost },
        reward: { ...template.reward },
        createdAt: now,
        expiresAt: now + ttlHours * 3600,
        status: 'available',
    };

    world.espionage.boardOpportunities.set(entry.id, entry);
    return entry;
}

/**
 * Advance the board: expire stale entries, prune seized/expired ones, and
 * spawn new entries for factions below the cap. Call once per strategic tick.
 */
export function tickOpportunityBoard(world: GameWorldState, deltaSeconds: number): void {
    const now = world.nowSeconds;

    // Expire and prune. Seized/expired entries linger 24h for UI feedback, then go.
    for (const [id, entry] of world.espionage.boardOpportunities) {
        if (entry.status === 'available' && now >= entry.expiresAt) entry.status = 'expired';
        if (entry.status !== 'available' && now - entry.expiresAt > 24 * 3600) {
            world.espionage.boardOpportunities.delete(id);
        }
    }

    // Spawn — scale chance to the delta so off-cadence calls stay fair.
    const spawnChance = SPAWN_CHANCE_PER_TICK * (deltaSeconds / STRATEGIC_TICK_SECONDS);
    for (const factionId of eligibleFactions(world)) {
        const active = [...world.espionage.boardOpportunities.values()]
            .filter(o => o.ownerFactionId === factionId && o.status === 'available').length;
        if (active >= MAX_ACTIVE_PER_FACTION) continue;
        if (Math.random() < spawnChance) spawnForFaction(factionId, world);
    }
}

// ─── Seizing ──────────────────────────────────────────────────────────────────

export interface SeizeResult {
    success: boolean;
    message: string;
}

/**
 * Seize an available board entry: validate ownership and freshness, pay the
 * cost (Intel from FactionIntelState, credits from live economy reserves),
 * then apply the reward. Worker-side entry point (ESP_SEIZE_OPPORTUNITY).
 */
export function seizeOpportunity(
    factionId: string,
    opportunityId: string,
    world: GameWorldState
): SeizeResult {
    const entry = world.espionage.boardOpportunities.get(opportunityId);
    if (!entry || entry.ownerFactionId !== factionId) {
        return { success: false, message: 'Opportunity not found.' };
    }
    if (entry.status !== 'available') {
        return { success: false, message: 'Opportunity is no longer available.' };
    }
    if (world.nowSeconds >= entry.expiresAt) {
        entry.status = 'expired';
        return { success: false, message: 'The window has closed.' };
    }

    const intel = getOrCreateFactionIntel(world, factionId);
    const reserves = (world.economy.factions.get(factionId) as any)?.reserves;

    const intelCost = entry.cost.intelPoints ?? 0;
    const creditsCost = entry.cost.credits ?? 0;
    if (intel.intelPoints < intelCost) {
        return { success: false, message: `Requires ${intelCost} Intel.` };
    }
    if (creditsCost > 0 && reserves && (reserves.CREDITS ?? 0) < creditsCost) {
        return { success: false, message: `Requires ${creditsCost} credits.` };
    }

    intel.intelPoints -= intelCost;
    if (creditsCost > 0 && reserves) reserves.CREDITS = (reserves.CREDITS ?? 0) - creditsCost;

    applyReward(entry, world);
    entry.status = 'seized';
    return { success: true, message: `${entry.title}: opportunity seized.` };
}

function applyReward(entry: BoardOpportunity, world: GameWorldState): void {
    const owner = entry.ownerFactionId;
    const reward = entry.reward;

    switch (reward.type) {
        case 'infiltration':
            updateInfiltration(world, owner, entry.targetFactionId, reward.amount);
            break;
        case 'intel': {
            const intel = getOrCreateFactionIntel(world, owner);
            intel.intelPoints = Math.min(1000, intel.intelPoints + reward.amount);
            break;
        }
        case 'credits': {
            const reserves = (world.economy.factions.get(owner) as any)?.reserves;
            if (reserves) reserves.CREDITS = (reserves.CREDITS ?? 0) + reward.amount;
            break;
        }
        case 'report':
            generateImmediateReport(owner, entry.targetFactionId, reward.domain, world);
            break;
        case 'counterIntel': {
            const intel = getOrCreateFactionIntel(world, owner);
            intel.counterIntelStrength = Math.min(100, intel.counterIntelStrength + reward.amount);
            break;
        }
        case 'instability': {
            const capitalId = world.economy.factions.get(entry.targetFactionId)?.capitalSystemId;
            const sys = capitalId ? world.movement.systems.get(capitalId) : undefined;
            if (sys) sys.instability = Math.min(100, sys.instability + reward.amount);
            break;
        }
    }
}
