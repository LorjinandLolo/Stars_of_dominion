// scripts/faction-voices-probe.ts
// Does every faction have its own leader, or are they all the Senate?
//
// FACTION_SPEAKERS was keyed by names that were never the world's faction ids
// ('kaer_ruun_hunt' vs 'faction-kaerruun'), so getFactionSpeaker fell through to
// the generic Imperial Senate chancellor for 12 of the 14 factions. Every
// player's leader spoke in the same borrowed voice, and nothing said so —
// the fallback is a legitimate branch, so there was no error to notice.
//
// The fallback itself has since changed. An id nobody authored resolves to the
// voice of its civilization (a breakaway sounds like its parent), or failing
// that to a generic envoy picked deterministically from the id — never to the
// Senate, who is a bloc inside the player's own empire and no foreign voice.
//
//   npx tsx scripts/faction-voices-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import {
    FACTION_SPEAKERS,
    GENERIC_ENVOYS,
    BLOC_SPEAKER_ALIASES,
    getFactionSpeaker,
    getFactionSpeakerForCivilization,
    isBlocId,
} from '../lib/ai/faction-personalities';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
function fail(factionId: string, why: string) {
    failures++;
    console.log(`  FAIL  ${factionId}: ${why}`);
}

const world = getGameWorldState();
const factions = [...world.economy.factions.values()];
const senate = FACTION_SPEAKERS['senate'];
const genericNames = new Set(GENERIC_ENVOYS.map(e => e.name));

console.log(`\n=== every faction speaks for itself (${factions.length} factions) ===`);
console.log('faction'.padEnd(24), 'speaker'.padEnd(28), 'civilization'.padEnd(18), 'title');
for (const f of factions) {
    const speaker = getFactionSpeaker(f.id, f.civilizationId);
    const own = !!FACTION_SPEAKERS[f.id];
    if (!own) fail(f.id, 'has no entry in FACTION_SPEAKERS');
    else if (speaker.id === senate.id) fail(f.id, 'resolves to the generic Senate chancellor');
    else if (speaker.factionId !== f.id) fail(f.id, `entry declares factionId "${speaker.factionId}"`);
    else if (speaker.civilizationId !== f.civilizationId) {
        fail(f.id, `entry declares civilizationId "${speaker.civilizationId}", the world says "${f.civilizationId}"`);
    }
    console.log(f.id.padEnd(24), String(speaker.name).padEnd(28), String(speaker.civilizationId ?? '—').padEnd(18), speaker.title);
}
const names = new Map<string, string>();
for (const f of factions) {
    const name = getFactionSpeaker(f.id, f.civilizationId).name;
    const clash = names.get(name);
    if (clash) fail(f.id, `shares its speaker "${name}" with ${clash}`);
    names.set(name, f.id);
}
check(`${factions.length} factions, ${names.size} distinct voices`, names.size === factions.length);

console.log(`\n=== the roster ===`);
const entries = Object.values(FACTION_SPEAKERS);
const blocs = entries.filter(s => !s.civilizationId && s.factionId !== 'pirates');
const empires = entries.filter(s => !!s.civilizationId);
console.log(`  blocs (${blocs.length}):`);
for (const s of blocs) console.log(`    ${s.factionId.padEnd(22)} ${s.name}`);
console.log(`  empires (${empires.length}):`);
for (const s of empires) console.log(`    ${s.factionId.padEnd(22)} ${String(s.name).padEnd(28)} ${s.civilizationId}`);
console.log(`  pirates: ${FACTION_SPEAKERS['pirates']?.name ?? 'MISSING'}`);
console.log(`  generic envoys (${GENERIC_ENVOYS.length}):`);
for (const e of GENERIC_ENVOYS) console.log(`    ${e.id.padEnd(22)} ${e.name}`);
check('every empire speaker is reachable by its civilization',
    empires.every(s => getFactionSpeakerForCivilization(s.civilizationId!) === s));
check('the generic pool has enough faces that neighbours rarely share one', GENERIC_ENVOYS.length >= 5);

