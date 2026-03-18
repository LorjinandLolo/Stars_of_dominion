const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('generated-systems.json', 'utf-8'));
    let ts = fs.readFileSync('lib/ui-mock-data.ts', 'utf-8');

    // Make mockSystems deterministic array instead of generated
    // By matching the previously injected array signature
    ts = ts.replace(/export const mockSystems: SystemNode\[\] = \[.*?\];/s, 'export const mockSystems: SystemNode[] = ' + JSON.stringify(data.systemNodes, null, 4) + ';');

    // Make mockLinks deterministic array
    ts = ts.replace(/export const mockLinks: Link\[\] = \[.*?\];/s, 'export const mockLinks: Link[] = ' + JSON.stringify(data.links, null, 4) + ';');

    // Adjust region system assignments dynamically based on the explicit archetypes
    const s1 = data.systemNodes.filter(s => s.regionId === 'crimson-expanse').map(s => `'${s.id}'`);
    const s2 = data.systemNodes.filter(s => s.regionId === 'veldt-dominion').map(s => `'${s.id}'`);
    const s3 = data.systemNodes.filter(s => s.regionId === 'nullward-fringe').map(s => `'${s.id}'`);
    const s4 = data.systemNodes.filter(s => s.regionId === 'middle-rim').map(s => `'${s.id}'`);

    // The previous script replaced the systemIds arrays completely, so now we match `systemIds: ['sys-5b3496', ...],` instead of slice calls
    ts = ts.replace(/systemIds: \[.*?\],/sg, function (match, offset, string) {
        // We have 4 regions, we replace them in order
        if (!this.count) this.count = 0;
        this.count++;
        if (this.count === 1) return `systemIds: [${s1.join(', ')}],`;
        if (this.count === 2) return `systemIds: [${s2.join(', ')}],`;
        if (this.count === 3) return `systemIds: [${s3.join(', ')}],`;
        // Handle the 4th Middle Rim region by safely appending it if it didn't exist in the static UI mock
        if (this.count === 4 && s4.length > 0) return `systemIds: [${s4.join(', ')}],`;
        return match;
    });

    fs.writeFileSync('lib/ui-mock-data.ts', ts);
    console.log(`Successfully patched lib/ui-mock-data.ts with ${data.systemNodes.length} systems and ${data.links.length} links.`);
} catch (err) {
    console.error(err);
}
