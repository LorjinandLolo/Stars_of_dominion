// scripts/saga-probe.ts
// Does the faction saga actually SHOW what the mechanics are DOING — and does
// it stay honest when the state changes underneath it?
//
// Drives buildFactionSaga for all fourteen factions, manipulating live state
// through the same paths the game uses, and asserts the view model tracks it.
//
//   npx tsx scripts/saga-probe.ts
//
// No database, no worker, no DOM. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureFactionTraits } from '../lib/factions/traits-service';
import { ensureGovernments } from '../lib/government/government-service';
import { buildFactionSaga } from '../lib/factions/saga';
import { administerSerum } from '../lib/factions/sarrak';
import { capacolaSurge, CAPACOLA_KEY } from '../lib/factions/gabagoon';
import { issueSovereignLoan, serviceLoans, CREDIT_KEY, MISSED_PAYMENTS_BEFORE_DEFAULT } from '../lib/factions/banking-clan';
import { grievanceStore } from '../lib/factions/civ-ids';
import { recordGrievance } from '../lib/factions/buthari';
import { ReputationService } from '../lib/reputation/reputation-service';
import { BLOODMOON_CYCLE_SECONDS, BLOODMOON_CEASEFIRE_SECONDS } from '../lib/factions/kaerruun';
import { BIOMASS_KEY } from '../lib/factions/nexulan';

const ALL_FACTIONS = [
    'faction-aurelian', 'faction-vektori', 'faction-null-syndicate', 'faction-covenant',
    'nexulan_convergence', 'banking_clan', 'faction-rhimetals', 'faction-gabagoonians',
    'faction-infernoids', 'faction-movanites', 'faction-leopantheri', 'faction-buthari',
    'faction-sarrak', 'faction-kaerruun',
];

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const world: any = getGameWorldState();
ensureFactionTraits(world);
ensureGovernments(world);
world.nowSeconds = 7_000_000;

const status = (factionId: string, id: string) =>
    buildFactionSaga(world, factionId).statuses.find(s => s.id === id);

// ── 1. Coverage ─────────────────────────────────────────────────────────────
console.log('\n[1] Every faction gets a saga');
{
    for (const id of ALL_FACTIONS) {
        const saga = buildFactionSaga(world, id);
        check(`${id} builds without throwing`, !!saga && saga.factionId === id);
    }
    // All ten authored civilizations must surface SOMETHING; the founding four
    // are honestly plain rather than pretending.
    const bespoke = ALL_FACTIONS.filter(id => buildFactionSaga(world, id).hasBespokeMechanics);
    check('all ten authored factions surface bespoke mechanics', bespoke.length === 10,
        `got ${bespoke.length}: ${bespoke.join(', ')}`);
    check('the founding four are honestly plain',
        !buildFactionSaga(world, 'faction-aurelian').hasBespokeMechanics);
    check('an unknown faction is a plain empty saga, not a crash',
        buildFactionSaga(world, 'faction-nonexistent').hasBespokeMechanics === false);
}

