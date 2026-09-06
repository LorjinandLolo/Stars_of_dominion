// lib/galaxy/overlays.ts
// The galaxy map's four overlays — Charted, Relations, Settle, Stability —
// as one pure table: the same function drives the hex paint, the legend
// chips and the counters, so a colour on the map always has a chip that
// explains it and a number that says how many.
//
// FOG CONTRACT. The game starts capital-only and reveals systems in stages
// (unknown → pinged → scanned → surveyed). Ownership, star position and
// hyperlanes are public; security/tradeValue/instability/escalationLevel/
// unrest/siege/tags are intel and arrive on the wire for every system today,
// so THIS module is the gate: an overlay may read an intel field only after
// it has checked the reveal stage (or ownership) for that system. Charted,
// Relations and Settle never read intel at all; Stability reads it only for
// the player's own worlds and for foreign systems at scanned/surveyed.
// scripts/galaxy-overlays-probe.ts randomises intel below 'scanned' and
// asserts the output is byte-identical.
//
// A LEAF on purpose: it is bundled into the browser. Imports are types,
// ping-cost (pricing), capital-distance (hexDistance), colonize-service
// (COLONY_COST) and movement-config.json — no React, no store, no db.

import {
    relayPingCredits,
    type PingGraphSystem,
    type RelayPingQuote,
} from '../exploration/ping-cost';
import { hexDistance } from '../government/capital-distance';
import { COLONY_COST } from '../exploration/colonize-service';
import config from '../movement/movement-config.json';

// ─── Ids and defs ─────────────────────────────────────────────────────────────

export type OverlayId = 'charted' | 'relations' | 'settle' | 'stability';
/** Also the hotkey order: digit 1 is Charted, digit 4 is Stability. */
export const OVERLAY_IDS: readonly OverlayId[] = ['charted', 'relations', 'settle', 'stability'];

export function isOverlayId(v: unknown): v is OverlayId {
    return typeof v === 'string' && (OVERLAY_IDS as readonly string[]).includes(v);
}

export type RevealStage = 'unknown' | 'pinged' | 'scanned' | 'surveyed';
export type Stance = 'mine' | 'ally' | 'pact' | 'tension' | 'hostile' | 'neutral';

export interface OverlayLegendEntry {
    /** == result.counts key */
    key: string;
    label: string;
    /** 'none' allowed */
    fill: string;
    fillOpacity: number;
    stroke: string;
    strokeOpacity: number;
    strokeWidth?: number;
    dash?: string;
    pulse?: boolean;
    /** Settle chips draw the badge swatch instead of a hex. */
    badge?: 'filled' | 'hollow';
    /** The chip is an explanation, not a bucket (e.g. 'no colour — no reading'). */
    isAction?: boolean;
}

export interface OverlayDef {
    id: OverlayId;
    label: string;
    /** lucide-react export names */
    icon: 'Radar' | 'Flag' | 'Sprout' | 'HeartPulse';
    hotkey: '1' | '2' | '3' | '4';
    question: string;
    legend: readonly OverlayLegendEntry[];
    /** Settle → 'show ping costs' → 'charted' */
    emptyAction?: { label: string; switchTo: OverlayId };
}

/**
 * Colour discipline shared by all four overlays: emerald/lime = act now or
 * done, teal/cyan = known or next step, amber = costs more / in progress /
 * caution, red = blocked / hostile / danger, slate = no data. Every tier also
 * differs by dash pattern so the map survives deuteranopia and the scanlines.
 */
export const OVERLAY_COLORS: Readonly<Record<'act' | 'known' | 'charted' | 'caution' | 'danger' | 'none' | 'inFlight' | 'reach' | 'pirate', string>> = {
    act: '#84cc16',
    known: '#2dd4bf',
    charted: '#14b8a6',
    caution: '#f59e0b',
    danger: '#ef4444',
    none: '#334155',
    inFlight: '#fbbf24',
    reach: '#22d3ee',
    pirate: '#a855f7',
};

const C = OVERLAY_COLORS;
const MINE = '#22c55e';
const ALLY = '#38bdf8';
const NEUTRAL = '#94a3b8';
const CONTESTED = '#f97316';
const SETTLE_STROKE = '#a3e635';
const STEADY = '#06b6d4';
const FRAYING = '#f97316';
const CALM = '#64748b';

const STANCE_COLOR: Record<Stance, string> = {
    mine: MINE,
    ally: ALLY,
    pact: C.known,
    neutral: NEUTRAL,
    tension: C.caution,
    hostile: C.danger,
};

const CHARTED_LEGEND: readonly OverlayLegendEntry[] = [
    { key: 'surveyed', label: 'Surveyed', fill: C.charted, fillOpacity: 0.38, stroke: C.known, strokeOpacity: 0.85 },
    { key: 'scanned', label: 'Scanned', fill: C.charted, fillOpacity: 0.24, stroke: C.known, strokeOpacity: 0.60 },
    { key: 'pinged', label: 'Pinged', fill: C.charted, fillOpacity: 0.10, stroke: C.known, strokeOpacity: 0.50, dash: '2 2' },
    { key: 'near', label: '≤550cr', fill: C.caution, fillOpacity: 0.16, stroke: C.caution, strokeOpacity: 0.60 },
    { key: 'mid', label: '≤1,150cr', fill: C.caution, fillOpacity: 0.08, stroke: C.caution, strokeOpacity: 0.35, dash: '3 2' },
    { key: 'far', label: 'farther', fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.15, dash: '1 2' },
    { key: 'overBudget', label: 'over budget', fill: 'none', fillOpacity: 0, stroke: C.danger, strokeOpacity: 0.45, dash: '1 2' },
    { key: 'reach', label: 'reach', fill: 'none', fillOpacity: 0, stroke: C.reach, strokeOpacity: 0.95, strokeWidth: 1.2 },
    { key: 'inFlight', label: 'in progress', fill: 'none', fillOpacity: 0, stroke: C.inFlight, strokeOpacity: 0.9, dash: '3 2', pulse: true },
];

