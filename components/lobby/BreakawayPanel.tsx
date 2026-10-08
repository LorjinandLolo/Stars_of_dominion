'use client';

// components/lobby/BreakawayPanel.tsx
// Stars of Dominion — late joiners and fallen players take a breakaway state
// (casual-play spec Item 7).
//
// Shown in the lobby to two people: someone who arrived after every empire
// was taken, and someone whose empire was destroyed. They see the breakaway
// states nobody leads, can take one, or let the game raise one — an
// underground movement declaring itself somewhere. Or they can just watch.
// Everything here is asked of the server; this component decides nothing.

import React from 'react';
import { Flame, Eye, EyeOff, Loader2 } from 'lucide-react';

interface Breakaway {
    factionId: string;
    name: string;
    parentName: string;
    worlds: number;
}

interface Status {
    eligible: boolean;
    reason: 'late_joiner' | 'eliminated' | null;
    message: string | null;
    breakaways: Breakaway[];
    pending: boolean;
    claimedFactionId: string | null;
    /** Item 14: a world still remembers this fallen empire. */
    canHide?: boolean;
}

const BUTTON = 'min-h-[40px] px-4 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';

export default function BreakawayPanel({ onTaken }: { onTaken: (factionId: string) => void }) {
    const [status, setStatus] = React.useState<Status | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        try {
            const res = await fetch('/api/lobby/breakaway', { cache: 'no-store' });
            if (res.ok) setStatus(await res.json());
        } catch { /* the rest of the lobby works without this panel */ }
    }, []);

    React.useEffect(() => { load(); }, [load]);

    // While the worker is handing a state over, watch for the claim to land.
    React.useEffect(() => {
        if (!status?.pending && !busy) return;
        const previous = status?.claimedFactionId ?? null;
        const started = Date.now();
        let stopped = false;
        const tick = async () => {
            if (stopped) return;
            const claim = await fetch('/api/lobby/claim', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
            if (claim?.myFactionId && claim.myFactionId !== previous) { onTaken(claim.myFactionId); return; }
            const fresh = await fetch('/api/lobby/breakaway', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
            if (fresh && !fresh.pending) {
                // The request was handled but no claim came of it.
                setStatus(fresh);
                setBusy(false);
                setError('That did not go through — the state may have been taken a moment ago. Try again.');
                return;
            }
            if (Date.now() - started > 120_000) {
                setBusy(false);
                setError('The galaxy did not answer in time. Is the game worker running? Try again in a minute.');
                return;
            }
            setTimeout(tick, 3000);
        };
        const first = setTimeout(tick, 2500);
        return () => { stopped = true; clearTimeout(first); };
    }, [status?.pending, busy, status?.claimedFactionId, onTaken]);

    const take = async (breakawayId: string | null, underground = false, hiding = false) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/lobby/breakaway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(breakawayId ? { breakawayId } : hiding ? { hiding: true } : underground ? { underground: true } : {}),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error ?? 'That did not go through.'); setBusy(false); return; }
            setStatus(s => s ? { ...s, pending: true } : s);
        } catch {
            setError('Could not reach the server.');
            setBusy(false);
        }
    };

    if (!status) return null;

    const watch = (
        <a
            href="/?watch=1"
            id="watch-galaxy"
            className={`${BUTTON} inline-flex items-center justify-center gap-2 border border-slate-700 bg-slate-900/70 hover:bg-slate-800 text-slate-300`}
        >
            <Eye size={15} /> Just watch the galaxy
        </a>
    );

    // Not for a breakaway: a player with a living empire sees nothing here; a
    // newcomer while seats are open is offered only the watch option.
    if (!status.eligible) {
        if (status.claimedFactionId) return null;
        return <div className="relative z-10 mb-6 flex justify-center px-4">{watch}</div>;
    }

    const waiting = busy || status.pending;
    const heading = status.reason === 'eliminated' ? 'Your empire has fallen' : 'Every empire is taken';
    const lead = status.reason === 'eliminated'
        ? 'The galaxy is not done with you. Take the helm of a breakaway state — and what losing taught you comes with you.'
        : 'But not every province is content. Take the helm of a breakaway state: a few worlds, a weak fleet, money for mercenaries, and an empire that wants them back.';

    return (
        <section id="breakaway-panel" className="relative z-10 w-full max-w-2xl mx-auto mb-8 px-4">
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-5 space-y-4 text-left">
                <div>
                    <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] uppercase text-amber-300">
                        <Flame size={14} /> {heading}
                    </p>
                    <p className="mt-2 text-sm text-slate-200 leading-relaxed">{lead}</p>
                </div>

                {waiting ? (
                    <p className="flex items-center gap-2 text-sm text-amber-200">
                        <Loader2 size={16} className="animate-spin" /> The galaxy is handing you the state…
                    </p>
                ) : (
                    <>
                        {status.canHide && (
                            <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 space-y-2">
                                <button
                                    id="go-into-hiding"
                                    onClick={() => take(null, false, true)}
                                    className={`${BUTTON} w-full bg-red-800/80 hover:bg-red-700/80 text-white inline-flex items-center justify-center gap-2`}
                                >
                                    <EyeOff size={15} /> Go into hiding
                                </button>
                                <p className="text-xs text-slate-300">
                                    Flee with the people who would still follow you, to a world out on the edge of what was yours, where the conqueror's reach is thin. Build a movement in secret; if it wins, the state is yours.
                                </p>
                            </div>
                        )}
                        {status.breakaways.length > 0 && (
                            <ul className="space-y-2">
                                {status.breakaways.map(b => (
                                    <li key={b.factionId} className="breakaway-option flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-950/60 p-3">
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-white">{b.name}</span>
                                            <span className="block text-xs text-slate-400">
                                                Broke from {b.parentName} · {b.worlds} world{b.worlds === 1 ? '' : 's'}
                                            </span>
                                        </span>
                                        <button onClick={() => take(b.factionId)} className={`${BUTTON} shrink-0 bg-amber-600/80 hover:bg-amber-500/80 text-white`}>
                                            Take the helm
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                id="raise-breakaway"
                                onClick={() => take(null)}
                                className={`${BUTTON} flex-1 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100`}
                                title="The game finds a province ready to rise and hands it to you"
                            >
                                {status.breakaways.length ? 'Or raise a new one' : 'Lead an uprising'}
                            </button>
                            {watch}
                        </div>
                        <button
                            id="lead-underground"
                            onClick={() => take(null, true)}
                            className={`${BUTTON} w-full border border-slate-600 bg-slate-950/70 hover:bg-slate-900 text-slate-200 inline-flex items-center justify-center gap-2`}
                            title="Lead a rebel cell nobody knows you lead. No worlds yet: build it in secret, then stand in the open"
                        >
                            <EyeOff size={15} /> Lead a movement underground
                        </button>
                        <p className="text-xs text-slate-400">
                            Underground: a rebel cell inside someone else's empire (an AI one where the game can), no worlds and no fleet. Strike, hide, take or refuse foreign money, and declare when it is strong enough. If it wins, the state is yours.
                        </p>
                    </>
                )}
                {error && <p className="text-xs text-red-300">{error}</p>}
            </div>
        </section>
    );
}
