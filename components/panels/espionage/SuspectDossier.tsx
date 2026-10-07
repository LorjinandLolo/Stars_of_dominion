'use client';

/**
 * A suspect's dossier on the case board (spec item 12b-2): what OUR service
 * knows about one empire, and nothing it does not. Public facts (species,
 * creed, standing, the relations log) come from the synced world; discoveries
 * (their reach inside us, their tradecraft, prisoners) come from our own
 * FactionIntelState, which the worker fills only when a sweep, a prisoner or
 * our sources inside them showed it. The assessment line reads the player's
 * pins and the clues' public tags, never hidden weights.
 */

import React from 'react';
import { FileText, Fingerprint, Handshake, History, Lock, ShieldAlert, UserX } from 'lucide-react';
import type { CaseClue, CovertCase, FactionIntelState, RivalryState } from '@/types/ui-state';
import { assessmentLine, ideologyLabel, relationPhrase, speciesLabel } from '@/lib/espionage/dossier';
import { stageForInfiltration, stageInfo } from '@/lib/espionage/network-stages';

export interface DossierContext {
    playerFactionId: string | null;
    factions: Record<string, any>;
    rivalries: RivalryState[];
    treaties: { type: string; signatories: string[]; status: string }[];
    intel: FactionIntelState | null;
    cases: CovertCase[];
    factionName: (id: string) => string;
    /** Sim seconds → "today", "3 days ago". */
    ago: (atSimSeconds: number) => string;
}

function standingWord(score: number): string {
    if (score >= 80) return 'bitter';
    if (score >= 60) return 'hostile';
    if (score >= 40) return 'tense';
    if (score >= 20) return 'cool';
    return 'cordial';
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-2 text-[11px]">
            <span className="text-slate-600 mt-0.5 shrink-0">{icon}</span>
            <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
                <div className="text-slate-300 leading-snug">{children}</div>
            </div>
        </div>
    );
}

export function SuspectDossier({ suspectId, pinned, cleared, ctx }: {
    suspectId: string;
    /** Clues the player pinned to this suspect, on the open file. */
    pinned: CaseClue[];
    /** A clue on the file argues against them. */
    cleared: boolean;
    ctx: DossierContext;
}) {
    const me = ctx.playerFactionId ?? '';
    const f = ctx.factions[suspectId] ?? {};
    const rivalry = ctx.rivalries.find(r =>
        (r.empireAId === me && r.empireBId === suspectId) || (r.empireBId === me && r.empireAId === suspectId));
    const score = rivalry?.rivalryScore ?? 0;
    const atWar = (rivalry?.escalationLevel ?? 0) >= 7;
    const treaties = ctx.treaties
        .filter(t => t.status === 'active' && t.signatories.includes(me) && t.signatories.includes(suspectId))
        .map(t => t.type.replace(/_/g, ' '));
    const events = [...(rivalry?.recentEvents ?? [])].sort((a, b) => b.atSeconds - a.atSeconds).slice(0, 3);

    const ourLevel = ctx.intel?.infiltrationLevels?.[suspectId] ?? 0;
    const ourStage = stageInfo(stageForInfiltration(ourLevel));
    const known = ctx.intel?.dossier?.[suspectId];
    const prisoners = (ctx.intel?.prisoners ?? []).filter(p => p.claimedEmployerId === suspectId);
    const pastFiles = ctx.cases.filter(c => c.accusedFactionId === suspectId && c.status !== 'open');
    const openNaming = ctx.cases.filter(c => c.status === 'open' && c.clues.some(cl => cl.pointsAt.includes(suspectId))).length;

    return (
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div>
                <div className="text-[12px] text-slate-100">{ctx.factionName(suspectId)}</div>
                <div className="text-[10px] text-slate-500">
                    {speciesLabel(f.civilizationId)} · {ideologyLabel(f.ideologyId)}
                </div>
            </div>

            <Row icon={<Handshake size={11} />} label="Standing with us">
                {atWar ? <span className="text-red-400">At war.</span> : <>Relations {standingWord(score)} ({Math.round(score)}).</>}
                {treaties.length > 0 && <> Treaties: {treaties.join(', ')}.</>}
            </Row>

            <Row icon={<History size={11} />} label="Between us lately">
                {events.length === 0 ? 'Nothing on file.' : (
                    <ul className="space-y-0.5">
                        {events.map((e, i) => (
                            <li key={i} className={e.scoreDelta > 0 ? 'text-amber-300' : 'text-slate-400'}>
                                {relationPhrase(e.kind)}, {ctx.ago(e.atSeconds)}
                            </li>
                        ))}
                    </ul>
                )}
            </Row>

            <Row icon={<Lock size={11} />} label="Our access inside them">
                {ourLevel <= 0 ? 'No sources. We are guessing.' : <>{ourStage.label} ({Math.floor(ourLevel)}).</>}
            </Row>

            <Row icon={<ShieldAlert size={11} />} label="Their reach inside us">
                {known?.revealedInfiltration != null
                    ? <>{stageInfo(stageForInfiltration(known.revealedInfiltration)).label} ({known.revealedInfiltration}), as a sweep found {known.revealedAt != null ? ctx.ago(known.revealedAt) : 'earlier'}.</>
                    : 'Unknown. A sweep that catches their people would tell us.'}
            </Row>

            <Row icon={<Fingerprint size={11} />} label="Black Market tradecraft">
                {known?.blackMarket == null ? 'Unknown. Our sources inside them would see it.'
                    : known.blackMarket ? 'Yes, by our sources.' : 'No, by our sources.'}
            </Row>

            {prisoners.length > 0 && (
                <Row icon={<UserX size={11} />} label="Prisoners who say they work for them">
                    {prisoners.map(p => `${p.codename} (${speciesLabel(p.species)})`).join(', ')}
                </Row>
            )}

            <Row icon={<FileText size={11} />} label="Past files">
                {pastFiles.length === 0 && openNaming === 0 ? 'None.' : (
                    <>
                        {pastFiles.map(c => c.status === 'accused'
                            ? `${c.verdict === 'correct' ? 'Proved' : 'Wrongly accused'}: ${c.title}.`
                            : `Leaked: ${c.title}.`).join(' ')}
                        {openNaming > 0 && ` Named in ${openNaming} open file${openNaming > 1 ? 's' : ''}.`}
                    </>
                )}
            </Row>

            <div className="border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                <span className="uppercase tracking-wider text-slate-500">Assessment · </span>
                {assessmentLine(pinned, cleared)}
            </div>
        </div>
    );
}
