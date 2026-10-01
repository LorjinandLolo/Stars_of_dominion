/**
 * lib/economy/corporate/mission-services.ts
 * What a company does for the state that chartered it.
 *
 * WORKER-SIDE. Called once per strategic tick from lib/time/tick-processor.ts.
 *
 * A mission used to be a revenue multiplier and a list of buildings, so the
 * only reason to pick one over another was the number next to it. Each mission
 * now renders the state a different service, in kind, from the works the
 * company actually has standing — which makes the choice of mission a choice of
 * strategy, and makes a raided outpost or a disloyal board cost the state
 * something it can see.
 *
 * The service stops the moment the company stops serving: rogue, revoked, or
 * loyal to somebody else (`servesTheState`). Nothing here is a bonus the state
 * can rely on; it is a relationship.
 */

import type { GameWorldState } from '../../game-world-state';
import { fireNotification } from '../../time/notification-hooks';
import { getGovernment } from '../../government/government-service';
import { canSeeSystem, colonizePlanet } from '../../exploration/colonize-service';
import type { CharteredCompany } from './company-types';
import type { CorporateAssetType } from './charter-types';
import { ensureCorporateState } from './company-registry';
import { activeAssets, creditLineAvailable, pushCompanyEvent, servesTheState } from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

const TICK_SECONDS = 6 * 3600;

/** Metals per working mining outpost per tick (mining charters). */
const METALS_PER_OUTPOST = 6;
/** Rares and chemicals per working outpost per tick (extraction charters). */
const RARES_PER_OUTPOST = 2;
const CHEMICALS_PER_OUTPOST = 3;
/** Political capital per working trade station per tick, and the ceiling. */
const CAPITAL_PER_STATION = 0.15;
const CAPITAL_PER_TICK_CAP = 1;
/** Fleet strength restored per tick at a system with a working depot. */
const DEPOT_REPAIR = 0.03;
/** Share of a tick each working private yard takes off a state ship order. */
const YARD_SPEEDUP = 0.03;
const YARD_SPEEDUP_CAP = 0.15;
/** Research ticks each working laboratory adds per tick, and the ceiling. */
const RESEARCH_PER_LAB = 0.08;
const RESEARCH_PER_TICK_CAP = 0.4;
/** What a company pays to plant one real colony. */
const COLONY_OUTLAY = 10_000;

/** How much harder a company under a standing state contract works. */
const CONTRACT_MULTIPLIER = 1.5;

/** Interest, charged up front on every drawing. */
export const LOAN_INTEREST = 0.1;
/** Share of the outstanding loan the state repays each tick, and the floor. */
const LOAN_SERVICE_RATE = 0.02;
const LOAN_SERVICE_FLOOR = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function reservesOf(world: GameWorldState, factionId: string): Record<string, number> | undefined {
    return world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
}

/** How hard the company is working for the state this tick, 0–1.5. */
export function serviceRate(company: CharteredCompany, nowSeconds: number): number {
    if (!servesTheState(company)) return 0;
    const willing = company.nationalized ? 1 : Math.max(0, Math.min(1, (company.loyalty ?? 50) / 100));
    const contracted = (company.contractUntil ?? 0) > nowSeconds ? CONTRACT_MULTIPLIER : 1;
    return willing * contracted;
}

function countOf(company: CharteredCompany, type: CorporateAssetType, nowSeconds: number): number {
    return activeAssets(company, nowSeconds).filter(a => a.type === type).length;
}

function record(company: CharteredCompany, summary: string, nowSeconds: number): void {
    company.lastService = { summary, at: nowSeconds };
}

// ─── Per-mission services ────────────────────────────────────────────────────

function deliver(world: GameWorldState, company: CharteredCompany, goods: Record<string, number>): string | null {
    const reserves = reservesOf(world, company.foundingFactionId);
    if (!reserves) return null;
    const parts: string[] = [];
    for (const [key, amount] of Object.entries(goods)) {
        if (amount <= 0) continue;
        reserves[key] = (reserves[key] ?? 0) + amount;
        parts.push(`${Math.round(amount)} ${key.toLowerCase()}`);
    }
    return parts.length ? `Delivered ${parts.join(' and ')} to the state stockpile.` : null;
}

function serveTrade(world: GameWorldState, company: CharteredCompany, rate: number, now: number): string | null {
    const stations = countOf(company, 'trade_station', now);
    const gov = getGovernment(world, company.foundingFactionId);
    if (stations === 0 || !gov) return null;
    const gain = Math.min(CAPITAL_PER_TICK_CAP, stations * CAPITAL_PER_STATION) * rate;
    gov.politicalCapital = Math.min(gov.politicalCapitalCap ?? 100, gov.politicalCapital + gain);
    return `Its ${stations} trade station(s) earned the government ${gain.toFixed(2)} political capital.`;
}

