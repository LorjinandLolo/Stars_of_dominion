// scripts/espionage-catalog-probe.ts
// Probe: the player launches the operation catalog (spec item 11b).
//
//   npx tsx scripts/espionage-catalog-probe.ts
//
// Drives launchCatalogOperation — the one function the ESP_LAUNCH_CATALOG_OP
// handler calls — on a copy of the init world, and checks the wiring around it
// by reading the source (game-loop inline code is invisible to probes).

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { launchCatalogOperation, computeCatalogSuccessChance, tickOperations } from '../lib/espionage/espionage-service';
import { getOrCreateFactionIntel } from '../lib/espionage/faction-intel';
import { OPERATION_CATALOG_BY_ID, catalogOwnSideChance, clampSuccessChance } from '../lib/espionage/operation-catalog';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';
import { techIdsHaveFlag } from '../lib/tech/flags';
import { BLOODMOON_FORBIDDEN_ACTIONS } from '../lib/factions/kaerruun';
import { getTechModifier } from '../lib/tech/modifiers';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');

const A = 'faction-aurelian';
const V = 'faction-vektori';

function freshWorld(): any {
    const world: any = deserializeWorld(serializeWorld(getGameWorldState()));
    world.claimedFactionIds = [A, V];
    world.espionage.operations.clear();
    return world;
}
const credits = (w: any, id: string) => Number(w.economy.factions.get(id)?.reserves?.CREDITS ?? 0);
const capitalOf = (w: any, id: string): string => {
    const cap = w.economy.factions.get(id)?.capitalSystemId;
    if (cap) return cap;
    return [...w.construction.planets.values()].find((p: any) => p.ownerId === id)?.systemId;
};

