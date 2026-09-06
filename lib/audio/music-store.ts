// lib/audio/music-store.ts
// What the music control shows and what the player reads: the scanned
// library, the live verdict, what is playing, and the two preferences
// (volume, mute) that survive a reload via localStorage.

import { create } from 'zustand';
import type { MusicLibrary, MusicMood, MusicTrack, MoodVerdict } from './music-mood';

const VOLUME_KEY = 'sod.music.volume';
const MUTED_KEY = 'sod.music.muted';
const DEFAULT_VOLUME = 0.45;

function readPref(key: string): string | null {
    try { return typeof window === 'undefined' ? null : window.localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string): void {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

/** Stored volume, or the default when unset or malformed. */
export function storedVolume(): number {
    const raw = readPref(VOLUME_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_VOLUME;
}

export interface MusicStore {
    volume: number;
    muted: boolean;
    /** Preferences read from localStorage (after mount, so SSR and first paint agree). */
    prefsLoaded: boolean;
    /** The browser has allowed playback (first gesture seen). */
    unlocked: boolean;
    library: MusicLibrary | null;
    libraryError: string | null;
    scannedAt: number | null;
    /** Bumped by the RESCAN button; the player refetches when it changes. */
    rescanRequests: number;
    verdict: MoodVerdict | null;
    /** The mood actually playing (after the smoother and the fallback). */
    playingMood: MusicMood | null;
    nowPlaying: MusicTrack | null;
    panelOpen: boolean;

    hydratePrefs: () => void;
    setVolume: (v: number) => void;
    toggleMuted: () => void;
    setUnlocked: (u: boolean) => void;
    setLibrary: (lib: MusicLibrary | null, error?: string | null) => void;
    requestRescan: () => void;
    setVerdict: (v: MoodVerdict) => void;
    setPlayingMood: (m: MusicMood | null) => void;
    setNowPlaying: (t: MusicTrack | null) => void;
    setPanelOpen: (open: boolean) => void;
}

export const useMusicStore = create<MusicStore>((set) => ({
    volume: DEFAULT_VOLUME,
    muted: false,
    prefsLoaded: false,
    unlocked: false,
    library: null,
    libraryError: null,
    scannedAt: null,
    rescanRequests: 0,
    verdict: null,
    playingMood: null,
    nowPlaying: null,
    panelOpen: false,

    hydratePrefs: () => set({ volume: storedVolume(), muted: readPref(MUTED_KEY) === '1', prefsLoaded: true }),
    setVolume: (v) => {
        const volume = Math.min(1, Math.max(0, v));
        writePref(VOLUME_KEY, String(volume));
        set({ volume });
    },
    toggleMuted: () => set((s) => {
        const muted = !s.muted;
        writePref(MUTED_KEY, muted ? '1' : '0');
        return { muted };
    }),
    setUnlocked: (unlocked) => set({ unlocked }),
    setLibrary: (library, error = null) => set({ library, libraryError: error, scannedAt: library ? Date.now() : null }),
    requestRescan: () => set((s) => ({ rescanRequests: s.rescanRequests + 1 })),
    setVerdict: (verdict) => set((s) =>
        s.verdict && s.verdict.mood === verdict.mood && s.verdict.reason === verdict.reason ? s : { verdict }),
    setPlayingMood: (playingMood) => set((s) => (s.playingMood === playingMood ? s : { playingMood })),
    setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    setPanelOpen: (panelOpen) => set({ panelOpen }),
}));

/** Total tracks across the library — zero means "drop files into public/music". */
export function libraryTrackCount(lib: MusicLibrary | null): number {
    if (!lib) return 0;
    return lib.ambient.length + lib.suspense.length + lib.battle.length;
}
