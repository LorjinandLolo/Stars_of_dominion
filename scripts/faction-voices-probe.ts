// scripts/faction-voices-probe.ts
// Does every faction have its own leader, or are they all the Senate?
//
// FACTION_SPEAKERS was keyed by names that were never the world's faction ids
// ('kaer_ruun_hunt' vs 'faction-kaerruun'), so getFactionSpeaker fell through to
// the generic Imperial Senate chancellor for 12 of the 14 factions. Every
// player's leader spoke in the same borrowed voice, and nothing said so —
// the fallback is a legitimate branch, so there was no error to notice.
//
//   npx tsx scripts/faction-voices-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { FACTION_SPEAKERS, getFactionSpeaker } from '../lib/ai/faction-personalities';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};

const world = getGameWorldState();
const factions = [...world.economy.factions.values()];
const fallback = FACTION_SPEAKERS['senate'];

console.log(`\n=== every faction speaks for itself (${factions.length} factions) ===`);
console.log('faction'.padEnd(24), 'speaker'.padEnd(28), 'title');
for (const f of factions) {
    const speaker = getFactionSpeaker(f.id);
    const own = !!FACTION_SPEAKERS[f.id];
    if (!own) fail(f.id, 'has no entry in FACTION_SPEAKERS');
    else if (speaker.id === fallback.id) fail(f.id, 'resolves to the generic Senate chancellor');
    else if (speaker.factionId !== f.id) fail(f.id, `entry declares factionId "${speaker.factionId}"`);
    console.log(f.id.padEnd(24), String(speaker.name).padEnd(28), speaker.title);
}
function fail(factionId: string, why: string) {
    failures++;
    console.log(`  FAIL  ${factionId}: ${why}`);
}

console.log(`\n=== the fallback still works for non-factions ===`);
check('an unknown id falls back to the Senate', getFactionSpeaker('not-a-faction').id === fallback.id);
check('a pirate id routes to the pirate voice',
    getFactionSpeaker('pirate-band-3').factionId === 'pirates');
check('the Nullward Syndicate is NOT treated as a pirate band',
    getFactionSpeaker('faction-null-syndicate').factionId === 'faction-null-syndicate');

console.log(`\n=== no stale keys left behind ===`);
const RETIRED = [
    'rhimetal_sovereignty', 'gabagoonian_republic', 'infernoid_crusade', 'movanite_stampede',
    'leopantheri_harmonate', 'buthari_council', 'sarrak_legion', 'kaer_ruun_hunt',
];
for (const key of RETIRED) {
    check(`"${key}" no longer keys a speaker`, !FACTION_SPEAKERS[key]);
}
for (const [key, profile] of Object.entries(FACTION_SPEAKERS)) {
    if (profile.factionId !== key) {
        failures++;
        console.log(`  FAIL  entry "${key}" declares factionId "${profile.factionId}" — they must match`);
    }
}
console.log(`  ${Object.keys(FACTION_SPEAKERS).length} speakers, every key matching its own factionId`);

console.log(`\n=== the UI resolves the same way the server does ===`);
{
    const src = fs.readFileSync(path.resolve(process.cwd(), 'components/panels/DiscoursePanel.tsx'), 'utf-8');
    check('DiscoursePanel uses getFactionSpeaker', /getFactionSpeaker\(activeFactionId\)/.test(src));
    check('DiscoursePanel no longer indexes FACTION_SPEAKERS directly',
        !/FACTION_SPEAKERS\[/.test(src));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ every faction has its own voice\n`);
process.exit(failures ? 1 : 0);