function serveLogistics(world: GameWorldState, company: CharteredCompany, rate: number, now: number): string | null {
    const depots = new Set(
        activeAssets(company, now)
            .filter(a => a.type === 'warehouse' || a.type === 'trade_station')
            .map(a => a.systemId)
    );
    if (depots.size === 0) return null;
    let mended = 0;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId !== company.foundingFactionId) continue;
        if (!fleet.currentSystemId || !depots.has(fleet.currentSystemId)) continue;
        if (fleet.strength >= 1) continue;
        fleet.strength = Math.min(1, fleet.strength + DEPOT_REPAIR * rate);
        mended++;
    }
    return mended > 0
        ? `Its depots resupplied ${mended} state fleet(s).`
        : `Keeps depots in ${depots.size} system(s) for state fleets to repair at.`;
}

function serveShipbuilding(world: GameWorldState, company: CharteredCompany, rate: number, now: number): string | null {
    const yards = countOf(company, 'shipyard', now);
    if (yards === 0) return null;
    const saved = Math.min(YARD_SPEEDUP_CAP, yards * YARD_SPEEDUP) * rate * TICK_SECONDS;
    let hurried = 0;
    for (const order of world.construction.spaceBuildQueue ?? []) {
        const owner = world.construction.planets.get(order.planetId)?.ownerId;
        if (owner !== company.foundingFactionId) continue;
        if (order.completesAtSeconds <= now) continue;
        order.completesAtSeconds = Math.max(now, order.completesAtSeconds - saved);
        hurried++;
    }
    return hurried > 0
        ? `Its ${yards} private yard(s) hurried ${hurried} state ship order(s).`
        : `Its ${yards} private yard(s) stand ready for the next state order.`;
}

function serveResearch(world: GameWorldState, company: CharteredCompany, rate: number, now: number): string | null {
    const labs = countOf(company, 'research_lab', now);
    if (labs === 0) return null;
    const slot = world.tech?.get?.(company.foundingFactionId)?.activeSlots?.find((s: any) => s.status === 'researching');
    if (!slot) return `Its ${labs} laboratory(ies) have no state programme to contribute to.`;
    const gain = Math.min(RESEARCH_PER_TICK_CAP, labs * RESEARCH_PER_LAB) * rate;
    slot.ticksCompleted = (slot.ticksCompleted ?? 0) + gain;
    return `Its ${labs} laboratory(ies) advanced the state's research.`;
}

/**
 * A colony seed becomes a real colony: the first free, surveyed world in its
 * system is settled under the founder's flag, at the company's expense. The
 * system is already a corporate colony — so a company that governs what it
 * settles is also a company that can take it away (rogue-service.ts).
 */
function serveColonization(world: GameWorldState, company: CharteredCompany, now: number): string | null {
    const founder = company.foundingFactionId;
    const seeds = activeAssets(company, now).filter(a => a.type === 'colony_seed' && !a.settledPlanetId);
    if (seeds.length === 0) return null;
    if (company.treasury < COLONY_OUTLAY) return 'Cannot afford to plant its next settlement.';

    for (const seed of seeds) {
        if (!canSeeSystem(world, founder, seed.systemId)) continue;
        const site = [...world.construction.planets.values()]
            .filter(p => p.systemId === seed.systemId
                && (!p.ownerId || p.ownerId === 'faction-neutral')
                && p.tags?.includes('colonizable')
                && !p.tags?.includes('dead_matter'))
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!site) continue;

        const result = colonizePlanet(world, founder, site.id);
        if (!result.ok) continue;

        company.treasury -= COLONY_OUTLAY;
        seed.settledPlanetId = site.id;
        if (!company.corporateColonies.includes(seed.systemId)) company.corporateColonies.push(seed.systemId);

        try {
            fireNotification({
                id: `corp-colony-${company.id}-${site.id}`,
                factionId: founder,
                category: 'system',
                priority: 'normal',
                title: 'COMPANY COLONY FOUNDED',
                body: `${company.charter.fullName} has settled ${site.name} under your flag, at its own expense.`,
                createdAt: new Date(now * 1000).toISOString(),
                read: false,
                linkToTab: 'corporate',
                payload: { companyId: company.id, planetId: site.id },
            } as any);
        } catch { /* notification queue absent in tests */ }

        // One settlement a tick: founding a colony is an event, not a batch job.
        return `Settled ${site.name} for the empire.`;
    }
    return 'Its settlements are waiting on a surveyed, free world.';
}

