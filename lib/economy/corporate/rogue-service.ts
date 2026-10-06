/**
 * lib/economy/corporate/rogue-service.ts
 * What a company does after it stops recognising its charter.
 *
 * WORKER-SIDE. This is the only corporate module that reaches into the
 * secession and piracy systems, so it is called from the strategic tick
 * (lib/time/tick-processor.ts) rather than from the company registry, which the
 * client bundles through the economy service.
 *
 * Going rogue used to mean the remittance stopped. Now it starts a clock: the
 * founding government has one Galactic Day to bring the company to heel —
 * nationalise it, or pull its autonomy back under the line with subsidies or
 * stock — and if it does not, the company leaves with whatever the charter let
 * it hold. (Revoking the charter does not stop it: by then the paper is the one
 * thing the company no longer needs.)
 *
 *   - the right to govern colonies  → those worlds open a secession crisis;
 *   - a foreign patron              → the charter itself changes flags, and
 *                                     the company takes its fleet with it;
 *   - an armed fleet and no patron  → the squadrons become a corsair band.
 *
 * Every one of those is a clause the player wrote. That is the design contract
 * in charter-types.ts, finally enforced.
 */

import type { GameWorldState } from '../../game-world-state';
import { fireNotification } from '../../time/notification-hooks';
import * as chronicle from '../../narrative/chronicle';
import { openCrisis } from '../../government/secession-service';
import { foundOrganization, PIRATE_FACTION_ID } from '../../piracy/organization-service';
import { createRaiderFleet } from '../../piracy/emergence-service';
import { areAtWar } from '../../combat/war-status';
import { RNG, seedFromString } from '../../trade-system/rng';
import type { CharteredCompany } from './company-types';
import type { CorporateWorldState } from './company-registry';
import { ensureCorporateState, getOrCreateFactionState } from './company-registry';
import {
    ROGUE_GRACE_SECONDS,
    REVOKE_STOPS_ROGUE_BELOW,
    rogueProgress,
    computeInfluence,
    computeStanding,
    hasRight,
    militaryCap,
    ownershipPercent,
    pushCompanyEvent,
} from './charter-service';
import { applyRogueRetaliation } from './corporate-politics';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Fleet size (0–100) below which there is nothing worth calling a squadron. */
const MIN_FLEET_TO_DEFECT = 20;
/** Most raider parties one company's fleet can turn into. */
const MAX_DEFECTING_FLEETS = 4;
/** Share of the treasury that leaves with the ships. */
const CORSAIR_TREASURY_SHARE = 0.3;
/** A patron needs at least this much pull before a board will change flags. */
const MIN_PATRON_SCORE = 20;

const NON_EMPIRES = new Set([PIRATE_FACTION_ID, 'faction-neutral']);

// ─── What the company could take with it ─────────────────────────────────────

/**
 * Worlds the company actually governs and could lead out of the empire: the
 * founder's planets in corporate colonies, never the capital system. Requires a
 * political right — a company that merely built a depot somewhere is a tenant,
 * not an authority.
 */
export function secedableWorlds(world: GameWorldState, company: CharteredCompany): string[] {
    if (!hasRight(company, 'govern_colonies') && !hasRight(company, 'administer_territories')) return [];
    const capital = world.economy.factions.get(company.foundingFactionId)?.capitalSystemId;
    const colonies = new Set(company.corporateColonies.filter(id => id !== capital));
    if (colonies.size === 0) return [];

    const claimed = new Set<string>();
    for (const crisis of world.secessionCrises?.values?.() ?? []) {
        if (crisis.status !== 'open') continue;
        for (const planetId of crisis.planetIds) claimed.add(planetId);
    }

    const out: string[] = [];
    for (const planet of world.construction.planets.values()) {
        if (planet.ownerId !== company.foundingFactionId) continue;
        if (!colonies.has(planet.systemId) || claimed.has(planet.id)) continue;
        out.push(planet.id);
    }
    return out.sort();
}

