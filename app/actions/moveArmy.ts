'use server';

import { getServerClients } from '@/lib/appwrite';
import { HexGrid } from '@/lib/hex-grid';
import { getSectorType, canEnterSector } from '@/lib/game-rules';
import { Query } from 'node-appwrite';


const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_ARMIES = 'armies';
const COLL_PLANETS = 'planets';

export async function moveArmy(armyId: string, targetX: number, targetY: number) {
    const { db } = await getServerClients();

    // 1. Fetch Army
    const army: any = await db.getDocument(DB_ID, COLL_ARMIES, armyId);

    // Determine start position
    // Fallback to planet coords if x/y missing (during migration phase)
    let startX = (army as any).x;
    let startY = (army as any).y;

    if (startX === undefined || startY === undefined) {
        if (army.location_planet_id) {
            const currentPlanet: any = await db.getDocument(DB_ID, COLL_PLANETS, army.location_planet_id);
            startX = currentPlanet.x;
            startY = currentPlanet.y;
        } else {
            throw new Error("Army has no location!");
        }
    }

    // 2. Validate Move
    const grid = new HexGrid(20, 20); // TODO: Share config
    const start = { x: startX, y: startY };
    const end = { x: targetX, y: targetY };

    // Check bounds
    if (!grid.isValid(targetX, targetY)) {
        throw new Error("Target is out of sector bounds.");
    }

    // Check Terrain
    const terrain = getSectorType(targetX, targetY);
    if (!canEnterSector(terrain)) {
        throw new Error(`Cannot move into ${terrain.replace('_', ' ')}.`);
    }

    const distance = grid.getDistance(start, end);

    // Rule: Can move 3 hexes per turn
    const MAX_MOVE = 3;

    if (distance > MAX_MOVE) {
        throw new Error(`Target is too far! Distance: ${distance}, Max: ${MAX_MOVE}`);
    }

    // 3. Determine if landing on a Planet
    const planets = await db.listDocuments(DB_ID, COLL_PLANETS, [
        // In a real app with many planets, use efficient queries or Geo location
        // Here we fetch all (limited) and check
    ]);
    // Optimization: Just check if any planet is at x,y. 
    // Since we can't easily query by two fields (x=val AND y=val) without an index in Appwrite immediately (requires index creation),
    // and we have a small map (max 400 tiles, ~100 planets), fetching all planets is acceptable for this demo.
    // However, existing getPlanets fetches 100 limit. 
    // Let's rely on passed planets or fetch efficiently? 
    // We'll trust the 100 limit for now or fetch all.
    // Better: Query by x? and filter by y?

    // Actually, let's just fetch all planets (up to reasonable limit) to find the ID.
    const allPlanets = await db.listDocuments(DB_ID, COLL_PLANETS, [Query.limit(100)]);
    const targetPlanet: any = allPlanets.documents.find(p => (p as any).x === targetX && (p as any).y === targetY);

    // 4. Check for existing armies at target (Collision/Combat)
    const armiesAtTarget = await db.listDocuments(DB_ID, COLL_ARMIES, [
        Query.equal('x', targetX),
        Query.equal('y', targetY)
    ]);

    const enemyArmy: any = armiesAtTarget.documents.find(a => (a as any).faction_id !== army.faction_id);

    if (enemyArmy) {
        // TRIGGER CRISIS
        const { triggerCrisis } = await import('@/lib/crisis-manager');

        // Default attacker strategy for now ("Orbital Barrage" / "Rapid Drop")
        // In a full UI, the attacker would pick this BEFORE moving, or a modal would open.
        // For MVP: Default to 'rapid_drop'
        const crisis = await triggerCrisis('ground_invasion', army.faction_id, enemyArmy.faction_id, enemyArmy.$id, 'rapid_drop', { attacking_army: armyId });

        return {
            success: false, // Stop movement
            combat: false,
            crisis: true,
            crisisId: crisis.$id,
            message: "Invasion Initiated! Crisis Triggered."
        };
    }

    // Check for friendly blocking (Optional: Allow merge later)
    const friendlyArmy = armiesAtTarget.documents.find(a => (a as any).faction_id === army.faction_id && a.$id !== armyId);
    if (friendlyArmy) {
        throw new Error("Friendly army already occupies this sector.");
    }

    // 5. Update Army (Movement)
    const updateData: any = {
        x: targetX,
        y: targetY,
        location_planet_id: targetPlanet ? targetPlanet.$id : null,
        status: 'moved'
    };

    await db.updateDocument(DB_ID, COLL_ARMIES, armyId, updateData);

    return { success: true, newX: targetX, newY: targetY, planetId: targetPlanet?.$id };
}
