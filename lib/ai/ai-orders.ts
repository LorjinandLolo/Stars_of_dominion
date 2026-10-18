/**
 * AI order outbox — the seam that lets an AI empire act through the SAME order
 * handlers a human does (scripts/game-loop.ts `executeOrder`).
 *
 * Why an outbox and not a direct call: the AI deciders live in lib/ (the tick
 * processor runs them), the handlers live in the worker script, and lib must
 * not import the worker. So a decider queues `{ factionId, actionId, payload }`
 * here and the worker drains the queue once per loop and once right after the
 * strategic tick (before the world round-trips through serialization, which
 * this transient field must not survive into the snapshot).
 *
 * What parity buys: the tech gate, the faction rite gates, the affordability
 * and political-capital charges, the deed counters and support evaluation all
 * apply to the AI exactly as to a player. A decider that wants an order to go
 * through checks affordability itself first (as a player would look at the
 * price) — a refused order is recorded, logged, and costs nothing.
 *
 * Only AI-run factions may queue: an order for a claimed faction is dropped,
 * so the AI can never act on a human's behalf.
 */
import { isAIRunFaction } from './belt-ambush-ai';

export interface AIOrder {
    factionId: string;
    actionId: string;
    payload: any;
    /** Why the AI chose it — logged with the order, for tuning. */
    reason?: string;
    /**
     * Runs right after the handler, in the same drain. The handler records a
     * refusal rather than throwing, so a decider that keeps its own books (the
     * war AI's declared wars) checks the world here and books only what landed.
     * In-memory only: the outbox is drained before the world is serialized.
     */
    onDone?: (world: any) => void;
}

type OutboxWorld = { claimedFactionIds?: string[]; aiOrderOutbox?: AIOrder[] };

/** Queue an order for an AI-run faction. Returns false (and queues nothing) for a human's faction. */
export function queueAIOrder(world: any, order: AIOrder): boolean {
    const w = world as OutboxWorld;
    if (!isAIRunFaction(w as any, order.factionId)) return false;
    (w.aiOrderOutbox ??= []).push(order);
    return true;
}

/** True when an identical action for the same faction is already waiting — deciders use it to avoid double-queuing within one drain window. */
export function hasQueuedAIOrder(world: any, factionId: string, actionId: string, match?: (payload: any) => boolean): boolean {
    const box = (world as OutboxWorld).aiOrderOutbox ?? [];
    return box.some(o => o.factionId === factionId && o.actionId === actionId && (!match || match(o.payload)));
}

/**
 * Run every queued AI order through `execute` (the worker's executeOrder) and
 * empty the outbox. `budget(factionId)` is the same per-faction order ceiling
 * the player queue honours (Movanite bottleneck); orders over it wait for the
 * next drain, exactly as a player's do. Returns how many ran.
 */
export function drainAIOrders(
    world: any,
    execute: (world: any, actionId: string, payload: any, factionId: string) => void,
    budget?: (world: any, factionId: string) => number,
): number {
    const w = world as OutboxWorld;
    const box = w.aiOrderOutbox;
    if (!box || box.length === 0) return 0;
    w.aiOrderOutbox = [];
    const left = new Map<string, number>();
    const held: AIOrder[] = [];
    let ran = 0;
    for (const order of box) {
        // A faction claimed between queue and drain is a human now.
        if (!isAIRunFaction(w as any, order.factionId)) continue;
        if (budget) {
            if (!left.has(order.factionId)) left.set(order.factionId, budget(world, order.factionId));
            const n = left.get(order.factionId)!;
            if (n <= 0) { held.push(order); continue; }
            left.set(order.factionId, n - 1);
        }
        try {
            execute(world, order.actionId, order.payload, order.factionId);
            ran++;
            order.onDone?.(world);
            if (order.reason) console.log(`[AI Orders] ${order.factionId} ${order.actionId}: ${order.reason}`);
        } catch (e: any) {
            console.warn(`[AI Orders] ${order.factionId} ${order.actionId} failed:`, e?.message ?? e);
        }
    }
    if (held.length) (w.aiOrderOutbox ??= []).unshift(...held);
    return ran;
}