/** How many raider parties the private fleet would become, 0 if it is unarmed. */
export function defectableFleets(company: CharteredCompany): number {
    if (militaryCap(company.rights ?? []) < 3) return 0;
    if ((company.privateFleetSize ?? 0) < MIN_FLEET_TO_DEFECT) return 0;
    return Math.max(1, Math.min(MAX_DEFECTING_FLEETS, Math.round(company.privateFleetSize / 25)));
}

/**
 * The empire a rogue board would rather answer to. Stock held, an operating
 * presence inside that empire, and a war with the founder all count; the best
 * score wins, ties broken by id so a replay picks the same patron.
 */
export function findPatron(world: GameWorldState, company: CharteredCompany): string | null {
    const founder = company.foundingFactionId;
    const candidates = new Set<string>([
        ...Object.keys(company.shareholders),
        ...(company.operatingFactionIds ?? []),
    ]);

    const walkedOutOn = new Set(company.formerFounderIds ?? []);
    let best: { id: string; score: number } | null = null;
    for (const id of [...candidates].sort()) {
        if (id === founder || NON_EMPIRES.has(id) || id.startsWith('class:')) continue;
        // It does not go back to a government it has already repudiated.
        if (walkedOutOn.has(id)) continue;
        if (!world.economy.factions.has(id)) continue;
        // A host that has thrown the company out is not offering it a home.
        const policy = (world.corporate as CorporateWorldState | undefined)?.hostPolicies?.get?.(`${id}:${company.id}`);
        if (policy && (policy.stance === 'banned' || policy.stance === 'nationalized')) continue;

        const score = ownershipPercent(company, id) * 2
            + ((company.operatingFactionIds ?? []).includes(id) ? 20 : 0)
            + (areAtWar(world, founder, id) ? 30 : 0);
        if (score >= MIN_PATRON_SCORE && (!best || score > best.score)) best = { id, score };
    }
    return best?.id ?? null;
}

// ─── The break ───────────────────────────────────────────────────────────────

