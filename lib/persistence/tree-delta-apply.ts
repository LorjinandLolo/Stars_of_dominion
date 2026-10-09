// lib/persistence/tree-delta-apply.ts
// The client half of delta sync: apply a TreeDelta to a plain JSON tree (the
// serialized world, before Maps are rebuilt). No Node imports — the hook bundles
// this. public/workers/game-sync.worker.js carries a line-for-line copy because
// a static worker cannot import modules; scripts/sync-delta-probe.ts runs both
// against the same deltas so they cannot drift apart.
//
// A delta is computed by lib/persistence/tree-delta.ts on the server.

export type TreePath = string[];

export interface TreeDelta {
    /** Replace the value at each path (intermediate objects are created). */
    set: Array<[TreePath, unknown]>;
    /** Remove the key at each path. */
    del: TreePath[];
}

/** A key that would reach Object.prototype instead of the tree. */
const UNSAFE = new Set(['__proto__']);

export function applyTreeDelta(tree: any, delta: TreeDelta): any {
    for (const path of delta.del) {
        if (path.some(k => UNSAFE.has(k))) continue;
        let node = tree;
        for (let i = 0; i < path.length - 1 && node; i++) node = node[path[i]];
        if (node && typeof node === 'object') delete node[path[path.length - 1]];
    }
    for (const [path, value] of delta.set) {
        if (path.length === 0) { tree = value; continue; }
        if (path.some(k => UNSAFE.has(k))) continue;
        let node = tree;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (node[key] === null || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        }
        node[path[path.length - 1]] = value;
    }
    return tree;
}
