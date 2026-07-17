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

self.onmessage = function (e) {
    const { id, type, payload } = e.data;
    try {
        if (type === 'DESERIALIZE_WORLD') {
            const parsed = JSON.parse(payload);
            const world = recordsToMaps(parsed);
            self.postMessage({ id, type, success: true, result: world });
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
