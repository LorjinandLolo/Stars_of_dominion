// lib/game-world-state.ts
// Single composite world state passed to all pillar services.
// Each service imports this type and destructures only what it needs.

import type { MovementWorldState, InfluenceBloc } from './movement/types';
import type { EconomyWorldState } from './economy/economy-types';
import type { EspionageWorldState } from './espionage/espionage-types';
import type { ActiveSeason, SeasonRecord, VictoryState, PostVictoryTransition, TerritoryPersistenceRecord } from './seasons/season-types';
import type { PlayerTechState } from './tech/types';
import type { RivalryState, Bloc, PropagandaCampaign, ProxyConflict, Treaty, TradePact, Tribute } from './politics/cold-war-types';
import type { CombatState } from './combat/combat-types';
import type { ConstructionWorldState } from './construction/construction-types';
import type { CouncilState } from '@/types/ui-state';
import type { SimulationState as PressSimulationState } from './press-system/types';
import type { IntelligenceWorldState } from './intelligence/types';


// ─── Shared cross-pillar variables ────────────────────────────────────────────

/**
 * Normalized 0–1 shared scalars that all services read/write.
 * These are the "integration bus" — changes in one pillar propagate
 * to others via this bag, not via direct imports.
 */
export interface SharedState {
    /** 0–1. Falls under espionage, bloc crisis, trade collapse. */
    stability: number;
    /** 0–1. Affected by route disruption, blockades, reroutes. */
    tradeEfficiency: number;
    /** 0–1. Falls under commodity scarcity; affects happiness + politics. */
    commodityAccess: number;
    /** 0–1. Aggregate of all bloc satisfaction levels. */
    blocSatisfaction: number;
    /** 0–1. Average infra integrity across all segments/gates/corridors. */
    infraIntegrity: number;
    /** 0–1. Regional espionage accumulation; widens vulnerability windows. */
    espionagePressure: number;
    /**
     * Active season modifier overrides.
     * Key = affectedVariable (a SharedState scalar key), value = pressure rate (0–1).
     * Typed as Record<string, number> because keys come from config strings at runtime.
     */
    seasonalModifiers: Record<string, number>;
    /** Days since current season started. */
    seasonDayElapsed: number;
    /** War fatigue 0–100. Affects frontier bloc and military bloc. */
    warFatigue: number;
}

// ─── Composite world state ────────────────────────────────────────────────────

export interface GameWorldState {
    // ── Shared integration bus ────────────────────────────────────────────────
    shared: SharedState;

    // ── Pillar 1/2/3 — Movement, Exploration, Doctrine ───────────────────────
    movement: MovementWorldState;

    // ── Pillar 3 — Flow-Based Economy ────────────────────────────────────────
    economy: EconomyWorldState;

    // ── Pillar 6 — Espionage ─────────────────────────────────────────────────
    espionage: EspionageWorldState;
    /** V2 Intelligence & Covert Ops System. */
    intelligence: IntelligenceWorldState;


    // ── Pillar 7 — Season ────────────────────────────────────────────────────
    activeSeason: ActiveSeason | null;
    seasonHistory: SeasonRecord[];

    // ── Victory & Transition ──────────────────────────────────────────────
    /** Active victory tracker (conquest OR enlightenment, never both simultaneously). */
    victoryState: VictoryState | null;
    /** Active 48-hour post-victory transition phase, if any. */
    postVictoryTransition: PostVictoryTransition | null;
    /** Historical territory snapshots at each season boundary. */
    territoryHistory: TerritoryPersistenceRecord[];
    
    /** Tech state per faction. */
    tech: Map<string, PlayerTechState>;

    /** Diplomacy state. */
    rivalries: Map<string, RivalryState>;
    blocs: Map<string, Bloc>;
    propagandaCampaigns: Map<string, PropagandaCampaign>;
    proxyConflicts: Map<string, ProxyConflict>;
    treaties: Map<string, Treaty>;
    tradePacts: Map<string, TradePact>;
    tributes: Map<string, Tribute>;

    /** Active combat engagements. */
    activeCombats: Map<string, CombatState>;

    /** Galactic Council state. */
    council: CouncilState;

    /** Press & Information pillar state. */
    press: PressSimulationState;

    // ── Pillar 17B — Planetary Construction ──────────────────────────────────
    construction: ConstructionWorldState;

    /** Sim-clock unix seconds. Single source of truth for all services. */
    nowSeconds: number;
}

// ─── Shared-state helpers ─────────────────────────────────────────────────────

/** Clamp a shared scalar to [0, 1]. */
export function clampShared(v: number): number {
    return Math.max(0, Math.min(1, v));
}

/**
 * Recompute bloc satisfaction aggregate from individual blocs.
 * Call after any bloc tick.
 */
export function recomputeBlocSatisfaction(world: GameWorldState): void {
    const allBlocs: InfluenceBloc[] = [];
    for (const posture of world.movement.empirePostures.values()) {
        allBlocs.push(...posture.blocs);
    }
    if (allBlocs.length === 0) return;
    const avg = allBlocs.reduce((s, b) => s + b.satisfaction, 0) / allBlocs.length;
    world.shared.blocSatisfaction = clampShared(avg / 100);
}

/**
 * Recompute infra integrity aggregate from all trade segments and gates.
 */
export function recomputeInfraIntegrity(world: GameWorldState): void {
    const items: number[] = [];
    for (const seg of world.movement.tradeSegments.values()) items.push(seg.integrity);
    for (const gate of world.movement.gates.values()) items.push(gate.integrity);
    if (items.length === 0) return;
    world.shared.infraIntegrity = clampShared(items.reduce((a, b) => a + b, 0) / items.length);
}

/**
 * Apply seasonal modifier pressure to shared state for deltaSeconds.
 * Each modifier reduces its target variable at pressureRate per second.
 * Rates in config are expressed as "fraction to reduce per full season".
 * We convert here: deltaFraction = pressureRate * (deltaSeconds / seasonDurationSeconds).
 */
export function applySeasonalPressure(
    world: GameWorldState,
    deltaSeconds: number,
    seasonDurationSeconds: number
): void {
    for (const [variable, rate] of Object.entries(world.shared.seasonalModifiers)) {
        if (rate === undefined) continue;
        const delta = rate * (deltaSeconds / seasonDurationSeconds);
        const key = variable as keyof SharedState;
        const current = world.shared[key];
        if (typeof current === 'number') {
            (world.shared as unknown as Record<string, number>)[key] = clampShared(current - delta);
        }
    }
}

/** Build a zero-initialized SharedState. */
export function defaultSharedState(): SharedState {
    return {
        stability: 1,
        tradeEfficiency: 1,
        commodityAccess: 1,
        blocSatisfaction: 1,
        infraIntegrity: 1,
        espionagePressure: 0,
        seasonalModifiers: {},
        seasonDayElapsed: 0,
        warFatigue: 0,
    };
}