export interface RogueBreak {
    companyId: string;
    companyName: string;
    founderId: string;
    worldsSeceding: number;
    fleetsDefected: number;
    patronId: string | null;
    secessionCrisisId?: string;
    pirateOrganizationId?: string;
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function systemName(world: GameWorldState, systemId: string): string {
    return world.movement.systems.get(systemId)?.name ?? systemId;
}

function notify(
    world: GameWorldState,
    factionId: string,
    id: string,
    title: string,
    body: string,
    companyId: string
): void {
    try {
        fireNotification({
            id,
            factionId,
            category: 'politics',
            priority: 'urgent',
            title,
            body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'corporate',
            payload: { companyId },
        } as any);
    } catch { /* notification queue absent in tests */ }
}

/** The colonies the company governs ask to leave — led by the board. */
function secedeColonies(world: GameWorldState, company: CharteredCompany): { crisisId?: string; worlds: number } {
    const planetIds = secedableWorlds(world, company);
    if (planetIds.length === 0) return { worlds: 0 };

    const crisis = openCrisis(world, company.foundingFactionId, planetIds, {
        name: `The ${company.charter.baseName} Company Secession`,
        leaderName: `the board of ${company.charter.fullName}`,
        causes: ['company rule'],
    });
    if (!crisis) return { worlds: 0 };

    // Where the company is the civil authority, its quarrel is the street's.
    for (const planetId of planetIds) {
        const planet = world.construction.planets.get(planetId);
        if (planet) planet.unrest = Math.min(100, (planet.unrest ?? 0) + 20);
    }
    return { crisisId: crisis.id, worlds: planetIds.length };
}

/** The private fleet stops being private security and starts being a band. */
function defectFleet(world: GameWorldState, company: CharteredCompany): { orgId?: string; fleets: number } {
    const count = defectableFleets(company);
    if (count === 0) return { fleets: 0 };

    // It musters wherever the company is strongest outside the capital.
    const capital = world.economy.factions.get(company.foundingFactionId)?.capitalSystemId;
    const musterId = [...(company.presenceSystemIds ?? []), company.headquartersSystemId]
        .find(id => id !== capital && world.movement.systems.has(id))
        ?? company.headquartersSystemId;
    const muster = world.movement.systems.get(musterId);
    if (!muster) return { fleets: 0 };

    const rng = new RNG(seedFromString(`rogue-fleet|${company.id}|${world.nowSeconds}`));
    // Company escorts are better kept than a frontier raiding party.
    const quality = Math.min(1, 0.5 + company.privateFleetSize / 200);
    const fleetIds: string[] = [];
    for (let i = 0; i < count; i++) {
        const fleet = createRaiderFleet(muster, world, rng);
        fleet.id = `pirate-raider-${company.id}-${world.nowSeconds}-${i}`;
        fleet.name = `${company.charter.baseName} Squadron`;
        fleet.strength = quality;
        fleet.basePower = Math.round(fleet.basePower * (1 + company.privateFleetSize / 50));
        world.movement.fleets.set(fleet.id, fleet);
        fleetIds.push(fleet.id);
    }

    const org = foundOrganization(world, muster.id, fleetIds, 'corporate_deniable');
    org.name = `${company.charter.baseName} Free Company`;
    // They leave with the payroll, and with a grudge the founder shares.
    const purse = Math.max(0, company.treasury * CORSAIR_TREASURY_SHARE);
    org.treasury += purse;
    company.treasury -= purse;
    org.infamy = Math.min(100, org.infamy + 15);
    org.heatByFaction[company.foundingFactionId] = 40;

    company.privateFleetSize = Math.round(company.privateFleetSize * 0.25);
    company.pirateOrganizationId = org.id;
    return { orgId: org.id, fleets: count };
}

/**
 * Move the charter to a new government. Everything the company owns goes with
 * it; holdings left inside the old founder's borders become foreign operations
 * there, subject to the host policy the old founder now gets to set.
 */
export function transferCharter(
    world: GameWorldState,
    corp: CorporateWorldState,
    company: CharteredCompany,
    patronId: string
): void {
    const oldFounder = company.foundingFactionId;

    const oldState = corp.factionStates.get(oldFounder);
    if (oldState) oldState.charteredCompanyIds = oldState.charteredCompanyIds.filter(id => id !== company.id);
    const patronState = getOrCreateFactionState(corp, patronId);
    if (!patronState.charteredCompanyIds.includes(company.id)) patronState.charteredCompanyIds.push(company.id);

    company.foundingFactionId = patronId;
    if (!(company.formerFounderIds ??= []).includes(oldFounder)) company.formerFounderIds.push(oldFounder);

    // Business that was on the old government's desk is no longer its business.
    for (const [key, demand] of corp.demands) {
        if (demand.companyId === company.id && demand.status === 'pending') corp.demands.delete(key);
    }
    for (const [key, crisis] of corp.crises) {
        if (crisis.companyId === company.id && crisis.status === 'pending') corp.crises.delete(key);
    }
    for (const proposal of corp.megaprojects.values()) {
        if (proposal.companyId !== company.id) continue;
        if (proposal.status === 'proposed' || proposal.status === 'delayed') proposal.status = 'rejected';
        else proposal.factionId = patronId;
    }

    // Re-derive where it is "abroad" from the new flag's point of view.
    const ownerOf = (systemId: string) => world.movement.systems.get(systemId)?.ownerFactionId;
    const abroad = new Set<string>();
    for (const systemId of company.presenceSystemIds ?? []) {
        const owner = ownerOf(systemId);
        if (owner && owner !== patronId) abroad.add(owner);
    }
    company.operatingFactionIds = [...abroad].sort();
    corp.hostPolicies.delete(`${patronId}:${company.id}`);

    // The seat of business moves under the new flag if it has anywhere to go.
    const newSeat = (company.presenceSystemIds ?? []).find(id => ownerOf(id) === patronId);
    if (newSeat) company.headquartersSystemId = newSeat;
    // Colonies in the old founder's space are no longer the company's to govern.
    company.corporateColonies = company.corporateColonies.filter(id => ownerOf(id) !== oldFounder);

    // A new patron is a fresh start — on the board's terms.
    company.hasGoneRogue = false;
    company.rogueSince = undefined;
    company.autonomyLevel = 50;
    company.loyalty = 65;
    company.refusedDemands = 0;
    company.profitShareToState = 0.1;
    company.charterRevocationPending = false;
    company.lastDemandAt = world.nowSeconds;
    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);
}

