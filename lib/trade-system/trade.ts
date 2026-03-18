import {
    TradeAgreement,
    TradeRoute,
    Graph,
    PolicyState,
    WarState,
    Market,
    Resource,
    PolicyRule,
    Faction
} from './types';
import { findBestRoute, getEdgeCost } from './pathfinding';
import { RNG } from './rng';

interface TradeFlowResult {
    netFlows: Map<string, Map<Resource, number>>; // TheatreID -> Resource -> Amount
    tariffRevenue: Map<string, number>; // FactionID -> Credits
    subsidyCost: Map<string, number>; // FactionID -> Credits
    piracyLoss: Map<string, number>; // FactionID -> Value Lost
    activeRoutes: TradeRoute[];
}

/**
 * Updates trade routes based on current graph and policies.
 * Routes that become invalid (blockaded, denied) are recalculated.
 */
export function updateTradeRoutes(
    agreements: TradeAgreement[],
    routes: Map<string, TradeRoute>, // Existing routes map
    graph: Graph,
    systemOwners: Map<string, string>,
    factions: Map<string, Faction>,
    policies: Map<string, PolicyState>,
    warStates: Map<string, WarState>
): Map<string, TradeRoute> {
    const nextRoutes = new Map<string, TradeRoute>(routes);

    for (const agreement of agreements) {
        const route = nextRoutes.get(agreement.id);
        
        // Find capitals for start/end
        const factionA = factions.get(agreement.aFactionId);
        const factionB = factions.get(agreement.bFactionId);

        if (!factionA || !factionB) continue;

        const startSys = factionA.capitalSystemId;
        const endSys = factionB.capitalSystemId;

        if (!startSys || !endSys) continue;

        // Condition for recalibration:
        // 1. No route exists
        // 2. Existing route path is empty
        // 3. Existing route has infinite cost (blocked)
        let needsRecalc = !route || route.path.length === 0;

        if (route && !needsRecalc) {
            // Check if existing path is still valid
            for (let i = 0; i < route.path.length - 1; i++) {
                const from = route.path[i];
                const to = route.path[i + 1];
                const edges = graph.adj.get(from) || [];
                const edge = edges.find(e => e.to === to);
                if (!edge) {
                    needsRecalc = true;
                    break;
                }
                const cost = getEdgeCost(edge, systemOwners.get(to), agreement.aFactionId, agreement.resource, policies, warStates);
                if (cost === Infinity) {
                    needsRecalc = true;
                    break;
                }
            }
        }

        if (needsRecalc) {
            const pathResult = findBestRoute(
                graph,
                startSys,
                endSys,
                agreement.aFactionId,
                agreement.resource,
                systemOwners,
                policies,
                warStates
            );

            if (pathResult) {
                const newRoute: TradeRoute = {
                    id: agreement.id,
                    agreementId: agreement.id,
                    path: pathResult.path,
                    theatreId: factionA.theatreId,
                    exposureScore: pathResult.riskScore,
                    piracyRisk: 0.01 * pathResult.path.length,
                    blockadeRisk: 0,
                    deepSpaceRisk: 0,
                    escortLevel: 0,
                    routePriority: 1
                };
                nextRoutes.set(agreement.id, newRoute);
            }
        }
    }

    return nextRoutes;
}

/**
 * Simulates flow on all active routes.
 * Calculates movement, applies tariffs, checks piracy/blockade.
 */
export function simulateTradeFlows(
    routes: TradeRoute[],
    agreements: Map<string, TradeAgreement>,
    policies: Map<string, PolicyState>,
    markets: Map<string, Market>, // For pricing piracy loss
    warStates: Map<string, WarState>,
    systemOwners: Map<string, string>,
    rng: RNG
): TradeFlowResult {
    const netFlows = new Map<string, Map<Resource, number>>(); // Flow into Theatre
    const tariffRevenue = new Map<string, number>();
    const subsidyCost = new Map<string, number>();
    const piracyLoss = new Map<string, number>();
    const activeRoutes: TradeRoute[] = [];

    const getFlow = (theatreId: string, res: Resource) => {
        if (!netFlows.has(theatreId)) netFlows.set(theatreId, new Map());
        return netFlows.get(theatreId)!.get(res) || 0;
    };

    const addFlow = (theatreId: string, res: Resource, amount: number) => {
        if (!netFlows.has(theatreId)) netFlows.set(theatreId, new Map());
        const m = netFlows.get(theatreId)!;
        m.set(res, (m.get(res) || 0) + amount);
    };

    const addRevenue = (factionId: string, amount: number) => {
        tariffRevenue.set(factionId, (tariffRevenue.get(factionId) || 0) + amount);
    };

    const addCost = (factionId: string, amount: number) => {
        subsidyCost.set(factionId, (subsidyCost.get(factionId) || 0) + amount);
    };

    for (const route of routes) {
        const agreement = agreements.get(route.agreementId);
        if (!agreement) continue;

        // 1. Check Blockade (Binary fail)
        if (rng.check(route.blockadeRisk)) {
            continue;
        }

        let flowAmount = agreement.volumePerHour;

        // 2. Piracy (Percentage loss)
        if (rng.check(route.piracyRisk)) {
            const lossPct = rng.next() * 0.5; // Up to 50% loss
            const lostAmount = flowAmount * lossPct;
            flowAmount -= lostAmount;

            const val = lostAmount * 100;
            piracyLoss.set(agreement.aFactionId, (piracyLoss.get(agreement.aFactionId) || 0) + val);
        }

        // 3. Subsidies (Cost to producer/source faction)
        const sourcePolicy = policies.get(agreement.aFactionId);
        if (sourcePolicy) {
            const subsidy = sourcePolicy.subsidiesByResource.get(agreement.resource) || 0;
            if (subsidy > 0) {
                const totalSubsidy = flowAmount * subsidy;
                addCost(agreement.aFactionId, totalSubsidy);
            }
        }

        // 4. Tariffs
        for (const sysId of route.path) {
            const owner = systemOwners.get(sysId);
            if (!owner) continue;

            const policy = policies.get(owner);
            if (!policy) continue;

            // Transit Tariff
            if (owner !== agreement.aFactionId && owner !== agreement.bFactionId) {
                const rule = policy.chokepointRules.get(sysId);
                if (rule && rule.rule === PolicyRule.TAX) {
                    const taxRate = rule.taxRate || 0.05;
                    const taxAmount = flowAmount * taxRate * 10;
                    addRevenue(owner, taxAmount);
                }
            }

            // Entry/Import Tariff
            if (owner === agreement.bFactionId && sysId === route.path[route.path.length - 1]) {
                const tariffRate = policy.tariffsByResource.get(agreement.resource) || 0;
                if (tariffRate > 0) {
                    const tariffAmount = flowAmount * tariffRate * 10;
                    addRevenue(owner, tariffAmount);
                }
            }
        }

        // 5. Update Net Flows
        activeRoutes.push(route);
        addFlow(route.path[0], agreement.resource, -flowAmount);
        addFlow(route.path[route.path.length - 1], agreement.resource, flowAmount);
    }

    return { netFlows, tariffRevenue, subsidyCost, piracyLoss, activeRoutes };
}
