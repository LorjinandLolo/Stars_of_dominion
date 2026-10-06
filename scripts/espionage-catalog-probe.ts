// scripts/espionage-catalog-probe.ts
// Probe: the player launches the operation catalog (spec items 11b, 11c, 11d).
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
import { recruitAgent, deployAgent, applyAgentOpConsequences } from '../lib/espionage/agent-service';
import { agentSuccessModifier, agentAttributionAvoidance, recruitCostForTraits, isValidRecruitTraitList } from '../lib/espionage/agent-types';
import { visibleTraits } from '../components/panels/espionage/AgentCard';
import { reportOperationOutcome, AFTER_ACTION_DOMAIN, INCOMING_DOMAIN } from '../lib/espionage/op-aftermath';
import { drainNotifications } from '../lib/time/notification-hooks';
import { labelFor } from '../lib/time/notification-names';
import { scrubOwnerSecrets } from '../lib/persistence/shard-privacy';

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

    console.log('\n[6] Agents on operations (item 11c)');
    {
        const w = freshWorld();
        w.espionage.agents.clear();
        const intel = getOrCreateFactionIntel(w, A);
        intel.intelPoints = 1000;
        w.economy.factions.get(A).reserves.CREDITS = 1_000_000;
        const cap = capitalOf(w, V);
        const mk = (id: string, owner: string, traitIds: any[], xp = 50) => {
            const agent = recruitAgent({ id, name: id, codename: id.toUpperCase(), traitIds, recruitmentCost: 0, expiresInDays: 7 }, owner, w.nowSeconds, w);
            agent.experienceLevel = xp;
            return agent;
        };
        const vet = mk('vet', A, ['veteran']);
        const theirs = mk('theirs', V, ['ghost']);

        const before = { intel: intel.intelPoints, credits: credits(w, A) };
        const foreign = launchCatalogOperation(A, V, cap, 'infiltrate_government', w, theirs.id);
        check('a rival\'s agent cannot be put on our operation', !foreign.success, foreign.message);
        check('and the refusal charges nothing', intel.intelPoints === before.intel && credits(w, A) === before.credits);

        const res = launchCatalogOperation(A, V, cap, 'infiltrate_government', w, vet.id);
        check('an available agent can run an operation', res.success, res.message);
        check('the operation names them', res.operation?.agentId === vet.id);
        check('and they are busy until it resolves', vet.status === 'on_operation');
        const again = launchCatalogOperation(A, V, cap, 'infiltrate_military', w, vet.id);
        check('a busy agent cannot take a second operation', !again.success && /not available/.test(again.message), again.message);
        const deploy = deployAgent(vet, cap, w);
        check('nor be deployed meanwhile', !deploy.ok);

        const def = OPERATION_CATALOG_BY_ID.get('sabotage_shipyard')!;
        const plain = computeCatalogSuccessChance(def, A, V, w);
        const withVet = computeCatalogSuccessChance(def, A, V, w, vet);
        check('a Veteran raises the odds', withVet > plain, `${plain} -> ${withVet}`);
        const mole = mk('mole', A, ['veteran', 'compromised']);
        check('a compromised agent quietly lowers them', computeCatalogSuccessChance(def, A, V, w, mole) < withVet);
        const seenByOwner = agentSuccessModifier(visibleTraits(mole.traitIds), mole.experienceLevel, def.category);
        check('but the owner\'s estimate does not show the hidden penalty',
            seenByOwner === agentSuccessModifier(['veteran'], mole.experienceLevel, def.category));
        check('a Seducer adds nothing to intelligence gathering',
            agentSuccessModifier(['seducer'], 100, 'intel_gathering') === 0);
        check('but helps political warfare', agentSuccessModifier(['seducer'], 100, 'political') > 0);
        check('a Brutal agent is easier to trace', agentAttributionAvoidance(['brutal']) < 0);
        check('a Ghost is harder to trace', agentAttributionAvoidance(['ghost']) > 0);

        // Resolution brings the agent home changed.
        const op = res.operation!;
        const cover0 = vet.coverStrength, xp0 = vet.experienceLevel;
        w.nowSeconds = Date.parse(op.completesAt) / 1000 + 1;
        tickOperations(w, 3600);
        check('after resolution the agent has one more operation', vet.operationsRun === 1);
        check('has spent cover', vet.coverStrength < cover0, `${cover0} -> ${vet.coverStrength}`);
        check('has gained experience', vet.experienceLevel > xp0);
        check('and rests (or is burned)', vet.status === 'on_cooldown' || vet.status === 'burned', vet.status);

        // Exposure costs extra cover.
        const a1 = mk('calm', A, ['ghost']);
        const a2 = mk('blown', A, ['ghost']);
        applyAgentOpConsequences(a1, true, 0.5, w.nowSeconds, w, false);
        applyAgentOpConsequences(a2, true, 0.5, w.nowSeconds, w, true);
        check('being exposed costs more cover', a2.coverStrength < a1.coverStrength - 0.2, `${a1.coverStrength} vs ${a2.coverStrength}`);

        // An operation that vanished does not strand its agent.
        const stranded = mk('stranded', A, ['ghost']);
        stranded.status = 'on_operation';
        tickOperations(w, 60);
        check('an agent whose operation is gone is released', (stranded.status as string) === 'available', stranded.status);

        // Deploying is network-only and reports refusals.
        const scout = mk('scout', A, ['ghost']);
        check('deploying a free agent works', deployAgent(scout, cap, w).ok);
        check('deploying to nowhere is refused', !deployAgent(mk('lost', A, ['ghost']), 'no-such-system', w).ok);
        check('agents no longer carry a deployment domain', !('deployedDomain' in scout));
    }

    console.log('\n[7] Recruitment is priced by the worker');
    {
        check('one plain trait costs the base price', recruitCostForTraits(['ghost']) === 2500);
        check('a Veteran costs more', recruitCostForTraits(['veteran']) === 4500);
        check('a forged list with a repeat is rejected', !isValidRecruitTraitList(['ghost', 'ghost']));
        check('four traits are rejected', !isValidRecruitTraitList(['ghost', 'brutal', 'seducer', 'veteran']));
        check('an unknown trait is rejected', !isValidRecruitTraitList(['omniscient']));
        check('a real list passes', isValidRecruitTraitList(['ghost', 'veteran']));
        const loop = code('scripts/game-loop.ts');
        check('the recruit handler prices from traits, not from the client',
            /case 'ESP_RECRUIT_AGENT':[\s\S]{0,900}recruitCostForTraits\(candidate\.traitIds\)/.test(loop));
        check('the deploy handler refunds a refused deployment',
            /case 'ESP_ASSIGN_AGENT':[\s\S]{0,900}refundOrderCost/.test(loop));
        check('the launch handler forwards the agent',
            /case 'ESP_LAUNCH_CATALOG_OP':[\s\S]{0,1200}payload\.agentId/.test(loop));
    }

    console.log('\n[8] Both sides hear how it went (item 11d)');
    {
        const w = freshWorld();
        w.espionage.reports.clear();
        w.espionage.attributionRecords.length = 0;
        const intel = getOrCreateFactionIntel(w, A);
        intel.intelPoints = 1000;
        const cap = capitalOf(w, V);
        drainNotifications();

        // Force the dice: a critical success that is also caught.
        const realRandom = Math.random;
        Math.random = () => 0.01;
        let op: any;
        try {
            const res = launchCatalogOperation(A, V, cap, 'infiltrate_government', w);
            op = res.operation;
            w.nowSeconds = Date.parse(op.completesAt) / 1000 + 1;
            tickOperations(w, 3600);
        } finally {
            Math.random = realRandom;
        }
        check('the forced operation was caught', op.attributionState === 'exposed', op.attributionState);
        const notes = drainNotifications();
        const reports = [...w.espionage.reports.values()];
        const aar = reports.find(r => r.ownerFactionId === A && r.domain === AFTER_ACTION_DOMAIN);
        check('the sponsor gets an after-action report', !!aar);
        check('it says how it went and that we were caught', !!aar && /complete success/.test(aar.body) && /caught/.test(aar.body), aar?.body);
        check('the sponsor is notified', notes.some(n => n.factionId === A && n.title === 'OPERATION SUCCEEDED'));
        const inc = reports.find(r => r.ownerFactionId === V && r.domain === INCOMING_DOMAIN);
        check('the victim gets a report of what was caught', !!inc && /^Caught:/.test(inc.title), inc?.title);
        check('and is notified, urgently', notes.some(n => n.factionId === V && n.title === 'FOREIGN OPERATION CAUGHT' && n.priority === 'urgent'));
        const victimNote = notes.find(n => n.factionId === V)!;
        const victimText = JSON.stringify({ id: inc?.id, src: (inc as any)?.sourceOperationId, note: { id: victimNote?.id, payload: victimNote?.payload } });
        check('no victim-side id carries the operation id (it names the sponsor)', !victimText.includes(op.id) && !victimText.includes(A), victimText);

        // A suspicion that lands on the wrong empire (what item 12a will make possible).
        const C = 'faction-null-syndicate';
        const fake: any = { ...op, id: `op-${A}-test-suspect`, attributionState: 'suspected', succeeded: false };
        w.espionage.attributionRecords.push({ operationId: fake.id, suspectedFactionId: C, attributionState: 'suspected', probability: 0.6, tensionApplied: 0, resolvedAt: '' });
        reportOperationOutcome(fake, w, { name: 'Infiltrate Government', kindPhrase: 'an intelligence operation', outcomePhrase: 'a failure' });
        const wrong = [...w.espionage.reports.values()].find(r => r.ownerFactionId === V && /^Suspected/.test(r.title));
        check('a suspicion names the suspect on record', !!wrong && wrong.targetFactionId === C && !wrong.body.includes(labelFor(A)), wrong?.body);
        check('its hidden truth flag says the suspicion is wrong', wrong?.accurate === false);
        check('and its confidence is the attribution probability', wrong?.confidence === 0.6);
        const sponsorView = w.espionage.reports.get(`aar-${fake.id}`);
        check('the sponsor learns the blame fell elsewhere',
            !!sponsorView && /blames/.test(sponsorView.body) && sponsorView.body.includes(labelFor(C)), sponsorView?.body);
        const shardView = scrubOwnerSecrets({ espionageReports: [wrong] });
        check('the victim\'s client never receives that truth flag', !('accurate' in shardView.espionageReports[0]));

        // Invisible operations tell the victim nothing.
        const before = [...w.espionage.reports.values()].filter(r => r.ownerFactionId === V).length;
        drainNotifications();
        reportOperationOutcome({ ...op, id: `op-${A}-test-quiet`, attributionState: 'invisible' }, w,
            { name: 'Infiltrate Government', kindPhrase: 'an intelligence operation', outcomePhrase: 'a success' });
        check('an invisible operation leaves the victim no report', [...w.espionage.reports.values()].filter(r => r.ownerFactionId === V).length === before);
        check('and no notification', !drainNotifications().some(n => n.factionId === V));

        // Nobody plays the AI: no report, no bell.
        w.claimedFactionIds = [V];
        reportOperationOutcome({ ...op, id: `op-${A}-test-ai`, attributionState: 'exposed' }, w,
            { name: 'Infiltrate Government', kindPhrase: 'an intelligence operation', outcomePhrase: 'a success' });
        const aiNotes = drainNotifications();
        check('an AI sponsor is not notified', !aiNotes.some(n => n.factionId === A));
        check('nor filed a report', !w.espionage.reports.has(`aar-op-${A}-test-ai`));
        check('a human victim still is', aiNotes.some(n => n.factionId === V));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
