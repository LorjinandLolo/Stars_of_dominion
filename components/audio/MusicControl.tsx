"use client";

// components/audio/MusicControl.tsx
// The note button in the top bar and its popover: what mood is playing and
// why, the track, volume, mute, and — when a folder is empty — where to drop
// the files. Reads the music store only; MusicPlayer does the work.

import React, { useEffect, useRef } from 'react';
import { Music, VolumeX, Volume2, Volume1, RefreshCw, FolderOpen } from 'lucide-react';
import { useMusicStore, libraryTrackCount } from '@/lib/audio/music-store';
import { MOOD_LABEL, MUSIC_MOODS, type MusicMood } from '@/lib/audio/music-mood';

const MOOD_TONE: Record<MusicMood, string> = {
    ambient: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
    suspense: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    battle: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
};

export default function MusicControl() {
    const volume = useMusicStore(s => s.volume);
    const muted = useMusicStore(s => s.muted);
    const unlocked = useMusicStore(s => s.unlocked);
    const library = useMusicStore(s => s.library);
    const libraryError = useMusicStore(s => s.libraryError);
    const verdict = useMusicStore(s => s.verdict);
    const playingMood = useMusicStore(s => s.playingMood);
    const nowPlaying = useMusicStore(s => s.nowPlaying);
    const panelOpen = useMusicStore(s => s.panelOpen);
    const setVolume = useMusicStore(s => s.setVolume);
    const toggleMuted = useMusicStore(s => s.toggleMuted);
    const requestRescan = useMusicStore(s => s.requestRescan);
    const setPanelOpen = useMusicStore(s => s.setPanelOpen);

    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!panelOpen) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanelOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [panelOpen, setPanelOpen]);

    const total = libraryTrackCount(library);
    const silent = muted || total === 0;
    const mood = playingMood ?? verdict?.mood ?? 'ambient';
    const title = nowPlaying
        ? `${MOOD_LABEL[mood]} · ${nowPlaying.title}`
        : total === 0 ? 'No music yet — drop files into public/music' : `${MOOD_LABEL[mood]} · ${verdict?.reason ?? ''}`;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                id="music-control"
                title={title}
                aria-label="Music"
                aria-expanded={panelOpen}
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-300 ${
                    panelOpen
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-white/5 border-white/10 hover:border-white/30 text-slate-400 hover:text-white'
                }`}
            >
                {silent ? <VolumeX className="w-4 h-4" /> : <Music className={`w-4 h-4 ${mood === 'battle' ? 'text-rose-400' : mood === 'suspense' ? 'text-amber-400' : ''}`} />}
                {!silent && nowPlaying && (
                    <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${mood === 'battle' ? 'bg-rose-400' : mood === 'suspense' ? 'bg-amber-400' : 'bg-sky-400'} ${mood !== 'ambient' ? 'animate-pulse' : ''}`} />
                )}
            </button>

            {panelOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-slate-700/70 bg-slate-950/95 backdrop-blur-md shadow-2xl p-3 z-[60] text-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-display text-[10px] tracking-[0.25em] text-slate-400">MUSIC</span>
                        <span className={`px-2 py-0.5 rounded-sm border text-[9px] font-display tracking-widest uppercase ${MOOD_TONE[mood]}`}>
                            {MOOD_LABEL[mood]}
                        </span>
                    </div>

                    <div className="min-h-[2.5rem] mb-3">
                        {nowPlaying ? (
                            <>
                                <div className="text-[12px] font-mono text-slate-100 truncate" title={nowPlaying.src}>{nowPlaying.title}</div>
                                <div className="text-[9px] font-mono text-slate-500 mt-0.5 truncate">{verdict?.reason ?? ''}</div>
                            </>
                        ) : total === 0 ? (
                            <div className="text-[10px] font-mono text-slate-400 leading-relaxed">
                                Nothing to play yet. Drop <span className="text-slate-200">.mp3</span> / <span className="text-slate-200">.ogg</span> files into
                                <span className="block mt-1 text-amber-300/90">public/music/ambient · suspense · battle</span>
                                then press rescan.
                            </div>
                        ) : (
                            <div className="text-[10px] font-mono text-slate-400">
                                {verdict?.reason ?? 'waiting for the galaxy'}
                                {!unlocked && <span className="block text-sky-300/90 mt-0.5">Click anywhere to start playback (browser rule).</span>}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        <button
                            type="button"
                            onClick={toggleMuted}
                            title={muted ? 'Unmute' : 'Mute'}
                            className="flex items-center justify-center w-7 h-7 rounded border border-white/10 bg-white/5 hover:border-white/30 text-slate-300"
                        >
                            {muted ? <VolumeX size={13} /> : volume < 0.4 ? <Volume1 size={13} /> : <Volume2 size={13} />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(volume * 100)}
                            onChange={(e) => setVolume(Number(e.target.value) / 100)}
                            aria-label="Music volume"
                            className="flex-1 h-1 accent-sky-400 cursor-pointer"
                        />
                        <span className="w-8 text-right text-[10px] font-mono text-slate-400">{Math.round(volume * 100)}</span>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
                        <span className="flex items-center gap-1 truncate" title="public/music/<mood>/">
                            <FolderOpen size={10} />
                            {library
                                ? MUSIC_MOODS.map(m => `${m} ${library[m].length}`).join(' · ')
                                : libraryError ? `scan failed: ${libraryError}` : 'scanning…'}
                        </span>
                        <button
                            type="button"
                            onClick={requestRescan}
                            title="Re-read public/music"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 hover:border-white/30 text-slate-300"
                        >
                            <RefreshCw size={9} /> RESCAN
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
