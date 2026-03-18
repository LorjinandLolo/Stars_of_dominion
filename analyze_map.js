const fs = require('fs');
const content = fs.readFileSync('lib/ui-mock-data.ts', 'utf-8');
const lines = content.split('\n');
let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
let count = 0;

for (const line of lines) {
    const qMatch = line.match(/\"q\":\s*(-?\d+)/);
    const rMatch = line.match(/\"r\":\s*(-?\d+)/);
    if (qMatch) {
        const q = parseInt(qMatch[1]);
        if (q < minQ) minQ = q;
        if (q > maxQ) maxQ = q;
        count++;
    }
    if (rMatch) {
        const r = parseInt(rMatch[1]);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
    }
}
console.log(JSON.stringify({ minQ, maxQ, minR, maxR, count }));
