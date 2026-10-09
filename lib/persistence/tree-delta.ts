// lib/persistence/tree-delta.ts
// Delta sync, server half. SERVER-ONLY (node:crypto).
//
// The client used to receive the whole world snapshot every time the worker
// saved it (~every 30 s), which grew from ~1.4 MB to ~3 MB over a season, per
// tab. Almost all of it is unchanged between saves: 550 systems, every planet,
// every leader. So a snapshot is cut into chunks along its own structure —
// each object bigger than SPLIT_BYTES is split into its children, which for a
// serialized Map (`{__map__, data}`) means one chunk per entry — and each chunk
// is hashed. Two versions' hash maps say exactly which chunks changed, and the
// client receives only those (lib/persistence/tree-delta-apply.ts applies them).
//
// Arrays are always single chunks: index-based patches go wrong the moment a
// capped list drops its head, and no array in the snapshot is large.

import { createHash } from 'node:crypto';
import type { TreeDelta, TreePath } from './tree-delta-apply';

/** Objects whose JSON exceeds this are sent per child rather than whole. */
export const SPLIT_BYTES = 1024;
const MAX_DEPTH = 8;

export interface Chunk { path: TreePath; json: string; hash: string }
/** key = JSON.stringify(path). */
export type ChunkMap = Map<string, Chunk>;
export type HashMap = Map<string, string>;

/** Interned keys: hundreds of versions share one string per path. */
const internTable = new Map<string, string>();
function intern(key: string): string {
    const hit = internTable.get(key);
    if (hit !== undefined) return hit;
    if (internTable.size > 200_000) internTable.clear();
    internTable.set(key, key);
    return key;
}

