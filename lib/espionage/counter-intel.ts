/**
 * lib/espionage/counter-intel.ts
 * Defending your own house (spec item 11e).
 *
 * Counter-intelligence existed only as numbers other systems read: the
 * target's counterIntelStrength cuts every operation's odds and raises the
 * chance its reports are planted, and regionalCounterIntel raises the chance
 * an operation in that system is traced. Nothing ever set them (bar one board
 * reward), so every empire defended at zero. Now a player buys them with
 * Intel:
 *
 *   - a service-wide budget (0–1), which pulls counterIntelStrength toward
 *     budget × 100 while it is paid for;
 *   - per-system coverage (0–1) on up to MAX_COVERED_SYSTEMS of their own
 *     systems, which raises the odds of tracing an operation there.
 *
 * Both are paid every hour in Intel. Unpaid, the settings stay but buy
 * nothing: coverage reads as zero and strength drifts down.
 *
 * And the Counter-Intel Sweep, a catalog operation that until now had no
 * effect at all: run in one of your own systems, it rolls up foreign networks
 * there and cuts every rival's infiltration of you.
 */

import type { GameWorldState } from '../game-world-state';
import type { EspionageOperation, FactionIntelState, IntelReport } from './espionage-types';
import type { OperationDefinition } from './operation-catalog';
import { weakenNetwork } from './agent-service';
import { getOrCreateFactionIntel } from './faction-intel';
import { fireNotification } from '../time/notification-hooks';
import { labelFor } from '../time/notification-names';
import { AFTER_ACTION_DOMAIN, AFTER_ACTION_TTL_SECONDS } from './op-aftermath';
import type { SpyAgent } from './agent-types';
import { techIdsHaveFlag } from '../tech/flags';
// Capture lives here, not in case-board: the Counter-intel tab imports this
// module, and case-board reaches lib/government (Node-only) for its rewards.

/** Intel per hour at a 100% service budget. Base Intel income is 1.5/h. */
export const CI_BUDGET_INTEL_PER_HOUR = 1.0;
/** Intel per hour for one system at full coverage. */
export const CI_SYSTEM_INTEL_PER_HOUR = 0.25;
/** How many of your systems can carry coverage at once. */
export const MAX_COVERED_SYSTEMS = 10;
/** Fraction of the gap to its target that strength closes per hour (~35 sim hours to halve it). */
export const CI_CONVERGE_PER_HOUR = 0.02;

/** Network strength a successful sweep strips from each foreign network it finds. */
export const SWEEP_NETWORK_DAMAGE = 0.4;

/** Intel per hour a plan costs. Shared by the worker and the page. */
export function counterIntelUpkeepPerHour(budget: number, regional: Record<string, number>): number {
    const systems = Object.values(regional).reduce((sum, level) => sum + Math.max(0, Math.min(1, level)), 0);
    return Math.max(0, Math.min(1, budget)) * CI_BUDGET_INTEL_PER_HOUR + systems * CI_SYSTEM_INTEL_PER_HOUR;
}