const RELATIONS_LEGEND: readonly OverlayLegendEntry[] = [
    { key: 'mine', label: 'Mine', fill: MINE, fillOpacity: 0.30, stroke: MINE, strokeOpacity: 0.75 },
    { key: 'ally', label: 'Allied', fill: ALLY, fillOpacity: 0.26, stroke: ALLY, strokeOpacity: 0.70 },
    { key: 'pact', label: 'Pact', fill: C.known, fillOpacity: 0.20, stroke: C.known, strokeOpacity: 0.60 },
    { key: 'neutral', label: 'Neutral', fill: NEUTRAL, fillOpacity: 0.14, stroke: NEUTRAL, strokeOpacity: 0.40 },
    { key: 'tension', label: 'Tension', fill: C.caution, fillOpacity: 0.22, stroke: C.caution, strokeOpacity: 0.70, dash: '1 2' },
    { key: 'hostile', label: 'Hostile', fill: C.danger, fillOpacity: 0.26, stroke: C.danger, strokeOpacity: 0.75, dash: '2 2' },
    { key: 'contested', label: 'Contested', fill: CONTESTED, fillOpacity: 0.30, stroke: CONTESTED, strokeOpacity: 0.8, dash: '3 2' },
    { key: 'unclaimed', label: 'Unclaimed', fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.30 },
];

const SETTLE_LEGEND: readonly OverlayLegendEntry[] = [
    { key: 'ready', label: 'Settle now', fill: C.act, fillOpacity: 0.38, stroke: SETTLE_STROKE, strokeOpacity: 0.85, badge: 'filled' },
    { key: 'unaffordable', label: 'sites, cannot afford yet', fill: C.inFlight, fillOpacity: 0.38, stroke: C.inFlight, strokeOpacity: 0.85, badge: 'filled' },
    { key: 'sighted', label: 'Worlds sighted', fill: C.act, fillOpacity: 0.14, stroke: SETTLE_STROKE, strokeOpacity: 0.50, dash: '2 2', badge: 'hollow' },
    { key: 'unsurveyed', label: 'Not surveyed yet', fill: 'none', fillOpacity: 0, stroke: C.caution, strokeOpacity: 0.50, dash: '2 3' },
    { key: 'none', label: 'No free worlds', fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.35 },
    { key: 'inFlight', label: 'scan/survey in progress', fill: 'none', fillOpacity: 0, stroke: C.inFlight, strokeOpacity: 0.9, dash: '3 2', pulse: true },
];

const STABILITY_LEGEND: readonly OverlayLegendEntry[] = [
    { key: 'steady', label: 'Steady', fill: STEADY, fillOpacity: 0.28, stroke: STEADY, strokeOpacity: 0.70 },
    { key: 'strained', label: 'Strained', fill: C.caution, fillOpacity: 0.30, stroke: C.caution, strokeOpacity: 0.70 },
    { key: 'fraying', label: 'Fraying', fill: FRAYING, fillOpacity: 0.34, stroke: FRAYING, strokeOpacity: 0.80 },
    { key: 'breaking', label: 'Breaking', fill: C.danger, fillOpacity: 0.40, stroke: C.danger, strokeOpacity: 0.90, dash: '2 2', pulse: true },
    { key: 'noReading', label: 'No cohesion reading', fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.35 },
    { key: 'calm', label: 'Calm', fill: CALM, fillOpacity: 0.14, stroke: CALM, strokeOpacity: 0.40 },
    { key: 'caution', label: 'Caution', fill: C.caution, fillOpacity: 0.20, stroke: C.caution, strokeOpacity: 0.60, dash: '3 2' },
    { key: 'danger', label: 'Danger', fill: C.danger, fillOpacity: 0.26, stroke: C.danger, strokeOpacity: 0.80 },
    { key: 'hazard', label: 'Siege / rebels / pirates / quarantine', fill: 'none', fillOpacity: 0, stroke: C.danger, strokeOpacity: 0.9, strokeWidth: 1.6 },
    { key: 'stale', label: 'Stale', fill: CALM, fillOpacity: 0.07, stroke: CALM, strokeOpacity: 0.40, dash: '1 2' },
    { key: 'pirate', label: 'Pirate influence', fill: 'none', fillOpacity: 0, stroke: C.pirate, strokeOpacity: 0.9, badge: 'filled' },
    { key: 'unread', label: 'No reading — scan with a fleet within one jump', fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0, isAction: true },
];

