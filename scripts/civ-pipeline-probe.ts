// scripts/civ-pipeline-probe.ts
// Does a civilization actually change the numbers, or is it still decoration?
//
// CivilizationDefinition.baseModifiers and IdeologyDefinition.modifiers were
// authored in full and read by nothing: ModifierEngine, the only machinery typed
// to consume them, has zero call sites. This probe asserts the new path is live
// end to end — authored bundle -> translation -> the two accessors every
// gameplay system already calls.
//
//   npx tsx scripts/civ-pipeline-probe.ts
//
// Needs no database and no worker. Exits non-zero on any regression.

import { CivilizationRegistry } from '../lib/civilization/registry';
import {
    CIV_MODIFIER_MAP,
    UNCONSUMED_KEYS,
    getCivilizationModifiers,
    validateCivilizationModifierKeys,
} from '../lib/civilization/modifiers';
import { getTechModifier, getResearchedModifiers } from '../lib/tech/modifiers';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Minimal world carrying just an identity — no tech, no research. */
function worldWith(civilizationId?: string, ideologyId?: string): any {
    return {
        economy: { factions: new Map([['f1', { id: 'f1', civilizationId, ideologyId }]]) },
        tech: new Map(),
    };
}

console.log('\n[1] the authored data reaches the translation layer');
{
    // civ-auraxian: trade_value 0.4, market_efficiency 0.2, credits_generation 0.3
    // all three route to eco_tax_mult, so they must SUM.
    const aurax = CivilizationRegistry.getCivilization('civ-auraxian');
    check('civ-auraxian is authored', !!aurax);
    const mods = getCivilizationModifiers(worldWith('civ-auraxian'), 'f1', 'tech');
    const expected = (aurax!.baseModifiers.trade_value ?? 0)
        + (aurax!.baseModifiers.market_efficiency ?? 0)
        + (aurax!.baseModifiers.credits_generation ?? 0);
    check(`three revenue keys sum into eco_tax_mult (${expected})`,
        near(mods.eco_tax_mult ?? 0, expected), `got ${mods.eco_tax_mult}`);
}

console.log('\n[2] civilization and ideology stack');
{
    // ideo-capitalist adds trade_value 0.2 + market_efficiency 0.15 + credits 0.1
    const civOnly = getCivilizationModifiers(worldWith('civ-auraxian'), 'f1', 'tech').eco_tax_mult ?? 0;
    const both = getCivilizationModifiers(worldWith('civ-auraxian', 'ideo-capitalist'), 'f1', 'tech').eco_tax_mult ?? 0;
    check('adding an ideology increases the same key', both > civOnly, `${civOnly} -> ${both}`);
    check('stacking is additive, not overwriting', near(both - civOnly, 0.2 + 0.15 + 0.1), `delta ${both - civOnly}`);
}

console.log('\n[3] inverted keys are inverted');
{
    // ideo-technocratic: energy_efficiency +0.2 must LOWER upkeep.
    const mods = getCivilizationModifiers(worldWith(undefined, 'ideo-technocratic'), 'f1', 'tech');
    check('energy_efficiency lowers eco_upkeep_mult', (mods.eco_upkeep_mult ?? 0) < 0, `got ${mods.eco_upkeep_mult}`);
    // ideo-theocratic: rebellion_chance -0.2 (a reduction) must RAISE approval.
    const gov = getCivilizationModifiers(worldWith(undefined, 'ideo-theocratic'), 'f1', 'government');
    check('less rebellion raises approval', (gov.approval ?? 0) > 0, `got ${gov.approval}`);
    // ideo-anarchic: espionage_detection_evasion +0.2 must LOWER the exposure roll.
    const esp = getCivilizationModifiers(worldWith(undefined, 'ideo-anarchic'), 'f1', 'tech');
    check('evasion lowers esp_exposure_mult', (esp.esp_exposure_mult ?? 0) < 0, `got ${esp.esp_exposure_mult}`);
}

console.log('\n[4] getTechModifier — the accessor every system already calls');
{
    const plain = worldWith();
    const identity = worldWith('civ-auraxian', 'ideo-capitalist');

    check("baseline still 1 for an unset 'mult' key", getTechModifier(plain, 'f1', 'eco_tax_mult') === 1);
    check("baseline still 0 for an unset 'add' key", getTechModifier(plain, 'f1', 'combat_power_multiplier') === 0);

    const taxed = getTechModifier(identity, 'f1', 'eco_tax_mult');
    check('a trade civilization now taxes better than a blank one',
        taxed > 1, `got ${taxed}`);
    check('mult composition is base * (1 + delta)', near(taxed, 1 * (1 + 0.9 + 0.45)), `got ${taxed}`);

    // civ-grakkar: combat_strength 0.25 -> combat_power_multiplier, an 'add' key.
    const grak = getTechModifier(worldWith('civ-grakkar'), 'f1', 'combat_power_multiplier');
    check('add composition is base + delta',
        near(grak, CivilizationRegistry.getCivilization('civ-grakkar')!.baseModifiers.combat_strength ?? 0),
        `got ${grak}`);

    // Researched modifiers must still compose with identity, not be replaced.
    const withTech: any = worldWith('civ-auraxian');
    withTech.tech = new Map([['f1', { globalModifiers: { eco_tax_mult: 2 } }]]);
    check('researched value survives and composes',
        near(getTechModifier(withTech, 'f1', 'eco_tax_mult'), 2 * (1 + 0.9)),
        `got ${getTechModifier(withTech, 'f1', 'eco_tax_mult')}`);
    check('getResearchedModifiers still returns the un-composed value',
        getResearchedModifiers(withTech, 'f1').eco_tax_mult === 2);
}

console.log('\n[5] unknown identity degrades to today\'s behaviour');
{
    const ghost = worldWith('civ-does-not-exist', 'ideo-does-not-exist');
    check('unknown civ contributes nothing', getTechModifier(ghost, 'f1', 'eco_tax_mult') === 1);
    check('no faction at all contributes nothing', getTechModifier(worldWith(), 'nobody', 'eco_tax_mult') === 1);
    check('a bare { tech } stub still works', getTechModifier({ tech: new Map() }, 'f1', 'eco_tax_mult') === 1);
}

console.log('\n[6] audit — what is still decoration');
{
    const audit = validateCivilizationModifierKeys();
    check('no unrecognised authored keys', audit.unknown.length === 0,
        audit.unknown.map(u => `${u.source}.${u.key}`).join(', '));
    const mapped = Object.keys(CIV_MODIFIER_MAP).length;
    console.log(`  ${mapped} authored keys now route to a live consumer`);
    console.log(`  ${UNCONSUMED_KEYS.size} knowingly decorative: ${[...UNCONSUMED_KEYS].join(', ')}`);
    if (audit.decorative.length) {
        const bySource = new Map<string, string[]>();
        for (const d of audit.decorative) {
            if (!bySource.has(d.source)) bySource.set(d.source, []);
            bySource.get(d.source)!.push(d.key);
        }
        for (const [source, keys] of bySource) console.log(`    ${source}: ${keys.join(', ')}`);
    }
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ civilization identity is live\n`);
process.exit(failures ? 1 : 0);
