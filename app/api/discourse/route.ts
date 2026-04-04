// app/api/discourse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFactionStatusSummary } from '@/app/actions/discourse';
import { generateFactionDiscourse } from '@/lib/ai/faction-ai';
import { getRecentMessages, appendMessage } from '@/lib/ai/discourse-memory';
import type { DiscourseMessage } from '@/lib/politics/faction-discourse-types';

// GET /api/discourse?factionId=xxx  → returns faction context summary
export async function GET(req: NextRequest) {
  try {
    const factionId = req.nextUrl.searchParams.get('factionId');
    if (!factionId) {
      return NextResponse.json({ error: 'Missing factionId query parameter.' }, { status: 400 });
    }
    const summary = await getFactionStatusSummary(factionId);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[API GET /discourse] Error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? 'Internal server error.' },
      { status: 500 }
    );
  }
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factionId, playerMessage } = body as { factionId: string; playerMessage: string };

    if (!factionId || !playerMessage?.trim()) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const context = await getFactionStatusSummary(factionId);

    const playerMsg: DiscourseMessage = {
      id: `m_p_${Date.now()}`,
      speaker: 'player',
      content: playerMessage.trim(),
      timestamp: Date.now(),
    };

    appendMessage(factionId, playerMsg);
    context.conversation.recentMessages = getRecentMessages(factionId);

    const discourseResponse = await generateFactionDiscourse({
      context,
      playerMessage: playerMessage.trim(),
    });

    const factionMsg: DiscourseMessage = {
      id: `m_f_${Date.now()}`,
      speaker: 'faction',
      content: discourseResponse.message,
      timestamp: Date.now(),
    };

    appendMessage(factionId, factionMsg);

    return NextResponse.json({
      playerMessage: playerMsg,
      factionMessage: factionMsg,
      response: discourseResponse,
    });
  } catch (error: any) {
    console.error('[API /discourse] Error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? 'Internal server error.' },
      { status: 500 }
    );
  }
}
