"use client";

// components/audio/MusicPlayer.tsx
// Headless. Mounted once in GameShell: scans public/music through /api/music,
// reads the synced world, decides the mood, and drives the MusicEngine. The
// visible control (MusicControl in the top bar) only reads the music store.

import { useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useMusicStore } from '@/lib/audio/music-store';
import { MusicEngine } from '@/lib/audio/music-engine';
import {
    MoodSmoother, pickMusicMood, pickTrack, resolvePlayableMood,
    type MusicLibrary, type MusicMood, type MusicTrack,
} from '@/lib/audio/music-mood';
import { stanceByFaction } from '@/lib/galaxy/overlays';

const LIBRARY_REFRESH_MS = 120_000;
const SMOOTHER_TICK_MS = 2_000;

export default function MusicPlayer() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const inBattleScreen = useUIStore(s => !!s.tacticalBattle);
    const activeCombatCount = useUIStore(s => s.activeCombats.length);
    const fleets = useUIStore(s => s.fleets);
    const systems = useUIStore(s => s.systems);
    const diplomacyState = useUIStore(s => s.diplomacyState);
    const nowSeconds = useUIStore(s => s.nowSeconds);

    const volume = useMusicStore(s => s.volume);
    const muted = useMusicStore(s => s.muted);
    const unlocked = useMusicStore(s => s.unlocked);
    const library = useMusicStore(s => s.library);
    const rescanRequests = useMusicStore(s => s.rescanRequests);
    const setLibrary = useMusicStore(s => s.setLibrary);
    const hydratePrefs = useMusicStore(s => s.hydratePrefs);
    const setUnlocked = useMusicStore(s => s.setUnlocked);
    const setVerdict = useMusicStore(s => s.setVerdict);
    const setPlayingMood = useMusicStore(s => s.setPlayingMood);
    const setNowPlaying = useMusicStore(s => s.setNowPlaying);

    // Volume and mute come from localStorage after mount, so the server and
    // the first client paint agree on the button.
    useEffect(() => { hydratePrefs(); }, [hydratePrefs]);

    // ── The library: scan now, on RESCAN, and every couple of minutes ──────
    useEffect(() => {
        let cancelled = false;
        const scan = async () => {
            try {
                const res = await fetch('/api/music', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setLibrary(data.tracks as MusicLibrary);
            } catch (e: any) {
                if (!cancelled) setLibrary(null, e?.message ?? 'scan failed');
            }
        };
        scan();
        const id = setInterval(scan, LIBRARY_REFRESH_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [rescanRequests, setLibrary]);

    // ── The verdict ───────────────────────────────────────────────────────
    const hostileFactionIds = useMemo(() => {
        const stances = stanceByFaction(playerFactionId, diplomacyState);
        return new Set(Object.entries(stances).filter(([, s]) => s === 'hostile').map(([id]) => id));
    }, [playerFactionId, diplomacyState]);

    const verdict = useMemo(() => pickMusicMood({
        playerFactionId, inBattleScreen, activeCombatCount, fleets, systems, hostileFactionIds, nowSeconds,
    }), [playerFactionId, inBattleScreen, activeCombatCount, fleets, systems, hostileFactionIds, nowSeconds]);

    useEffect(() => { setVerdict(verdict); }, [verdict, setVerdict]);

    // ── The smoother: ticks on a clock so holds expire even between syncs ──
    const wantedRef = useRef<MusicMood>(verdict.mood);
    wantedRef.current = verdict.mood;
    const smootherRef = useRef<MoodSmoother | null>(null);
    if (!smootherRef.current) smootherRef.current = new MoodSmoother('ambient', Date.now());
    useEffect(() => {
        const tick = () => setPlayingMood(smootherRef.current!.push(wantedRef.current, Date.now()));
        tick();
        const id = setInterval(tick, SMOOTHER_TICK_MS);
        return () => clearInterval(id);
    }, [setPlayingMood]);
    // Escalation should not wait for the next clock tick.
    useEffect(() => {
        setPlayingMood(smootherRef.current!.push(verdict.mood, Date.now()));
    }, [verdict.mood, setPlayingMood]);
    const playingMood = useMusicStore(s => s.playingMood);

    // ── The engine ────────────────────────────────────────────────────────
    const engineRef = useRef<MusicEngine | null>(null);
    const libraryRef = useRef<MusicLibrary | null>(library);
    libraryRef.current = library;
    const moodRef = useRef<MusicMood | null>(playingMood);
    moodRef.current = playingMood;
    // Files the browser could not play: skipped until the next rescan.
    const badRef = useRef(new Set<string>());
    useEffect(() => { badRef.current.clear(); }, [library]);

    // The mood's folder minus the files that failed, with the fallbacks applied.
    const playable = (lib: MusicLibrary | null, wanted: MusicMood): { mood: MusicMood; tracks: MusicTrack[] } | null => {
        if (!lib) return null;
        const clean = (m: MusicMood) => lib[m].filter(t => !badRef.current.has(t.src));
        const mood = resolvePlayableMood({ ambient: clean('ambient'), suspense: clean('suspense'), battle: clean('battle') }, wanted);
        return mood ? { mood, tracks: clean(mood) } : null;
    };
    const playableRef = useRef(playable);
    playableRef.current = playable;

    useEffect(() => {
        const engine = new MusicEngine();
        engineRef.current = engine;
        engine.onTrackChange = (t) => setNowPlaying(t);
        const advance = (from: MusicTrack) => {
            const pool = playableRef.current(libraryRef.current, moodRef.current ?? 'ambient');
            if (!pool) { engine.stop(); return; }
            const next = pickTrack(pool.tracks, from.src);
            if (next) engine.play(next);
        };
        engine.onTrackEnded = advance;
        engine.onTrackError = (bad) => { badRef.current.add(bad.src); advance(bad); };
        engine.onBlocked = () => setUnlocked(false);
        return () => { engine.destroy(); engineRef.current = null; };
    }, [setNowPlaying, setUnlocked]);

    useEffect(() => { engineRef.current?.setMaster(volume); }, [volume]);
    useEffect(() => { engineRef.current?.setMuted(muted); }, [muted]);

    // Browsers refuse audio before the first gesture: retry on the first one.
    useEffect(() => {
        if (unlocked) return;
        const unlock = () => {
            setUnlocked(true);
            engineRef.current?.resume();
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [unlocked, setUnlocked]);

    // Mood or library changed: keep the track if it still fits, else crossfade.
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !playingMood) return;
        const pool = playableRef.current(library, playingMood);
        if (!pool) { engine.stop(); return; }
        const current = engine.track;
        if (current && current.mood === pool.mood && pool.tracks.some(t => t.src === current.src)) return;
        const next = pickTrack(pool.tracks, current?.src ?? null);
        if (next) engine.play(next);
    }, [playingMood, library]);

    return null;
}
