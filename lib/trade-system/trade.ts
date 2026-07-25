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

export interface TradeFlowResult {
    netFlows: Map<string, Map<Resource, number>>; // TheatreID -> Resource -> Amount
    tariffRevenue: Map<string, number>; // FactionID -> Credits
    subsidyCost: Map<string, number>; // FactionID -> Credits
    piracyLoss: Map<string, number>; // FactionID -> Value Lost
    activeRoutes: TradeRoute[];
    /** RouteID -> fraction of the agreed volume that got through this tick (0 = blockaded). */
    deliveredRatio: Map<string, number>;
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
                    // Contested space raises the odds a convoy is caught by a blockade.
                    blockadeRisk: Math.min(0.9, pathResult.riskScore / 500),
                    deepSpaceRisk: 0,
                    // Escorts are player investments — survive rerouting.
                    escortLevel: route?.escortLevel ?? 0,
                    // Priority doubles as a flow-volume proxy for toll/piracy math.
                    routePriority: route?.routePriority ?? Math.max(1, agreement.volumePerHour / 100)
                };
                nextRoutes.set(agreement.id, newRoute);
            }
        }
    }

    // Refresh exposure/blockade risk for EVERY route against the current war
    // picture. Without this, a route computed in peacetime kept exposure 0
    // forever — blockades only mattered if the path physically broke.
    for (const route of nextRoutes.values()) {
        let risk = 0;
        for (const sys of route.path) {
            for (const ws of warStates.values()) {
                if (ws.blockadeSystems.has(sys)) risk += 50;
                if (ws.hostileFleetsPresence.has(sys)) risk += (ws.hostileFleetsPresence.get(sys) || 0) * 5;
            }
        }
        route.exposureScore = risk;
        route.blockadeRisk = Math.min(0.9, risk / 100);
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
    const deliveredRatio = new Map<string, number>();

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
            deliveredRatio.set(route.id, 0);
            continue;
        }

        let flowAmount = agreement.volumePerHour;

        // 2. Piracy (Percentage loss) — escorts mitigate the intercept chance.
        const escortMitigation = Math.min(0.8, route.escortLevel * 0.1);
        if (rng.check(route.piracyRisk * (1 - escortMitigation))) {
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
        deliveredRatio.set(route.id, agreement.volumePerHour > 0 ? flowAmount / agreement.volumePerHour : 0);
        addFlow(route.path[0], agreement.resource, -flowAmount);
        addFlow(route.path[route.path.length - 1], agreement.resource, flowAmount);
    }

    return { netFlows, tariffRevenue, subsidyCost, piracyLoss, activeRoutes, deliveredRatio };
}