/** Does this empire hold this system (by planet, or by the system's derived owner)? */
export function holdsSystem(world: GameWorldState, factionId: string, systemId: string): boolean {
    const sys: any = world.movement?.systems?.get?.(systemId);
    if (sys?.ownerFactionId === factionId) return true;
    for (const p of (world.construction?.planets?.values?.() ?? []) as Iterable<any>) {
        if (p.systemId === systemId && p.ownerId === factionId) return true;
    }
    return false;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Check and normalise a plan from the client. Budget snaps to 5%, coverage to
 * 25%; zero-coverage systems are dropped; every covered system must be ours.
 */
export function validateCounterIntelPlan(
    world: GameWorldState,
    factionId: string,
    payload: { budget?: unknown; regions?: unknown }
): { ok: true; budget: number; regional: Record<string, number> } | { ok: false; message: string } {
    const rawBudget = Number(payload.budget);
    if (!Number.isFinite(rawBudget) || rawBudget < 0 || rawBudget > 1) {
        return { ok: false, message: 'The counter-intelligence budget must be between 0% and 100%.' };
    }
    const regions = payload.regions;
    if (regions === null || typeof regions !== 'object' || Array.isArray(regions)) {
        return { ok: false, message: 'Malformed system coverage.' };
    }
    const regional: Record<string, number> = {};
    for (const [systemId, raw] of Object.entries(regions as Record<string, unknown>)) {
        const level = Number(raw);
        if (!Number.isFinite(level) || level < 0 || level > 1) {
            return { ok: false, message: 'Coverage must be between 0% and 100%.' };
        }
        const snapped = roundTo(level, 0.25);
        if (snapped === 0) continue;
        if (!holdsSystem(world, factionId, systemId)) {
            return { ok: false, message: 'You can only cover systems you hold.' };
        }
        regional[systemId] = snapped;
    }
    if (Object.keys(regional).length > MAX_COVERED_SYSTEMS) {
        return { ok: false, message: `At most ${MAX_COVERED_SYSTEMS} systems can be covered at once.` };
    }
    return { ok: true, budget: roundTo(rawBudget, 0.05), regional };
}

export function setCounterIntelPlan(world: GameWorldState, factionId: string, budget: number, regional: Record<string, number>): void {
    const intel = getOrCreateFactionIntel(world, factionId);
    intel.counterIntelBudget = budget;
    intel.regionalCounterIntel = regional;
}

/**
 * One faction's hour (or part of one) of counter-intelligence: pay upkeep in
 * Intel, then move strength toward what the budget buys. Called from
 * tickFactionIntel after Intel income is credited.
 */
export function tickCounterIntel(intel: FactionIntelState, hours: number): void {
    const cost = counterIntelUpkeepPerHour(intel.counterIntelBudget ?? 0, intel.regionalCounterIntel ?? {}) * hours;
    if (cost > 0 && intel.intelPoints >= cost) {
        intel.intelPoints -= cost;
        intel.counterIntelUnpaid = false;
    } else {
        intel.counterIntelUnpaid = cost > 0;
    }
    const target = intel.counterIntelUnpaid ? 0 : Math.max(0, Math.min(1, intel.counterIntelBudget ?? 0)) * 100;
    const step = Math.min(1, CI_CONVERGE_PER_HOUR * hours);
    intel.counterIntelStrength = Math.max(0, Math.min(100, intel.counterIntelStrength + (target - intel.counterIntelStrength) * step));
}

/** Coverage the attribution formula should use: none while unpaid. */
export function effectiveRegionalCounterIntel(intel: FactionIntelState | undefined, systemId: string): number {
    if (!intel || intel.counterIntelUnpaid) return 0;
    return intel.regionalCounterIntel?.[systemId] ?? 0;
}

/**
 * Apply a Counter-Intel Sweep. `mult` is the outcome multiplier (0 on
 * failure). Returns the foreign empires whose networks were found, and the
 * agents taken from those networks (item 12a: prisoners can be questioned).
 */
export function applySweep(
    op: EspionageOperation,
    def: OperationDefinition,
    world: GameWorldState,
    mult: number
): { found: string[]; captured: SpyAgent[] } {
    const self = op.actorFactionId;
    const found = new Set<string>();
    const captured: SpyAgent[] = [];
    if (mult <= 0) return { found: [], captured };

    // detect_cells: foreign networks in the swept system are found and broken up.
    for (const network of world.espionage.intelNetworks.values()) {
        if (network.systemId !== op.targetRegionId || network.ownerFactionId === self) continue;
        if (weakenNetwork(network, SWEEP_NETWORK_DAMAGE * mult) <= 0) continue;
        found.add(network.ownerFactionId);
        captured.push(...captureAgents(world, self, network.agentIds, Math.min(1, SWEEP_CAPTURE_CHANCE * mult)));
    }

    // reduce_foreign_intel: every rival's hold on us loosens.
    const cut = (def.effects.find(e => e.type === 'reduce_foreign_intel')?.value ?? 0) * mult;
    if (cut > 0) {
        for (const [factionId, intel] of world.espionage.factionIntel) {
            if (factionId === self) continue;
            const level = intel.infiltrationLevels[self];
            if (level > 0) intel.infiltrationLevels[self] = Math.max(0, level - cut);
        }
    }
    // What the sweep showed us goes into our dossiers: how deep each rival we
    // caught still is inside us, after the cut.
    const ours = getOrCreateFactionIntel(world, self);
    for (const owner of found) {
        const theirs = world.espionage.factionIntel.get(owner)?.infiltrationLevels?.[self] ?? 0;
        (ours.dossier ??= {})[owner] = { ...(ours.dossier[owner] ?? {}), revealedInfiltration: Math.round(theirs), revealedAt: world.nowSeconds };
    }
    return { found: [...found], captured };
}

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);
function isPlayerRun(world: GameWorldState, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = (world as any).claimedFactionIds;
    return !Array.isArray(claimed) || claimed.includes(factionId);
}

