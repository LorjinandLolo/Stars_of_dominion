// lib/audio/music-mood.ts
// Which folder the soundtrack should be playing from, decided from the
// synced world. Pure and browser-safe: the API route imports the mood list
// and the title helper, the player imports the verdict and the smoother.
//
//   battle    a fleet of yours is in an active engagement, or the tactical
//             battle screen is open
//   suspense  you were just ambushed; a hostile (or pirate) fleet sits in, is
//             bound for, or is one jump from a system you hold or occupy; or
//             one of your fleets is lurking in a belt waiting for someone
//   ambient   everything else
//
// The smoother keeps the music from flapping: escalation is immediate,
// de-escalation waits out a hold so a fleet jittering at a border does not
// restart the ambient track every sync.

export type MusicMood = 'ambient' | 'suspense' | 'battle';
export const MUSIC_MOODS: readonly MusicMood[] = ['ambient', 'suspense', 'battle'];
export const MOOD_LABEL: Readonly<Record<MusicMood, string>> = { ambient: 'Ambient', suspense: 'Suspense', battle: 'Battle' };
const MOOD_RANK: Readonly<Record<MusicMood, number>> = { ambient: 0, suspense: 1, battle: 2 };

export interface MusicTrack { mood: MusicMood; src: string; title: string }
export type MusicLibrary = Record<MusicMood, MusicTrack[]>;

/** '03_cold-orbit.mp3' → 'cold orbit'. */
export function trackTitleFromFilename(name: string): string {
    return name
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/^\d+[\s._-]+/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || name;
}

// ─── The verdict ──────────────────────────────────────────────────────────────

export interface MoodInputFleet {
    id: string;
    factionId: string;
    name?: string;
    currentSystemId?: string | null;
    destinationSystemId?: string | null;
    stance?: 'open' | 'belt' | null;
    ambushedBy?: { factionId: string; atSeconds: number; systemId: string } | null;
}
export interface MoodInputSystem { id: string; name?: string; ownerId?: string | null; hyperlaneNeighbors?: string[] }

export interface MoodInput {
    playerFactionId: string | null;
    /** The tactical battle overlay is open. */
    inBattleScreen: boolean;
    /** Active combats the player is a party to (useGameSync already filters to mine). */
    activeCombatCount: number;
    fleets: MoodInputFleet[];
    systems: MoodInputSystem[];
    /** Factions whose fleets count as a threat (Relations 'hostile'); pirates are added here. */
    hostileFactionIds: ReadonlySet<string>;
    /** Sim clock, for ambush freshness. */
    nowSeconds?: number;
}

export interface MoodVerdict { mood: MusicMood; reason: string }

/** An ambush keeps the suspense track up this long after the stamp. */
export const AMBUSH_ECHO_SECONDS = 90;
export const PIRATE_FACTION_ID = 'faction-pirates';

export function pickMusicMood(input: MoodInput): MoodVerdict {
    if (input.inBattleScreen) return { mood: 'battle', reason: 'tactical engagement under way' };
    if (input.activeCombatCount > 0) {
        const n = input.activeCombatCount;
        return { mood: 'battle', reason: n === 1 ? 'your fleet is engaged' : `${n} engagements in progress` };
    }
    const me = input.playerFactionId;
    if (!me) return { mood: 'ambient', reason: 'no faction' };

    const byId = new Map<string, MoodInputSystem>();
    for (const s of input.systems) byId.set(s.id, s);
    const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? id) : 'deep space');

    // Systems I hold or occupy, and everything one jump out.
    const presence = new Set<string>();
    for (const s of input.systems) if (s.ownerId === me) presence.add(s.id);
    const mine = input.fleets.filter(f => f.factionId === me);
    for (const f of mine) if (f.currentSystemId) presence.add(f.currentSystemId);
    const border = new Set<string>();
    for (const id of presence) for (const n of byId.get(id)?.hyperlaneNeighbors ?? []) if (!presence.has(n)) border.add(n);

    const now = input.nowSeconds;
    for (const f of mine) {
        const stamp = f.ambushedBy;
        if (!stamp) continue;
        if (now === undefined || now - stamp.atSeconds <= AMBUSH_ECHO_SECONDS) {
            return { mood: 'suspense', reason: `${f.name ?? 'your fleet'} was ambushed at ${nameOf(stamp.systemId)}` };
        }
    }

    const threats = new Set<string>(input.hostileFactionIds);
    threats.add(PIRATE_FACTION_ID);
    const hostile = input.fleets
        .filter(f => f.factionId !== me && threats.has(f.factionId))
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const f of hostile) {
        const here = f.currentSystemId;
        if (here && presence.has(here)) return { mood: 'suspense', reason: `hostile fleet at ${nameOf(here)}` };
        const dest = f.destinationSystemId;
        if (dest && presence.has(dest)) return { mood: 'suspense', reason: `hostile fleet inbound to ${nameOf(dest)}` };
    }
    for (const f of hostile) {
        const here = f.currentSystemId;
        if (here && border.has(here)) return { mood: 'suspense', reason: `hostile fleet one jump out, at ${nameOf(here)}` };
    }

    const lurker = mine.find(f => f.stance === 'belt');
    if (lurker) return { mood: 'suspense', reason: `${lurker.name ?? 'your fleet'} lies in wait at ${nameOf(lurker.currentSystemId)}` };

    return { mood: 'ambient', reason: 'all quiet' };
}

// ─── The smoother ─────────────────────────────────────────────────────────────

/** Seconds a mood keeps playing after the world stops calling for it. */
export const DEESCALATE_HOLD_SECONDS: Readonly<Record<MusicMood, number>> = { battle: 20, suspense: 30, ambient: 0 };

/**
 * Feed it the raw verdict whenever you like; read back what should be
 * playing. Escalation is immediate. De-escalation happens only once the
 * calmer mood has been asked for continuously for the outgoing mood's hold.
 */
export class MoodSmoother {
    private playing: MusicMood;
    private candidate: MusicMood;
    private candidateSinceMs: number;

    constructor(initial: MusicMood = 'ambient', nowMs = 0) {
        this.playing = initial;
        this.candidate = initial;
        this.candidateSinceMs = nowMs;
    }

    get current(): MusicMood { return this.playing; }

    push(wanted: MusicMood, nowMs: number): MusicMood {
        if (wanted !== this.candidate) {
            this.candidate = wanted;
            this.candidateSinceMs = nowMs;
        }
        if (wanted === this.playing) return this.playing;
        if (MOOD_RANK[wanted] > MOOD_RANK[this.playing]) {
            this.playing = wanted;
            return this.playing;
        }
        const hold = DEESCALATE_HOLD_SECONDS[this.playing] * 1000;
        if (nowMs - this.candidateSinceMs >= hold) this.playing = wanted;
        return this.playing;
    }
}

/** The folder to actually draw from: the wanted mood, else ambient, else nothing. */
export function resolvePlayableMood(library: MusicLibrary | null, wanted: MusicMood): MusicMood | null {
    if (!library) return null;
    if (library[wanted]?.length) return wanted;
    if (library.ambient?.length) return 'ambient';
    return null;
}

/** A random track from the mood, avoiding an immediate repeat when there is a choice. */
export function pickTrack(tracks: readonly MusicTrack[], lastSrc: string | null, random: () => number = Math.random): MusicTrack | null {
    if (tracks.length === 0) return null;
    if (tracks.length === 1) return tracks[0];
    const pool = tracks.filter(t => t.src !== lastSrc);
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