export const OVERLAY_DEFS: readonly OverlayDef[] = [
    {
        id: 'charted',
        label: 'Charted',
        icon: 'Radar',
        hotkey: '1',
        question: 'What do I know, what does the next ping cost, and where can my fleets scan right now?',
        legend: CHARTED_LEGEND,
    },
    {
        id: 'relations',
        label: 'Relations',
        icon: 'Flag',
        hotkey: '2',
        question: 'Who holds what, and are they with me, against me, or sliding toward war?',
        legend: RELATIONS_LEGEND,
    },
    {
        id: 'settle',
        label: 'Settle',
        icon: 'Sprout',
        hotkey: '3',
        question: 'Where is my next world, and can I pay for it?',
        legend: SETTLE_LEGEND,
        emptyAction: { label: 'show ping costs', switchTo: 'charted' },
    },
    {
        id: 'stability',
        label: 'Stability',
        icon: 'HeartPulse',
        hotkey: '4',
        question: 'Which of the systems I can see inside are about to break?',
        legend: STABILITY_LEGEND,
    },
];

export function overlayDef(id: OverlayId): OverlayDef {
    const def = OVERLAY_DEFS.find(d => d.id === id);
    if (!def) throw new Error(`Unknown overlay '${id}'`);
    return def;
}

// ─── Input / output types ─────────────────────────────────────────────────────

export interface OverlaySystemStyle {
    /** 'none' when no fill */
    fill: string;
    fillOpacity: number;
    stroke?: string;
    strokeOpacity?: number;
    /** default 1 when omitted */
    strokeWidth?: number;
    /** SVG stroke-dasharray */
    dash?: string;
    /** SystemNode adds className gx-breathe */
    pulse?: boolean;
    /** reserved (colour) — unused by the four shipped overlays, kept for a future ring mark */
    ring?: string;
    badge?: { count: number; color: string; hollow: boolean };
    /** legend key this system was counted under */
    bucket: string;
}

export interface OverlayInputSystem {
    id: string; q: number; r: number; name?: string;
    ownerId?: string | null;
    hyperlaneNeighbors?: string[];
    // intel — present on the wire for every system today; the module MUST only read these after its own gate
    instability?: number; unrest?: number; security?: number; escalationLevel?: number; siege?: unknown;
}
export interface OverlayInputVisibilityEntry { revealStage: RevealStage; lastSeenAt?: string; visibleTags?: string[] }
export interface OverlayInputFleet { id: string; factionId: string; currentSystemId?: string | null; destinationSystemId?: string | null }
export interface OverlayInputPlanet { id: string; systemId: string; ownerId?: string | null; tags?: string[] }
export interface OverlayInputFaction { name?: string; capitalSystemId?: string; reserves?: Record<string, number> }
export interface OverlayInputDiplomacy {
    rivalries?: Array<{ empireAId: string; empireBId: string; escalationLevel?: number; detenteActive?: boolean }>;
    treaties?: Array<{ type: string; status: string; signatories?: string[] }>;
}
export interface OverlayInputOrder {
    targetSystemId: string; mode: 'ping' | 'scan' | 'survey';
    source?: 'fleet' | 'relay'; completesAt: string; issuedAt?: string; relayFromSystemId?: string;
}

export interface OverlayInput {
    systems: OverlayInputSystem[];
    visibility: Record<string, OverlayInputVisibilityEntry> | null;
    fleets: OverlayInputFleet[];
    planets: OverlayInputPlanet[];
    factions: Record<string, OverlayInputFaction>;
    diplomacy: OverlayInputDiplomacy | null;
    shipyardSystemIds: string[];
    explorationOrders: OverlayInputOrder[];
    systemCohesion: Record<string, number>;
    contestedSystemIds: ReadonlySet<string> | string[];
    playerFactionId: string | null;
    /** piracyState.view?.influence */
    piracyInfluence?: Record<string, number>;
    /** sim clock; staleness only */
    nowSeconds?: number;
}

export interface OverlayLegendRow { label: string; color: string; count: number; stance?: Stance; focusSystemId?: string }

