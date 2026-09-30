"use client";

// components/messages/MessageBox.tsx
// Stars of Dominion — a note to the friend who plays the empire next door.
//
// Plain text, 280 characters, no daily limit — only a few seconds' cooldown
// between messages to the same empire (casual-play spec Item 6c, as amended).
// Renders nothing for an AI-run empire: there is nobody there to read it. The
// thread comes from the player's own shard via the store; sending goes to
// /api/messages, which takes the sender from the session and nothing else.
//
// Message bodies are rendered as text nodes. There is no markup to interpret
// and no dangerouslySetInnerHTML anywhere near them.

import React from 'react';
import { Send } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { isHumanEmpire } from '@/lib/players/player-label';
import {
    MESSAGE_MAX_CHARS,
    cleanMessageBody,
    messageLength,
    threadWith,
    writeWindow,
    type EmpireMessageView,
} from '@/lib/messages/message-rules';
import { formatRealAgo } from '@/lib/time/galactic-time';

/** "today, 14:05" / "yesterday" / "3 days ago". */
function whenLine(at: string): string {
    const words = formatRealAgo(at);
    if (words !== 'today') return words;
    return `today, ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function MessageBox({ contactId, contactName, accent = '#38bdf8' }: {
    contactId: string;
    contactName: string;
    accent?: string;
}) {
    const me = useUIStore(s => s.playerFactionId);
    const messages = useUIStore(s => s.messages);
    const humanPlayers = useUIStore(s => s.humanPlayers);
    const addSentMessage = useUIStore(s => s.addSentMessage);

    const [draft, setDraft] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    // The server's word on when the next one may go, when it refused this one.
    const [serverNextAt, setServerNextAt] = React.useState<Date | null>(null);
    const [, setPulse] = React.useState(0);
    const listRef = React.useRef<HTMLUListElement | null>(null);

    React.useEffect(() => {
        setDraft('');
        setError(null);
        setServerNextAt(null);
    }, [contactId]);

    const thread = me ? threadWith(messages, me, contactId) : [];
    const mine = me ? writeWindow(messages, me, contactId) : { allowed: true, nextAt: null };
    const nextAt = [mine.nextAt, serverNextAt]
        .filter((d): d is Date => !!d && d.getTime() > Date.now())
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const waitSeconds = nextAt ? Math.max(1, Math.ceil((nextAt.getTime() - Date.now()) / 1000)) : 0;

    // Count the cooldown down while there is one.
    const nextAtMs = nextAt?.getTime() ?? 0;
    React.useEffect(() => {
        if (!nextAtMs) return;
        const id = setInterval(() => setPulse(p => p + 1), 1000);
        return () => clearInterval(id);
    }, [nextAtMs]);

    // Keep the newest message in view.
    const lastId = thread[thread.length - 1]?.id;
    React.useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [lastId]);

    if (!me || !isHumanEmpire(contactId, humanPlayers)) return null;

    const playerName = humanPlayers?.[contactId] ?? 'Commander';
    const length = messageLength(cleanMessageBody(draft));
    const over = length > MESSAGE_MAX_CHARS;
    const blocked = sending || over || length === 0 || waitSeconds > 0;

    const send = async () => {
        if (blocked) return;
        setSending(true);
        setError(null);
        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toFactionId: contactId, body: draft }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.message) {
                addSentMessage(data.message as EmpireMessageView);
                setDraft('');
            } else {
                // A cooldown refusal is not an error worth a red line: the
                // button counts it down and the draft is still there.
                if (data?.nextAt) setServerNextAt(new Date(data.nextAt));
                else setError(data?.error || `Could not send (${res.status}).`);
            }
        } catch {
            setError('Could not reach the server. Your message was not sent.');
        } finally {
            setSending(false);
        }
    };

    return (
        <section
            id="message-box"
            className="rounded-2xl border bg-slate-900/60 p-5 space-y-4"
            style={{ borderColor: `${accent}40` }}
        >
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[11px] font-display uppercase tracking-[0.2em] text-slate-300">
                    Messages with {playerName}
                </h3>
                <span className="text-[10px] font-mono text-slate-500">plain text · {MESSAGE_MAX_CHARS} characters</span>
            </div>

            {thread.length === 0 ? (
                <p className="text-xs text-slate-500">
                    Nothing yet. {playerName} plays {contactName}, and reads what you write here in their daily brief.
                </p>
            ) : (
                <ul ref={listRef} className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {thread.map(message => {
                        const fromMe = message.fromFactionId === me;
                        return (
                            <li
                                key={message.id}
                                className={`message-line rounded-xl border px-3 py-2 ${
                                    fromMe ? 'border-slate-700/60 bg-slate-950/60 ml-6' : 'bg-slate-800/50 mr-6'
                                }`}
                                style={fromMe ? undefined : { borderColor: `${accent}55` }}
                            >
                                <p className="text-[10px] font-mono text-slate-500 mb-0.5">
                                    {fromMe ? 'You' : playerName} · {whenLine(message.sentAt)}
                                </p>
                                <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                                    {message.body}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="space-y-2">
                <textarea
                    id="message-draft"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    rows={2}
                    placeholder={`Write to ${playerName}…`}
                    className="w-full rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/60 resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                    <span className={`text-[10px] font-mono ${over ? 'text-red-400' : 'text-slate-500'}`}>
                        {length}/{MESSAGE_MAX_CHARS}
                    </span>
                    <button
                        id="message-send"
                        onClick={send}
                        disabled={blocked}
                        className="min-h-[40px] px-4 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 disabled:opacity-40 disabled:hover:bg-sky-600/80 text-white text-xs font-bold flex items-center gap-2 transition-colors"
                    >
                        <Send size={14} />
                        {sending ? 'Sending…' : waitSeconds > 0 ? `Send in ${waitSeconds}s` : 'Send'}
                    </button>
                </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
        </section>
    );
}
