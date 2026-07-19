'use server';
import { prisma, withDocAliases } from '@/lib/db';
import { updateEconomy } from '@/lib/economy';
import { DefeatManager } from '@/lib/defeat/manager';

export async function getFactions() {
  const factions = await prisma.faction.findMany();
  return factions.map(withDocAliases);
}

export async function getFaction(id: string) {
  const faction = await prisma.faction.findUniqueOrThrow({ where: { id } });
  return withDocAliases(faction);
}

export async function createFaction(name: string) {
  const faction = await prisma.faction.create({
    data: {
      name,
      resources: JSON.stringify({ credits: 100, metals: 50, chemicals: 20, food: 100, happiness: 50 }),
      traits: JSON.stringify({})
    }
  });
  return withDocAliases(faction);
}

import { unstable_noStore as noStore } from 'next/cache';

export async function getArmies() {
  noStore();
  const armies = await prisma.army.findMany();
  return armies.map(withDocAliases);
}

export async function getPlanets() {
  // Fetch all planets (limit 1000 for now, might need pagination later)
  const planets = await prisma.planet.findMany({ take: 1000 });
  return planets.map(withDocAliases);
}

export async function claimHomePlanet(factionId: string, planetId: string) {
  // 1. Update Faction
  await prisma.faction.update({
    where: { id: factionId },
    data: { home_planet_id: planetId }
  });

  // 2. Update Planet
  await prisma.planet.update({
    where: { id: planetId },
    data: { owner_faction_id: factionId }
  });
}

export async function recruitArmy(factionId: string, planetId: string) {
  // 1. Get Faction to check resources
  const faction = await prisma.faction.findUniqueOrThrow({ where: { id: factionId } });
  const resources = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : (faction.resources ?? {});

  // Cost: 50 Economic, 10 Military
  if (resources.economic < 50 || resources.military < 10) {
    throw new Error('Insufficient resources');
  }

  // 2. Deduct Resources
  resources.economic -= 50;
  resources.military -= 10;
  await prisma.faction.update({
    where: { id: factionId },
    data: { resources: JSON.stringify(resources) }
  });

  // 3. Create Army
  const planet = await prisma.planet.findUniqueOrThrow({ where: { id: planetId } });
  await prisma.army.create({
    data: {
      faction_id: factionId,
      location_planet_id: planetId,
      x: planet.x,
      y: planet.y,
      units: JSON.stringify({ infantry: 1000, tanks: 50 }),
      status: 'idle'
    }
  });
}

export async function getFactionArmies(factionId: string) {
  const armies = await prisma.army.findMany({ where: { faction_id: factionId } });
  return armies.map(withDocAliases);
}

async function ensureState() {
  let doc = await prisma.worldState.findFirst();
  if (!doc) {
    doc = await prisma.worldState.create({
      data: {
        day: 1,
        resources: JSON.stringify({ credits: 500, metals: 100, chemicals: 50, food: 200, happiness: 50 })
      }
    });
  }
  let resources: any = doc.resources;
  if (typeof resources === 'string') {
    try {
      resources = JSON.parse(resources);
    } catch (e) {
      console.error('Failed to parse resources', e);
      resources = {};
    }
  }
  return { ...doc, $id: doc.id, resources };
}

import { MilestoneService } from '@/lib/victory/milestone-service';
import { getGameWorldState } from '@/lib/game-world-state-singleton';

export async function getState() {
  try {
    const st = await ensureState();

    // One available event per day (demo)
    const eventDoc = await prisma.gameEvent.findFirst();
    const event: any = eventDoc ? { ...eventDoc, $id: eventDoc.id } : null;

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
    const crises = await prisma.crisis.findMany({ take: 20 });

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
      const world = getGameWorldState();
      myDefeatStatus = DefeatManager.checkDefeatConditions(myFactionId, world);

      // Check Victory/Prestige Conditions
      const prestige = MilestoneService.calculateFactionPrestige(myFactionId, world);
      const activeMilestones = Array.from(world.milestones.entries())
          .filter(([mId, data]) => data.factionId === myFactionId)
          .map(([mId]) => mId);

      myVictoryStatus = {
          status: 'PENDING',
          prestige,
          milestones: activeMilestones
      };

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
      crises: crises.map(withDocAliases)
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
  const st = await ensureState();
  await prisma.worldState.update({ where: { id: st.id }, data: { day: st.day + 1 } });
}

export async function choose(eventId: string, choiceId: string) {
  // For demo, just append a gazette line:
  const st = await ensureState();
  await prisma.gazette.create({
    data: {
      day: st.day,
      headline: 'Player made a choice',
      lede: `Event ${eventId} -> ${choiceId}`,
      tone: 'neutral'
    }
  });
}