async function main() {
    console.log('\n[1] Wiring');
    {
        const def: any = (ACTION_DEFINITIONS as any).ESP_LAUNCH_CATALOG_OP;
        check('the order is registered', !!def);
        check('its static cost is empty (the launch charges per definition)', !!def && Object.keys(def.cost).length === 0);
        check('the legacy player order is gone', !(ACTION_DEFINITIONS as any).ESP_LAUNCH_OP);
        const loop = code('scripts/game-loop.ts');
        check('the worker case calls launchCatalogOperation',
            /case 'ESP_LAUNCH_CATALOG_OP':[\s\S]{0,900}launchCatalogOperation\(/.test(loop));
        check('no worker case for ESP_LAUNCH_OP remains', !loop.includes("case 'ESP_LAUNCH_OP'"));
        check('strategic AI launches from the catalog', code('lib/ai/strategic-ai-service.ts').includes('launchCatalogOperation(')
            && !/\blaunchOperation\(/.test(code('lib/ai/strategic-ai-service.ts')));
        check('the Bloodmoon still may not run operations', !!BLOODMOON_FORBIDDEN_ACTIONS.ESP_LAUNCH_CATALOG_OP);
        check('the page sends the catalog order', code('app/actions/espionage.ts').includes("'ESP_LAUNCH_CATALOG_OP'"));
    }

    console.log('\n[2] Gates refuse without charging');
    {
        const w = freshWorld();
        const intel = getOrCreateFactionIntel(w, A);
        intel.intelPoints = 500;
        intel.infiltrationLevels[V] = 0;
        const cap = capitalOf(w, V);
        check('the target has a capital to aim at', !!cap);
        const before = { intel: intel.intelPoints, credits: credits(w, A), used: intel.usedAgentCapacity };

        const coup = launchCatalogOperation(A, V, cap, 'fund_coup', w);
        check('Fund a Coup is refused with no network', !coup.success);
        check('and the reason names the stage it needs', /Shadow Government/.test(coup.message), coup.message);

        const self = launchCatalogOperation(A, A, capitalOf(w, A), 'infiltrate_government', w);
        check('an empire cannot target itself', !self.success);

        const wrongPlace = launchCatalogOperation(A, V, capitalOf(w, A), 'infiltrate_government', w);
        check('a system the target does not hold is refused', !wrongPlace.success, wrongPlace.message);

        const market = launchCatalogOperation(A, V, cap, 'manipulate_market', w);
        intel.infiltrationLevels[V] = 40; // embedded network: economic warfare unlocked
        const marketStaged = launchCatalogOperation(A, V, cap, 'manipulate_market', w);
        const hasFlag = techIdsHaveFlag(w.tech?.get?.(A)?.unlockedTechIds ?? [], 'ENABLE_SHADOW_ECONOMY');
        check('economic warfare without Black Market Operations is refused',
            hasFlag || (!marketStaged.success && /Black Market/.test(marketStaged.message)), marketStaged.message);
        check('(the unstaged attempt was refused too)', !market.success);
        intel.infiltrationLevels[V] = 0;

        const poor = freshWorld();
        const pIntel = getOrCreateFactionIntel(poor, A);
        pIntel.intelPoints = 0;
        const broke = launchCatalogOperation(A, V, capitalOf(poor, V), 'infiltrate_government', poor);
        check('no Intel, no operation', !broke.success && /Intel/.test(broke.message), broke.message);

        check('none of the refusals spent Intel', intel.intelPoints === before.intel);
        check('none of the refusals spent credits', credits(w, A) === before.credits);
        check('none of the refusals took a slot', intel.usedAgentCapacity === before.used);
    }

    console.log('\n[3] A launch charges the definition and takes a slot');
    {
        const w = freshWorld();
        const intel = getOrCreateFactionIntel(w, A);
        intel.intelPoints = 500;
        const def = OPERATION_CATALOG_BY_ID.get('infiltrate_government')!;
        const cap = capitalOf(w, V);
        const c0 = credits(w, A);
        const res = launchCatalogOperation(A, V, cap, def.id, w);
        check('Infiltrate Government launches at no infiltration', res.success, res.message);
        check(`it costs ${def.intelCost} Intel`, intel.intelPoints === 500 - def.intelCost);
        check(`and § ${def.creditsCost}`, credits(w, A) === c0 - def.creditsCost, `${c0} -> ${credits(w, A)}`);
        check('and one slot', intel.usedAgentCapacity === 1);
        const op = res.operation!;
        check('the operation carries its definition', op.definitionId === def.id);
        check('and targets the chosen system', op.targetRegionId === cap);

        // Resolution frees the slot.
        w.nowSeconds = Date.parse(op.completesAt) / 1000 + 1;
        tickOperations(w, 3600);
        const after = w.espionage.operations.get(op.id);
        check('it resolves when its time comes', after && (after.status === 'resolved' || after.status === 'failed'), after?.status);
        check('and gives the slot back', intel.usedAgentCapacity === 0);
    }

    console.log('\n[4] Slots run out');
    {
        const w = freshWorld();
        const intel = getOrCreateFactionIntel(w, A);
        intel.intelPoints = 10_000;
        w.economy.factions.get(A).reserves.CREDITS = 1_000_000;
        const cap = capitalOf(w, V);
        let launched = 0;
        for (let i = 0; i < intel.agentCapacity; i++) {
            if (launchCatalogOperation(A, V, cap, 'infiltrate_government', w).success) launched++;
        }
        check(`all ${intel.agentCapacity} slots fill`, launched === intel.agentCapacity);
        const extra = launchCatalogOperation(A, V, cap, 'infiltrate_government', w);
        check('the next launch is refused', !extra.success && /capacity/i.test(extra.message), extra.message);
    }

    console.log('\n[5] The estimate the page shows is the worker\'s formula');
    {
        const w = freshWorld();
        const intel = getOrCreateFactionIntel(w, A);
        intel.infiltrationLevels[V] = 50;
        const target = getOrCreateFactionIntel(w, V);
        target.counterIntelStrength = 0;
        target.internalSecurity = 0;
        const techBonus = getTechModifier(w, A, 'esp_op_success_add');
        let worst = 0;
        for (const def of OPERATION_CATALOG_BY_ID.values()) {
            const page = clampSuccessChance(catalogOwnSideChance(def, { infiltration: 50, techBonus }));
            const worker = computeCatalogSuccessChance(def, A, V, w);
            worst = Math.max(worst, Math.abs(page - worker));
        }
        check('with no defences, page and worker agree for every operation', worst < 1e-9, `max gap ${worst}`);
        target.counterIntelStrength = 60;
        const def = OPERATION_CATALOG_BY_ID.get('infiltrate_government')!;
        check('their counter-intelligence only ever lowers the real odds',
            computeCatalogSuccessChance(def, A, V, w) <= clampSuccessChance(catalogOwnSideChance(def, { infiltration: 50, techBonus })));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
