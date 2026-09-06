// lib/audio/music-engine.ts
// Two <audio> elements and a crossfade. Browser-only, no React: the player
// component owns one instance and tells it which track to play; the engine
// reports track changes, track ends and autoplay refusals back through
// callbacks. Volume = master × fade level, mute is a master of zero.

import type { MusicTrack } from './music-mood';

export const CROSSFADE_MS = 3000;
const FADE_STEP_MS = 50;

interface Voice {
    el: HTMLAudioElement;
    track: MusicTrack;
    /** 0..1 fade level; the element's volume is master × level. */
    level: number;
    /** level change per step (+ fading in, − fading out, 0 settled). */
    delta: number;
}

export class MusicEngine {
    private current: Voice | null = null;
    private outgoing: Voice | null = null;
    private master = 0.5;
    private muted = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    private blocked = false;

    onTrackChange: ((track: MusicTrack | null) => void) | null = null;
    /** The current track played to its end — pick the next one. */
    onTrackEnded: ((track: MusicTrack) => void) | null = null;
    /** The element could not load or decode the file — pick another and skip this one until the next rescan. */
    onTrackError: ((track: MusicTrack) => void) | null = null;
    /** The browser refused to autoplay; call resume() after a user gesture. */
    onBlocked: (() => void) | null = null;

    get track(): MusicTrack | null { return this.current?.track ?? null; }
    get isBlocked(): boolean { return this.blocked; }

    setMaster(volume: number): void {
        this.master = Math.min(1, Math.max(0, volume));
        this.applyVolumes();
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.applyVolumes();
    }

    /** Start `track`, crossfading out whatever is playing. */
    play(track: MusicTrack): void {
        if (this.current?.track.src === track.src) {
            // The only track in its folder just ended: start it over.
            if (this.current.el.ended) {
                this.current.el.currentTime = 0;
                this.attemptPlay(this.current.el);
            }
            return;
        }
        const el = new Audio(track.src);
        el.preload = 'auto';
        el.loop = false;
        el.addEventListener('ended', () => {
            if (this.current?.el === el) this.onTrackEnded?.(track);
        });
        el.addEventListener('error', () => {
            if (this.current?.el === el) {
                console.warn(`[Music] could not play ${track.src}`);
                this.onTrackError?.(track);
            }
        });

        if (this.outgoing) this.dispose(this.outgoing);
        if (this.current) {
            this.outgoing = this.current;
            this.outgoing.delta = -FADE_STEP_MS / CROSSFADE_MS;
        }
        this.current = { el, track, level: this.current ? 0 : 1, delta: this.current ? FADE_STEP_MS / CROSSFADE_MS : 0 };
        this.applyVolumes();
        this.attemptPlay(el);
        this.ensureTimer();
        this.onTrackChange?.(track);
    }

    /** Retry after a user gesture unlocked audio. */
    resume(): void {
        if (!this.blocked) return;
        this.blocked = false;
        if (this.current) this.attemptPlay(this.current.el);
        if (this.outgoing) this.attemptPlay(this.outgoing.el);
    }

    stop(): void {
        if (this.current) this.dispose(this.current);
        if (this.outgoing) this.dispose(this.outgoing);
        this.current = null;
        this.outgoing = null;
        this.clearTimer();
        this.onTrackChange?.(null);
    }

    destroy(): void {
        this.onTrackChange = null;
        this.onTrackEnded = null;
        this.onTrackError = null;
        this.onBlocked = null;
        this.stop();
    }

    private attemptPlay(el: HTMLAudioElement): void {
        const p = el.play();
        if (p && typeof p.catch === 'function') {
            p.catch((err: any) => {
                if (err?.name === 'NotAllowedError') {
                    if (!this.blocked) {
                        this.blocked = true;
                        this.onBlocked?.();
                    }
                } else if (err?.name !== 'AbortError') {
                    console.warn('[Music] play failed:', err);
                }
            });
        }
    }

    private applyVolumes(): void {
        const master = this.muted ? 0 : this.master;
        for (const v of [this.current, this.outgoing]) {
            if (v) v.el.volume = Math.min(1, Math.max(0, master * v.level));
        }
    }

    private ensureTimer(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.step(), FADE_STEP_MS);
    }

    private clearTimer(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    private step(): void {
        let busy = false;
        if (this.current && this.current.delta !== 0) {
            this.current.level = Math.min(1, this.current.level + this.current.delta);
            if (this.current.level >= 1) this.current.delta = 0; else busy = true;
        }
        if (this.outgoing) {
            this.outgoing.level = Math.max(0, this.outgoing.level + this.outgoing.delta);
            if (this.outgoing.level <= 0) {
                this.dispose(this.outgoing);
                this.outgoing = null;
            } else busy = true;
        }
        this.applyVolumes();
        if (!busy) this.clearTimer();
    }

    private dispose(v: Voice): void {
        try { v.el.pause(); } catch { /* already gone */ }
        v.el.removeAttribute('src');
        try { v.el.load(); } catch { /* releases the decoder */ }
    }
}
