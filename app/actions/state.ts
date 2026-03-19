'use server';
import { getServerClients } from '@/lib/appwrite';
import { Query, ID } from 'node-appwrite';
import { updateEconomy } from '@/lib/economy';
import { DefeatManager } from '@/lib/defeat/manager';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_STATE = 'world_state';
const COLL_RES = 'resources';
const COLL_EVENTS = 'events';
const COLL_GAZ = 'gazettes';
const COLL_FACTIONS = 'factions';
const COLL_ARMIES = 'armies';

export async function getFactions() {
  const { db } = await getServerClients();
  const res = await db.listDocuments(DB_ID, COLL_FACTIONS);
  return res.documents;
}

export async function getFaction(id: string) {
  const { db } = await getServerClients();
  return await db.getDocument(DB_ID, COLL_FACTIONS, id);
}

export async function createFaction(name: string) {
  const { db } = await getServerClients();
  const faction = await db.createDocument(DB_ID, COLL_FACTIONS, ID.unique(), {
    name,
    resources: JSON.stringify({ credits: 100, metals: 50, chemicals: 20, food: 100, happiness: 50 }),
    traits: JSON.stringify({})
  });
  return faction;
}

import { unstable_noStore as noStore } from 'next/cache';

export async function getArmies() {
  noStore();
  const { db } = await getServerClients();
  const res = await db.listDocuments(DB_ID, COLL_ARMIES);
  return res.documents;
}

export async function getPlanets() {
  const { db } = await getServerClients();
  // Fetch all planets (limit 1000 for now, might need pagination later)
  const res = await db.listDocuments(DB_ID, 'planets', [Query.limit(1000)]);
  return res.documents;
}

export async function claimHomePlanet(factionId: string, planetId: string) {
  const { db } = await getServerClients();

  // 1. Update Faction
  await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
    home_planet_id: planetId
  });

  // 2. Update Planet
  await db.updateDocument(DB_ID, 'planets', planetId, {
    owner_faction_id: factionId
  });
}

export async function recruitArmy(factionId: string, planetId: string) {
  const { db } = await getServerClients();

  // 1. Get Faction to check resources
  const faction: any = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);
  const resources = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;

  // Cost: 50 Economic, 10 Military
  if (resources.economic < 50 || resources.military < 10) {
    throw new Error('Insufficient resources');
  }

  // 2. Deduct Resources
  resources.economic -= 50;
  resources.military -= 10;
  await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
    resources: JSON.stringify(resources)
  });

  // 3. Create Army
  const planet: any = await db.getDocument(DB_ID, 'planets', planetId);
  await db.createDocument(DB_ID, COLL_ARMIES, ID.unique(), {
    faction_id: factionId,
    location_planet_id: planetId,
    x: planet.x,
    y: planet.y,
    units: JSON.stringify({ infantry: 1000, tanks: 50 }),
    status: 'idle'
  });
}

export async function getFactionArmies(factionId: string) {
  const { db } = await getServerClients();
  const res = await db.listDocuments(DB_ID, COLL_ARMIES, [
    Query.equal('faction_id', factionId)
  ]);
  return res.documents;
}

async function ensureState(db: any) {
  console.log('ensureState', DB_ID, COLL_STATE);
  console.log('Query limit:', Query.limit(1));
  const res = await db.listDocuments(DB_ID, COLL_STATE, [Query.limit(1)]);
  if (res.total === 0) {
    console.log('Creating new state document...');
    try {
      await db.createDocument(DB_ID, COLL_STATE, ID.unique(), {
        day: 1,
        resources: JSON.stringify({ credits: 500, metals: 100, chemicals: 50, food: 200, happiness: 50 })
      });
      console.log('Document created.');
    } catch (e) {
      console.error('Error creating document:', e);
    }
  } else {
    console.log('State document exists.');
  }
  const res2 = await db.listDocuments(DB_ID, COLL_STATE, [Query.limit(1)]);
  console.log('List result:', res2);
  const doc = res2.documents[0];
  if (!doc) {
    console.error('Doc is undefined!');
    return { day: 1, resources: {} }; // Fallback
  }
  if (typeof doc.resources === 'string') {
    try {
      doc.resources = JSON.parse(doc.resources);
    } catch (e) {
      console.error('Failed to parse resources', e);
      doc.resources = {};
    }
  }
  return doc;
}

