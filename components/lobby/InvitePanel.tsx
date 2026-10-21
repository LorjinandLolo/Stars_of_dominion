'use client';

// components/lobby/InvitePanel.tsx
// Stars of Dominion — friend links in the lobby (casual-play Item 6a).
//
// Two jobs, depending on who is looking:
//  - a player WITH an empire can make a link to send a friend;
//  - a player WITHOUT one who arrived through a link is offered the seat next
//    to the friend who sent it. The server picks that seat (the free empire
//    nearest the inviter's capital); this component only asks for it.

import React from 'react';
import { Link2, Copy, Check, Users } from 'lucide-react';
import { pendingInvite, forgetInvite } from '@/lib/invites/pending-invite';

export interface InviteClaimResult {
    factionId: string;
    empireName: string;
    inviterName: string;
    inviterEmpire: string;
    /** A seat link: the portfolio now held in the inviter's cabinet. */
    seatPortfolio?: string;
}

/** The cabinet portfolios a ruler can offer a friend (lib/government/types). */
const PORTFOLIOS: Array<{ id: string; label: string }> = [
    { id: 'defence', label: 'Defence' },
    { id: 'economy', label: 'Economy' },
    { id: 'science', label: 'Science' },
    { id: 'intelligence', label: 'Intelligence' },
    { id: 'interior', label: 'Interior' },
    { id: 'foreign', label: 'Foreign Affairs' },
];

interface Props {
    hasClaim: boolean;
    displayName?: string;
    onClaimed: (result: InviteClaimResult) => void;
}

export default function InvitePanel({ hasClaim, displayName, onClaimed }: Props) {
    const [pending, setPending] = React.useState<{ code: string; inviterName?: string; inviterEmpire?: string; seatPortfolio?: string | null } | null>(null);
    const [link, setLink] = React.useState<string | null>(null);
    /** What the next link offers: an empire next door, or a seat in the cabinet. */
    const [offer, setOffer] = React.useState<'empire' | string>('empire');
    const [copied, setCopied] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    // A breakaway state is being raised next to the friend (no free empire left).
    const [rising, setRising] = React.useState(false);

    // Arrived through a link? Read who sent it. A player who already leads an
    // empire cannot spend one, so the code is dropped rather than left waiting.
    React.useEffect(() => {
        const code = pendingInvite();
        if (!code) return;
        fetch(`/api/invites/${encodeURIComponent(code)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                // "used" is fine here when it was spent on this very account at
                // registration; the claim route makes the final call. A seat
                // link is good for a ruler too (a cabinet seat in another
                // court); an empire link is not.
                if (!data?.inviterName || (hasClaim && !data.seatPortfolio)) { forgetInvite(); return; }
                setPending({ code, inviterName: data.inviterName, inviterEmpire: data.inviterEmpire, seatPortfolio: data.seatPortfolio ?? null });
            })
            .catch(() => { /* the lobby still works without the banner */ });
    }, [hasClaim]);

    const claimNextToFriend = async () => {
        if (!pending) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/lobby/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteCode: pending.code, displayName }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error ?? 'That did not go through.'); setBusy(false); return; }
            forgetInvite();
            if (data?.pendingBreakaway) {
                // Every empire was taken: a province next to the friend is
                // rising for this player (Item 7). Wait for the worker to hand
                // it over, then enter like any other claim.
                setRising(true);
                const started = Date.now();
                const poll = async () => {
                    const claim = await fetch('/api/lobby/claim', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
                    if (claim?.myFactionId) {
                        onClaimed({ factionId: claim.myFactionId, empireName: 'your breakaway state', inviterName: data.inviterName, inviterEmpire: data.inviterEmpire });
                        return;
                    }
                    if (Date.now() - started > 120_000) {
                        setError('The galaxy did not answer in time. Is the game worker running? Try again in a minute.');
                        setRising(false);
                        setBusy(false);
                        return;
                    }
                    setTimeout(poll, 3000);
                };
                poll();
                return;
            }
            onClaimed(data as InviteClaimResult);
        } catch {
            setError('Could not reach the server.');
            setBusy(false);
        }
    };

    const makeLink = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(offer === 'empire' ? {} : { seatPortfolio: offer }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error ?? 'Could not make a link.'); return; }
            setLink(`${window.location.origin}/join?code=${data.invite.code}`);
            setCopied(false);
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* the link is on screen to select */ }
    };

    if (pending && (!hasClaim || pending.seatPortfolio)) {
        const seat = pending.seatPortfolio;
        return (
            <div id="invite-banner" className="mt-6 mx-auto max-w-lg rounded-2xl border border-sky-500/40 bg-sky-950/40 p-5 text-left">
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] uppercase text-sky-300">
                    <Users size={14} /> You were invited
                </div>
                <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                    <span className="font-semibold text-white">{pending.inviterName}</span> leads the{' '}
                    <span className="font-semibold text-sky-300">{pending.inviterEmpire}</span>.{' '}
                    {seat
                        ? <>They offer you the <span className="capitalize font-semibold">{seat}</span> seat in their cabinet: that brief's orders are yours to give in their name. Serve them, or not.</>
                        : <>Take the free empire nearest theirs and start as neighbours — or pick any empire below instead.</>}
                </p>
                {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
                <button
                    onClick={claimNextToFriend}
                    disabled={busy}
                    className="mt-4 w-full min-h-[44px] rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold transition-colors"
                >
                    {rising
                        ? `Every empire is taken — a province next to ${pending.inviterName} is rising for you…`
                        : busy ? 'Finding your seat…'
                        : seat ? `Take the ${seat} seat` : `Start next to ${pending.inviterName}`}
                </button>
            </div>
        );
    }

    if (!hasClaim) return null;

    return (
        <div id="invite-panel" className="mt-6 mx-auto max-w-lg text-left">
            {!link ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    <select
                        id="invite-offer"
                        value={offer}
                        onChange={e => setOffer(e.target.value)}
                        className="min-h-[40px] px-3 rounded-full border border-slate-700 bg-slate-900 text-slate-200 text-xs"
                        title="What the link offers"
                    >
                        <option value="empire">An empire next to mine</option>
                        {PORTFOLIOS.map(p => <option key={p.id} value={p.id}>A seat: Minister of {p.label}</option>)}
                    </select>
                    <button
                        onClick={makeLink}
                        disabled={busy}
                        className="flex items-center gap-2 min-h-[40px] px-5 rounded-full border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-200 text-sm font-semibold transition-colors"
                    >
                        <Link2 size={15} /> {busy ? 'Making a link…' : 'Invite a friend'}
                    </button>
                </div>
            ) : (
                <div className="rounded-xl border border-sky-500/30 bg-slate-950/70 p-4 space-y-2">
                    <p className="text-[11px] text-slate-400">
                        {offer === 'empire'
                            ? 'Send this to a friend. They start with the free empire nearest yours. Good for one friend, for seven days.'
                            : `Send this to a friend. They take the ${PORTFOLIOS.find(p => p.id === offer)?.label ?? offer} seat in your cabinet and can give that brief's orders in your name. A minister can serve you — or bury you. Good for one friend, for seven days.`}
                    </p>
                    <div className="flex gap-2">
                        <input
                            id="invite-link"
                            readOnly
                            value={link}
                            onFocus={e => e.currentTarget.select()}
                            className="flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
                        />
                        <button
                            onClick={copy}
                            className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                        >
                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}
            {error && <p className="mt-2 text-xs text-amber-300 text-center">{error}</p>}
        </div>
    );
}
