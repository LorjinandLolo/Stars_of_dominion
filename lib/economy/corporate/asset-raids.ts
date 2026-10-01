/**
 * lib/economy/corporate/asset-raids.ts
 * Corporate works are places, and places can be taken.
 *
 * WORKER-SIDE. Called once per strategic tick from lib/time/tick-processor.ts,
 * after the pirate bands have moved.
 *
 * A company's assets used to be a parallel economy nobody could touch: income
 * arrived whatever was happening in the system the asset stood in. Now a pirate
 * band sitting on a system can raid the works there, and an empire at war with
 * the founder can occupy them. A disrupted asset earns nothing and renders the
 * state no service until it recovers (`disruptedUntil`).
 *
 * That is what finally gives the military rights a job. Security forces,
 * defence platforms and a real escort fleet all cut the odds; so does a state
 * fleet on station — which is the player's lever.
 */

import type { GameWorldState } from '../../game-world-state';
import { fireNotification } from '../../time/notification-hooks';
import * as chronicle from '../../narrative/chronicle';
import { areAtWar } from '../../combat/war-status';
import {
    PIRATE_FACTION_ID,
    activeOrganizations,
    ensurePiracyState,
    recordRaid,
} from '../../piracy/organization-service';
import type { Fleet } from '../../movement/types';
import type { CharteredCompany } from './company-types';
import type { CorporateAsset } from './charter-types';
import { ASSET_DEFS } from './charter-catalog';
import { ensureCorporateState } from './company-registry';
import { hasRight, isAssetActive, militaryTier, seededRandom } from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

const TICK_SECONDS = 6 * 3600;
/** How long raided works stay dark: eight ticks, a little over three real hours. */
export const RAID_DISRUPTION_SECONDS = 8 * TICK_SECONDS;
/** Occupied works stay dark while the occupier stays, and this long after. */
export const OCCUPATION_DISRUPTION_SECONDS = 4 * TICK_SECONDS;
/** Chance per tick that a full-strength band raids an undefended asset. */
const BASE_RAID_CHANCE = 0.35;
/** Ticks of the asset's income a raid carries off. */
const LOOT_TICKS = 6;

// ─── Defence ─────────────────────────────────────────────────────────────────

/**
 * How much of a raid the defences turn away, as a multiplier on the odds.
 * Every term is something the charter granted or the state deployed.
 */
export function raidExposure(
    world: GameWorldState,
    company: CharteredCompany,
    asset: CorporateAsset
): number {
    let exposure = 1;
    if (hasRight(company, 'security_forces')) exposure *= 0.7;
    // A platform in the same system, still standing.
    const platform = (company.assets ?? []).some(a =>
        a.type === 'defence_platform' && a.systemId === asset.systemId && isAssetActive(a, world.nowSeconds));
    if (platform) exposure *= 0.4;
    exposure *= Math.max(0.3, 1 - militaryTier(company).tier * 0.12);
    if (founderFleetPresent(world, company.foundingFactionId, asset.systemId)) exposure *= 0.25;
    return exposure;
}

function founderFleetPresent(world: GameWorldState, factionId: string, systemId: string): boolean {
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === factionId && fleet.currentSystemId === systemId && (fleet.strength ?? 0) > 0) return true;
    }
    return false;
}

/** Fleets parked in each system, by who they answer to. */
function fleetsBySystem(world: GameWorldState): Map<string, Fleet[]> {
    const out = new Map<string, Fleet[]>();
    for (const fleet of world.movement.fleets.values()) {
        if (!fleet.currentSystemId || (fleet.strength ?? 0) <= 0) continue;
        const list = out.get(fleet.currentSystemId);
        if (list) list.push(fleet); else out.set(fleet.currentSystemId, [fleet]);
    }
    return out;
}

// ─── Tick ────────────────────────────────────────────────────────────────────

export interface AssetRaid {
    companyId: string;
    assetId: string;
    systemId: string;
    by: string;
    kind: 'raid' | 'occupation';
    loot: number;
}

function notifyFounder(world: GameWorldState, company: CharteredCompany, asset: CorporateAsset, body: string): void {
    try {
        fireNotification({
            id: `corp-raid-${asset.id}-${world.nowSeconds}`,
            factionId: company.foundingFactionId,
            category: 'military',
            priority: 'normal',
            title: 'COMPANY WORKS ATTACKED',
            body,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'corporate',
            payload: { companyId: company.id, systemId: asset.systemId },
        } as any);
    } catch { /* notification queue absent in tests */ }
}

/**
 * Pirates raid and enemies occupy the corporate works within their reach.
 * Returns what happened, for the worker log and the tests.
 */