export interface OverlayResult {
    /** systemId → style; systems with nothing to say are ABSENT */
    styles: Map<string, OverlaySystemStyle>;
    coverage: { withData: number; total: number };
    /** one entry per legend key, computed over ALL systems */
    counts: Record<string, number>;
    /** the coverage line, e.g. 'Charted 4 of 212 · …' */
    footer: string;
    /** non-null ⇒ picker shows this sentence instead of chips */
    empty: string | null;
    /** Relations: one per faction, hostile first */
    rows?: OverlayLegendRow[];
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const STAGES: readonly RevealStage[] = ['unknown', 'pinged', 'scanned', 'surveyed'];

function isUnclaimed(ownerId: string | null | undefined): boolean {
    return !ownerId || ownerId === 'faction-neutral';
}

function fmt(n: number): string {
    return Math.round(n).toLocaleString('en-US');
}

function stageOf(input: Pick<OverlayInput, 'visibility' | 'playerFactionId'>, sys: OverlayInputSystem): RevealStage {
    // Your own worlds are always fully known to you, whatever the reveal map
    // says — the map is seeded surveyed for the home system but a conquered
    // or colonised system may lag a tick.
    if (input.playerFactionId && sys.ownerId === input.playerFactionId) return 'surveyed';
    const raw = input.visibility?.[sys.id]?.revealStage;
    return raw && STAGES.includes(raw) ? raw : 'unknown';
}

/** Reveal stage of one system; owner === me floors to 'surveyed'. */
export function revealStageOf(input: OverlayInput, systemId: string): RevealStage {
    const sys = input.systems.find(s => s.id === systemId);
    if (!sys) return 'unknown';
    return stageOf(input, sys);
}

function isKnownStage(stage: RevealStage): boolean {
    return stage === 'scanned' || stage === 'surveyed';
}

/**
 * Stance toward every faction named in the diplomacy ledger, in this order:
 * active mutual-defence treaty → ally; rivalry ≥5 without détente → hostile;
 * ≥5 under détente or 3–4 → tension; active non-aggression / open borders →
 * pact; else neutral. The 0–7 rivalry escalation scale — not the 0–10
 * per-system one. Factions absent from the ledger are simply not keyed;
 * callers default to 'neutral'.
 */
export function stanceByFaction(playerFactionId: string | null, diplomacy: OverlayInputDiplomacy | null): Record<string, Stance> {
    const out: Record<string, Stance> = {};
    const me = playerFactionId;
    if (!me) return out;
    out[me] = 'mine';

    const allies = new Set<string>();
    const pacts = new Set<string>();
    for (const t of diplomacy?.treaties ?? []) {
        if (t.status !== 'active') continue;
        const sig = t.signatories ?? [];
        if (!sig.includes(me)) continue;
        for (const s of sig) {
            if (s === me) continue;
            if (t.type === 'mutual_defense') allies.add(s);
            else if (t.type === 'non_aggression' || t.type === 'open_borders') pacts.add(s);
        }
    }
    const rivalry = new Map<string, { escalationLevel: number; detenteActive: boolean }>();
    for (const r of diplomacy?.rivalries ?? []) {
        const other = r.empireAId === me ? r.empireBId : r.empireBId === me ? r.empireAId : null;
        if (!other) continue;
        const level = r.escalationLevel ?? 0;
        const prev = rivalry.get(other);
        // Two rows for one pair should not happen; keep the hotter one.
        if (!prev || level > prev.escalationLevel) rivalry.set(other, { escalationLevel: level, detenteActive: !!r.detenteActive });
    }

    const everyone = new Set<string>([...allies, ...pacts, ...rivalry.keys()]);
    for (const f of everyone) {
        if (f === me) continue;
        const r = rivalry.get(f);
        if (allies.has(f)) out[f] = 'ally';
        else if (r && r.escalationLevel >= 5 && !r.detenteActive) out[f] = 'hostile';
        // ≥5 under détente and 3–4 both read as tension.
        else if (r && r.escalationLevel >= 3) out[f] = 'tension';
        else if (pacts.has(f)) out[f] = 'pact';
        else out[f] = 'neutral';
    }
    return out;
}

/**
 * Systems a fleet can scan or survey without moving: where an own fleet is
 * stationed, plus one hyperlane jump out — the same rule SystemContextPanel
 * uses to pick an eligible fleet and the worker enforces on EXPLORE_ISSUE_ORDER.
 */
export function scanReachSystemIds(systems: OverlayInputSystem[], fleets: OverlayInputFleet[], playerFactionId: string | null): Set<string> {
    const out = new Set<string>();
    if (!playerFactionId) return out;
    const byId = new Map<string, OverlayInputSystem>();
    for (const s of systems) byId.set(s.id, s);
    for (const f of fleets) {
        if (f.factionId !== playerFactionId || !f.currentSystemId) continue;
        out.add(f.currentSystemId);
        for (const n of byId.get(f.currentSystemId)?.hyperlaneNeighbors ?? []) out.add(n);
    }
    return out;
}

/** Free colonizable bodies per system: unowned + 'colonizable' − 'dead_matter'. */
export function settleSitesBySystem(planets: OverlayInputPlanet[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const p of planets) {
        if (!p.systemId || !isUnclaimed(p.ownerId)) continue;
        const tags = p.tags ?? [];
        if (!tags.includes('colonizable') || tags.includes('dead_matter')) continue;
        out.set(p.systemId, (out.get(p.systemId) ?? 0) + 1);
    }
    return out;
}

/** True when every COLONY_COST key is covered by the reserves. */
export function canAffordColony(reserves: Record<string, number> | undefined): boolean {
    return Object.entries(COLONY_COST).every(([key, amt]) => (reserves?.[key] ?? 0) >= amt);
}

/** The always-visible pill chip: 'Charted N / M' (N = pinged or better). */
export function chartedCoverage(input: Pick<OverlayInput, 'systems' | 'visibility' | 'playerFactionId'>): { charted: number; scanned: number; surveyed: number; total: number } {
    let charted = 0, scanned = 0, surveyed = 0;
    for (const sys of input.systems) {
        const stage = stageOf(input, sys);
        if (stage !== 'unknown') charted++;
        if (stage === 'scanned') scanned++;
        if (stage === 'surveyed') surveyed++;
    }
    return { charted, scanned, surveyed, total: input.systems.length };
}

// ─── Relay ping pricing (one BFS for the whole map) ───────────────────────────
//
// relayPingQuote in ping-cost.ts prices ONE target per call; the overlay
// prices every system, so it runs the identical multi-source BFS once and
// keeps the whole distance map. The traversal is deterministic, so for each
// target this yields exactly the quote relayPingQuote would (the probe
// asserts it). Lives here until ping-cost.ts grows the same helpers.

/** Anchors a ping is bounced from: the faction's yards, else its capital, else nothing. */
export function pingAnchorsFor(shipyardSystemIds: readonly string[], capitalSystemId?: string | null): string[] {
    if (shipyardSystemIds.length > 0) return [...shipyardSystemIds];
    return capitalSystemId ? [capitalSystemId] : [];
}

export function relayPingDistances(systems: Iterable<PingGraphSystem>, anchorSystemIds: string[]): Map<string, RelayPingQuote> {
    const byId = new Map<string, PingGraphSystem>();
    for (const s of systems) if (s?.id) byId.set(s.id, s);
    const anchors = anchorSystemIds.filter(id => byId.has(id));
    const out = new Map<string, RelayPingQuote>();

    if (anchors.length === 0) {
        for (const id of byId.keys()) {
            out.set(id, { credits: relayPingCredits(0), jumps: 0, anchorSystemId: null, metric: 'none' });
        }
        return out;
    }

    const dist = new Map<string, number>();
    const from = new Map<string, string>();
    const queue: string[] = [];
    for (const a of anchors) {
        if (dist.has(a)) continue;
        dist.set(a, 0); from.set(a, a); queue.push(a);
    }
    let head = 0;
    while (head < queue.length) {
        const cur = queue[head++];
        const hops = dist.get(cur)!;
        for (const n of byId.get(cur)?.hyperlaneNeighbors ?? []) {
            if (dist.has(n)) continue;
            dist.set(n, hops + 1);
            from.set(n, from.get(cur)!);
            queue.push(n);
        }
    }

    for (const [id, sys] of byId) {
        const hops = dist.get(id);
        if (hops !== undefined) {
            out.set(id, { credits: relayPingCredits(hops), jumps: hops, anchorSystemId: from.get(id)!, metric: 'lanes' });
            continue;
        }
        // Off the lane net: straight across the grid to the closest anchor.
        let best: { id: string; d: number } | null = null;
        for (const a of anchors) {
            const s = byId.get(a)!;
            const d = Math.round(hexDistance(s.q, s.r, sys.q, sys.r));
            if (!best || d < best.d) best = { id: a, d };
        }
        out.set(id, { credits: relayPingCredits(best!.d), jumps: best!.d, anchorSystemId: best!.id, metric: 'grid' });
    }
    return out;
}

/** Hover line for an uncharted hex: 'PING 550cr · 2 jumps from Kessary' (+ ' · off-lane'). */
export function chartedPingHint(quote: RelayPingQuote, anchorName?: string | null): string {
    if (quote.metric === 'none') return 'PING — no relay point';
    const jumps = quote.jumps === 1 ? '1 jump' : `${quote.jumps} jumps`;
    const from = anchorName ? ` from ${anchorName}` : '';
    const offLane = quote.metric === 'grid' ? ' · off-lane' : '';
    return `PING ${fmt(quote.credits)}cr · ${jumps}${from}${offLane}`;
}

// ─── Exploration orders ───────────────────────────────────────────────────────

export const ORDER_DURATION_SECONDS: Readonly<Record<'ping' | 'scan' | 'survey', number>> = {
    ping: config.exploration.pingDurationSeconds,
    scan: config.exploration.scanDurationSeconds,
    survey: config.exploration.surveyDurationSeconds,
};

function parseSeconds(iso: string | undefined): number {
    if (!iso) return NaN;
    return Date.parse(iso) / 1000;
}

function mmss(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Progress of one order on the sim clock. p is clamped to [0,1] and never
 * NaN: when issuedAt is missing (older orders) the duration table stands in,
 * and an unparseable completesAt reads as "just issued".
 */
export function orderProgress(order: OverlayInputOrder, nowSeconds: number): { p: number; remainingSeconds: number; label: string } {
    const mode = order.mode;
    const duration = ORDER_DURATION_SECONDS[mode] ?? ORDER_DURATION_SECONDS.ping;
    const completesAt = parseSeconds(order.completesAt);
    const label = (remaining: number) => `${mode.toUpperCase()} ${mmss(remaining)}`;
    if (!Number.isFinite(completesAt) || !Number.isFinite(nowSeconds)) {
        return { p: 0, remainingSeconds: duration, label: label(duration) };
    }
    let issuedAt = parseSeconds(order.issuedAt);
    if (!Number.isFinite(issuedAt) || issuedAt >= completesAt) issuedAt = completesAt - duration;
    const total = completesAt - issuedAt;
    const raw = total > 0 ? (nowSeconds - issuedAt) / total : 1;
    const p = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
    const remaining = Math.max(0, completesAt - nowSeconds);
    return { p, remainingSeconds: remaining, label: label(remaining) };
}

// ─── The overlays ─────────────────────────────────────────────────────────────

interface Ctx {
    input: OverlayInput;
    me: string | null;
    byId: Map<string, OverlayInputSystem>;
    styles: Map<string, OverlaySystemStyle>;
    counts: Record<string, number>;
}

function makeCtx(overlayId: OverlayId, input: OverlayInput): Ctx {
    const counts: Record<string, number> = {};
    for (const entry of overlayDef(overlayId).legend) counts[entry.key] = 0;
    const byId = new Map<string, OverlayInputSystem>();
    for (const s of input.systems) byId.set(s.id, s);
    return { input, me: input.playerFactionId, byId, styles: new Map(), counts };
}

function bump(ctx: Ctx, key: string, n = 1): void {
    ctx.counts[key] = (ctx.counts[key] ?? 0) + n;
}

function ordersByTarget(orders: OverlayInputOrder[], modes?: ReadonlySet<OverlayInputOrder['mode']>): Set<string> {
    const out = new Set<string>();
    for (const o of orders) if (!modes || modes.has(o.mode)) out.add(o.targetSystemId);
    return out;
}

const IN_FLIGHT_STROKE = { stroke: C.inFlight, strokeOpacity: 0.9, dash: '3 2', pulse: true } as const;

function computeCharted(ctx: Ctx): OverlayResult {
    const { input, me } = ctx;
    const faction = me ? input.factions[me] : undefined;
    const anchors = pingAnchorsFor(input.shipyardSystemIds, faction?.capitalSystemId);
    const quotes = relayPingDistances(input.systems, anchors);
    const credits = faction?.reserves?.CREDITS ?? 0;
    const reach = scanReachSystemIds(input.systems, input.fleets, me);
    const inFlight = ordersByTarget(input.explorationOrders);

    let withData = 0;
    let withinBudget = 0;
    for (const sys of input.systems) {
        const stage = stageOf(input, sys);
        let style: OverlaySystemStyle;
        if (stage === 'surveyed') {
            style = { fill: C.charted, fillOpacity: 0.38, stroke: C.known, strokeOpacity: 0.85, bucket: 'surveyed' };
        } else if (stage === 'scanned') {
            style = { fill: C.charted, fillOpacity: 0.24, stroke: C.known, strokeOpacity: 0.60, bucket: 'scanned' };
        } else if (stage === 'pinged') {
            style = { fill: C.charted, fillOpacity: 0.10, stroke: C.known, strokeOpacity: 0.50, dash: '2 2', bucket: 'pinged' };
        } else {
            // Unknown: priced from public geometry only. Nothing about the
            // system's contents is read here.
            const q = quotes.get(sys.id);
            const jumps = q && q.metric !== 'none' ? q.jumps : Infinity;
            if (jumps <= 2) {
                style = { fill: C.caution, fillOpacity: 0.16, stroke: C.caution, strokeOpacity: 0.60, bucket: 'near' };
            } else if (jumps <= 6) {
                style = { fill: C.caution, fillOpacity: 0.08, stroke: C.caution, strokeOpacity: 0.35, dash: '3 2', bucket: 'mid' };
            } else {
                style = { fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.15, dash: '1 2', bucket: 'far' };
            }
            if (style.bucket !== 'far' && q) {
                if (q.credits > credits) {
                    style.stroke = C.danger; style.strokeOpacity = 0.45; style.dash = '1 2';
                    bump(ctx, 'overBudget');
                } else {
                    withinBudget++;
                }
            }
        }
        if (stage !== 'unknown' || style.bucket === 'near' || style.bucket === 'mid') withData++;
        bump(ctx, style.bucket);

        // Stroke overrides, highest first: an order under way, then scan reach.
        if (inFlight.has(sys.id)) {
            Object.assign(style, IN_FLIGHT_STROKE);
            bump(ctx, 'inFlight');
        } else if ((stage === 'pinged' || stage === 'scanned') && reach.has(sys.id)) {
            style.stroke = C.reach; style.strokeOpacity = 0.95; style.strokeWidth = 1.2; delete style.dash;
            bump(ctx, 'reach');
        }
        ctx.styles.set(sys.id, style);
    }

    const cov = chartedCoverage(input);
    const total = input.systems.length;
    let relay: string;
    if (input.shipyardSystemIds.length === 0) {
        relay = 'relay: capital — build a shipyard closer to ping cheaper';
    } else if (input.shipyardSystemIds.length === 1) {
        relay = `relay: ${ctx.byId.get(input.shipyardSystemIds[0])?.name ?? input.shipyardSystemIds[0]}`;
    } else {
        relay = `relay: ${input.shipyardSystemIds.length} yards`;
    }
    const footer = `Charted ${cov.charted} of ${total} · ${cov.surveyed} surveyed · ${withinBudget} pings within budget · treasury ${fmt(credits)}cr · ${relay}`;
    const empty = anchors.length === 0 ? 'No relay point — you need a capital or a shipyard to ping from' : null;
    return { styles: ctx.styles, coverage: { withData, total }, counts: ctx.counts, footer, empty };
}

const STANCE_ORDER: Record<Stance, number> = { hostile: 0, tension: 1, ally: 2, pact: 3, neutral: 4, mine: 5 };

function computeRelations(ctx: Ctx): OverlayResult {
    const { input, me } = ctx;
    const stances = stanceByFaction(me, input.diplomacy);
    const contested = input.contestedSystemIds instanceof Set
        ? input.contestedSystemIds
        : new Set(input.contestedSystemIds as Iterable<string>);
    const capitals = new Set<string>();
    for (const f of Object.values(input.factions)) if (f?.capitalSystemId) capitals.add(f.capitalSystemId);

    const perFaction = new Map<string, number>();
    let withData = 0;
    for (const sys of input.systems) {
        const owner = sys.ownerId;
        let style: OverlaySystemStyle;
        if (isUnclaimed(owner)) {
            style = { fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.30, bucket: 'unclaimed' };
            bump(ctx, 'unclaimed');
        } else {
            const stance: Stance = owner === me ? 'mine' : (stances[owner!] ?? 'neutral');
            const legend = RELATIONS_LEGEND.find(e => e.key === stance)!;
            style = { fill: legend.fill, fillOpacity: legend.fillOpacity, stroke: legend.stroke, strokeOpacity: legend.strokeOpacity, dash: legend.dash, bucket: stance };
            bump(ctx, stance);
            perFaction.set(owner!, (perFaction.get(owner!) ?? 0) + 1);
            withData++;
            // Contested is the one planet-derived signal, so it stays behind
            // the same scanned/surveyed gate SystemNode applies today.
            if (contested.has(sys.id) && isKnownStage(stageOf(input, sys))) {
                style.fill = CONTESTED; style.fillOpacity = 0.30;
                style.stroke = CONTESTED; style.strokeOpacity = 0.8; style.dash = '3 2';
                style.bucket = 'contested';
                bump(ctx, 'contested');
            }
        }
        if (style.dash === undefined) delete style.dash;
        if (capitals.has(sys.id)) style.strokeWidth = 1.6;
        ctx.styles.set(sys.id, style);
    }

    const rows: OverlayLegendRow[] = [...perFaction.entries()].map(([id, count]) => {
        const stance: Stance = id === me ? 'mine' : (stances[id] ?? 'neutral');
        const f = input.factions[id];
        return { label: f?.name ?? id, color: STANCE_COLOR[stance], count, stance, focusSystemId: f?.capitalSystemId };
    }).sort((a, b) =>
        STANCE_ORDER[a.stance!] - STANCE_ORDER[b.stance!] || b.count - a.count || a.label.localeCompare(b.label));

    const c = ctx.counts;
    const footer = `Mine ${c.mine} · Allied ${c.ally} · Pact ${c.pact} · Neutral ${c.neutral} · Tension ${c.tension} · Hostile ${c.hostile} · Unclaimed ${c.unclaimed} — borders are common knowledge, contents are not`;
    const empty = input.systems.length === 0 ? 'No systems synced yet' : null;
    return { styles: ctx.styles, coverage: { withData, total: input.systems.length }, counts: ctx.counts, footer, empty, rows };
}

const SCAN_SURVEY = new Set<OverlayInputOrder['mode']>(['scan', 'survey']);

function colonyCostLine(reserves: Record<string, number> | undefined): string {
    const parts: string[] = [];
    const have: string[] = [];
    for (const [key, amt] of Object.entries(COLONY_COST)) {
        parts.push(key === 'CREDITS' ? `${fmt(amt)}cr` : `${fmt(amt)} ${key.toLowerCase()}`);
        have.push(fmt(reserves?.[key] ?? 0));
    }
    return `colony ${parts.join(' + ')} · you have ${have.join(' / ')}`;
}

function computeSettle(ctx: Ctx): OverlayResult {
    const { input, me } = ctx;
    const sites = settleSitesBySystem(input.planets);
    const reserves = me ? input.factions[me]?.reserves : undefined;
    const affordable = canAffordColony(reserves);
    const presence = new Set<string>();
    for (const f of input.fleets) if (me && f.factionId === me && f.currentSystemId) presence.add(f.currentSystemId);
    const inFlight = ordersByTarget(input.explorationOrders, SCAN_SURVEY);

    let withData = 0;
    let totalSites = 0;
    let siteSystems = 0;
    for (const sys of input.systems) {
        // Another faction's system is a war, not a settlement.
        if (!isUnclaimed(sys.ownerId) && sys.ownerId !== me) continue;
        const stage = stageOf(input, sys);
        const here = presence.has(sys.id);
        if (stage === 'unknown' && !here) continue;
        const n = sites.get(sys.id) ?? 0;
        let style: OverlaySystemStyle;
        if (n >= 1 && (stage === 'surveyed' || here)) {
            const color = affordable ? C.act : C.inFlight;
            style = { fill: C.act, fillOpacity: 0.38, stroke: SETTLE_STROKE, strokeOpacity: 0.85, badge: { count: n, color, hollow: false }, bucket: 'ready' };
            if (!affordable) bump(ctx, 'unaffordable');
            totalSites += n; siteSystems++;
        } else if (n >= 1) {
            style = { fill: C.act, fillOpacity: 0.14, stroke: SETTLE_STROKE, strokeOpacity: 0.50, dash: '2 2', badge: { count: n, color: SETTLE_STROKE, hollow: true }, bucket: 'sighted' };
            totalSites += n; siteSystems++;
        } else if (stage === 'surveyed') {
            style = { fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.35, bucket: 'none' };
        } else {
            // Bodies only materialise on first survey, so "no badge" must
            // never read as "nothing here".
            style = { fill: 'none', fillOpacity: 0, stroke: C.caution, strokeOpacity: 0.50, dash: '2 3', bucket: 'unsurveyed' };
        }
        bump(ctx, style.bucket);
        withData++;
        if (inFlight.has(sys.id)) {
            Object.assign(style, IN_FLIGHT_STROKE);
            bump(ctx, 'inFlight');
        }
        ctx.styles.set(sys.id, style);
    }

    const c = ctx.counts;
    const footer = `${totalSites} sites in ${siteSystems} systems · ${c.unsurveyed} systems await survey · ${colonyCostLine(reserves)}`;
    const empty = withData === 0
        ? 'No charted worlds yet — ping a neighbour (from 250cr), then survey it with a fleet within one jump'
        : null;
    return { styles: ctx.styles, coverage: { withData, total: input.systems.length }, counts: ctx.counts, footer, empty };
}

const HAZARD_TAGS = new Set(['under_siege', 'rebel_stronghold', 'pirate_station', 'corsair_den', 'plague_quarantine']);
/** One 6h tick in sim seconds — older than this, a foreign reading is stale. */
const STALE_AFTER_SECONDS = 21_600;

function computeStability(ctx: Ctx): OverlayResult {
    const { input, me } = ctx;
    const cohesion = input.systemCohesion ?? {};
    const influence = input.piracyInfluence ?? {};
    const now = input.nowSeconds;

    let withData = 0;
    let foreignKnown = 0;
    for (const sys of input.systems) {
        const stage = stageOf(input, sys);
        const mine = !!me && sys.ownerId === me;
        const known = isKnownStage(stage);
        const pirate = stage !== 'unknown' && (influence[sys.id] ?? 0) >= 25
            ? { count: Math.round(influence[sys.id]), color: C.pirate, hollow: false }
            : undefined;

        // THE GATE. Nothing below this line runs for a system the player
        // has not scanned or does not own.
        if (!mine && !known) {
            if (pirate) {
                ctx.styles.set(sys.id, { fill: 'none', fillOpacity: 0, badge: pirate, bucket: 'pirate' });
                bump(ctx, 'pirate');
            } else {
                bump(ctx, 'unread');
            }
            continue;
        }

        let style: OverlaySystemStyle;
        if (mine) {
            const v = cohesion[sys.id];
            if (v === undefined) {
                style = { fill: 'none', fillOpacity: 0, stroke: C.none, strokeOpacity: 0.35, bucket: 'noReading' };
            } else if (v >= 60) {
                style = { fill: STEADY, fillOpacity: 0.28, stroke: STEADY, strokeOpacity: 0.70, bucket: 'steady' };
            } else if (v >= 40) {
                style = { fill: C.caution, fillOpacity: 0.30, stroke: C.caution, strokeOpacity: 0.70, bucket: 'strained' };
            } else if (v >= 20) {
                style = { fill: FRAYING, fillOpacity: 0.34, stroke: FRAYING, strokeOpacity: 0.80, bucket: 'fraying' };
            } else {
                style = { fill: C.danger, fillOpacity: 0.40, stroke: C.danger, strokeOpacity: 0.90, dash: '2 2', pulse: true, bucket: 'breaking' };
            }
        } else {
            foreignKnown++;
            // Per-system escalation is 0–10; ×10 puts it on the same 0–100 axis.
            const threat = Math.max(
                sys.instability ?? 0,
                sys.unrest ?? 0,
                100 - (sys.security ?? 50),
                (sys.escalationLevel ?? 0) * 10,
            );
            if (threat < 40) {
                style = { fill: CALM, fillOpacity: 0.14, stroke: CALM, strokeOpacity: 0.40, bucket: 'calm' };
            } else if (threat < 70) {
                style = { fill: C.caution, fillOpacity: 0.20, stroke: C.caution, strokeOpacity: 0.60, dash: '3 2', bucket: 'caution' };
            } else {
                style = { fill: C.danger, fillOpacity: 0.26, stroke: C.danger, strokeOpacity: 0.80, bucket: 'danger' };
            }
            const seen = parseSeconds(input.visibility?.[sys.id]?.lastSeenAt);
            if (now !== undefined && Number.isFinite(seen) && now - seen > STALE_AFTER_SECONDS) {
                style.fillOpacity = style.fillOpacity / 2;
                style.dash = '1 2';
                bump(ctx, 'stale');
            }
        }
        bump(ctx, style.bucket);
        withData++;

        const visibleTags = input.visibility?.[sys.id]?.visibleTags ?? [];
        const hazard = (sys.siege !== undefined && sys.siege !== null) || visibleTags.some(t => HAZARD_TAGS.has(t));
        if (hazard) {
            style.stroke = C.danger; style.strokeOpacity = 0.9; style.strokeWidth = 1.6;
            bump(ctx, 'hazard');
        }
        if (pirate) {
            style.badge = pirate;
            bump(ctx, 'pirate');
        }
        ctx.styles.set(sys.id, style);
    }

    const c = ctx.counts;
    let footer = `You: ${c.steady} steady · ${c.strained} strained · ${c.fraying} fraying · ${c.breaking} breaking · Foreign: ${c.calm} calm · ${c.caution} caution · ${c.danger} danger · ${c.stale} stale`;
    if (foreignKnown === 0) footer += ' · scan a system with a fleet within one jump to read foreign systems';
    const empty = withData === 0 ? 'Nothing readable yet — hold a world or scan a system with a fleet within one jump' : null;
    return { styles: ctx.styles, coverage: { withData, total: input.systems.length }, counts: ctx.counts, footer, empty };
}

export function computeOverlayStyles(overlayId: OverlayId, input: OverlayInput): OverlayResult {
    const ctx = makeCtx(overlayId, input);
    switch (overlayId) {
        case 'charted': return computeCharted(ctx);
        case 'relations': return computeRelations(ctx);
        case 'settle': return computeSettle(ctx);
        case 'stability': return computeStability(ctx);
    }
}
