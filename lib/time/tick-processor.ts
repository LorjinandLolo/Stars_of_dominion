// lib/time/tick-processor.ts
// Stars of Dominion — Strategic Tick Processor
// Orchestrates all 9 sub-systems defined in the time design spec.
// Called by tick-scheduler.ts on every 6-hour strategic tick.

import { getGameWorldState } from '../game-world-state-singleton';
import { tickEconomy } from '../economy/economy-service';
import { tickConstructionGlobal } from '../construction/construction-service';
import { fireNotification } from './notification-hooks';
import { expireAllStaleCrises } from './crisis-engine';

// ─── Tick Delta ─────────────────────────────────────────────────────────────

/** 6 hours in seconds — the time span each tick represents. */
const TICK_DELTA_SECONDS = 6 * 60 * 60;

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Execute a full strategic tick.
 * Order is deterministic and must remain stable for replayability.
 */
export async function runStrategicTick(now: Date, tickIndex: number): Promise<void> {
    const world = getGameWorldState();
    world.nowSeconds = Math.floor(now.getTime() / 1000);

    console.log(`[TickProcessor] Running tick #${tickIndex} at ${now.toISOString()}`);

    // 1 & 2: Planetary production + upkeep + construction (bundled in economy service)
    step1_economy(world, TICK_DELTA_SECONDS);

    // 3: Construction progress (separate pass — checks build queues by wall-clock time)
    step3_construction(world);

    // 4: Research progress
    step4_research(world);

    // 5: Recruitment / unit production
    step5_recruitment(world);

    // 6: Trade and logistics
    step6_trade(world, TICK_DELTA_SECONDS);

    // 7: Planetary social state
    step7_socialState(world);

    // 8: Intelligence refresh
    step8_intelligence(world, TICK_DELTA_SECONDS);

    // 9: Ongoing effects (sanctions, propaganda, rebellion, seasonal)
    step9_ongoingEffects(world);

    // Post-tick: expire stale crises
    await expireAllStaleCrises(now);

    // Post-tick notification
    await fireNotification({
        id: `tick-${tickIndex}-${Date.now()}`,
        factionId: 'all',
        category: 'system',
        priority: 'low',
        title: 'Strategic Cycle Complete',
        body: `Cycle #${tickIndex} resolved. Resources, construction, and research updated.`,
        createdAt: now.toISOString(),
        read: false,
        linkToTab: 'economy',
        payload: { tickIndex },
    });

    console.log(`[TickProcessor] Tick #${tickIndex} complete.`);
}

// ─── Sub-steps ────────────────────────────────────────────────────────────────

function step1_economy(world: ReturnType<typeof getGameWorldState>, delta: number) {
    try {
        tickEconomy(world, delta);
    } catch (e) {
        console.error('[TickProcessor] step1_economy failed:', e);
    }
}

function step3_construction(world: ReturnType<typeof getGameWorldState>) {
    try {
        tickConstructionGlobal(world);
    } catch (e) {
        console.error('[TickProcessor] step3_construction failed:', e);
    }
}

