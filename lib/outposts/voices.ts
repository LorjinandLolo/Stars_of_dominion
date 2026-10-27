// lib/outposts/voices.ts
// Stars of Dominion — who speaks when something happens on an outpost.
//
// A crisis card reads differently when the medic says it. Each trait has a
// line per crisis kind (docs/writing/character-lines.md); `crisisVoice`
// picks the first WELL colonist whose trait has something to say about this
// kind, in the order a reporter would be believed, and returns a quoted
// sentence to append to the crisis text. Nothing here changes the sim: the
// speaker is only the one the text names. Pure.

import type { ColonistTrait, OutpostState } from './outpost-types';
import { withTrait } from './colonists';

/** Lines by trait, keyed by crisis kind (or an expedition outcome key). */
export const VOICES: Record<ColonistTrait, Record<string, string>> = {
    medic: {
        sickness: 'Fever in bunk four. I can hold it to one if you give me the medbay. Without it, guess.',
        air_leak: 'Everyone off the dome side. Breathe shallow. I mean it about the breathing.',
        funeral: 'I signed the paper. I would rather sign fewer.',
        drunk_accident: 'I have splinted that arm twice. I will not splint a third.',
        refugee_pod: 'Two alive, both dehydrated. They stay in the medbay tonight whatever you decide.',
        meteor_shower: 'Get them under cover and I will patch what comes back.',
        expedition_hurt: 'Walked in on one leg. Will walk out on two, eventually.',
    },
    engineer: {
        reactor_fault: 'I can patch it live, or we go dark for a shift and do it right. Your call, not mine.',
        air_leak: 'I know which seal. I have been saying which seal.',
        dust_storm: 'Three panels and a bent mast by morning. Give me the metals and a day.',
        sabotage: 'Cut clean, by someone who knew which coupling. That narrows it to everyone I trained.',
        rich_vein: 'The extractor can take it if nobody tells it how much.',
        meteor_shower: 'If it hits the reactor we are all engineers tonight.',
        lab_accident: 'Containment is holding. Containment is a strong word for that door.',
    },
    miner: {
        rich_vein: 'We hit something that does not want to end. Get me a second extractor before it does.',
        sabotage: 'That was one of ours. I will not say which, and neither will they.',
        raiders: 'Let them try the lower galleries. We know the galleries.',
        dust_storm: 'Storm up top means a double shift below. Fine by the crews.',
        expedition_vent_ore: 'Told you it smelled like ore.',
        expedition_vent_dust: 'Smelled like ore. Was not ore. Happens.',
    },
    botanist: {
        supply_delay: 'I can stretch the stores two shifts. Nobody gets seconds.',
        dust_storm: 'The seedlings are under tarp. I am under the tarp with them.',
        homesick: 'Tell them the second harvest comes in next season. People stay for a harvest.',
        trader: 'Ask what seed they carry before you ask about food.',
        refugee_pod: 'Two more mouths. Two more pairs of hands at harvest. It balances.',
        expedition_dust: 'Dust. We have dust. Next time bring me a rock with lichen on it.',
    },
    veteran: {
        raiders: 'Lights out, fire teams at the airlocks. They think we are soft. Let them.',
        pirate_skiff: 'One skiff. They want to be paid, not to fight. We can oblige either way.',
        riot: 'Stand down or I stand you down. Choose while I am still asking.',
        sabotage: 'I know who did it. I am giving them one shift to confess.',
        breakout: 'I need bodies at the east gate, not opinions.',
        survey_team: 'I counted their rifles. Four.',
        refugee_pod: 'Search them before you feed them. Then feed them.',
    },
    zealot: {
        homesick: 'Nobody goes home. Home is where the dome is. Say it with me.',
        funeral: 'Into the ground that fed us. That is not nothing.',
        sickness: 'Fever passes. Faith does not. Boil the water anyway.',
        refugee_pod: 'Strangers at the door are a test. Open it.',
        rich_vein: 'The ground gives because we asked it properly.',
        supply_delay: 'We did not come across the dark to be hungry about it. Share.',
    },
    drunk: {
        drunk_accident: 'I was not that drunk. The ladder was that drunk.',
        trader: 'Ask if they carry anything stronger than coolant.',
        riot: 'I started nothing. I joined something already started. There is a difference.',
        pirate_skiff: 'I know that skiff. I owe that skiff.',
        expedition_dust: 'Horizon is round. Checked twice.',
    },
    scholar: {
        lab_accident: 'Minor explosion. Expected, if I am honest, which I was not in the proposal.',
        ruins: 'Leave the drills off until I have looked.',
        meteor_shower: 'Samples. Everyone collecting samples. After the shower, obviously.',
        survey_team: 'Their instruments are better than ours. Ask where they got them.',
        rich_vein: 'I adjusted the extractor timing. Do not ask me to explain it to the miners.',
        expedition_ruin_notes: 'It is a language. Half of one. I need a season and silence.',
        expedition_ruin_salvage: 'Salvage. They wanted salvage. There was writing on the salvage.',
        expedition_found_ruin: 'Nobody here made it. Nobody here is allowed to touch it.',
    },
};

/** Who is believed first about each kind of trouble. Omitted traits are tried last, in roster order. */
const SPEAKERS: Record<string, ColonistTrait[]> = {
    sickness: ['medic', 'zealot'],
    air_leak: ['engineer', 'medic'],
    reactor_fault: ['engineer'],
    dust_storm: ['engineer', 'botanist', 'miner'],
    meteor_shower: ['engineer', 'scholar', 'medic'],
    supply_delay: ['botanist', 'zealot'],
    rich_vein: ['miner', 'engineer', 'zealot', 'scholar'],
    sabotage: ['veteran', 'engineer', 'miner'],
    raiders: ['veteran', 'miner'],
    pirate_skiff: ['veteran', 'drunk'],
    riot: ['veteran', 'drunk'],
    breakout: ['veteran'],
    survey_team: ['veteran', 'scholar'],
    refugee_pod: ['medic', 'veteran', 'zealot', 'botanist'],
    trader: ['botanist', 'drunk'],
    funeral: ['zealot', 'medic'],
    homesick: ['zealot', 'botanist'],
    lab_accident: ['scholar', 'engineer'],
    ruins: ['scholar'],
    drunk_accident: ['drunk', 'medic'],
};

const ALL: ColonistTrait[] = ['medic', 'engineer', 'miner', 'botanist', 'veteran', 'zealot', 'drunk', 'scholar'];

/**
 * A quoted line from the first well colonist with something to say about
 * `key`, as ` Name: "…"`, or '' when nobody fit is on the roster. Appended
 * to a crisis text; the text itself stays the steward's.
 */
export function crisisVoice(state: OutpostState, key: string, exclude: string[] = []): string {
    const order = [...(SPEAKERS[key] ?? []), ...ALL.filter(t => !(SPEAKERS[key] ?? []).includes(t))];
    for (const trait of order) {
        const line = VOICES[trait][key];
        if (!line) continue;
        const who = withTrait(state, trait);
        if (!who || exclude.includes(who.id)) continue;
        return ` ${who.name}: “${line}”`;
    }
    return '';
}

/** The same for an expedition crew: only someone who went speaks. */
export function crewVoice(crew: Array<{ id: string; name: string; trait: ColonistTrait; status: string }>, key: string): string {
    for (const c of crew) {
        if (c.status !== 'well') continue;
        const line = VOICES[c.trait][key];
        if (line) return ` ${c.name}: “${line}”`;
    }
    return '';
}
