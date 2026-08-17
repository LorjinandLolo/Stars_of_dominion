// lib/factions/traits-service.ts
// Bootstrap and tick for per-faction bespoke mechanics.
//
// A dispatcher, not a framework. It knows which civilization a faction belongs
// to and calls that civilization's module; the modules share no interface
// because their mechanics land in different parts of the engine.

import type { GameWorldState } from '../game-world-state';
import type { FactionTraitState } from './faction-traits-types';
import { emptyKaerruunTraitState, emptySarrakTraitState, emptyButhariTraitState, emptyMovaniteTraitState, emptyLeopantheriTraitState, emptyRhimetalTraitState, emptyGabagoonTraitState, emptyNexulanTraitState, emptyBankingTraitState, NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import type { DistrictTraitMultiplier } from './faction-traits-types';
import { CIV_MOVANITE, CIV_LEOPANTHERI, CIV_RHIMETALS, CIV_GABAGOON, CIV_NEXULAN, CIV_BANKING } from './civ-ids';
import { tickNexulan } from './nexulan';
import { tickBankingClan } from './banking-clan';
import { tickGabagoon, gabagoonDistrictTraits } from './gabagoon';
import { tickMovanite, movaniteDistrictTraits } from './movanite';
import { tickLeopantheri, leopantheriDistrictTraits } from './leopantheri';
import { tickRhimetals, rhimetalDistrictTraits } from './rhimetals';
import { KAERRUUN_CIV_ID, tickKaerruun } from './kaerruun';
import { SARRAK_CIV_ID, tickSarrak, districtTraitMultiplier as sarrakDistrictTraits } from './sarrak';
import { BUTHARI_CIV_ID, tickButhari, districtTraitsForButhari } from './buthari';
import { INFERNOID_CIV_ID, infernoidDistrictTraits } from './infernoid';

/**
 * Ensure every faction has a trait record, back-filling fields onto records
 * restored from older snapshots.
 *
 * Safe on every boot and every load. Modelled on ensureGovernments: guard the
 * map, back-fill an existing record field-by-field, seed a new one otherwise.
 * Must run AFTER faction shards are restored — it reads economy.factions.
 */
export function ensureFactionTraits(world: GameWorldState): number {
    if (!(world.factionTraits instanceof Map)) world.factionTraits = new Map();
    const factions = world.economy?.factions;
    if (!factions?.size) return 0;

    let seeded = 0;
    // Sorted so two boots of the same snapshot seed identically.
    for (const factionId of [...factions.keys()].sort()) {
        const civilizationId = (factions.get(factionId) as { civilizationId?: string })?.civilizationId;

        let traits = world.factionTraits.get(factionId);
        if (!traits) {
            traits = { factionId };
            world.factionTraits.set(factionId, traits);
            seeded += 1;
        }

        // Per-civilization sub-state. Back-fill, never overwrite: a live record
        // carries counters that must survive a deploy.
        if (civilizationId === KAERRUUN_CIV_ID && !traits.kaerruun) {
            traits.kaerruun = emptyKaerruunTraitState();
        }
        if (civilizationId === SARRAK_CIV_ID && !traits.sarrak) {
            traits.sarrak = emptySarrakTraitState();
        }
        if (civilizationId === BUTHARI_CIV_ID && !traits.buthari) {
            traits.buthari = emptyButhariTraitState();
        }
        if (civilizationId === CIV_MOVANITE && !traits.movanite) {
            traits.movanite = emptyMovaniteTraitState();
        }
        if (civilizationId === CIV_LEOPANTHERI && !traits.leopantheri) {
            traits.leopantheri = emptyLeopantheriTraitState();
        }
        if (civilizationId === CIV_RHIMETALS && !traits.rhimetals) {
            traits.rhimetals = emptyRhimetalTraitState();
        }
        if (civilizationId === CIV_GABAGOON && !traits.gabagoon) {
            traits.gabagoon = emptyGabagoonTraitState();
        }
        if (civilizationId === CIV_NEXULAN && !traits.nexulan) {
            traits.nexulan = emptyNexulanTraitState();
        }
        if (civilizationId === CIV_BANKING && !traits.banking) {
            traits.banking = emptyBankingTraitState();
        }
    }

    if (seeded) console.log(`[FactionTraits] Seeded trait state for ${seeded} faction(s).`);
    return seeded;
}

/**
 * One strategic tick of every faction's bespoke mechanics.
 *
 * Iteration is over sorted ids for determinism — the tick order contract in
 * tick-processor requires it.
 */
export function tickFactionTraits(world: GameWorldState): void {
    if (!(world.factionTraits instanceof Map) || !world.factionTraits.size) {
        ensureFactionTraits(world);
    }
    if (!(world.factionTraits instanceof Map)) return;

    for (const factionId of [...world.factionTraits.keys()].sort()) {
        const traits: FactionTraitState | undefined = world.factionTraits.get(factionId);
        if (!traits) continue;
        const civilizationId = (world.economy?.factions?.get(factionId) as { civilizationId?: string })?.civilizationId;

        switch (civilizationId) {
            case KAERRUUN_CIV_ID:
                try { tickKaerruun(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickKaerruun failed for ${factionId}:`, e); }
                break;
            case SARRAK_CIV_ID:
                try { tickSarrak(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickSarrak failed for ${factionId}:`, e); }
                break;
            case BUTHARI_CIV_ID:
                try { tickButhari(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickButhari failed for ${factionId}:`, e); }
                break;
            case CIV_MOVANITE:
                try { tickMovanite(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickMovanite failed for ${factionId}:`, e); }
                break;
            case CIV_LEOPANTHERI:
                try { tickLeopantheri(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickLeopantheri failed for ${factionId}:`, e); }
                break;
            case CIV_RHIMETALS:
                try { tickRhimetals(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickRhimetals failed for ${factionId}:`, e); }
                break;
            case CIV_GABAGOON:
                try { tickGabagoon(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickGabagoon failed for ${factionId}:`, e); }
                break;
            case CIV_NEXULAN:
                try { tickNexulan(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickNexulan failed for ${factionId}:`, e); }
                break;
            case CIV_BANKING:
                try { tickBankingClan(world, traits); }
                catch (e) { console.error(`[FactionTraits] tickBankingClan failed for ${factionId}:`, e); }
                break;
            default:
                break;
        }
    }
}

/**
 * Civilization combat traits for one side of one district battle.
 *
 * The dispatcher exists so the siege layer never imports a faction module —
 * resolveDistrictBattle is faction-blind by design, and its call site in the
 * worker resolves the numbers here. Civilization ids are single-valued, so this
 * is a switch rather than a composition: no stacking rule is needed.
 */
export function districtTraitsFor(
    world: GameWorldState,
    factionId: string | undefined,
    terrain: string,
    planet?: unknown,
): DistrictTraitMultiplier {
    if (!factionId) return NEUTRAL_DISTRICT_TRAITS;
    const civilizationId = (world.economy?.factions?.get(factionId) as { civilizationId?: string } | undefined)
        ?.civilizationId;

    switch (civilizationId) {
        case SARRAK_CIV_ID:
            return sarrakDistrictTraits(world, factionId, terrain);
        case BUTHARI_CIV_ID:
            return districtTraitsForButhari(world, factionId, terrain, planet);
        case INFERNOID_CIV_ID:
            return infernoidDistrictTraits(world, factionId, terrain);
        case CIV_MOVANITE:
            return movaniteDistrictTraits(world, factionId, terrain);
        case CIV_LEOPANTHERI:
            return leopantheriDistrictTraits(world, factionId, terrain, planet);
        case CIV_RHIMETALS:
            return rhimetalDistrictTraits(world, factionId, terrain);
        case CIV_GABAGOON:
            return gabagoonDistrictTraits(world, factionId, terrain);
        default:
            return NEUTRAL_DISTRICT_TRAITS;
    }
}