function breakAway(world: GameWorldState, corp: CorporateWorldState, company: CharteredCompany): RogueBreak {
    const founderId = company.foundingFactionId;
    const name = company.charter.fullName;

    const colonies = secedeColonies(world, company);
    const patronId = findPatron(world, company);
    // A company that has somewhere to go takes its ships with it. Only one
    // with no flag left to sail under sees its squadrons turn corsair — which
    // also keeps a company passed from patron to patron from seeding a new
    // band at every stop.
    const fleet = patronId ? { fleets: 0 } as { orgId?: string; fleets: number } : defectFleet(world, company);

    // A company with nothing to take and nowhere to go still takes its money.
    if (colonies.worlds === 0 && fleet.fleets === 0 && !patronId) {
        applyRogueRetaliation(company, world, world.nowSeconds);
    }

    const gov = world.government?.get?.(founderId);
    if (gov) {
        gov.legitimacy = Math.max(0, gov.legitimacy - 4);
        gov.history.push({ timestamp: world.nowSeconds, event: `${name} broke with the government that chartered it.` });
        if (gov.history.length > 60) gov.history.splice(0, gov.history.length - 60);
    }

    company.rogueBrokeAt = world.nowSeconds;

    chronicle.record(world, {
        type: 'company_broke_away',
        actorIds: [founderId],
        targetIds: patronId ? [patronId] : [],
        location: company.headquartersSystemId,
        facts: {
            companyName: name,
            systemName: systemName(world, company.headquartersSystemId),
            worldsSeceding: colonies.worlds,
            fleetsDefected: fleet.fleets,
            defected: Boolean(patronId),
        },
    });
    pushCompanyEvent(corp.eventLog, company, 'broke_away', {
        worldsSeceding: colonies.worlds, fleetsDefected: fleet.fleets, patronId,
    }, world.nowSeconds);

    const losses: string[] = [];
    if (colonies.worlds > 0) losses.push(`${colonies.worlds} company world(s) are demanding independence`);
    if (fleet.fleets > 0) losses.push(`${fleet.fleets} of its squadrons have turned corsair`);
    if (patronId) losses.push(`its charter now sits with ${world.economy.factions.get(patronId)?.name ?? patronId}`);
    notify(
        world, founderId, `corp-broke-${company.id}-${world.nowSeconds}`,
        'CHARTER COMPANY HAS BROKEN AWAY',
        `${name} is gone: ${losses.length ? joinList(losses) : 'its capital has left your jurisdiction'}.`,
        company.id
    );

    if (patronId) {
        transferCharter(world, corp, company, patronId);
        notify(
            world, patronId, `corp-defected-${company.id}-${world.nowSeconds}`,
            'A CHARTER COMPANY SEEKS YOUR PROTECTION',
            `${name} has repudiated ${world.economy.factions.get(founderId)?.name ?? founderId} and placed its charter under your government. It remits to you now.`,
            company.id
        );
    }

    return {
        companyId: company.id,
        companyName: name,
        founderId,
        worldsSeceding: colonies.worlds,
        fleetsDefected: fleet.fleets,
        patronId,
        secessionCrisisId: colonies.crisisId,
        pirateOrganizationId: fleet.orgId,
    };
}

// ─── Tick ────────────────────────────────────────────────────────────────────

/**
 * Open the clock on companies that have just gone rogue, clear it on companies
 * brought back to heel, and carry out the break for any whose founder ran out
 * of time. Called once per strategic tick, before tickSecession so a crisis
 * opened here is live in the same tick.
 */
export type RevokeAgainstRogue = 'not_rogue' | 'stopped' | 'hastened';

