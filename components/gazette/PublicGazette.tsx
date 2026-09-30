// components/gazette/PublicGazette.tsx
// Stars of Dominion — the public gazette page body (casual-play spec Item 6d).
//
// A server component: no client code, no session, no store. It renders what
// lib/gazette hands it — published articles, the empires the press connects
// with each, the season — and nothing else. Headlines and bodies are text
// nodes.

import Link from 'next/link';
import { LOBBY_FACTIONS } from '@/data/factions/lobby-factions';
import {
    articlesAbout,
    groupByDate,
    seasonLabel,
    type PublicArticle,
    type SeasonLine,
} from '@/lib/gazette/public-gazette';

const KIND_LABEL: Record<string, string> = {
    news: 'News',
    investigation: 'Investigation',
    propaganda: 'Opinion',
    retrospective: 'Retrospective',
    obituary: 'Obituary',
    rumor: 'Rumour',
};

const CHIP = 'gazette-subject inline-flex items-center min-h-[40px] px-3 rounded-lg border text-xs transition-colors';

export default function PublicGazette({ season, factionNames, articles, factionId }: {
    season: SeasonLine;
    factionNames: Record<string, string>;
    articles: PublicArticle[];
    /** When set, only this empire's headlines. */
    factionId?: string;
}) {
    const shown = factionId ? articlesAbout(articles, factionId) : articles;
    const days = groupByDate(shown);
    const empireName = factionId ? (factionNames[factionId] ?? factionId) : null;
    // The fourteen empires, then any other named power the papers have written about.
    const roster = LOBBY_FACTIONS.map(f => f.id);
    const others = [...new Set(articles.flatMap(a => a.subjects))]
        .filter(id => !roster.includes(id) && factionNames[id]);

    return (
        <main id="public-gazette" className="h-screen supports-[height:100dvh]:h-dvh overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-200">
            <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
                <header className="border-b border-slate-700/60 pb-6 mb-6">
                    <p className="text-[10px] font-display uppercase tracking-[0.3em] text-sky-400 mb-2">
                        Stars of Dominion
                    </p>
                    <h1 className="text-3xl sm:text-4xl font-display uppercase tracking-wider text-white leading-tight">
                        {empireName ?? 'The Galactic Gazette'}
                    </h1>
                    <p id="gazette-season" className="text-sm text-slate-400 mt-2">
                        {empireName ? 'In the Galactic Gazette · ' : ''}{seasonLabel(season)}
                    </p>
                    {factionId && (
                        <Link href="/gazette" className="inline-flex items-center min-h-[40px] text-sm text-sky-300 hover:text-sky-200 mt-2">
                            ← All headlines
                        </Link>
                    )}
                </header>

                <nav aria-label="Empires" className="flex flex-wrap gap-2 mb-8">
                    {[...roster, ...others].map(id => (
                        <Link
                            key={id}
                            href={`/gazette/${encodeURIComponent(id)}`}
                            className={`${CHIP} ${
                                id === factionId
                                    ? 'border-sky-400/60 bg-sky-500/15 text-white'
                                    : 'border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500'
                            }`}
                        >
                            {factionNames[id] ?? id}
                        </Link>
                    ))}
                </nav>

                {days.length === 0 && (
                    <p className="text-sm text-slate-400 leading-relaxed">
                        {empireName
                            ? `The papers have had nothing to say about ${empireName} this week.`
                            : 'The presses have been quiet this week.'}
                    </p>
                )}

                {days.map(day => (
                    <section key={day.date} className="mb-10">
                        <h2 className="text-[11px] font-display uppercase tracking-[0.2em] text-slate-500 mb-4">
                            {day.label}
                        </h2>
                        <div className="space-y-4">
                            {day.articles.map(article => (
                                <article key={article.id} className="gazette-article rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 sm:p-5">
                                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                                        {KIND_LABEL[article.kind] ?? 'News'}
                                        {article.masthead ? ` · ${article.masthead}` : ''}
                                        {article.speculative ? ' · unconfirmed' : ''}
                                    </p>
                                    <h3 className="text-lg font-semibold text-white leading-snug">{article.headline}</h3>
                                    {article.body && (
                                        <details className="mt-2 group">
                                            <summary className="inline-flex items-center min-h-[40px] cursor-pointer text-xs text-sky-300 hover:text-sky-200 list-none">
                                                <span className="group-open:hidden">Read the story</span>
                                                <span className="hidden group-open:inline">Close</span>
                                            </summary>
                                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words mt-1">
                                                {article.body}
                                            </p>
                                        </details>
                                    )}
                                    {article.subjects.filter(id => factionNames[id] && id !== factionId).length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {article.subjects.filter(id => factionNames[id] && id !== factionId).map(id => (
                                                <Link
                                                    key={id}
                                                    href={`/gazette/${encodeURIComponent(id)}`}
                                                    className={`${CHIP} border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500`}
                                                >
                                                    {factionNames[id]}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                ))}

                <footer className="border-t border-slate-800 pt-6 mt-10 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-500">
                        The last seven days of a galaxy run by its players.
                    </p>
                    <Link
                        href="/login"
                        className="inline-flex items-center min-h-[40px] px-4 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-bold transition-colors"
                    >
                        Play
                    </Link>
                </footer>
            </div>
        </main>
    );
}
