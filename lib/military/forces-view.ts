// lib/military/forces-view.ts
// Every fleet and army an empire has, where it is and what it is doing, plus
// foreign fleets inside its space and what its yards are producing. Pure and
// client-safe: built from the store's synced lists for the Forces panel.
//
// Before this the only roster was the map's Fleet Command bar (fleets only,
// 16rem wide, desktop only). Armies had no list at all: a player found them by
// clicking planets one by one.

import { veterancyRank } from '../combat/veterancy';
import { isCivilianFleet, civilianCount } from '../combat/civilian-ships';

export type ForceStatusKind = 'trade' | 'combat' | 'refit' | 'moving' | 'lurking' | 'orbit' | 'holding' | 'aboard' | 'sieging' | 'stationed' | 'empty';

export interface ForceStatus {
    kind: ForceStatusKind;
    /** "En route to Kepler", "In orbit of Aglate II". */
    text: string;
}

export interface FleetRow {
    id: string;
    name: string;
    ships: Array<{ cls: string; count: number }>;
    shipCount: number;
    power: number;
    veterancy: { label: string; rank: number };
    status: ForceStatus;
    /** Where the locator takes the camera: current system, else the next hop, else the destination. */
    systemId: string | null;
    systemName: string;
    destinationName: string | null;
    etaSeconds: number | null;
    originSystemId: string | null;
    armiesAboard: number;
    /** Unarmed ships only (lib/combat/civilian-ships.ts). */
    civilian: boolean;
    /** Freighters aboard: they can run a trade route. */
    freighters: number;
    tradeRoute: { fromPlanetId: string; toPlanetId: string; fromName: string; toName: string; cargo: string | null; delivered: number } | null;
}

export interface ArmyRow {
    id: string;
    name: string;
    troops: Array<{ type: string; count: number }>;
    troopCount: number;
    power: number;
    /** 0–100. */
    morale: number;
    /** 0–100. */
    supply: number;
    status: ForceStatus;
    systemId: string | null;
    systemName: string;
    planetId: string | null;
}

export interface ContactRow {
    id: string;
    ownerName: string;
    ownerId: string;
    shipCount: number;
    power: number;
    systemId: string;
    systemName: string;
    moving: boolean;
}

export interface ProductionRow {
    id: string;
    label: string;
    planetName: string;
    completesAt: number;
}

export interface ForcesView {
    fleets: FleetRow[];
    armies: ArmyRow[];
    contacts: ContactRow[];
    production: ProductionRow[];
    totals: { fleets: number; ships: number; armies: number; troops: number; power: number };
    /** The empire's own worlds, for picking a trade route's ends. */
    worlds: Array<{ id: string; name: string }>;
}

const RANK_ORDER = ['Green', 'Regular', 'Seasoned', 'Veteran', 'Elite'] as const;

/** The game's own veterancy rank (lib/combat/veterancy.ts), with its place in the order (1-5). */
export function veterancyOf(experience: number | undefined): { label: string; rank: number } {
    const label = veterancyRank(experience);
    return { label, rank: RANK_ORDER.indexOf(label) + 1 };
}

const CLASS_ORDER = ['battleship', 'carrier', 'cruiser', 'destroyer', 'corvette', 'builder', 'freighter', 'spy', 'explorer'];

const pretty = (key: string) => {
    const words = key.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};

/** 0..1 or 0..100 into 0..100. */
const pct = (v: number | undefined) => {
    const n = Number(v ?? 0);
    return Math.round(n <= 1 ? n * 100 : n);
};

export interface ForcesInput {
    playerFactionId: string;
    fleets: any[];
    armies: any[];
    systems: any[];
    planets: any[];
    recruitmentJobs: any[];
    activeCombats: any[];
    factions: Record<string, { name?: string }>;
}

