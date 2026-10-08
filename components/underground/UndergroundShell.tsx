'use client';

/**
 * components/underground/UndergroundShell.tsx
 * Item 13d: the page for a person leading a movement from hiding. No galaxy
 * map, no empire: what the cell itself can see. Its strength and cover, its
 * money and who sends it (a name only when no go-between stands in the way),
 * the strikes it can make, and the moment it is ready to stand in the open.
 *
 * Everything shown comes from /api/rebel/cell (the worker's seatView); every
 * button queues an order the worker re-checks. Browser-safe: rebellion-types
 * and the server-action module only.
 */

import React from 'react';
import { EyeOff, Flame, Loader2, LogOut, Megaphone, Radio, Shield, Users, Wallet } from 'lucide-react';
import {
    COMPANION_ROLE_LABEL, HELD_ACT_COOLDOWN_SECONDS,
    type CellActKind, type CellSeatView, type Companion, type CompanionSkill, type ExileRecord, type JobApproach, type JobBoardEntry, type JobPlan, type JobPlanView,
} from '@/lib/rebellion/rebellion-types';
import { APPROACH_LABEL } from '@/lib/fallen/jobs';
import { speciesLabel } from '@/lib/espionage/dossier';
import { cellOrderAction } from '@/app/actions/espionage';