/**
 * What revoking the charter does to a company that is mid-break. Called by the
 * CORP_REVOKE_CHARTER handler before it marks the revocation.
 * - not rogue: nothing here; the revocation proceeds as normal.
 * - under REVOKE_STOPS_ROGUE_BELOW of the clock: the break is over. The company
 *   winds down as an ordinary revocation (which also stops the autonomy check
 *   from setting it rogue again).
 * - at or past it: the board ignores the revocation and goes on the next
 *   strategic tick. The caller must NOT mark the revocation pending — a
 *   revoked company does not break away, it winds down.
 */
export function revokeAgainstRogue(world: GameWorldState, company: CharteredCompany): RevokeAgainstRogue {
    if (!company.hasGoneRogue) return 'not_rogue';
    const now = world.nowSeconds;
    if (rogueProgress(company, now) < REVOKE_STOPS_ROGUE_BELOW) {
        company.hasGoneRogue = false;
        company.rogueSince = undefined;
        notify(
            world, company.foundingFactionId, `corp-rogue-ended-${company.id}-${now}`,
            'ROGUE COMPANY BROUGHT TO HEEL',
            `Revoked in time: ${company.charter.fullName} will wind down under the law instead of leaving with what it holds.`,
            company.id
        );
        return 'stopped';
    }
    // Next strategic tick crosses the deadline.
    company.rogueSince = now - ROGUE_GRACE_SECONDS;
    notify(
        world, company.foundingFactionId, `corp-rogue-hastened-${company.id}-${now}`,
        'REVOCATION IGNORED — THE COMPANY IS LEAVING',
        `${company.charter.fullName} was too far gone. The board has taken the revocation as its signal: it breaks away at the next cycle.`,
        company.id
    );
    return 'hastened';
}

export function tickRogueCompanies(world: GameWorldState): RogueBreak[] {
    const corp = ensureCorporateState(world);
    const now = world.nowSeconds;
    const breaks: RogueBreak[] = [];

    // Sorted: a break can delete pending business and found organizations, and
    // the order those happen in must not depend on Map insertion history.
    const companies = [...corp.companies.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const company of companies) {
        if (company.nationalized) { company.rogueSince = undefined; continue; }

        if (!company.hasGoneRogue) {
            // Brought back under control before the deadline (or after a break):
            // the episode is over and a later one starts a fresh clock.
            company.rogueSince = undefined;
            continue;
        }

        if (company.rogueSince === undefined) {
            company.rogueSince = now;
            const worlds = secedableWorlds(world, company).length;
            const fleets = defectableFleets(company);

            chronicle.record(world, {
                type: 'company_went_rogue',
                actorIds: [company.foundingFactionId],
                location: company.headquartersSystemId,
                facts: {
                    companyName: company.charter.fullName,
                    systemName: systemName(world, company.headquartersSystemId),
                    assets: (company.assets ?? []).length,
                    systems: (company.presenceSystemIds ?? []).length,
                    armed: fleets > 0,
                },
            });

            const stakes: string[] = [];
            const patron = findPatron(world, company);
            if (worlds > 0) stakes.push(`the ${worlds} world(s) it governs`);
            if (patron) stakes.push('a charter a foreign power is ready to take up');
            else if (fleets > 0) stakes.push('its armed squadrons, as corsairs');
            notify(
                world, company.foundingFactionId, `corp-rogue-${company.id}-${now}`,
                'CHARTER COMPANY HAS GONE ROGUE',
                `${company.charter.fullName} no longer recognises its charter and has stopped remitting. `
                + `Nationalise it, or buy its autonomy back down with subsidies or stock, within one Galactic Day`
                + `${stakes.length ? ` — or it leaves with ${joinList(stakes)}` : ''}.`,
                company.id
            );
            continue;
        }

        const alreadyBroke = (company.rogueBrokeAt ?? -1) >= company.rogueSince;
        if (alreadyBroke || now - company.rogueSince < ROGUE_GRACE_SECONDS) continue;

        try {
            breaks.push(breakAway(world, corp, company));
        } catch (e) {
            // Never retry a half-applied break every tick.
            company.rogueBrokeAt = now;
            console.error(`[Corporate] rogue break failed for ${company.id}:`, e);
        }
    }
    return breaks;
}
