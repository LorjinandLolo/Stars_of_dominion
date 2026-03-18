import { ResourceId, TradeRoute } from '@/types';

// Mock DB for now, would normally be Appwrite calls
const routes: TradeRoute[] = [];

export function createTradeRoute(originId: string, targetId: string, resource: ResourceId, amount: number): TradeRoute {
    const newRoute: TradeRoute = {
        id: `tr-${Date.now()}`,
        origin_planet_id: originId,
        target_planet_id: targetId,
        resource,
        amount,
        status: 'active' // Auto-accept for now
    };
    routes.push(newRoute);
    console.log(`[TRADE] Created route ${newRoute.id}: ${amount} ${resource} from ${originId} to ${targetId}`);
    return newRoute;
}

export function checkBlockade(routeId: string, hostileSectors: string[]): boolean {
    const route = routes.find(r => r.id === routeId);
    if (!route) return false;

    // TODO: Geometry check (Raycast hex grid)
    // For now, simple check if origin/dest are in hostile list
    const isBlockaded = hostileSectors.includes(route.origin_planet_id) || hostileSectors.includes(route.target_planet_id);

    if (isBlockaded && route.status === 'active') {
        route.status = 'blockaded';
        console.log(`[TRADE] Route ${route.id} BLOCKADED!`);
    } else if (!isBlockaded && route.status === 'blockaded') {
        route.status = 'active';
        console.log(`[TRADE] Route ${route.id} unblocked.`);
    }

    return isBlockaded;
}

export function getActiveRoutes(planetId: string): TradeRoute[] {
    return routes.filter(r => (r.origin_planet_id === planetId || r.target_planet_id === planetId) && r.status === 'active');
}

export function getAllActiveRoutes(): TradeRoute[] {
    return routes.filter(r => r.status === 'active');
}