export function buildForcesView(input: ForcesInput): ForcesView {
    const { playerFactionId: me } = input;
    const systemById = new Map(input.systems.map((s: any) => [s.id, s]));
    const planetById = new Map(input.planets.map((p: any) => [p.id, p]));
    const sysName = (id: string | null | undefined) => (id ? systemById.get(id)?.name ?? id : '—');
    const planetName = (id: string | null | undefined) => (id ? planetById.get(id)?.name ?? id : '—');
    const fleetById = new Map(input.fleets.map((f: any) => [f.id, f]));

    const combatSystems = new Set(
        input.activeCombats.filter((c: any) => !c?.resolved).map((c: any) => c?.target?.systemId ?? c?.location?.systemId).filter(Boolean),
    );
    const inRefit = new Set(input.recruitmentJobs.filter((j: any) => j?.kind === 'refit').map((j: any) => j.targetFormationId));

    const fleets: FleetRow[] = input.fleets
        .filter((f: any) => f.factionId === me)
        .map((f: any) => {
            const ships = Object.entries(f.composition ?? {})
                .map(([cls, n]) => ({ cls: cls.toLowerCase(), count: Number(n) || 0 }))
                .filter(s => s.count > 0)
                .sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
            const shipCount = ships.reduce((s, x) => s + x.count, 0);
            const moving = !!f.destinationSystemId;
            const nextHop = Array.isArray(f.plannedPath) && f.plannedPath.length > 1 ? f.plannedPath[1] : null;
            const systemId = f.currentSystemId ?? nextHop ?? f.destinationSystemId ?? null;
            const route = f.tradeRoute ?? null;
            const towards = f.destinationSystemId ? sysName(f.destinationSystemId) : null;
            let status: ForceStatus;
            if (shipCount === 0) status = { kind: 'empty', text: `No ships yet · at ${sysName(f.currentSystemId)}` };
            else if (route && moving) status = { kind: 'trade', text: route.cargo ? `Hauling ${Math.round(route.cargo.amount)} ${route.cargo.resource} to ${towards}` : `Trade run to ${towards}` };
            else if (route) status = { kind: 'trade', text: `Loading at ${sysName(f.currentSystemId)}` };
            else if (f.currentSystemId && combatSystems.has(f.currentSystemId)) status = { kind: 'combat', text: `In battle at ${sysName(f.currentSystemId)}` };
            else if (inRefit.has(f.id)) status = { kind: 'refit', text: `Refitting at ${sysName(f.currentSystemId)}` };
            else if (moving) status = { kind: 'moving', text: `En route to ${sysName(f.destinationSystemId)}` };
            else if (f.stance === 'belt') status = { kind: 'lurking', text: `Lurking in the belt at ${sysName(f.currentSystemId)}` };
            else if (f.orbitingPlanetId) status = { kind: 'orbit', text: `In orbit of ${planetName(f.orbitingPlanetId)}` };
            else status = { kind: 'holding', text: `Holding at ${sysName(f.currentSystemId)}` };
            return {
                id: f.id,
                name: f.name ?? f.id,
                ships,
                shipCount,
                power: Math.round(f.basePower ?? 0),
                veterancy: veterancyOf(f.experience),
                status,
                systemId,
                systemName: sysName(systemId),
                destinationName: moving ? sysName(f.destinationSystemId) : null,
                etaSeconds: moving ? Number(f.etaSeconds ?? 0) : null,
                originSystemId: moving ? f.originSystemId ?? null : null,
                armiesAboard: (f.transportedArmyIds ?? []).length,
                civilian: isCivilianFleet(f),
                freighters: civilianCount(f.composition, 'freighter'),
                tradeRoute: route ? {
                    fromPlanetId: route.fromPlanetId,
                    toPlanetId: route.toPlanetId,
                    fromName: planetName(route.fromPlanetId),
                    toName: planetName(route.toPlanetId),
                    cargo: route.cargo ? `${Math.round(route.cargo.amount)} ${route.cargo.resource}` : null,
                    delivered: Math.round(route.delivered ?? 0),
                } : null,
            };
        })
        // Warships by power first, then the civilian ships.
        .sort((a, b) => Number(a.civilian) - Number(b.civilian) || b.power - a.power);

    const armies: ArmyRow[] = input.armies
        .filter((a: any) => a.factionId === me)
        .map((a: any) => {
            const troops = Object.entries(a.composition ?? {})
                .map(([type, n]) => ({ type: pretty(type), count: Number(n) || 0 }))
                .filter(t => t.count > 0)
                .sort((x, y) => y.count - x.count);
            const carrier = a.transportFleetId ? fleetById.get(a.transportFleetId) : null;
            const planet = a.currentPlanetId ? planetById.get(a.currentPlanetId) : null;
            const systemId = carrier
                ? (carrier.currentSystemId ?? carrier.destinationSystemId ?? null)
                : (planet?.systemId ?? a.currentSystemId ?? null);
            let status: ForceStatus;
            if (carrier) status = { kind: 'aboard', text: `Aboard ${carrier.name ?? 'a fleet'}` };
            else if (planet?.siege) status = { kind: 'sieging', text: `Fighting on ${planet.name}` };
            else if (planet) status = { kind: 'stationed', text: `Stationed on ${planet.name}` };
            else status = { kind: 'holding', text: `At ${sysName(systemId)}` };
            return {
                id: a.id,
                name: a.name ?? a.id,
                troops,
                troopCount: troops.reduce((s, t) => s + t.count, 0),
                power: Math.round(a.basePower ?? 0),
                morale: pct(a.morale),
                supply: pct(a.supplyLevel),
                status,
                systemId,
                systemName: sysName(systemId),
                planetId: carrier ? null : (a.currentPlanetId ?? null),
            };
        })
        .sort((a, b) => b.power - a.power);

    // Foreign fleets anywhere this empire holds a world or keeps a fleet.
    const mySpace = new Set<string>();
    for (const p of input.planets) if (p?.ownerId === me && p.systemId) mySpace.add(p.systemId);
    for (const f of fleets) if (f.systemId) mySpace.add(f.systemId);
    const contacts: ContactRow[] = input.fleets
        .filter((f: any) => f.factionId !== me && f.currentSystemId && mySpace.has(f.currentSystemId))
        .map((f: any) => ({
            id: f.id,
            ownerId: f.factionId,
            ownerName: input.factions[f.factionId]?.name ?? (f.factionId === 'faction-pirates' ? 'Pirates' : f.factionId.replace(/^faction-/, '')),
            shipCount: Object.values(f.composition ?? {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0),
            power: Math.round(f.basePower ?? 0),
            systemId: f.currentSystemId,
            systemName: sysName(f.currentSystemId),
            moving: !!f.destinationSystemId,
        }))
        .sort((a, b) => b.power - a.power);

    const production: ProductionRow[] = input.recruitmentJobs
        .filter((j: any) => j?.factionId === me)
        .map((j: any) => ({
            id: j.id,
            label: j.kind === 'refit'
                ? `Refit: ${j.count}× ${j.designName ?? j.classKey ?? 'ships'}`
                : `${j.count}× ${j.designName ?? (j.classKey ? pretty(j.classKey) : pretty(String(j.unitType ?? 'unit')))}`,
            // Fleet recruits carry 'formation-<fleetId>' as their planet.
            planetName: String(j.planetId ?? '').startsWith('formation-')
                ? (fleetById.get(String(j.planetId).slice('formation-'.length))?.name ?? 'a fleet')
                : planetName(j.planetId),
            completesAt: Number(j.completesAt ?? 0),
        }))
        .sort((a, b) => a.completesAt - b.completesAt);

    return {
        fleets,
        armies,
        contacts,
        production,
        worlds: input.planets.filter((p: any) => p?.ownerId === me).map((p: any) => ({ id: p.id, name: p.name ?? p.id })),
        totals: {
            fleets: fleets.length,
            ships: fleets.reduce((s, f) => s + f.shipCount, 0),
            armies: armies.length,
            troops: armies.reduce((s, a) => s + a.troopCount, 0),
            power: fleets.reduce((s, f) => s + f.power, 0) + armies.reduce((s, a) => s + a.power, 0),
        },
    };
}
