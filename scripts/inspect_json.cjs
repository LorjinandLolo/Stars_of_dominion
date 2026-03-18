const fs = require('fs');
const filename = 'c:/Users/lorij/OneDrive/Desktop/Star_of_Dom/Alpha - September 18, 2025.json';

try {
    const rawData = fs.readFileSync(filename);
    const data = JSON.parse(rawData);
    console.log('Top level keys:', Object.keys(data));

    if (data.planet) {
        console.log('Sample planet:', Object.values(data.planet)[0]);
        // Check bounds
        let maxX = 0, maxY = 0;
        Object.values(data.planet).forEach(p => {
            if (p.x !== undefined) {
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
        });
        console.log(`Planet bounds: Max X: ${maxX}, Max Y: ${maxY}`);
    } else {
        console.log('"planet" key not found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