// ─── State loans (banking) ───────────────────────────────────────────────────

/**
 * The state draws on its bank. The money arrives now; the interest is written
 * onto the loan now; and until it is repaid the bank's voice in the capital is
 * louder (charter-service.ts#computeInfluence).
 */
export function drawStateLoan(
    world: GameWorldState,
    factionId: string,
    companyId: string,
    amount: number
): { ok: true; amount: number; owed: number } | { ok: false; error: string } {
    const corp = ensureCorporateState(world);
    const company = corp.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    if (company.foundingFactionId !== factionId) return { ok: false, error: 'Only the chartering government can draw on a company bank.' };
    if (company.mission !== 'banking') return { ok: false, error: 'Only a banking charter lends to the state.' };
    if (!servesTheState(company)) return { ok: false, error: 'The bank is not answering the ministry.' };

    const wanted = Math.floor(Number(amount) || 0);
    if (wanted <= 0) return { ok: false, error: 'The drawing must be positive.' };
    const available = creditLineAvailable(company);
    if (wanted > available) {
        return { ok: false, error: `The bank will lend at most ${available.toLocaleString()} credits more.` };
    }
    const reserves = reservesOf(world, factionId);
    if (!reserves) return { ok: false, error: 'No treasury to pay into.' };

    company.treasury -= wanted;
    reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + wanted;
    company.stateLoan = (company.stateLoan ?? 0) + wanted * (1 + LOAN_INTEREST);
    pushCompanyEvent(corp.eventLog, company, 'loan_drawn', {
        amount: wanted, owed: Math.round(company.stateLoan),
    }, world.nowSeconds);
    return { ok: true, amount: wanted, owed: company.stateLoan };
}

/** The state services what it owes. Arrears are noticed. */
function serviceStateLoan(world: GameWorldState, company: CharteredCompany): void {
    const loan = company.stateLoan ?? 0;
    if (loan <= 0) return;
    const reserves = reservesOf(world, company.foundingFactionId);
    const due = Math.min(loan, Math.max(LOAN_SERVICE_FLOOR, loan * LOAN_SERVICE_RATE));
    const paid = Math.min(due, Math.max(0, reserves?.['CREDITS'] ?? 0));
    if (reserves && paid > 0) reserves['CREDITS'] -= paid;
    company.treasury += paid;
    company.stateLoan = loan - paid;
    if (company.stateLoan < 1) company.stateLoan = 0;
    // A government that misses a payment has told its banker something.
    if (paid < due) company.loyalty = Math.max(0, (company.loyalty ?? 50) - 1);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

/** Every company renders the state its mission's service for this tick. */
export function tickMissionServices(world: GameWorldState): void {
    const corp = ensureCorporateState(world);
    const now = world.nowSeconds;

    const companies = [...corp.companies.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const company of companies) {
        serviceStateLoan(world, company);

        const rate = serviceRate(company, now);
        if (rate <= 0) {
            if (company.lastService) record(company, 'Rendering the state no service.', now);
            continue;
        }

        let summary: string | null = null;
        switch (company.mission ?? 'trade') {
            case 'mining':
                summary = deliver(world, company, { METALS: countOf(company, 'mining_outpost', now) * METALS_PER_OUTPOST * rate });
                break;
            case 'extraction': {
                const outposts = countOf(company, 'mining_outpost', now);
                summary = deliver(world, company, {
                    RARES: outposts * RARES_PER_OUTPOST * rate,
                    CHEMICALS: outposts * CHEMICALS_PER_OUTPOST * rate,
                });
                break;
            }
            case 'trade':
                summary = serveTrade(world, company, rate, now);
                break;
            case 'logistics':
                summary = serveLogistics(world, company, rate, now);
                break;
            case 'shipbuilding':
                summary = serveShipbuilding(world, company, rate, now);
                break;
            case 'research':
                summary = serveResearch(world, company, rate, now);
                break;
            case 'colonization':
                summary = serveColonization(world, company, now);
                break;
            case 'banking': {
                const line = creditLineAvailable(company);
                const owed = Math.round(company.stateLoan ?? 0);
                summary = owed > 0
                    ? `The state owes it ${owed.toLocaleString()}cr; ${line.toLocaleString()}cr more is on offer.`
                    : `Holds a credit line of ${line.toLocaleString()}cr open for the treasury.`;
                break;
            }
        }
        if (summary) record(company, summary, now);
    }
}
