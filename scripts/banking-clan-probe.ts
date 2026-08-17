// scripts/banking-clan-probe.ts
// Do the Banking Clan's loans actually MOVE CREDITS — and does bad paper
// actually cost them?
//
// Covers sovereign lending, servicing, default, foreclosure and the cascade.
//
//   npx tsx scripts/banking-clan-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, tickFactionTraits } from '../lib/factions/traits-service';
import { ensureGovernments } from '../lib/government/government-service';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { getTechModifier } from '../lib/tech/modifiers';
import {
    CREDIT_KEY,
    INTEREST_PER_TICK,
    MIN_TERM_TICKS,
    MAX_TERM_TICKS,
    MISSED_PAYMENTS_BEFORE_DEFAULT,
    issueSovereignLoan,
    serviceLoans,
    forecloseOn,
    badDebtRatio,
    totalOutstanding,
    loansAgainst,
    creditsOf,
    bankingState,
} from '../lib/factions/banking-clan';

const BNK = 'banking_clan';
const DEBTOR = 'faction-sarrak';
const OTHER = 'faction-kaerruun';

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

const setCredits = (id: string, n: number) => { world.economy.factions.get(id).reserves[CREDIT_KEY] = n; };
const clearBook = () => { const st = bankingState(world, BNK); if (st) st.loans = {}; };

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    const tax = getTechModifier(world, BNK, 'eco_tax_mult');
    check('their whole economic identity is already live (eco_tax_mult)', tax > 1, `got ${tax.toFixed(3)}`);
    const combat = getTechModifier(world, BNK, 'combat_power_multiplier');
    check('"no native army" is already live (combat_power_multiplier)', combat < 0, `got ${combat.toFixed(3)}`);

    const bnk = code('lib/factions/banking-clan.ts');
    check('the module adds NO second copy of those pipeline modifiers',
        !/eco_tax_mult|combat_power_multiplier|credits_generation/.test(bnk));

    // Their rented strength already works: the mercenary-contract system built
    // for the Kaer'Ruun makes the Clan the natural EMPLOYER, and it already
    // defaults an employer who cannot pay. Nothing new was needed.
    check('the mercenary system already defaults an employer who cannot pay',
        /defaulted/.test(code('lib/factions/faction-traits-types.ts')));
}

// ── 2. A loan moves real credits ────────────────────────────────────────────
console.log('\n[2] Issuing');
{
    clearBook();
    setCredits(BNK, 100_000);
    setCredits(DEBTOR, 1000);

    const lenderBefore = creditsOf(world, BNK);
    const debtorBefore = creditsOf(world, DEBTOR);
    const res = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10);
    check('the Clan can write paper', res.ok === true, res.reason ?? '');
    check('the principal LEAVES the lender', creditsOf(world, BNK) === lenderBefore - 10_000,
        `${lenderBefore} -> ${creditsOf(world, BNK)}`);
    check('and ARRIVES with the borrower', creditsOf(world, DEBTOR) === debtorBefore + 10_000,
        `${debtorBefore} -> ${creditsOf(world, DEBTOR)}`);
    check('no lowercase credits key was created — the world.tributes bug',
        (world.economy.factions.get(BNK).reserves as any)['credits'] === undefined
        && (world.economy.factions.get(DEBTOR).reserves as any)['credits'] === undefined);

    const loan = res.loan!;
    check('interest is charged over the term', loan.outstanding > loan.principal,
        `${loan.principal} -> ${loan.outstanding.toFixed(0)}`);
    check('at the authored rate',
        Math.abs(loan.outstanding - loan.principal * (1 + INTEREST_PER_TICK * 10)) < 1e-6);
    check('the book knows about it', loansAgainst(world, BNK, DEBTOR).length === 1);

    // Guards.
    check('nobody else writes sovereign paper',
        issueSovereignLoan(world, OTHER, DEBTOR, 1000, 10).ok === false);
    check('the Clan does not lend to itself',
        issueSovereignLoan(world, BNK, BNK, 1000, 10).ok === false);
    setCredits(BNK, 100);
    check('it cannot advance what it does not hold',
        issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).ok === false);
    setCredits(BNK, 100_000);
    const clamped = issueSovereignLoan(world, BNK, OTHER, 1000, 9999).loan!;
    check('the term is clamped to the authored band',
        (clamped.dueAtSeconds - clamped.issuedAtSeconds) / (6 * 60 * 60) <= MAX_TERM_TICKS
        && MIN_TERM_TICKS > 0);
}

