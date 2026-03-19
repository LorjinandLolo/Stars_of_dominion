'use server';

import { createFaction, claimHomePlanet, recruitArmy } from './state';
import { redirect } from 'next/navigation';

export async function createFactionAction(name: string) {
    if (name) {
        await createFaction(name);
        redirect('/faction');
    }
}

export async function claimHomePlanetAction(factionId: string, formData: FormData) {
    const planetId = formData.get('planetId') as string;
    if (planetId) {
        await claimHomePlanet(factionId, planetId);
        redirect(`/faction/${factionId}`);
    }
}

export async function recruitArmyAction(factionId: string, homePlanetId: string, formData: FormData) {
    if (homePlanetId) {
        await recruitArmy(factionId, homePlanetId);
        redirect(`/faction/${factionId}`);
    }
}
