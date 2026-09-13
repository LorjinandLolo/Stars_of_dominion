/**
 * lib/espionage/intel-reports.ts
 * Imperfect intelligence: report generation for successful intel operations.
 *
 * Reports snapshot REAL world state, then pass through an imperfection model:
 *  - confidence: what the player sees, driven by outcome quality, infiltration,
 *    and the target's counter-intelligence strength.
 *  - accuracy (hidden): reports can be distorted by bad tradecraft, poisoned by
 *    a compromised agent on the owner's own roster, or PLANTED by the target's
 *    counter-intelligence — plants carry deliberately high confidence.
 *  - staleness: reports expire and are pruned; even accurate ones age out.
 */

import type { GameWorldState } from '../game-world-state';
import type { EspionageOperation, IntelReport } from './espionage-types';
import type { OperationDefinition } from './operation-catalog';
import { factionDesigns } from '../combat/ship-design-service';
import { summarizeDesign } from '../combat/ship-registry';
import type { DesignProfile } from '../combat/ship-types';
import { NETWORK_STAGES, stageForInfiltration } from './network-stages';
import type { NetworkStage } from './network-stages';

// ─── Tuning ───────────────────────────────────────────────────────────────────

const REPORT_TTL_SECONDS = 5 * 24 * 3600;      // reports stale after 5 days
const BASE_CONFIDENCE: Record<string, number> = {
    critical_success: 0.9,
    success: 0.75,
    partial_success: 0.55,
};
/** Chance the target's counter-intel converts a would-be report into a plant. */
const PLANT_CHANCE_PER_CI_POINT = 0.004;        // 0.4% per counterIntelStrength point
/** Accuracy penalty when the owner fields a compromised/turned agent. */
const COMPROMISED_AGENT_ACCURACY_PENALTY = 0.35;

// ─── Imperfection model ───────────────────────────────────────────────────────

interface Imperfection {
    confidence: number;
    accurate: boolean;
    /** 0–1 distortion severity applied to numbers when inaccurate. */
    severity: number;
}

/** Does the owner faction field an asset working against them (compromised trait or turned)? */
function ownerHasCompromisedAsset(ownerFactionId: string, world: GameWorldState): boolean {
    for (const agent of world.espionage.agents.values()) {
        if (agent.ownerFactionId !== ownerFactionId) continue;
        if (agent.status === 'turned') return true;
        if (agent.status === 'deployed' && agent.traitIds.includes('compromised')) return true;
    }
    return false;
}

function rollImperfection(op: EspionageOperation, outcome: string, world: GameWorldState): Imperfection {
    const ownerIntel = world.espionage.factionIntel.get(op.actorFactionId);
    const targetIntel = world.espionage.factionIntel.get(op.targetFactionId);
    const infiltration = ownerIntel?.infiltrationLevels[op.targetFactionId] ?? 0;
    const targetCI = targetIntel?.counterIntelStrength ?? 0;

    // Counter-intel plant: target feeds fabricated data through the channel.
    // Plants look GOOD — high confidence is the trap.
    if (Math.random() < targetCI * PLANT_CHANCE_PER_CI_POINT) {
        return { confidence: 0.8 + Math.random() * 0.15, accurate: false, severity: 0.8 };
    }

    const base = BASE_CONFIDENCE[outcome] ?? 0.55;
    const confidence = Math.max(0.3, Math.min(0.95,
        base + infiltration / 500 - targetCI / 300 + (Math.random() - 0.5) * 0.1
    ));

    // Honest tradecraft: accuracy tracks confidence, minus sabotage from within.
    let accuracyChance = confidence + 0.1;
    if (ownerHasCompromisedAsset(op.actorFactionId, world)) {
        accuracyChance -= COMPROMISED_AGENT_ACCURACY_PENALTY;
    }
    const accurate = Math.random() < accuracyChance;

    return { confidence, accurate, severity: accurate ? 0 : 0.4 + Math.random() * 0.4 };
}

/** Distort a number by up to ±severity (proportional), keeping it plausible. */
function distort(value: number, severity: number): number {
    if (severity <= 0) return value;
    const factor = 1 + (Math.random() - 0.5) * 2 * severity;
    return Math.max(0, Math.round(value * factor));
}

// ─── Snapshot generators ──────────────────────────────────────────────────────

interface Finding {
    domain: string;
    title: string;
    body: string;
}

/** Infiltration stage from which a military intercept reads the target's shipwright channels. */
export const DESIGN_INTEL_MIN_STAGE: NetworkStage = 'embedded_network';

