// app/api/music/route.ts
// The soundtrack manifest, read from disk on every call so a file dropped
// into public/music/<mood>/ is picked up without a rebuild or an edit.
// Read-only, no auth: it lists file names under a public folder that the
// static server already serves.

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { MUSIC_MOODS, trackTitleFromFilename, type MusicMood, type MusicTrack } from '@/lib/audio/music-mood';

export const dynamic = 'force-dynamic';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.aac', '.flac', '.webm', '.opus']);

async function listMood(root: string, mood: MusicMood): Promise<MusicTrack[]> {
    let names: string[];
    try {
        names = await fs.readdir(path.join(root, mood));
    } catch (e: any) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }
    return names
        .filter(n => AUDIO_EXTENSIONS.has(path.extname(n).toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
        .map(n => ({ mood, src: `/music/${mood}/${encodeURIComponent(n)}`, title: trackTitleFromFilename(n) }));
}

export async function GET() {
    const root = path.join(process.cwd(), 'public', 'music');
    try {
        const entries = await Promise.all(MUSIC_MOODS.map(async m => [m, await listMood(root, m)] as const));
        const tracks = Object.fromEntries(entries) as Record<MusicMood, MusicTrack[]>;
        return NextResponse.json(
            { tracks, scannedAt: Date.now(), folder: 'public/music' },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (err: any) {
        console.error('[API/music] scan failed:', err);
        return NextResponse.json({ error: err?.message ?? 'scan failed' }, { status: 500 });
    }
}