function hashOf(json: string): string {
    return createHash('sha1').update(json).digest('base64').slice(0, 16);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Cut a parsed JSON tree into chunks. The root itself is never a chunk. */
export function chunkTree(tree: unknown): ChunkMap {
    const out: ChunkMap = new Map();
    // Returns the node's JSON; pushes leaves for its children when it splits.
    const walk = (node: unknown, path: TreePath, depth: number, pending: Chunk[]): string => {
        if (!isPlainObject(node) || depth >= MAX_DEPTH) {
            const json = JSON.stringify(node);
            pending.push({ path, json, hash: '' });
            return json;
        }
        const childLeaves: Chunk[] = [];
        const parts: string[] = [];
        for (const [k, v] of Object.entries(node)) {
            if (v === undefined) continue;
            parts.push(`${JSON.stringify(k)}:${walk(v, [...path, k], depth + 1, childLeaves)}`);
        }
        const json = `{${parts.join(',')}}`;
        if (path.length === 0 || json.length > SPLIT_BYTES) {
            for (const leaf of childLeaves) pending.push(leaf);
        } else {
            pending.push({ path, json, hash: '' });
        }
        return json;
    };
    const leaves: Chunk[] = [];
    walk(tree, [], 0, leaves);
    for (const leaf of leaves) {
        leaf.hash = hashOf(leaf.json);
        out.set(intern(JSON.stringify(leaf.path)), leaf);
    }
    return out;
}

export function hashesOf(chunks: ChunkMap): HashMap {
    const out: HashMap = new Map();
    for (const [key, chunk] of chunks) out.set(key, chunk.hash);
    return out;
}

function getAt(tree: any, path: TreePath): { found: boolean; value: unknown } {
    let node = tree;
    for (const key of path) {
        if (!isPlainObject(node) || !(key in node)) return { found: false, value: undefined };
        node = node[key];
    }
    return { found: true, value: node };
}

/** A delta whose `set` values are still raw JSON text (sent without re-encoding). */
export interface RawTreeDelta { set: Array<[TreePath, string]>; del: TreePath[] }

/**
 * What turns version `old` (its hashes) into `next` (its chunks + tree).
 *
 * Structure can shift between versions: an object that crossed SPLIT_BYTES is
 * a leaf on one side and split on the other. A former leaf that is now split is
 * re-sent whole, so none of its old keys survive; a former split node that is
 * now a leaf arrives as one set that replaces its children. A removed subtree
 * is deleted at its highest missing ancestor, so no empty shell is left behind
 * (an empty `{}` under a Map's `data` would revive the entry as a blank record).
 */
export function diffChunks(old: HashMap, next: ChunkMap, nextTree: unknown): RawTreeDelta {
    const set: Array<[TreePath, string]> = [];
    const del: TreePath[] = [];

    const nextInner = new Set<string>();
    for (const chunk of next.values()) {
        for (let i = 1; i < chunk.path.length; i++) nextInner.add(JSON.stringify(chunk.path.slice(0, i)));
    }

    const replaced: TreePath[] = [];
    const deleted = new Set<string>();
    for (const [key] of old) {
        if (next.has(key)) continue;
        const path: TreePath = JSON.parse(key);
        // Covered by a new leaf at an ancestor.
        let covered = false;
        for (let i = 1; i < path.length; i++) {
            if (next.has(JSON.stringify(path.slice(0, i)))) { covered = true; break; }
        }
        if (covered) continue;
        if (nextInner.has(key)) {
            // Old leaf, now split: send it whole.
            const { value } = getAt(nextTree, path);
            set.push([path, JSON.stringify(value)]);
            replaced.push(path);
            continue;
        }
        // Gone: delete at the highest ancestor the new tree no longer has.
        for (let i = 1; i <= path.length; i++) {
            const prefix = path.slice(0, i);
            if (!getAt(nextTree, prefix).found) {
                const pk = JSON.stringify(prefix);
                if (!deleted.has(pk)) { deleted.add(pk); del.push(prefix); }
                break;
            }
        }
    }

    const underReplaced = (path: TreePath) => replaced.some(r =>
        r.length < path.length && r.every((k, i) => path[i] === k));

    for (const [key, chunk] of next) {
        if (old.get(key) === chunk.hash) continue;
        if (underReplaced(chunk.path)) continue;
        set.push([chunk.path, chunk.json]);
    }
    return { set, del };
}

/** Serialize a raw delta without re-encoding the chunk JSON. */
export function rawDeltaToJson(delta: RawTreeDelta): string {
    const sets = delta.set.map(([path, json]) => `[${JSON.stringify(path)},${json}]`);
    return `{"set":[${sets.join(',')}],"del":${JSON.stringify(delta.del)}}`;
}

export function rawDeltaBytes(delta: RawTreeDelta): number {
    let n = 0;
    for (const [path, json] of delta.set) n += json.length + path.join('').length + 8;
    return n;
}

export type { TreeDelta, TreePath };

/**
 * One versioned stream (the session snapshot, or one shard): remembers the
 * hashes of its recent versions so a client holding any of them can be sent a
 * delta. Memory is the point of the cap — a version's hash map is a few hundred
 * KB, and a client further behind than the window just gets a full copy.
 */
export class DeltaStream {
    private history = new Map<string, HashMap>();
    private current: { version: string; json: string; tree: unknown; chunks: ChunkMap } | null = null;

    constructor(private readonly keep: number) {}

    get currentVersion(): string | null { return this.current?.version ?? null; }
    /** The current version's full JSON, as recorded. */
    get currentJson(): string | null { return this.current?.json ?? null; }

    /** Record a version (idempotent). `json` is only parsed when it is new. */
    update(version: string, json: string): void {
        if (this.current?.version === version) return;
        const tree = JSON.parse(json);
        const chunks = chunkTree(tree);
        this.current = { version, json, tree, chunks };
        this.history.delete(version);
        this.history.set(version, hashesOf(chunks));
        while (this.history.size > this.keep) {
            const oldest = this.history.keys().next().value as string;
            this.history.delete(oldest);
        }
    }

    has(version: string): boolean { return this.history.has(version); }

    /** Delta from `base` to the current version, or null when base is unknown. */
    deltaFrom(base: string): RawTreeDelta | null {
        if (!this.current) return null;
        const old = this.history.get(base);
        if (!old) return null;
        return diffChunks(old, this.current.chunks, this.current.tree);
    }
}