const ATTACK_WORD: Record<'energy' | 'kinetic' | 'explosive', string> = { energy: 'energy-heavy', kinetic: 'kinetic-heavy', explosive: 'missile-heavy' };
const DEFENSE_WORD: Record<'shield' | 'armor' | 'evasion', string> = { shield: 'shielded', armor: 'armoured', evasion: 'nimble' };

/** "energy-heavy, shielded" — the dominant attack and defense dimensions of a design's signature. */
export function describeDesignProfile(profile: DesignProfile): string {
    const attack = (['energy', 'kinetic', 'explosive'] as const).reduce((best, k) => profile[k] > profile[best] ? k : best, 'energy' as 'energy' | 'kinetic' | 'explosive');
    const defense = (['shield', 'armor', 'evasion'] as const).reduce((best, k) => profile[k] > profile[best] ? k : best, 'shield' as 'shield' | 'armor' | 'evasion');
    const parts: string[] = [];
    if (profile[attack] > 0) parts.push(ATTACK_WORD[attack]);
    if (profile[defense] > 0) parts.push(DEFENSE_WORD[defense]);
    return parts.length ? parts.join(', ') : 'unarmed';
}

/**
 * The target's ship designs, as a sentence, once the owner's network is deep
 * enough to have people in the yards. Rival designs are otherwise invisible
 * (projectPublicShard never sends them). Heavily distorted reports keep the
 * names but lose the details — a plant does not hand over the real fits.
 */
export function designIntelLine(world: GameWorldState, ownerFactionId: string, targetFactionId: string, severity: number): string {
    const infiltration = world.espionage.factionIntel.get(ownerFactionId)?.infiltrationLevels?.[targetFactionId] ?? 0;
    const stageIndex = (stage: NetworkStage) => NETWORK_STAGES.findIndex(s => s.stage === stage);
    if (stageIndex(stageForInfiltration(infiltration)) < stageIndex(DESIGN_INTEL_MIN_STAGE)) return '';
    const designs = factionDesigns(world, targetFactionId)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 3);
    if (!designs.length) return ' Shipwright channels show only standard patterns on the slips.';
    const garbled = severity >= 0.6;
    const described = designs.map(d => {
        const hull = d.hullId;
        if (garbled) return `"${d.name}" (${hull}; details garbled)`;
        return `"${d.name}" (${hull}; ${describeDesignProfile(summarizeDesign(d, null).profile)})`;
    });
    return ` Shipwright channels name ${designs.length === 1 ? 'a design' : 'designs'} on the slips: ${described.join(', ')}.`;
}

function militaryFinding(op: EspionageOperation, world: GameWorldState, severity: number): Finding {
    const fleets = [...world.movement.fleets.values()].filter(f => f.factionId === op.targetFactionId);
    const inTransit = fleets.filter(f => f.currentSystemId === null).length;
    const reportedFleets = distort(fleets.length, severity);
    const reportedTransit = Math.min(reportedFleets, distort(inTransit, severity));
    const staging = fleets.find(f => f.currentSystemId)?.currentSystemId;
    return {
        domain: 'military',
        title: 'Fleet Disposition Intercept',
        body: `Command traffic indicates ${reportedFleets} active fleet${reportedFleets === 1 ? '' : 's'}, ` +
            `${reportedTransit} currently in transit.` +
            (staging ? ` Heaviest activity traced to ${staging}.` : ' No staging concentration identified.') +
            designIntelLine(world, op.actorFactionId, op.targetFactionId, severity),
    };
}

function politicalFinding(op: EspionageOperation, world: GameWorldState, severity: number): Finding {
    const posture = world.movement.empirePostures.get(op.targetFactionId);
    const blocs = posture?.blocs ?? [];
    const avgSatisfaction = blocs.length
        ? blocs.reduce((s, b) => s + b.satisfaction, 0) / blocs.length
        : 50;
    const reported = Math.min(100, distort(avgSatisfaction, severity));
    const mood = reported < 35 ? 'widespread dissent' : reported < 60 ? 'simmering discontent' : 'stable public order';
    return {
        domain: 'political',
        title: 'Government Penetration Digest',
        body: `Sources inside the bureaucracy read current posture as "${posture?.current ?? 'Unknown'}". ` +
            `Bloc satisfaction assessed at ${Math.round(reported)}/100 — ${mood}.`,
    };
}

function scientificFinding(op: EspionageOperation, world: GameWorldState, severity: number): Finding {
    const tech = world.tech.get(op.targetFactionId);
    const unlocked = tech?.unlockedTechIds?.length ?? 0;
    const activeSlots = tech?.activeSlots?.filter((s: any) => s?.techId)?.length ?? 0;
    const reportedUnlocked = distort(unlocked, severity);
    const reportedActive = distort(activeSlots, severity);
    return {
        domain: 'scientific',
        title: 'Research Cluster Exfiltration',
        body: `Siphoned archives suggest ${reportedUnlocked} completed technologies with ` +
            `${reportedActive} active research track${reportedActive === 1 ? '' : 's'}.`,
    };
}