function step4_research(world: ReturnType<typeof getGameWorldState>) {
    // Research is tracked via tech state per faction.
    // For each faction with active research slots, advance ticks completed.
    try {
        for (const [factionId, techState] of world.tech) {
            if (!techState.activeSlots) continue;
            for (const slot of techState.activeSlots) {
                if (slot.status !== 'researching') continue;
                slot.ticksCompleted = (slot.ticksCompleted ?? 0) + 1;
                if (slot.ticksRequired && slot.ticksCompleted >= slot.ticksRequired) {
                    slot.status = 'complete';
                    // Mark tech as unlocked
                    if (slot.techId && !techState.unlockedTechIds.includes(slot.techId)) {
                        techState.unlockedTechIds.push(slot.techId);
                    }
                    // Notification fired below
                    fireNotification({
                        id: `research-complete-${factionId}-${slot.techId}-${Date.now()}`,
                        factionId,
                        category: 'research',
                        priority: 'normal',
                        title: 'Research Complete',
                        body: `Technology "${slot.techId}" has been unlocked.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        linkToTab: 'tech',
                        payload: { techId: slot.techId },
                    });
                }
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step4_research failed:', e);
    }
}

function step5_recruitment(world: ReturnType<typeof getGameWorldState>) {
    // Unit production is handled within the construction space build queue.
    // A dedicated recruitment queue can be added here when the unit system
    // exposes a tickRecruitment() function.
    // For now this is a no-op stub with logging.
    try {
        for (let i = world.construction.spaceBuildQueue.length - 1; i >= 0; i--) {
            const buildItem = world.construction.spaceBuildQueue[i];
            if (world.nowSeconds >= buildItem.completesAtSeconds) {
                // Construction complete
                fireNotification({
                    id: `ship-complete-${buildItem.orderId}-${Date.now()}`,
                    factionId: 'unknown', // factionId not in SpaceBuildOrder, could add it or leave unknown
                    category: 'construction',
                    priority: 'normal',
                    title: 'Ship Construction Complete',
                    body: `${buildItem.shipType ?? 'New ship'} is ready for deployment.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    linkToTab: 'war',
                    payload: { buildItemId: buildItem.orderId },
                });
                // Remove from queue
                world.construction.spaceBuildQueue.splice(i, 1);
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step5_recruitment failed:', e);
    }
}

function step6_trade(world: ReturnType<typeof getGameWorldState>, delta: number) {
    // Trade flow is handled lazily inside tickEconomy.
    // Here we process tribute payments from vassal factions.
    try {
        for (const tribute of world.tributes.values()) {
            if (tribute.status !== 'active') continue;
            // Tribute is processed per tick — find vassal economy and deduct.
            const vassalEconFaction = world.economy.factions.get(tribute.vassalId);
            const overlordEconFaction = world.economy.factions.get(tribute.overlordId);
            if (vassalEconFaction && overlordEconFaction) {
                const amount = tribute.amountPerTick;
                const resourceKey = tribute.resourceType as keyof typeof vassalEconFaction.reserves;
                vassalEconFaction.reserves[resourceKey] =
                    Math.max(0, (vassalEconFaction.reserves[resourceKey] ?? 0) - amount);
                overlordEconFaction.reserves[resourceKey] =
                    (overlordEconFaction.reserves[resourceKey] ?? 0) + amount;
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step6_trade failed:', e);
    }
}

function step7_socialState(world: ReturnType<typeof getGameWorldState>) {
    // Drift planet happiness and unrest toward equilibrium.
    try {
        for (const planet of world.construction.planets.values()) {
            const unrest = planet.stability < 50 ? (50 - planet.stability) * 0.5 : 0;
            let happinessDrift = 0;

            if (planet.stability < 30) {
                happinessDrift = -3;
            } else if (planet.stability > 70) {
                happinessDrift = 1;
            }

            planet.happiness = Math.min(100, Math.max(0, (planet.happiness ?? 80) + happinessDrift));

            // Unrest buildup from low stability
            if (planet.stability < 40 && Math.random() < 0.15) {
                fireNotification({
                    id: `unrest-${planet.id}-${Date.now()}`,
                    factionId: planet.ownerId ?? 'unknown',
                    category: 'politics',
                    priority: 'normal',
                    title: 'Civil Unrest Rising',
                    body: `${planet.name} stability is critically low. Secession risk increasing.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    linkToTab: 'government',
                    payload: { planetId: planet.id },
                });
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step7_socialState failed:', e);
    }
}

function step8_intelligence(world: ReturnType<typeof getGameWorldState>, delta: number) {
    // Decay stale intel and passively grow espionage networks.
    try {
        const hours = delta / 3600;
        for (const network of world.espionage.intelNetworks.values()) {
            // Passive network growth
            network.strength = Math.min(1, network.strength + 0.01 * hours);
            // Decay old intel
            if (network.penetrationLevel === 'confirmed' && Math.random() < 0.05) {
                network.penetrationLevel = 'rumor';
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step8_intelligence failed:', e);
    }
}

function step9_ongoingEffects(world: ReturnType<typeof getGameWorldState>) {
    // Apply propaganda campaigns, sanctions, and seasonal effects.
    try {
        // Propaganda: decay credibility on active campaigns
        for (const campaign of world.propagandaCampaigns.values()) {
            if (campaign.ticksRemaining > 0) {
                // Propaganda slowly erodes if not refreshed
                campaign.ticksRemaining = Math.max(0, campaign.ticksRemaining - 1);
            }
        }

        // Sanctions: apply per-tick economic pressure via rivalry score
        for (const rivalry of world.rivalries.values()) {
            if (rivalry.activeSanctionIds && rivalry.activeSanctionIds.length > 0) {
                // Sanctions drift shared stability
                world.shared.stability = Math.max(0, world.shared.stability - 0.005);
            }
        }
    } catch (e) {
        console.error('[TickProcessor] step9_ongoingEffects failed:', e);
    }
}