// ── 3. Servicing ────────────────────────────────────────────────────────────
console.log('\n[3] Servicing');
{
    clearBook();
    setCredits(BNK, 100_000);
    setCredits(DEBTOR, 100_000);
    const loan = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;

    const lenderBefore = creditsOf(world, BNK);
    const r = serviceLoans(world, BNK);
    check('a solvent borrower pays', r.collected > 0, `collected ${r.collected.toFixed(0)}`);
    check('and the money reaches the Clan', creditsOf(world, BNK) === lenderBefore + r.collected);
    check('the balance falls', loan.outstanding < loan.principal * (1 + INTEREST_PER_TICK * 10));
    check('no default while they are paying', loan.missedPayments === 0 && loan.status === 'active');

    // Paid to term.
    for (let i = 0; i < 20; i++) serviceLoans(world, BNK);
    check('a loan paid to term is marked repaid', loan.status === 'repaid', `got ${loan.status}`);
    check('and the Clan collected MORE than it lent — this is the whole business',
        loan.collected > loan.principal, `lent ${loan.principal}, collected ${loan.collected.toFixed(0)}`);
    check('the repaid loan leaves the outstanding book', totalOutstanding(world, BNK) === 0);
}

// ── 4. Default ──────────────────────────────────────────────────────────────
console.log('\n[4] Default');
{
    clearBook();
    setCredits(BNK, 100_000);
    setCredits(DEBTOR, 100_000);
    const loan = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;

    setCredits(DEBTOR, 0);   // the war went badly
    for (let i = 0; i < MISSED_PAYMENTS_BEFORE_DEFAULT - 1; i++) serviceLoans(world, BNK);
    check('missed payments are counted', loan.missedPayments === MISSED_PAYMENTS_BEFORE_DEFAULT - 1,
        `got ${loan.missedPayments}`);
    check('but the loan is not called early', loan.status === 'active');

    serviceLoans(world, BNK);
    check('the loan is called after the authored number of misses', loan.status === 'defaulted');

    // The deliberate design call: debt does NOT compound. A balance that grew
    // while a player was losing would make one bad loan unrecoverable rather
    // than expensive.
    const owed = loan.outstanding;
    serviceLoans(world, BNK);
    check('a defaulted balance does not keep growing', loan.outstanding === owed,
        `${owed.toFixed(0)} -> ${loan.outstanding.toFixed(0)}`);
    check('a debtor with no credits is never driven negative', creditsOf(world, DEBTOR) >= 0,
        `got ${creditsOf(world, DEBTOR)}`);

    // A full payment resets the counter — recovery must be possible.
    clearBook();
    setCredits(DEBTOR, 100_000);
    const l2 = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;
    setCredits(DEBTOR, 0);
    serviceLoans(world, BNK);
    check('a miss is recorded', l2.missedPayments === 1);
    setCredits(DEBTOR, 100_000);
    serviceLoans(world, BNK);
    check('and paying clears the counter — a debtor can recover', l2.missedPayments === 0);
}

// ── 5. Foreclosure ──────────────────────────────────────────────────────────
console.log('\n[5] Foreclosure');
{
    clearBook();
    setCredits(BNK, 100_000);
    setCredits(DEBTOR, 100_000);
    const loan = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;

    check('a performing loan cannot be foreclosed', forecloseOn(world, BNK, loan.id).ok === false);

    setCredits(DEBTOR, 0);
    for (let i = 0; i < MISSED_PAYMENTS_BEFORE_DEFAULT; i++) serviceLoans(world, BNK);
    check('precondition: the loan is in default', loan.status === 'defaulted');

    // Currency fallback: most factions never found a company, so without this
    // the mechanic would be dead against nearly the whole galaxy.
    setCredits(DEBTOR, 50_000);
    const lenderBefore = creditsOf(world, BNK);
    const res = forecloseOn(world, BNK, loan.id);
    check('the Clan collects', res.ok === true, res.reason ?? '');
    check('and the vault is lighter', creditsOf(world, DEBTOR) < 50_000);
    check('by exactly what the Clan gained',
        creditsOf(world, BNK) === lenderBefore + (res.creditsSeized ?? 0));
    check('the instrument is closed', loan.status === 'foreclosed');
    check('and cannot be collected twice', forecloseOn(world, BNK, loan.id).ok === false);
    check('nobody else forecloses', forecloseOn(world, OTHER, loan.id).ok === false);
    check('an unknown instrument is refused', forecloseOn(world, BNK, 'loan-nonexistent').ok === false);

    // The charter path is preferred when the debtor actually holds shares —
    // "territory arrives by foreclosure".
    const bnkSrc = code('lib/factions/banking-clan.ts');
    check('foreclosure prefers a charter over cash',
        bnkSrc.indexOf('shareholders') < bnkSrc.indexOf('transferCredits(world, debtor, lenderId, owed)'));
}

