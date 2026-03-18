import { initRegistries, factionRegistry, societyRegistry, governmentRegistry } from '../lib/politics/registry';
import { calculateInitialIdeology, applyIdeologyShift, getDominantIdeologyType, ideologyDistance } from '../lib/politics/ideology-service';
import { IdeologyProfile } from '../lib/politics/ideology-types';

async function testIdeologyEngine() {
    console.log("=== 📜 STAR OF DOM: IDEOLOGY ENGINE TEST ===");

    // 1. Initialize Registries
    console.log("\n[1] BOOTING JSON REGISTRIES...");
    initRegistries();

    const testFactions = ['faction-aurelian', 'faction-vektori', 'faction-covenant'];
    const factionProfiles: Record<string, IdeologyProfile> = {};

    console.log("\n[2] GENERATING INITIAL FACTION IDEOLOGIES...");
    for (const fid of testFactions) {
        const fac = factionRegistry.get(fid);
        if (!fac) {
            console.error(`FACTION NOT FOUND: ${fid}`);
            continue;
        }

        // To generate initial ideology, we need society and gov tags. 
        // We'll map the faction to its corresponding society and government we created.
        const societyId = fid.replace('faction-', '') + '_society';
        const govId = fid === 'faction-aurelian' ? 'aurelian_autocracy' :
            fid === 'faction-vektori' ? 'vektori_senate' : 'covenant_theocracy';

        const soc = societyRegistry.get(societyId);
        const gov = governmentRegistry.get(govId);

        if (!soc || !gov) {
            console.error(`MISSING SOCIETY/GOV DEFINITIONS FOR ${fid}`);
            continue;
        }

        const initialIdeology = calculateInitialIdeology(soc.tags, gov.tags);
        factionProfiles[fid] = initialIdeology;
        const domType = getDominantIdeologyType(initialIdeology);

        console.log(`\n--- ${fid.toUpperCase()} ---`);
        console.log(`Base Tags => Society: [${soc.tags.join(', ')}] | Gov: [${gov.tags.join(', ')}]`);
        console.log(`Computed Archetype: ${domType}`);
        console.log(`Axes:`, JSON.stringify(initialIdeology, null, 2));
    }

    // 3. Apply Event Drift
    console.log("\n[3] SIMULATING EVENT DRIFT...");
    const targetFaction = 'faction-aurelian';
    console.log(`Triggering massive economic collapse on ${targetFaction}... (+50 Collectivism, +20 Authoritarianism)`);

    applyIdeologyShift(factionProfiles[targetFaction], 'collectivism_individualism', 50);
    applyIdeologyShift(factionProfiles[targetFaction], 'authoritarianism_liberty', 20);

    const newDomType = getDominantIdeologyType(factionProfiles[targetFaction]);
    console.log(`New Archetype: ${newDomType}`);
    console.log(`New Axes:`, JSON.stringify(factionProfiles[targetFaction], null, 2));

    // 4. Calculate Friction/Distance
    console.log("\n[4] CALCULATING DIPLOMATIC FRICTION...");
    const distA = ideologyDistance(factionProfiles['faction-aurelian'], factionProfiles['faction-vektori']);
    const distB = ideologyDistance(factionProfiles['faction-vektori'], factionProfiles['faction-covenant']);

    console.log(`Ideological Distance (Aurelian vs Vektori): ${distA}`);
    console.log(`Ideological Distance (Vektori vs Covenant): ${distB}`);

    console.log("\n=== ✅ TEST COMPLETE ===");
}

testIdeologyEngine().catch(console.error);