console.log(`\n=== the fallback chain for non-factions ===`);
const stranger = getFactionSpeaker('not-a-faction');
check('an unknown id no longer falls back to the Senate', stranger.id !== senate.id);
check('an unknown id gets a generic envoy', genericNames.has(stranger.name), `got "${stranger.name}"`);
check('the envoy is stamped with the id it answers for', stranger.factionId === 'not-a-faction');
check('and titled after it', stranger.title === 'Envoy of Not A', `got "${stranger.title}"`);
check('the same id always gets the same envoy object',
    getFactionSpeaker('not-a-faction') === stranger);
// The civilization step is opt-in: discourse.ts passes civilizationId only for
// a true successor state (parent empire gone), so a rebel is never voiced by
// the ruler it fights. Here we only assert the mechanism.
check("a successor state offered its civilization borrows that voice",
    getFactionSpeaker('faction-sarrak-breakaway-1', 'civ-sarrak') === FACTION_SPEAKERS['faction-sarrak']);
check("a rebel NOT offered a civilization gets a generic envoy, not its parent's ruler",
    genericNames.has(getFactionSpeaker('faction-sarrak-rebels-1').name));
check('an unknown civilization still yields a generic envoy, not the Senate',
    genericNames.has(getFactionSpeaker('rebel-9', 'civ-nobody').name));
check('a pirate id routes to the pirate voice',
    getFactionSpeaker('pirate-band-3').factionId === 'pirates');
check('the Nullward Syndicate is NOT treated as a pirate band',
    getFactionSpeaker('faction-null-syndicate').factionId === 'faction-null-syndicate');
check('the Senate answers only for "senate"', getFactionSpeaker('senate') === senate);
check("the Senate's voice is never lent to a foreign id",
    ['breakaway-xyz', 'faction-ghost', 'civ-unknown-rebels'].every(id => getFactionSpeaker(id).id !== senate.id));

console.log(`\n=== every seeded bloc has a domestic voice ===`);
// data/blocs is what posture-bootstrap seeds into every empire; the authored
// bloc speakers were keyed by other names, so six of nine blocs used to fall
// through to a foreign envoy ("Envoy of Science").
{
    const blocDir = path.resolve(process.cwd(), 'data/blocs');
    const blocIds = fs.readdirSync(blocDir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(blocDir, f), 'utf-8')).id as string);
    for (const id of blocIds) {
        const s = getFactionSpeaker(id);
        const target = BLOC_SPEAKER_ALIASES[id] ?? id;
        check(`bloc "${id}" is classified as a bloc`, isBlocId(id));
        check(`bloc "${id}" speaks with an authored domestic voice (${s.name})`,
            !genericNames.has(s.name) && s.id !== senate.id && s.factionId === target && !s.civilizationId);
    }
    check('"constructor" is not a speaker', genericNames.has(getFactionSpeaker('constructor').name));
}

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

console.log(`\n=== every voice has enough to say ===`);
// The terminal opens with greetings[0] and the prose layer samples the rest;
// a profile with one line of each repeats itself within two exchanges.
let thinProfiles = 0;
for (const s of [...entries, ...GENERIC_ENVOYS]) {
    const thin: string[] = [];
    if (s.greetings.length < 2) thin.push(`${s.greetings.length} greeting(s)`);
    if (s.samplePhrases.length < 2) thin.push(`${s.samplePhrases.length} sample phrase(s)`);
    if (s.verbalTics.length < 3) thin.push(`${s.verbalTics.length} verbal tic(s)`);
    if (thin.length) { thinProfiles++; fail(`${s.factionId}/${s.id}`, thin.join(', ')); }
}
check(`${entries.length + GENERIC_ENVOYS.length} profiles carry ≥2 greetings, ≥2 sample phrases, ≥3 verbal tics`, thinProfiles === 0);

console.log(`\n=== the UI resolves the same way the server does ===`);
{
    const src = fs.readFileSync(path.resolve(process.cwd(), 'components/panels/DiscoursePanel.tsx'), 'utf-8');
    check('DiscoursePanel uses getFactionSpeaker', /getFactionSpeaker\(activeFactionId\b/.test(src));
    check('DiscoursePanel no longer indexes FACTION_SPEAKERS directly',
        !/FACTION_SPEAKERS\[/.test(src));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ every faction has its own voice\n`);
process.exit(failures ? 1 : 0);