// ── 6. The default cascade ──────────────────────────────────────────────────
console.log('\n[6] Default cascade — "a default cascade can unmake it"');
{
    clearBook();
    setCredits(BNK, 500_000);
    setCredits(DEBTOR, 500_000);
    check('a clean book is no burden', badDebtRatio(world, BNK) === 0);
    const cleanMods = getGovernmentModifiers(world, BNK) as any;

    const good = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;
    check('a performing loan is still not bad debt', badDebtRatio(world, BNK) === 0);

    const bad = issueSovereignLoan(world, BNK, OTHER, 10_000, 10).loan!;
    setCredits(OTHER, 0);
    for (let i = 0; i < MISSED_PAYMENTS_BEFORE_DEFAULT; i++) serviceLoans(world, BNK);
    check('a default shows up in the ratio', badDebtRatio(world, BNK) > 0,
        `got ${badDebtRatio(world, BNK).toFixed(2)}`);
    check('but not the whole book — the good paper still counts',
        badDebtRatio(world, BNK) < 1, `got ${badDebtRatio(world, BNK).toFixed(2)} with ${good.status} paper alongside`);

    const strainedMods = getGovernmentModifiers(world, BNK) as any;
    check('bad paper costs them tax income', strainedMods.tax_income < cleanMods.tax_income,
        `${cleanMods.tax_income.toFixed(3)} -> ${strainedMods.tax_income.toFixed(3)}`);
    check('and approval', strainedMods.approval < cleanMods.approval);
    check('the source is composed into getGovernmentModifiers',
        /getCascadeModifiers\(world, factionId\)/.test(code('lib/government/modifiers.ts')));

    const otherBefore = (getGovernmentModifiers(world, DEBTOR) as any).tax_income;
    check('no other empire carries a cascade', (getGovernmentModifiers(world, DEBTOR) as any).tax_income === otherBefore
        && badDebtRatio(world, DEBTOR) === 0);

    // Foreclosing clears the bad paper — the Clan's answer to its own weakness.
    forecloseOn(world, BNK, bad.id);
    check('collecting on a default clears it from the book', badDebtRatio(world, BNK) === 0);
}

// ── 7. Persistence, wiring and layering ─────────────────────────────────────
console.log('\n[7] Persistence, wiring and layering');
{
    clearBook();
    setCredits(BNK, 100_000);
    setCredits(DEBTOR, 100_000);
    const loan = issueSovereignLoan(world, BNK, DEBTOR, 10_000, 10).loan!;
    tickFactionTraits(world);
    check('the tick services the book', loan.outstanding < loan.principal * (1 + INTEREST_PER_TICK * 10));

    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    const restored = bankingState(round, BNK);
    check('the loan book survives a save/load round trip', !!restored && !!restored.loans[loan.id]);
    check('and the balance came back intact — a plain Record, not a nested Map',
        Math.abs((restored!.loans[loan.id]?.outstanding ?? -1) - loan.outstanding) < 1e-6);
    check('so servicing continues after a reload', serviceLoans(round, BNK).collected > 0);

    check('both orders are registered, so they are not silently dropped',
        /BNK_ISSUE_LOAN/.test(code('lib/actions/registry.ts')) && /BNK_FORECLOSE/.test(code('lib/actions/registry.ts'))
        && /BNK_ISSUE_LOAN/.test(code('lib/actions/types.ts')) && /BNK_FORECLOSE/.test(code('lib/actions/types.ts')));
    check('and both have worker handlers',
        /case 'BNK_ISSUE_LOAN'/.test(code('scripts/game-loop.ts')) && /case 'BNK_FORECLOSE'/.test(code('scripts/game-loop.ts')));

    const imports = [...code('lib/factions/banking-clan.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('banking-clan.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
    clearBook();
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Banking Clan mechanics are live\n`);
process.exit(failures ? 1 : 0);
