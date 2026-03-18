const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('generated-systems.json', 'utf-8'));
    let updatedCount = 0;

    data.systemNodes.forEach(s => {
        // Map regions directly to archetype tags
        if (s.regionId === 'crimson-expanse') {
            if (!s.tags.includes('crimson_expanse')) s.tags.push('crimson_expanse');
            updatedCount++;
        }
        else if (s.regionId === 'veldt-dominion') {
            if (!s.tags.includes('veldt_dominion')) s.tags.push('veldt_dominion');
            updatedCount++;
        }
        else if (s.regionId === 'nullward-fringe') {
            if (!s.tags.includes('nullward_fringe')) s.tags.push('nullward_fringe');
            updatedCount++;
        }
    });

    fs.writeFileSync('generated-systems.json', JSON.stringify(data, null, 2));
    console.log(`Successfully mapped ${updatedCount} system archetypes based on their region.`);
} catch (err) {
    console.error(err);
}
