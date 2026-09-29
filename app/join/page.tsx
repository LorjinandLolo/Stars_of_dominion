'use client';

// app/join/page.tsx
// Stars of Dominion — where a friend link lands (/join?code=...).
//
// Public: the person opening it has no account yet. It says who invited them
// and what that means ("you start next to their empire"), keeps the code for
// the steps that follow (register or log in, then the lobby), and sends them
// on. The claim itself happens in the lobby, server-side (lib/invites).

import React from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { rememberInvite, forgetInvite } from '@/lib/invites/pending-invite';

interface Preview {
    valid: boolean;
    reason?: string;
    code?: string | null;
    inviterName?: string;
    inviterEmpire?: string;
    inviteRequired?: boolean;
}

export default function JoinPage() {
    const router = useRouter();
    const [preview, setPreview] = React.useState<Preview | null>(null);
    const [signedIn, setSignedIn] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('code') ?? '';
        fetch(`/api/invites/${encodeURIComponent(code)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then((data: Preview) => {
                setPreview(data);
                if (data.valid && data.code) rememberInvite(data.code);
                else forgetInvite();
            })
            .catch(() => setPreview({ valid: false, reason: 'Could not reach the server.' }));
        authService.getCurrentUser().then(u => setSignedIn(!!u));
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/80 p-6 sm:p-8 shadow-2xl space-y-5">
                <div className="text-center">
                    <p className="text-[10px] font-bold tracking-[0.35em] uppercase text-sky-400">Stars of Dominion</p>
                    <h1 className="mt-2 text-2xl font-black text-white tracking-tight">
                        {preview === null ? 'Reading your invite…'
                            : preview.valid ? 'You have been invited' : 'This invite cannot be used'}
                    </h1>
                </div>

                {preview?.valid && (
                    <div className="space-y-3 text-center">
                        <p className="text-sm text-slate-300 leading-relaxed">
                            <span className="font-semibold text-white">{preview.inviterName}</span> leads the{' '}
                            <span className="font-semibold text-sky-300">{preview.inviterEmpire}</span> and wants you in their galaxy.
                        </p>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Take a seat and you start with the free empire nearest theirs — neighbours from day one.
                            Five minutes a day is enough to play.
                        </p>
                        <p className="text-[11px] font-mono tracking-widest text-slate-500">CODE {preview.code}</p>
                    </div>
                )}

                {preview && !preview.valid && (
                    <p className="text-sm text-amber-300/90 text-center leading-relaxed">{preview.reason}</p>
                )}

                {preview?.valid && signedIn === true && (
                    <button
                        onClick={() => router.push('/lobby')}
                        className="w-full min-h-[44px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors"
                    >
                        Continue to the lobby
                    </button>
                )}

                {preview?.valid && signedIn === false && (
                    <div className="space-y-2">
                        <button
                            onClick={() => router.push('/login?mode=register')}
                            className="w-full min-h-[44px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors"
                        >
                            Create an account
                        </button>
                        <button
                            onClick={() => router.push('/login')}
                            className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold transition-colors"
                        >
                            I already have an account
                        </button>
                    </div>
                )}

                {preview && !preview.valid && (
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold transition-colors"
                    >
                        Go to sign in
                    </button>
                )}
            </div>
        </div>
    );
}
