'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

/** Editorial register set by the narrator (lib/narrative/prose). */
const TONE_STYLE: Record<string, { dot: string; label: string }> = {
    grave: { dot: 'bg-amber-400', label: 'GRAVE' },
    alarmed: { dot: 'bg-red-400', label: 'ALARMED' },
    triumphal: { dot: 'bg-emerald-400', label: 'TRIUMPHAL' },
    wry: { dot: 'bg-violet-400', label: 'WRY' },
    neutral: { dot: 'bg-slate-400', label: 'REPORT' },
};

/**
 * The galactic gazette's front page.
 *
 * Omit `day` to show the latest published day — the API resolves it, because
 * the client has no way to know the sim-clock day number. Rows are written by
 * the narrator worker (scripts/narrator.ts); with no narrator running this
 * panel is empty and says so.
 */
export default function Newspaper({ day }: { day?: number }) {
    const url = day === undefined ? '/api/gazette' : `/api/gazette?day=${day}`;
    const { data, error } = useSWR(url, fetcher, { refreshInterval: 15000 });

    if (error) return <div className="text-[10px] text-red-400/80">Gazette unreachable.</div>;
    if (!data) return <div className="text-[10px] text-slate-500">Loading…</div>;

    if (!data.articles?.length) {
        return (
            <div className="text-[10px] text-slate-500 italic">
                No major incidents reported.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {data.articles.map((a: any, idx: number) => {
                const tone = TONE_STYLE[a.tone as string] ?? TONE_STYLE.neutral;
                return (
                    <article
                        key={a.id ?? idx}
                        className="p-3 rounded-lg border bg-slate-900/40 border-slate-800/60"
                    >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="text-[11px] text-slate-100 leading-tight font-medium">
                                {a.headline}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                                <span className="text-[8px] font-mono text-slate-500">{tone.label}</span>
                            </div>
                        </div>
                        <div className="text-[10px] text-slate-400 leading-snug">{a.lede}</div>
                    </article>
                );
            })}
        </div>
    );
}