export function tickAssetRaids(world: GameWorldState): AssetRaid[] {
    const corp = ensureCorporateState(world);
    const now = world.nowSeconds;
    const tick = Math.floor(now / TICK_SECONDS);
    const present = fleetsBySystem(world);
    const orgById = new Map(activeOrganizations(world).map(org => [org.id, org]));
    const contracts = [...ensurePiracyState(world).protectionContracts.values()];
    const raids: AssetRaid[] = [];

    const companies = [...corp.companies.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const company of companies) {
        const founder = company.foundingFactionId;
        const sysName = (id: string) => world.movement.systems.get(id)?.name ?? id;

        for (const asset of company.assets ?? []) {
            const here = present.get(asset.systemId) ?? [];
            if (here.length === 0) continue;

            // ── Occupation: a fleet at war with the founder holds the system ──
            const occupier = here.find(f => f.factionId !== PIRATE_FACTION_ID && areAtWar(world, founder, f.factionId));
            if (occupier && !founderFleetPresent(world, founder, asset.systemId)) {
                const fresh = isAssetActive(asset, now);
                asset.disruptedUntil = now + OCCUPATION_DISRUPTION_SECONDS;
                asset.disruptedBy = occupier.factionId;
                if (fresh) {
                    raids.push({ companyId: company.id, assetId: asset.id, systemId: asset.systemId, by: occupier.factionId, kind: 'occupation', loot: 0 });
                    corp.eventLog.push({
                        type: 'asset_raided', companyId: company.id, timestamp: now,
                        payload: { kind: 'occupation', systemId: asset.systemId, by: occupier.factionId, asset: asset.type },
                    });
                    notifyFounder(world, company, asset,
                        `${world.economy.factions.get(occupier.factionId)?.name ?? 'An enemy fleet'} has occupied the ${ASSET_DEFS[asset.type].name.toLowerCase()} of ${company.charter.fullName} at ${sysName(asset.systemId)}. It earns nothing until the system is relieved.`);
                }
                continue;
            }

            // ── Raid: a pirate band is sitting on the system ─────────────────
            if (!isAssetActive(asset, now)) continue;
            const raider = here.find(f => f.factionId === PIRATE_FACTION_ID && f.organizationId && orgById.has(f.organizationId));
            if (!raider?.organizationId) continue;
            const org = orgById.get(raider.organizationId)!;
            // A band does not rob the company that pays it, and the band a
            // company's own squadrons became (rogue-service.ts) left to prey on
            // the state that chartered it, not on the works it used to guard.
            if (org.id === company.pirateOrganizationId) continue;
            if (contracts.some(c => c.organizationId === org.id && c.payerId === company.id && c.expiresAtSeconds > now)) continue;

            const chance = BASE_RAID_CHANCE * Math.min(1, raider.strength ?? 0.5) * raidExposure(world, company, asset);
            if (seededRandom(`${asset.id}:raid:${tick}`)() >= chance) continue;

            const loot = Math.max(0, Math.min(company.treasury, asset.incomePerTick * LOOT_TICKS));
            company.treasury -= loot;
            asset.disruptedUntil = now + RAID_DISRUPTION_SECONDS;
            asset.disruptedBy = org.id;
            recordRaid(world, org.id, { valueLost: loot, victimFactionId: founder, raidType: 'robbery' });

            raids.push({ companyId: company.id, assetId: asset.id, systemId: asset.systemId, by: org.id, kind: 'raid', loot });
            corp.eventLog.push({
                type: 'asset_raided', companyId: company.id, timestamp: now,
                payload: { kind: 'raid', systemId: asset.systemId, by: org.name, asset: asset.type, loot: Math.round(loot) },
            });
            chronicle.record(world, {
                type: 'pirate_raid',
                actorIds: [PIRATE_FACTION_ID],
                targetIds: [founder],
                location: asset.systemId,
                facts: {
                    systemName: sysName(asset.systemId),
                    bandName: org.name,
                    companyName: company.charter.fullName,
                    valueLost: Math.round(loot),
                },
                // Several works in one system on one night are one story.
                coalesceKey: `corp-raid:${org.id}:${asset.systemId}:${tick}`,
            });
            notifyFounder(world, company, asset,
                `${org.name} raided the ${ASSET_DEFS[asset.type].name.toLowerCase()} of ${company.charter.fullName} at ${sysName(asset.systemId)} and took ${Math.round(loot).toLocaleString()}cr. A fleet on station, or defences written into the charter, would have made that harder.`);
        }
    }
    return raids;
}
