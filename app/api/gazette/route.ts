import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withDocAliases } from '@/lib/db';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import type { PublicEvent } from '@/lib/narrative/reactions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const window = parseInt(process.env.GAZETTE_WINDOW_DAYS || '2', 10);

  // Days are derived from the sim clock (see lib/narrative/chronicle.ts), so a
  // live galaxy is on day ~20370, not day 1. With no explicit ?day= the client
  // wants "the latest front page" — find it rather than guessing a number.
  const requested = searchParams.get('day');
  let day: number;
  if (requested !== null) {
    day = parseInt(requested, 10);
  } else {
    const newest = await prisma.gazette.findFirst({ orderBy: { day: 'desc' }, select: { day: true } });
    day = newest?.day ?? 0;
  }

  const start = day - window + 1;
  const articles = await prisma.gazette.findMany({
    where: { day: { gte: start, lte: day } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // The events behind each front-page story, for a signed-in reader, so the
  // client can offer reactions (lib/narrative/reactions.ts). Served through
  // the public ceiling: the real actors only when the attribution is
  // 'exposed', a whispered name when 'suspected:<id>'. The front page itself
  // stays open to anyone, as before.
  let eventsByHeadline: Record<string, PublicEvent[]> = {};
  try {
    const { userId } = await resolveCallerFaction(req);
    if (userId) {
      const written = await prisma.narrativeArticle.findMany({
        where: { day: { gte: start, lte: day } },
        select: { headline: true, day: true, eventIds: true },
      });
      const ids = new Set<string>();
      const byKey = new Map<string, string[]>();
      for (const a of written) {
        let list: string[] = [];
        try { list = JSON.parse(a.eventIds); } catch { /* malformed: no reactions for that one */ }
        byKey.set(`${a.day}|${a.headline}`, list);
        for (const id of list) ids.add(id);
      }
      const rows = ids.size ? await prisma.chronicleEvent.findMany({ where: { id: { in: [...ids] } } }) : [];
      const shaped = new Map<string, PublicEvent>();
      for (const e of rows) {
        const parse = (s: string): any => { try { return JSON.parse(s); } catch { return null; } };
        const exposed = e.attribution === 'exposed';
        const suspected = e.attribution.startsWith('suspected:') ? e.attribution.slice('suspected:'.length) : null;
        shaped.set(e.id, {
          id: e.id, type: e.type, day: e.day,
          actorIds: exposed ? (parse(e.actorIds) ?? []) : [],
          suspectedId: suspected,
          targetIds: parse(e.targetIds) ?? [],
          location: e.location,
          facts: parse(e.facts) ?? {},
        });
      }
      eventsByHeadline = {};
      for (const [key, list] of byKey) {
        const evs = list.map(id => shaped.get(id)).filter((x): x is PublicEvent => !!x);
        if (evs.length) eventsByHeadline[key] = evs;
      }
    }
  } catch (e) {
    console.warn('[API/gazette] reactions unavailable:', (e as any)?.message ?? e);
  }

  return new Response(JSON.stringify({
    day, window,
    articles: articles.map(a => ({ ...withDocAliases(a), events: eventsByHeadline[`${a.day}|${a.headline}`] ?? [] })),
  }), { headers: { 'Content-Type':'application/json' } });
}