const POLL_MS = 15_000;
const JOB_POLL_MS = 3_000;
/** The sim runs at 15x: sim seconds to a real-time phrase. */
function realDuration(simSeconds: number): string {
    const minutes = Math.max(1, Math.round(simSeconds / 15 / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 6) / 10;
    return `${hours} h`;
}

const ACT_LABEL: Record<CellActKind, { label: string; blurb: string }> = {
    hijack: { label: 'Steal a ship', blurb: 'Only as a planned job: a warship taken from its berth to our hidden dock.' },
    propaganda: { label: 'Agitate', blurb: 'Leaflets, slogans, a crowd. Turns the people we speak for against the government.' },
    heist: { label: 'Rob them', blurb: 'Take money from the treasury. Sponsors take a share.' },
    sabotage: { label: 'Sabotage', blurb: 'Wreck works and shake the world\'s stability.' },
    prison_break: { label: 'Break them out', blurb: 'Free the agents of those who pay us from the government\'s prisons.' },
    assassination: { label: 'Kill the governor', blurb: 'The government\'s face on this world. The loudest thing we can do.' },
};

function coverWord(c: number): { word: string; color: string } {
    if (c >= 0.75) return { word: 'deep cover', color: 'text-emerald-400' };
    if (c >= 0.5) return { word: 'hidden', color: 'text-emerald-300' };
    if (c >= 0.3) return { word: 'exposed', color: 'text-amber-400' };
    return { word: 'hunted', color: 'text-red-400' };
}

const BTN = 'min-h-[40px] px-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export default function UndergroundShell({ seatId, onRisen }: { seatId: string; onRisen: () => void }) {
    const [view, setView] = React.useState<CellSeatView | null>(null);
    const [loaded, setLoaded] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [toast, setToast] = React.useState<{ text: string; ok: boolean } | null>(null);

    const load = React.useCallback(async () => {
        try {
            const res = await fetch('/api/rebel/cell', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.risen) { onRisen(); return; }
            setView(data.view ?? null);
        } catch { /* keep the last view */ }
        setLoaded(true);
    }, [onRisen]);

    // A job is played in one sitting: while one is under way, look for the next scene often.
    const jobRunning = view?.job?.status === 'running';
    React.useEffect(() => {
        load();
        const t = setInterval(load, jobRunning ? JOB_POLL_MS : POLL_MS);
        return () => clearInterval(t);
    }, [load, jobRunning]);

    const order = async (actionId: Parameters<typeof cellOrderAction>[1], payload: Record<string, unknown> = {}, sent = 'Sent. The cell acts on it within a minute.') => {
        setBusy(true);
        const res = await cellOrderAction(seatId, actionId, payload);
        setBusy(false);
        setToast(res.success ? { text: sent, ok: true } : { text: res.error ?? 'That did not go through.', ok: false });
        setTimeout(() => setToast(null), 5000);
        setTimeout(load, 4000);
    };

    const release = async () => {
        if (!window.confirm('Let go of the movement? You return to the lobby, and the cell goes on without you.')) return;
        await fetch('/api/lobby/claim', { method: 'DELETE' });
        localStorage.removeItem('selectedFactionId');
        window.location.href = '/lobby';
    };

    if (!loaded || !view) {
        return (
            <main className="h-dvh bg-slate-950 text-slate-300 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <Loader2 className="animate-spin text-amber-400" />
                <p className="text-sm">{loaded ? 'Finding your people. The galaxy hands the cell over within a minute or two.' : 'Making contact…'}</p>
                {loaded && <button onClick={release} className={`${BTN} border border-slate-700 text-slate-400`}>Back to the lobby</button>}
            </main>
        );
    }

    if (view.status !== 'active' && view.status !== 'risen') {
        return (
            <main className="h-dvh bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-4 px-4 text-center">
                <p className="text-[10px] tracking-[0.3em] uppercase text-red-400">{view.status === 'crushed' ? 'The movement is broken' : 'The movement has faded'}</p>
                <h1 className="text-2xl font-display capitalize">{view.name}</h1>
                <ul className="text-xs text-slate-400 space-y-1 max-w-md">{view.log.slice(0, 4).map((l, i) => <li key={i}>{l.text}</li>)}</ul>
                <button onClick={release} className={`${BTN} bg-amber-600/80 hover:bg-amber-500/80 text-white`}>Back to the lobby</button>
            </main>
        );
    }

    const cover = coverWord(view.concealment);
    const cooling = view.nextActAtSeconds && view.nextActAtSeconds > view.asOfSeconds ? view.nextActAtSeconds - view.asOfSeconds : 0;

    return (
        <main className="min-h-dvh bg-slate-950 text-slate-200 px-4 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
                <header className="space-y-1">
                    <p className="text-[10px] tracking-[0.3em] uppercase text-amber-400 flex items-center gap-2">
                        <EyeOff size={12} /> {view.inTheOpen ? 'In the open' : 'Underground'}
                    </p>
                    <h1 className="text-2xl font-display capitalize">{view.name}</h1>
                    <p className="text-sm text-slate-400">
                        For {view.cause}, on {view.planetName}, a world of {view.hostName}.
                        {view.inTheOpen && view.crisisName ? ` ${view.crisisName}: ${view.hostName} must answer us, or lose the world.` : ''}
                    </p>
                </header>

                {view.exile && <CrewSection exile={view.exile} />}

                {view.exile && (
                    <JobsSection
                        view={view}
                        busy={busy}
                        onOrder={order}
                        onChoose={choiceId => order('REB_JOB_CHOOSE', { choiceId }, 'Done. Wait for what happens.')}
                    />
                )}

                <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat icon={<Flame size={12} />} label="Strength" value={`${view.strength} / 100`} />
                    <Stat icon={<Users size={12} />} label="Members" value={`about ${view.members}`} />
                    <Stat icon={<Wallet size={12} />} label="Money" value={`${view.treasury}`} />
                    <Stat icon={<Shield size={12} />} label="Cover" value={<span className={cover.color}>{cover.word}</span>} />
                </section>
                <p className="text-xs text-slate-500">
                    {view.found ? `${view.hostName}'s security knows we exist. It does not know who leads us.` : `As far as we can tell, ${view.hostName} does not know we exist.`}
                    {view.lyingLow ? ' We are lying low.' : ''}
                </p>

                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[10px] tracking-widest uppercase text-slate-400">Strike</h2>
                        <span className="text-[10px] text-slate-500">{view.acts} so far{cooling ? ` · next in about ${realDuration(cooling)}` : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {view.actsOpen.map(a => (
                            <div key={a.act} className="rounded-lg border border-slate-800 p-2 flex flex-col gap-1.5">
                                <span className="text-sm text-slate-200">{ACT_LABEL[a.act].label}</span>
                                <span className="text-[11px] text-slate-500 leading-snug">{ACT_LABEL[a.act].blurb}</span>
                                <button disabled={busy || !a.open} onClick={() => order('REB_CELL_ACT', { act: a.act }, 'The order is out. Watch the news.')}
                                    className={`${BTN} ${a.open ? 'bg-red-800/80 hover:bg-red-700 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                    {a.open ? 'Do it' : a.why}
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-500">Every strike costs cover and tells {view.hostName} we are here. One every {realDuration(HELD_ACT_COOLDOWN_SECONDS)} at most.</p>
                    <button disabled={busy} onClick={() => order('REB_CELL_LIE_LOW', { on: !view.lyingLow }, view.lyingLow ? 'We are active again.' : 'We go quiet.')}
                        className={`${BTN} w-full border border-slate-700 text-slate-300 hover:bg-slate-800`}>
                        {view.lyingLow ? 'Become active again' : 'Lie low: no strikes, cover rebuilt, slower recruiting'}
                    </button>
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                    <h2 className="text-[10px] tracking-widest uppercase text-slate-400 flex items-center gap-2"><Wallet size={12} /> Who pays us</h2>
                    {view.sponsors.length === 0 && <p className="text-xs text-slate-500">Nobody. Every coin we have, we raised or took ourselves.</p>}
                    {view.sponsors.map(s => (
                        <div key={s.sponsorshipId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 p-2">
                            <span className="text-xs text-slate-300">
                                {s.sponsorName ?? 'A go-between who will not say whose money it is'}{s.armed ? ', with weapons' : ''}
                            </span>
                            <button disabled={busy} onClick={() => order('REB_CELL_REFUSE_SPONSOR', { sponsorshipId: s.sponsorshipId }, 'The money goes back.')}
                                className={`${BTN} shrink-0 border border-slate-700 text-slate-300 hover:bg-slate-800`}>Send it back</button>
                        </div>
                    ))}
                    <p className="text-[11px] text-slate-500">Foreign money makes us stronger and gives {view.hostName} someone else to blame. It also comes with a name we may not want attached to us.</p>
                </section>

                <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
                    <h2 className="text-[10px] tracking-widest uppercase text-amber-300 flex items-center gap-2"><Megaphone size={12} /> Stand in the open</h2>
                    <p className="text-xs text-slate-300">
                        {view.inTheOpen
                            ? `We have declared. If ${view.hostName} neither settles with us nor crushes us before its patience runs out, ${view.planetName} becomes our state, and you lead it.`
                            : 'When we are strong and old enough, we can declare: a secession crisis on our world, in our name. If it is not settled or crushed, it ends in a state of our own.'}
                    </p>
                    {!view.inTheOpen && (
                        <button disabled={busy || !view.declare.open} onClick={() => order('REB_CELL_DECLARE', {}, 'We declare. The galaxy will hear it.')}
                            className={`${BTN} w-full ${view.declare.open ? 'bg-amber-600/80 hover:bg-amber-500/80 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                            {view.declare.open ? 'Declare' : view.declare.why}
                        </button>
                    )}
                </section>

                <section className="space-y-1">
                    <h2 className="text-[10px] tracking-widest uppercase text-slate-500 flex items-center gap-2"><Radio size={12} /> What we know</h2>
                    {view.log.length === 0 && <p className="text-xs text-slate-500">Nothing yet.</p>}
                    <ul className="space-y-1">{view.log.map((l, i) => <li key={i} className="text-xs text-slate-400">{l.text}</li>)}</ul>
                </section>

                <footer className="flex justify-between items-center pt-2">
                    <span className="text-[10px] text-slate-600">Checks for news every 15 seconds.</span>
                    <button onClick={release} className={`${BTN} flex items-center gap-1.5 text-slate-500 hover:text-slate-300`}><LogOut size={12} /> Let go</button>
                </footer>
            </div>

            {toast && (
                <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm ${toast.ok ? 'bg-emerald-800 text-white' : 'bg-red-800 text-white'}`}>{toast.text}</div>
            )}
        </main>
    );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center gap-1">{icon}{label}</div>
            <div className="text-sm text-slate-200 mt-0.5">{value}</div>
        </div>
    );
}

const SKILL_WORD: Record<string, string> = {
    infiltration: 'getting in unseen', violence: 'a fight', piloting: 'flying', talk: 'talking people round', tech: 'machines and records',
};

/** Item 14a: the people who fled with a fallen empire's leader. Text only in season one. */
function CrewSection({ exile }: { exile: ExileRecord }) {
    const bondWord = (b: number) => (b >= 75 ? 'would die for you' : b >= 50 ? 'trusts you' : b >= 25 ? 'follows you' : 'barely knows you');
    const statusWord: Record<string, string> = { free: '', wounded: 'wounded', captured: 'held by the conqueror', dead: 'dead', gone: 'gone: betrayed us' };
    return (
        <section className="rounded-xl border border-red-900/50 bg-red-950/10 p-4 space-y-3">
            <div>
                <h2 className="text-[10px] tracking-widest uppercase text-red-300 flex items-center gap-2"><Users size={12} /> Who came with you</h2>
                <p className="text-xs text-slate-400 mt-1">
                    You led {exile.fromName}. {exile.conquerorName} holds it now. These people did not stay to watch.
                </p>
            </div>
            <ul className="space-y-2">
                {exile.crew.map(c => (
                    <li key={c.id} className={`rounded-lg border border-slate-800 p-2 ${c.status === 'dead' ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between gap-2">
                            <span className="text-sm text-slate-100">{c.name}</span>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                                {COMPANION_ROLE_LABEL[c.role]}{statusWord[c.status] ? ` · ${statusWord[c.status]}` : ''}
                            </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                            Once {c.formerly}. {c.species ? speciesLabel(c.species) : 'Of another people'}, {c.traits.join(', ')}; {bondWord(c.bond)}.
                        </div>
                        <div className="text-[11px] text-slate-500">
                            {(() => {
                                const good = (Object.entries(c.skills) as [string, number][]).filter(([, v]) => v >= 3).map(([k]) => SKILL_WORD[k] ?? k);
                                return good.length ? `Good at ${good.join(' and ')}.` : 'Good at nothing in particular, yet.';
                            })()}
                        </div>
                        <div className={`text-[11px] italic mt-0.5 ${c.threadResolved ? 'text-emerald-400 line-through decoration-emerald-700' : 'text-slate-300'}`}>{c.thread}</div>
                        {c.status === 'captured' && (
                            <div className="text-[11px] text-red-300">Held and questioned. A prison break could bring them home.</div>
                        )}
                    </li>
                ))}
            </ul>
            {(exile.memorial?.length ?? 0) > 0 && (
                <div className="border-t border-red-900/40 pt-2 space-y-1">
                    <h3 className="text-[10px] tracking-widest uppercase text-slate-500">We remember</h3>
                    {exile.memorial!.map((m, i) => (
                        <p key={i} className="text-[11px] text-slate-400"><span className="text-slate-200">{m.name}</span>, {COMPANION_ROLE_LABEL[m.role].toLowerCase()}. {m.epitaph}</p>
                    ))}
                </div>
            )}
        </section>
    );
}

/**
 * Item 14b: the job board and the job being played. Choices show their odds
 * as words; the worker rolls them. The scene changes when the worker has
 * resolved the choice, a few seconds later.
 */
type OrderFn = (actionId: Parameters<typeof cellOrderAction>[1], payload?: Record<string, unknown>, sent?: string) => void;

function JobsSection({ view, busy, onOrder, onChoose }: {
    view: CellSeatView;
    busy: boolean;
    onOrder: OrderFn;
    onChoose: (choiceId: string) => void;
}) {
    const job = view.job;
    const [picking, setPicking] = React.useState<string | null>(null);
    const [waitingAt, setWaitingAt] = React.useState<number | null>(null);
    const storyLen = job?.story.length ?? 0;
    React.useEffect(() => { setWaitingAt(null); }, [storyLen, job?.status]);
    const free = (view.exile?.crew ?? []).filter(c => c.status === 'free');

    if (job && job.status === 'running') {
        return (
            <section className="rounded-xl border border-amber-500/50 bg-slate-900/80 p-4 space-y-3">
                <h2 className="text-[10px] tracking-widest uppercase text-amber-300">{job.title} · {job.crew.join(', ')}</h2>
                {job.story.length > 0 && (
                    <ol className="space-y-1.5">{job.story.map((s, i) => <li key={i} className="text-xs text-slate-400 leading-relaxed">{s}</li>)}</ol>
                )}
                {job.sceneText && <p className="text-sm text-slate-100 leading-relaxed">{job.sceneText}</p>}
                {waitingAt !== null ? (
                    <p className="flex items-center gap-2 text-xs text-amber-200"><Loader2 size={14} className="animate-spin" /> It is happening…</p>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {job.choices.map(c => (
                            <button key={c.id} disabled={busy} onClick={() => { setWaitingAt(storyLen); onChoose(c.id); }}
                                className={`${BTN} text-left normal-case tracking-normal font-normal text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 flex justify-between gap-3 py-2`}>
                                <span>
                                    <span className="block">{c.label}</span>
                                    {c.risk && <span className="block text-[11px] text-red-300 mt-0.5">{c.risk}</span>}
                                </span>
                                {c.odds && <span className="shrink-0 text-[11px] italic text-amber-300">{c.odds}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </section>
        );
    }

    const board = view.jobs ?? [];
    const pv = view.plan ?? null;
    const plan = pv?.plan ?? null;
    const crewName = (id: string | null | undefined) => (view.exile?.crew ?? []).find(c => c.id === id)?.name ?? 'someone';
    return (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h2 className="text-[10px] tracking-widest uppercase text-slate-400">Jobs</h2>
            {job && (
                <div className="rounded-lg border border-slate-800 p-3 space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Last job: {job.title} · {job.status === 'success' ? 'it worked' : job.status === 'partial' ? 'it worked, loudly' : 'it failed'}
                    </div>
                    <ol className="space-y-1">{job.story.map((s, i) => <li key={i} className="text-xs text-slate-400">{s}</li>)}</ol>
                </div>
            )}
            {(pv?.dock?.length ?? 0) > 0 && (
                <p className="text-[11px] text-slate-400">
                    In the hidden dock: {pv!.dock.map(d => `the ${d.name} (${d.shipClass})`).join(', ')}. They sail for our state the day we have one.
                </p>
            )}
            {board.map(j => {
                const planned = plan?.jobId === j.id ? plan : null;
                return (
                    <div key={j.id} className="rounded-lg border border-slate-800 p-2 space-y-1.5">
                        <div className="text-sm text-slate-200">{j.title}</div>
                        <div className="text-[11px] text-slate-400">{j.pitch}</div>
                        {(j.minRecon ?? 0) > 0 && <div className="text-[10px] text-slate-500">Needs {j.minRecon} watches on the target first.</div>}

                        {planned && pv && picking !== j.id && (
                            <PlanPanel view={view} pv={pv} plan={planned} jobId={j.id} busy={busy} crewName={crewName} onOrder={onOrder} />
                        )}

                        {picking === j.id ? (
                            <Planner job={j} targets={pv?.targets?.[j.id] ?? []} free={free} busy={busy}
                                onCancel={() => setPicking(null)}
                                onSave={payload => { onOrder('REB_JOB_PLAN', { jobId: j.id, ...payload }, 'The plan is set.'); setPicking(null); }} />
                        ) : (
                            <button disabled={(!j.open && !planned) || busy} onClick={() => setPicking(j.id)}
                                className={`${BTN} w-full ${j.open || planned ? 'bg-slate-800 hover:bg-slate-700 text-amber-200' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                {planned ? 'Change the plan' : j.open ? 'Plan it' : j.why}
                            </button>
                        )}
                    </div>
                );
            })}
            {board.length === 0 && <p className="text-xs text-slate-500">No jobs yet.</p>}
        </section>
    );
}

/** Item 14c: choose the target, the approach, who goes and who does what. */
function Planner({ job, targets, free, busy, onCancel, onSave }: {
    job: JobBoardEntry;
    targets: { id: string; label: string }[];
    free: Companion[];
    busy: boolean;
    onCancel: () => void;
    onSave: (payload: { targetId: string | null; approach: JobApproach; crewIds: string[]; roles: Partial<Record<CompanionSkill, string>> }) => void;
}) {
    const [targetId, setTargetId] = React.useState<string>(targets[0]?.id ?? '');
    const [approach, setApproach] = React.useState<JobApproach>('quiet');
    const [crew, setCrew] = React.useState<string[]>([]);
    const [roles, setRoles] = React.useState<Partial<Record<CompanionSkill, string>>>({});
    const chosen = free.filter(c => crew.includes(c.id));
    const needsTarget = job.targetKind && job.targetKind !== 'none';
    const SELECT = 'w-full min-h-[40px] bg-slate-950 border border-slate-800 rounded px-2 text-xs text-slate-200';
    return (
        <div className="space-y-2 border-t border-slate-800 pt-2">
            {needsTarget && (
                <label className="block text-[10px] text-slate-500">Target
                    <select value={targetId} onChange={e => setTargetId(e.target.value)} className={SELECT}>
                        {targets.length === 0 && <option value="">Nothing within reach</option>}
                        {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
            )}
            <label className="block text-[10px] text-slate-500">Approach
                <select value={approach} onChange={e => setApproach(e.target.value as JobApproach)} className={SELECT}>
                    {(Object.keys(APPROACH_LABEL) as JobApproach[]).map(a => <option key={a} value={a}>{APPROACH_LABEL[a]}</option>)}
                </select>
            </label>
            <div className="text-[10px] text-slate-500">Who goes? Up to {job.maxCrew}.</div>
            {free.map(c => (
                <label key={c.id} className="flex items-center gap-2 min-h-[36px] text-xs text-slate-300">
                    <input type="checkbox" checked={crew.includes(c.id)}
                        disabled={!crew.includes(c.id) && crew.length >= job.maxCrew}
                        onChange={e => setCrew(e.target.checked ? [...crew, c.id] : crew.filter(x => x !== c.id))} />
                    {c.name} <span className="text-slate-500">({COMPANION_ROLE_LABEL[c.role].toLowerCase()})</span>
                </label>
            ))}
            {chosen.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {(Object.keys(SKILL_WORD) as CompanionSkill[]).map(skill => (
                        <label key={skill} className="block text-[10px] text-slate-500">Who handles {SKILL_WORD[skill]}?
                            <select value={roles[skill] ?? ''} onChange={e => setRoles({ ...roles, [skill]: e.target.value || undefined })} className={SELECT}>
                                <option value="">Whoever is best</option>
                                {chosen.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </label>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={onCancel} className={`${BTN} flex-1 border border-slate-700 text-slate-400`}>Back</button>
                <button disabled={busy || crew.length === 0 || (needsTarget && !targetId)}
                    onClick={() => onSave({ targetId: needsTarget ? targetId : null, approach, crewIds: crew, roles })}
                    className={`${BTN} flex-1 bg-amber-600/80 hover:bg-amber-500/80 text-white`}>Set the plan</button>
            </div>
        </div>
    );
}

/** Item 14c: a plan in hand: watches, gear, and the go. */
function PlanPanel({ view, pv, plan, jobId, busy, crewName, onOrder }: {
    view: CellSeatView;
    pv: JobPlanView;
    plan: JobPlan;
    jobId: string;
    busy: boolean;
    crewName: (id: string | null | undefined) => string;
    onOrder: OrderFn;
}) {
    const [watcher, setWatcher] = React.useState('');
    const target = (pv.targets[jobId] ?? []).find(t => t.id === plan.targetId);
    const free = (view.exile?.crew ?? []).filter(c => c.status === 'free');
    const watching = !!plan.reconUntilSeconds;
    const roleLine = (Object.entries(plan.roles) as [CompanionSkill, string][]).map(([s, id]) => `${crewName(id)} on ${SKILL_WORD[s]}`).join('; ');
    return (
        <div className="rounded border border-amber-900/50 bg-amber-950/10 p-2 space-y-2 text-[11px] text-slate-300">
            <div>
                The plan: {target ? `${target.label}, ` : ''}{APPROACH_LABEL[plan.approach].split(':')[0].toLowerCase()}, with {plan.crewIds.map(crewName).join(', ')}.
                {roleLine ? ` ${roleLine}.` : ''}
            </div>
            <div>
                {plan.recon === 0 ? 'Nobody has watched the target yet.' : plan.recon === 1 ? 'We know the routine.' : 'We know the routine, the guards and the gaps.'}
                {watching ? ` ${crewName(plan.reconBy)} is watching now.` : ''}
            </div>
            {!watching && plan.recon < 2 && (
                <div className="flex gap-2">
                    <select value={watcher} onChange={e => setWatcher(e.target.value)} className="flex-1 min-h-[40px] bg-slate-950 border border-slate-800 rounded px-2 text-xs text-slate-200">
                        <option value="">Send someone to watch…</option>
                        {free.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button disabled={busy || !watcher} onClick={() => onOrder('REB_JOB_RECON', { companionId: watcher }, 'They go to watch. About an hour and a half.')}
                        className={`${BTN} shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-200`}>Watch</button>
                </div>
            )}
            <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Gear · we have {pv.treasury}</div>
                {pv.gear.map(g => (
                    <div key={g.id} className="flex items-center justify-between gap-2">
                        <span>{g.label}{g.owned ? ' (ours)' : ` · ${g.price}${g.blackMarket ? ', black market' : ''}`}</span>
                        {!g.owned && (
                            <button disabled={busy || pv.treasury < g.price} onClick={() => onOrder('REB_JOB_GEAR', { gearId: g.id }, 'Bought.')}
                                className={`${BTN} shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-200`}>Buy</button>
                        )}
                    </div>
                ))}
            </div>
            <button disabled={busy || watching} onClick={() => onOrder('REB_JOB_START', { jobId, crewIds: plan.crewIds }, 'The crew sets out.')}
                className={`${BTN} w-full bg-red-800/80 hover:bg-red-700/80 text-white`}>{watching ? 'Wait for the watcher' : 'Go'}</button>
        </div>
    );
}
