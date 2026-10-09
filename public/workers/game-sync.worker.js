// public/workers/game-sync.worker.js
// Stars of Dominion — Asynchronous Game Sync Web Worker
// Processes CPU-intensive JSON parsing and recursive Map/Set reconstruction off the main thread.

function recordsToMaps(obj) {
    if (obj && typeof obj === 'object') {
        if (obj.__map__ === true && obj.data) {
            const m = new Map();
            for (const [k, v] of Object.entries(obj.data)) {
                m.set(k, recordsToMaps(v));
            }
            return m;
        }
        if (obj.__set__ === true && Array.isArray(obj.data)) {
            return new Set(obj.data.map(recordsToMaps));
        }
        if (Array.isArray(obj)) {
            return obj.map(recordsToMaps);
        }
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = recordsToMaps(v);
        }
        return out;
    }
    return obj;
}

// Delta sync: the last snapshot tree (plain JSON, before Maps) and its
// version, so the next change can arrive as a delta instead of ~3 MB.
// applyTreeDelta is a copy of lib/persistence/tree-delta-apply.ts — keep the
// two identical; scripts/sync-delta-probe.ts runs both on the same deltas.
let lastTree = null;
let lastVersion = null;

const UNSAFE = new Set(['__proto__']);

function applyTreeDelta(tree, delta) {
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

self.onmessage = function (e) {
    const { id, type, payload, version } = e.data;
    try {
        if (type === 'DESERIALIZE_WORLD') {
            const parsed = JSON.parse(payload);
            const world = recordsToMaps(parsed);
            lastTree = version ? parsed : null;
            lastVersion = version || null;
            self.postMessage({ id, type, success: true, result: world });
        } else if (type === 'APPLY_WORLD_DELTA') {
            if (!lastTree || lastVersion !== payload.base) {
                const held = lastVersion;
                lastTree = null;
                lastVersion = null;
                throw new Error(`delta base ${payload.base} does not match held version ${held}`);
            }
            try {
                lastTree = applyTreeDelta(lastTree, payload.delta);
            } catch (err) {
                lastTree = null;
                lastVersion = null;
                throw err;
            }
            lastVersion = payload.version;
            self.postMessage({ id, type, success: true, result: recordsToMaps(lastTree) });
        } else if (type === 'DESERIALIZE_SHARD') {
            const parsed = JSON.parse(payload);
            const shard = recordsToMaps(parsed);
            self.postMessage({ id, type, success: true, result: shard });
        } else {
            self.postMessage({ id, type, success: false, error: 'Unknown action' });
        }
    } catch (err) {
        self.postMessage({ id, type, success: false, error: err.message });
    }
};
