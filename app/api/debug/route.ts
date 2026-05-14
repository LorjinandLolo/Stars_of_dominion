import { NextRequest, NextResponse } from 'next/server';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { TechEngine } from '@/lib/tech/engine';
import { tickSeasonModifiers, endSeason, scheduleNextSeason } from '@/lib/seasons/season-service';
import { processSectorCombats } from '@/lib/combat/combat-manager';

export async function POST(req: NextRequest) {
    try {
        const { action, payload } = await req.json();
        const world = getGameWorldState();

        console.log(`[API/Debug] Action: ${action}`, payload);

        switch (action) {
            case 'tick': {
                const hours = payload.hours || 1;
                const seconds = hours * 3600;
                world.nowSeconds += seconds;
                
                if (world.tech) {
                    for (const [factionId, techState] of world.tech.entries()) {
                        const updated = TechEngine.tickResearch(techState, seconds);
                        world.tech.set(factionId, updated);
                    }
                }
                
                // Process Combats during tick
                processSectorCombats(world);
                
                tickSeasonModifiers(world, seconds);
                return NextResponse.json({ success: true, nowSeconds: world.nowSeconds });
            }

            case 'endSeason': {
                const record = endSeason(world);
                const nextSeasonNumber = (record?.seasonNumber ?? 0) + 1;
                world.activeSeason = scheduleNextSeason(nextSeasonNumber, world);
                return NextResponse.json({ success: true });
            }

            case 'inject': {
                const { factionId, resources } = payload;
                const faction = world.economy.factions.get(factionId);
                if (!faction) return NextResponse.json({ success: false, error: 'Faction not found' }, { status: 404 });

                if (!faction.reserves) faction.reserves = {};
                for (const [res, amount] of Object.entries(resources)) {
                    const current = (faction.reserves as any)[res] || 0;
                    (faction.reserves as any)[res] = current + (amount as number);
                }
                return NextResponse.json({ success: true });
            }

            case 'triggerCombat': {
                const playerFactionId = 'faction-aurelian';
                const enemyFactionId = 'faction-vektori';
                const systemId = 'alpha-5b34961e18bb6fd14903'; // Aurelian Capital

                // 1. Force a Rivalry at War escalation (Level 7)
                const rivalryId = `rivalry-${playerFactionId}-${enemyFactionId}`;
                world.rivalries.set(rivalryId, {
                    id: rivalryId,
                    empireAId: playerFactionId,
                    empireBId: enemyFactionId,
                    rivalryScore: 100,
                    escalationLevel: 7, // TRIGGER WAR
                    activeSanctionIds: [],
                    proxyConflictsInvolved: [],
                    detenteActive: false
                });

                // 2. Spawn Player Fleet if none exists in system
                const playerFleets = Array.from(world.movement.fleets.values()).filter(f => f.factionId === playerFactionId && f.currentSystemId === systemId);
                if (playerFleets.length === 0) {
                    const id = `fleet-player-debug-${Date.now()}`;
                    world.movement.fleets.set(id, {
                        id,
                        factionId: playerFactionId,
                        name: "1st Home Defense Fleet",
                        currentSystemId: systemId,
                        destinationSystemId: null,
                        activeLayer: null,
                        transitProgress: 0,
                        etaSeconds: 0,
                        plannedPath: [],
                        orders: [],
                        doctrine: {
                            type: 'Defensive',
                            deviationFromPosture: 0,
                            preferredLayers: ['hyperlane'],
                            retreatThreshold: 0.2,
                            logisticsStrain: 0,
                            moraleDrift: 0,
                            supplyLevel: 1.0
                        },
                        postureId: 'Consolidating',
                        strength: 1.0,
                        basePower: 500,
                        composition: { destroyer: 10, cruiser: 2 },
                        hyperdriveProfile: { hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, trade: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, corridor: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, gate: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, deepSpace: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 } },
                        isDetectable: true
                    } as any);
                }

                // 3. Spawn Enemy Fleet
                const enemyId = `fleet-vektori-debug-${Date.now()}`;
                world.movement.fleets.set(enemyId, {
                    id: enemyId,
                    factionId: enemyFactionId,
                    name: "Vektori Vengeance Taskforce",
                    currentSystemId: systemId,
                    destinationSystemId: null,
                    activeLayer: null,
                    transitProgress: 0,
                    etaSeconds: 0,
                    plannedPath: [],
                    orders: [],
                    doctrine: {
                        type: 'Offensive',
                        deviationFromPosture: 0,
                        preferredLayers: ['hyperlane'],
                        retreatThreshold: 0.1,
                        logisticsStrain: 0,
                        moraleDrift: 0,
                        supplyLevel: 1.0
                    },
                    postureId: 'Militarist',
                    strength: 1.0,
                    basePower: 450,
                    composition: { destroyer: 12, cruiser: 1 },
                    hyperdriveProfile: { hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, trade: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, corridor: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, gate: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 }, deepSpace: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 } },
                    isDetectable: true
                } as any);

                // 4. Initial process
                processSectorCombats(world);

                return NextResponse.json({ success: true, message: 'Combat scenario initialized in Aurelian system.' });
            }

            case 'ping': {
                return NextResponse.json({ success: true, pong: Date.now() });
            }

            default:
                return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
        }
    } catch (err: any) {
        console.error('[API/Debug] Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