function counterIntelFinding(op: EspionageOperation, world: GameWorldState, severity: number): Finding {
    // Sweep of the actor's OWN space: hostile ops currently targeting them.
    const hostileOps = [...world.espionage.operations.values()].filter(o =>
        o.targetFactionId === op.actorFactionId && o.status === 'active');
    const reported = distort(hostileOps.length, severity);
    const suspect = world.espionage.attributionRecords
        .filter(r => r.attributionState !== 'invisible')
        .slice(-1)[0]?.suspectedFactionId;
    return {
        domain: 'counterintel',
        title: 'Internal Security Sweep',
        body: reported === 0
            ? 'Sweep complete. No hostile operations detected in our space at this time.'
            : `Sweep detected ${reported} suspected hostile operation${reported === 1 ? '' : 's'} in progress.` +
              (suspect ? ` Circumstantial evidence points toward ${suspect}.` : ' No attribution established.'),
    };
}

const FINDING_GENERATORS: Record<string, (op: EspionageOperation, world: GameWorldState, severity: number) => Finding> = {
    infiltrate_government: politicalFinding,
    infiltrate_military: militaryFinding,
    steal_research: scientificFinding,
    counterintel_sweep: counterIntelFinding,
};

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Generate a report for a successfully resolved catalog operation, if the
 * operation's definition produces one. Returns the report or null.
 */
export function generateReportForOperation(
    op: EspionageOperation,
    def: OperationDefinition,
    outcome: string,
    world: GameWorldState
): IntelReport | null {
    const generator = FINDING_GENERATORS[def.id];
    if (!generator) return null;

    const imperfection = rollImperfection(op, outcome, world);
    const finding = generator(op, world, imperfection.severity);
    const now = world.nowSeconds;

    const report: IntelReport = {
        id: `rpt-${op.actorFactionId}-${def.id}-${now}-${Math.floor(Math.random() * 1e6)}`,
        ownerFactionId: op.actorFactionId,
        targetFactionId: op.targetFactionId,
        domain: finding.domain,
        title: finding.title,
        body: finding.body,
        confidence: Math.round(imperfection.confidence * 100) / 100,
        accurate: imperfection.accurate,
        sourceOperationId: op.id,
        createdAt: now,
        expiresAt: now + REPORT_TTL_SECONDS,
    };

    world.espionage.reports.set(report.id, report);
    return report;
}

const DOMAIN_GENERATORS: Record<string, (op: EspionageOperation, world: GameWorldState, severity: number) => Finding> = {
    military: militaryFinding,
    political: politicalFinding,
    scientific: scientificFinding,
};

/**
 * Produce a report outside the operation pipeline (e.g. an Intelligence
 * Operations Board reward). Same imperfection model as op-generated reports —
 * bought intel can be just as falsified as stolen intel.
 */
export function generateImmediateReport(
    ownerFactionId: string,
    targetFactionId: string,
    domain: 'military' | 'political' | 'scientific',
    world: GameWorldState
): IntelReport | null {
    const generator = DOMAIN_GENERATORS[domain];
    if (!generator) return null;

    const pseudoOp = {
        id: `board-${ownerFactionId}-${world.nowSeconds}`,
        actorFactionId: ownerFactionId,
        targetFactionId,
    } as EspionageOperation;

    const imperfection = rollImperfection(pseudoOp, 'success', world);
    const finding = generator(pseudoOp, world, imperfection.severity);
    const now = world.nowSeconds;

    const report: IntelReport = {
        id: `rpt-${ownerFactionId}-board-${domain}-${now}-${Math.floor(Math.random() * 1e6)}`,
        ownerFactionId,
        targetFactionId,
        domain: finding.domain,
        title: finding.title,
        body: finding.body,
        confidence: Math.round(imperfection.confidence * 100) / 100,
        accurate: imperfection.accurate,
        createdAt: now,
        expiresAt: now + REPORT_TTL_SECONDS,
    };

    world.espionage.reports.set(report.id, report);
    return report;
}

/** Remove reports past their shelf life. Call from the espionage tick. */
export function pruneExpiredReports(world: GameWorldState): void {
    const now = world.nowSeconds;
    for (const [id, report] of world.espionage.reports) {
        if (report.expiresAt < now) world.espionage.reports.delete(id);
    }
}