import { VictoryManager } from '@/lib/victory/manager';

export async function getState() {
  try {
    const { db, Query } = await getServerClients();
    const st = await ensureState(db);

    // One available event per day (demo)
    const events = await db.listDocuments(DB_ID, COLL_EVENTS, [Query.limit(1)]);
    const event: any = events.documents[0] || null;

    if (event) {
      try {
        if (typeof event.choices === 'string') event.choices = JSON.parse(event.choices);
        if (typeof event.triggers === 'string') event.triggers = JSON.parse(event.triggers);
        if (typeof event.effects === 'string') event.effects = JSON.parse(event.effects);
      } catch (e) {
        console.error('Failed to parse event JSON', e);
      }
    }

    // Fetch active crises
    const crises = await db.listDocuments(DB_ID, 'crises', [Query.limit(20)]);

    // Fetch planets for Defeat Check
    const planets = await db.listDocuments(DB_ID, 'planets', [Query.limit(1000)]);

    // Fetch Factions for Victory Check
    const otherFactionsRes = await db.listDocuments(DB_ID, COLL_FACTIONS, [Query.limit(10)]);
    const allFactions: any[] = otherFactionsRes.documents;

    // Update Economy for Human Player (Terran Dominion - Hardcoded for MVP)
    const myFactionId = '692db2fa000cd91f9852';
    let myResources = st.resources;
    let myRates: any = {};
    let myExpenses: any = {};
    let myHealth: any = { stability: 100, deficit_counter: 0, status: 'solvent' };
    let myDefeatStatus: any = null;
    let myVictoryStatus: any = null;

    try {
      const faction: any = await updateEconomy(myFactionId);
      myResources = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;
      myRates = typeof faction.income_rates === 'string' ? JSON.parse(faction.income_rates) : faction.income_rates;
      myExpenses = faction.expenses || {}; // From updateEconomy return
      myHealth = faction.economic_health || myHealth; // From return

      // Check Defeat Conditions
      const cleanFaction = {
        ...faction,
        resources: myResources
      };
      myDefeatStatus = DefeatManager.checkDefeatConditions(cleanFaction, planets.documents as any, { income_rates: myRates });

      // Check Victory Conditions
      const rivals = allFactions.filter(d => d.$id !== myFactionId);
      myVictoryStatus = VictoryManager.checkVictory(cleanFaction, rivals, { income_rates: myRates });

    } catch (e) {
      console.error("Economy Update Failed:", e);
    }

    return {
      day: st.day,
      resources: myResources,
      income_rates: myRates,
      incomeRate: myRates, // Legacy compatibility if anything else uses it
      expenses: myExpenses,
      economic_health: myHealth,
      defeat_status: myDefeatStatus,
      victory_status: myVictoryStatus,
      last_updated: new Date().toISOString(),
      event: event,
      crises: crises.documents
    };
  } catch (error: any) {
    console.error("CRITICAL GETSTATE ERROR:", error);
    return {
      error: error.message || "Unknown State Error",
      stack: error.stack,
      day: 0,
      resources: {},
      income_rates: {},
      crises: []
    };
  }
}

export async function advanceDay() {
  const { db, Query } = await getServerClients();
  const st = await ensureState(db);
  await db.updateDocument(DB_ID, COLL_STATE, st.$id, { day: st.day + 1 });
}

export async function choose(eventId: string, choiceId: string) {
  const { db } = await getServerClients();
  // Delegate to function 'resolveEvent' if you prefer centralized logic
  // For demo, just append a gazette line:
  const st = await ensureState(db);
  await db.createDocument(DB_ID, COLL_GAZ, ID.unique(), {
    day: st.day,
    headline: 'Player made a choice',
    lede: `Event ${eventId} -> ${choiceId}`,
    tone: 'neutral'
  });
}
