import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withDocAliases } from '@/lib/db';

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
  return new Response(JSON.stringify({ day, window, articles: articles.map(withDocAliases) }), { headers: { 'Content-Type':'application/json' } });
}