/** Tell the sweeping empire what it found, and the owners of what it broke. */
export function reportSweep(op: EspionageOperation, world: GameWorldState, succeeded: boolean, found: string[], cut: number, captured: SpyAgent[] = []): void {
    const now = world.nowSeconds;
    const where = (world.movement?.systems?.get?.(op.targetRegionId) as any)?.name ?? 'an unnamed system';
    const createdAt = new Date(now * 1000).toISOString();
    const self = op.actorFactionId;

    const prisoners = captured.length
        ? ` We took ${captured.map(a => `${a.codename} (${labelFor(a.ownerFactionId)})`).join(', ')} prisoner; they can be questioned on any open case.`
        : '';
    const body = !succeeded
        ? `The sweep at ${where} turned up nothing it could act on.`
        : found.length > 0
            ? `The sweep at ${where} found and broke up networks run by ${found.map(labelFor).join(', ')}.${prisoners} Every rival's infiltration of us fell by ${Math.round(cut)}.`
            : `The sweep at ${where} found no foreign network there. Every rival's infiltration of us fell by ${Math.round(cut)}.`;

    if (isPlayerRun(world, self)) {
        const report: IntelReport = {
            id: `aar-${op.id}`,
            ownerFactionId: self,
            targetFactionId: found[0] ?? self,
            domain: AFTER_ACTION_DOMAIN,
            title: `Counter-Intel Sweep: ${succeeded ? 'succeeded' : 'failed'}`,
            body,
            confidence: 1,
            accurate: true,
            sourceOperationId: op.id,
            createdAt: now,
            expiresAt: now + AFTER_ACTION_TTL_SECONDS,
        };
        world.espionage.reports.set(report.id, report);
        fireNotification({
            id: `esp-sweep-${op.id}`,
            factionId: self,
            category: 'espionage',
            priority: found.length > 0 ? 'urgent' : 'normal',
            title: found.length > 0 ? 'FOREIGN NETWORKS FOUND' : succeeded ? 'SWEEP COMPLETE' : 'SWEEP FAILED',
            body,
            createdAt,
            read: false,
            linkToTab: 'intelligence',
        });
    }

    // The owners of a broken network notice it fall apart. They are told it
    // was found, not by whom it was swept: that is obvious from where it was.
    for (const owner of found) {
        if (!isPlayerRun(world, owner)) continue;
        const lost = captured.filter(a => a.ownerFactionId === owner).map(a => a.codename);
        fireNotification({
            id: `esp-rolled-${owner}-${now}-${Math.floor(Math.random() * 1e9).toString(36)}`,
            factionId: owner,
            category: 'espionage',
            priority: 'urgent',
            title: lost.length ? 'AGENT CAPTURED' : 'NETWORK ROLLED UP',
            body: `${labelFor(self)}'s service swept ${where} and broke up our network there.${lost.length ? ` ${lost.join(', ')} ${lost.length > 1 ? 'were' : 'was'} taken.` : ''}`,
            createdAt,
            read: false,
            linkToTab: 'intelligence',
        });
    }
}

/** Chance a sweep takes each agent of a network it breaks up (scaled by outcome). */
export const SWEEP_CAPTURE_CHANCE = 0.5;

// ─── Sweeps take prisoners ───────────────────────────────────────────────────

/**
 * Take agents from foreign networks a sweep broke up. Returns who was taken.
 * Called by applySweep for each network it found.
 */
export function captureAgents(
    world: GameWorldState,
    captorId: string,
    agentIds: string[],
    chance: number,
    rand: () => number = Math.random
): SpyAgent[] {
    const taken: SpyAgent[] = [];
    for (const id of agentIds) {
        const agent = world.espionage.agents.get(id);
        if (!agent || agent.ownerFactionId === captorId) continue;
        if (agent.status !== 'deployed' && agent.status !== 'on_cooldown') continue;
        if (rand() >= chance) continue;
        const systemId = agent.deployedToSystemId ?? '';
        agent.status = 'captured';
        agent.capturedByFactionId = captorId;
        agent.deployedToSystemId = null;
        taken.push(agent);
        recordPrisoner(world, captorId, agent, systemId, rand);
    }
    return taken;
}

/**
 * Put a prisoner on the captor's books, as they present themselves: species
 * is plain to see; the employer is what they say, and a Double Agent lies.
 */
export function recordPrisoner(world: GameWorldState, captorId: string, agent: SpyAgent, systemId: string, rand: () => number = Math.random): void {
    const intel = getOrCreateFactionIntel(world, captorId);
    let claimed = agent.ownerFactionId;
    if (agent.traitIds.includes('double_agent')) {
        const others = [...(world.economy?.factions?.keys?.() ?? [])]
            .filter(id => id !== agent.ownerFactionId && id !== captorId && id !== 'faction-pirates' && id !== 'faction-neutral');
        if (others.length) claimed = others[Math.floor(rand() * others.length)];
    }
    const list = (intel.prisoners ??= []);
    list.push({
        agentId: agent.id,
        codename: agent.codename,
        species: agent.species ?? (world.economy?.factions?.get?.(agent.ownerFactionId) as any)?.civilizationId ?? null,
        claimedEmployerId: claimed,
        takenAt: world.nowSeconds,
        systemId,
    });
    if (list.length > 20) list.splice(0, list.length - 20);
}

/**
 * Refresh what our sources inside rivals show us. Black Market tradecraft is
 * visible to a service with an Embedded Network inside them, and stays on file
 * after the network fades.
 */
export function tickDossiers(world: GameWorldState): void {
    for (const [self, intel] of world.espionage.factionIntel) {
        for (const [target, level] of Object.entries(intel.infiltrationLevels ?? {})) {
            if (level < DOSSIER_SOURCES_MIN_INFILTRATION) continue;
            const bm = techIdsHaveFlag(world.tech?.get?.(target)?.unlockedTechIds ?? [], 'ENABLE_SHADOW_ECONOMY');
            const entry = ((intel.dossier ??= {})[target] ??= {});
            if (entry.blackMarket !== bm || entry.blackMarketSeenAt == null) {
                entry.blackMarket = bm;
                entry.blackMarketSeenAt = world.nowSeconds;
            }
        }
        void self;
    }
}

/** Infiltration at which our sources inside a rival can see their tradecraft (Embedded Network). */
export const DOSSIER_SOURCES_MIN_INFILTRATION = 35;
