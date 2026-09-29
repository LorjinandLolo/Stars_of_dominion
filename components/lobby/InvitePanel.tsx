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
}

interface Props {
    hasClaim: boolean;
    displayName?: string;
    onClaimed: (result: InviteClaimResult) => void;
}

export default function InvitePanel({ hasClaim, displayName, onClaimed }: Props) {
    const [pending, setPending] = React.useState<{ code: string; inviterName?: string; inviterEmpire?: string } | null>(null);
    const [link, setLink] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Arrived through a link? Read who sent it. A player who already leads an
    // empire cannot spend one, so the code is dropped rather than left waiting.
    React.useEffect(() => {
        const code = pendingInvite();
        if (!code) return;
        if (hasClaim) { forgetInvite(); return; }
        fetch(`/api/invites/${encodeURIComponent(code)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                // "used" is fine here when it was spent on this very account at
                // registration; the claim route makes the final call.
                if (data?.inviterName) setPending({ code, inviterName: data.inviterName, inviterEmpire: data.inviterEmpire });
                else forgetInvite();
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
            const res = await fetch('/api/invites', { method: 'POST' });
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

    if (!hasClaim && pending) {
        return (
            <div id="invite-banner" className="mt-6 mx-auto max-w-lg rounded-2xl border border-sky-500/40 bg-sky-950/40 p-5 text-left">
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] uppercase text-sky-300">
                    <Users size={14} /> You were invited
                </div>
                <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                    <span className="font-semibold text-white">{pending.inviterName}</span> leads the{' '}
                    <span className="font-semibold text-sky-300">{pending.inviterEmpire}</span>. Take the free empire nearest
                    theirs and start as neighbours — or pick any empire below instead.
                </p>
                {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
                <button
                    onClick={claimNextToFriend}
                    disabled={busy}
                    className="mt-4 w-full min-h-[44px] rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold transition-colors"
                >
                    {busy ? 'Finding your seat…' : `Start next to ${pending.inviterName}`}
                </button>
            </div>
        );
    }

    if (!hasClaim) return null;

    return (
        <div id="invite-panel" className="mt-6 mx-auto max-w-lg text-left">
            {!link ? (
                <button
                    onClick={makeLink}
                    disabled={busy}
                    className="mx-auto flex items-center gap-2 min-h-[40px] px-5 rounded-full border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-200 text-sm font-semibold transition-colors"
                >
                    <Link2 size={15} /> {busy ? 'Making a link…' : 'Invite a friend'}
                </button>
            ) : (
                <div className="rounded-xl border border-sky-500/30 bg-slate-950/70 p-4 space-y-2">
                    <p className="text-[11px] text-slate-400">
                        Send this to a friend. They start with the free empire nearest yours. Good for one friend, for seven days.
                    </p>
                    <div className="flex gap-2">
                        <input
                            id="invite-link"
                            readOnly
                            value={link}
                            onFocus={e => e.currentTarget.select()}
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
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