// ── 2. The saga tracks LIVE state, not a snapshot ───────────────────────────
console.log('\n[2] Live state is live');
{
    // Sarrak serum: dormant -> active through the real order path.
    check('clean legions read dormant', status('faction-sarrak', 'serum')?.tone === 'dormant');
    administerSerum(world, 'faction-sarrak');
    check('a dose flips the gauge the same tick', status('faction-sarrak', 'serum')?.tone === 'active',
        `got ${status('faction-sarrak', 'serum')?.tone}`);

    // Gabagoon surge through the real consumption path.
    world.economy.factions.get('faction-gabagoonians').reserves[CAPACOLA_KEY] = 5000;
    check('an unfed Gabagoonian is dormant', status('faction-gabagoonians', 'capacola')?.tone === 'dormant');
    capacolaSurge(world, 'faction-gabagoonians', 800);
    const surge = status('faction-gabagoonians', 'capacola');
    check('eating shows up as surging', surge?.tone === 'active' && /SURGING/.test(surge?.value ?? ''));
    check('and the serving size is on the gauge', /100%/.test(surge?.value ?? ''), surge?.value);

    // Banking book through the real lending path.
    world.economy.factions.get('banking_clan').reserves[CREDIT_KEY] = 100_000;
    check('an idle Clan shows no paper', status('banking_clan', 'book')?.tone === 'dormant');
    issueSovereignLoan(world, 'banking_clan', 'faction-sarrak', 10_000, 10);
    check('writing a loan fills the book', status('banking_clan', 'book')?.tone === 'active');
    world.economy.factions.get('faction-sarrak').reserves[CREDIT_KEY] = 0;
    for (let i = 0; i < MISSED_PAYMENTS_BEFORE_DEFAULT; i++) serviceLoans(world, 'banking_clan');
    check('a default turns the cascade gauge amber', status('banking_clan', 'cascade')?.tone === 'warning');

    // Grievances through the real writer.
    const bt = grievanceStore(world, 'faction-buthari')!;
    for (const k of Object.keys(bt)) delete bt[k];
    check('no grievances reads dormant', status('faction-buthari', 'grievances')?.tone === 'dormant');
    recordGrievance(world, 'faction-buthari', 'faction-kaerruun', 'attacked');
    const g = status('faction-buthari', 'grievances');
    check('being wronged shows the wrongdoer BY NAME', g?.tone === 'active' && /kaerruun/.test(g?.value ?? ''), g?.value);

    // Honour tracks the reputation ledger.
    ReputationService.getReputation(world, 'faction-leopantheri').scores.honor = 90;
    check('high honour reads as strength', status('faction-leopantheri', 'honor')?.tone === 'active');
    ReputationService.getReputation(world, 'faction-leopantheri').scores.honor = 10;
    check('ruined honour reads as warning', status('faction-leopantheri', 'honor')?.tone === 'warning');

    // Nexulan cores track the reserve.
    world.economy.factions.get('nexulan_convergence').reserves[BIOMASS_KEY] = 5000;
    check('fed cores read active', status('nexulan_convergence', 'cores')?.tone === 'active');
    world.economy.factions.get('nexulan_convergence').reserves[BIOMASS_KEY] = 0;
    const cores = status('nexulan_convergence', 'cores');
    check('an empty pantry reads FAILING', cores?.tone === 'warning' && /FAILING/.test(cores?.value ?? ''));

    // Bloodmoon window derives from the clock.
    world.nowSeconds = Math.floor(world.nowSeconds / BLOODMOON_CYCLE_SECONDS + 1) * BLOODMOON_CYCLE_SECONDS + 1;
    const moon = status('faction-kaerruun', 'bloodmoon');
    check('inside the Bloodmoon the saga says so, with turns remaining',
        moon?.tone === 'warning' && /remain/.test(moon?.value ?? ''), moon?.value);
    world.nowSeconds += BLOODMOON_CEASEFIRE_SECONDS + 1;
    check('and it closes when the moon sets', status('faction-kaerruun', 'bloodmoon')?.tone === 'dormant');
}

// ── 3. The ledger renders only what has happened ────────────────────────────
console.log('\n[3] The saga records deeds, not zeroes');
{
    const sarrak = buildFactionSaga(world, 'faction-sarrak');
    check('the dose just administered is in the ledger',
        sarrak.records.some(r => r.id === 'doses' && r.value > 0));
    const clan = buildFactionSaga(world, 'banking_clan');
    check('the loan just written is in the ledger',
        clan.records.some(r => r.id === 'loans' && r.value > 0));
    check('a defaulted debtor shows in the Clan defaults',
        clan.records.some(r => r.id === 'defaults' && r.value > 0));
    check('what has never happened is NOT rendered as a zero row',
        !clan.records.some(r => r.value === 0));
}

// ── 4. Honesty and layering ─────────────────────────────────────────────────
console.log('\n[4] Honesty and layering');
{
    // The panel must not re-derive game arithmetic — every live number comes
    // through the same reader the engine uses. Asserted structurally: saga.ts
    // imports the faction modules' readers; the panel imports ONLY the store.
    const panel = code('components/panels/FactionPanel.tsx');
    check('the panel imports no faction module — it cannot disagree with the worker',
        !/from '@\/lib\/factions\/(?!saga)/.test(panel));
    check('the panel does no game arithmetic', !/nowSeconds|TICK_SECONDS|getMetric/.test(panel));

    const saga = code('lib/factions/saga.ts');
    check('the saga derives through the engine readers, not private copies',
        /isInBloodmoonCeasefire/.test(saga) && /hiveCoherence/.test(saga)
        && /isDosed/.test(saga) && /badDebtRatio/.test(saga) && /orderBudget/.test(saga));

    // Wiring: store field, sync push, tab, panel registration.
    check('useGameSync builds the saga each push',
        /buildFactionSaga\(world, activeFactionId\)/.test(code('hooks/useGameSync.ts')));
    check('the store carries it', /factionSaga/.test(code('lib/store/ui-store.ts')));
    check('the tab exists', /'saga'/.test(code('types/ui-state.ts')) && /tab: 'saga'/.test(code('components/shell/dockConfig.tsx')));
    check('the shell renders it', /saga: <FactionPanel \/>/.test(code('components/shell/GameShell.tsx')));

    // Serializable: it crosses a worker boundary inside useGameSync's world and
    // lands in a zustand store — a Map or function would rot silently.
    const s = buildFactionSaga(world, 'faction-kaerruun');
    check('the view model is plain JSON', JSON.parse(JSON.stringify(s)).statuses.length === s.statuses.length);
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ The saga is live\n`);
process.exit(failures ? 1 : 0);
