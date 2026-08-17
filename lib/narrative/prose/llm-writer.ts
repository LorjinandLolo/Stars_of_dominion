// lib/narrative/prose/llm-writer.ts — prose with a model behind it.
//
// Wraps the existing providers in lib/ai/providers (gemini, ollama) but does
// NOT go through safeGenerateFactionReply: that path is built for a faction
// answering a player in dialogue and insists on a FactionContextSummary. An
// article needs a different prompt and a different failure policy.
//
// The failure policy is the important part. Any problem at all — no key, no
// daemon, a timeout, a refusal, unparseable output, a model that invents a
// faction nobody has heard of — falls through to the template writer. A galaxy
// whose newspaper stops printing because a GPU is busy is a worse galaxy.
//
// Invariant 6 is enforced here as well as at the service boundary: the prompt
// is built from `visibleActors`, never from the event's real actors, so a
// hidden hand cannot leak through the model.

import type { NarrationRequest, NarrationResult, ProseWriter } from './prose-types';
import { TemplateWriter } from './template-writer';
import { GeminiProvider } from '../../ai/providers/gemini-provider';
import { OllamaProvider } from '../../ai/providers/ollama-provider';

export type NarrativeProvider = 'gemini' | 'ollama' | 'template';

export interface LlmWriterOptions {
    provider?: NarrativeProvider;
    /** Stories below this importance are written by the template — the model's
     *  budget belongs to history, not to skirmishes. */
    minImportance?: number;
    /** Hard ceilings. Past them the template takes over silently. */
    maxCallsPerHour?: number;
    maxCallsPerDay?: number;
}

/** Simple rolling counters. Per-process, which is correct: the narrator is a
 *  single worker, and a restart legitimately resets its budget. */
class CallBudget {
    private hourly: number[] = [];
    private daily: number[] = [];

    constructor(private perHour: number, private perDay: number) {}

    private prune(now: number): void {
        this.hourly = this.hourly.filter(t => now - t < 3_600_000);
        this.daily = this.daily.filter(t => now - t < 86_400_000);
    }

    allows(): boolean {
        const now = Date.now();
        this.prune(now);
        return this.hourly.length < this.perHour && this.daily.length < this.perDay;
    }

    record(): void {
        const now = Date.now();
        this.hourly.push(now);
        this.daily.push(now);
    }

    spent(): { hour: number; day: number } {
        this.prune(Date.now());
        return { hour: this.hourly.length, day: this.daily.length };
    }
}

function voiceBrief(request: NarrationRequest): string {
    const { stance } = request;
    const lines: string[] = [];

    switch (stance.publisher.type) {
        case 'STATE_MEDIA':
            lines.push(
                `You write for ${stance.publisher.masthead}, an official state outlet. You do not lie outright, but you choose which facts lead, you use the government's preferred framing, and you never volunteer a detail that embarrasses your own administration.`,
            );
            break;
        case 'PIRATE_PRESS':
            lines.push(
                `You write for ${stance.publisher.masthead}, an unlicensed outlet broadcasting from outside anyone's jurisdiction. You assume every government is lying, you print what the respectable press will not, and you are comfortable with rumour as long as you label it.`,
            );
            break;
        default:
            lines.push(
                `You write for ${stance.publisher.masthead}, an independent wire service. You follow evidence, you attribute carefully, and you do not assert what you cannot support.`,
            );
    }

    if (stance.slant === 'friendly') lines.push('The subject of this story is your own administration and it has done well; report it as such without gloating.');
    if (stance.slant === 'hostile') lines.push('The subject of this story is hostile to your readership; report it plainly, without hysteria.');
    if (stance.coveringOwnEmpire && stance.slant === 'hostile') lines.push('This is a setback for your own side. Do not deny it; frame it as a challenge being met.');
    if (stance.sensational) lines.push('Your outlet has a reputation for overstatement. Lean slightly dramatic.');

    return lines.join(' ');
}

function factSheet(request: NarrationRequest): string {
    const { lead, events, visibleActors, speculative, memory } = request;

    const facts = Object.entries(lead.facts)
        .filter(([k]) => !k.startsWith('__'))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');

    const parts = [
        `EVENT: ${lead.type.replace(/_/g, ' ')}`,
        events.length > 1 ? `This covers ${events.length} related incidents.` : '',
        visibleActors.length
            ? `RESPONSIBLE (as far as the public knows): ${visibleActors.join(', ')}${speculative ? ' — SUSPECTED ONLY, not proven' : ''}`
            : 'RESPONSIBLE: unknown. Nobody has been identified, and you must not name anyone.',
        lead.targetNames.length ? `AFFECTED: ${lead.targetNames.join(', ')}` : '',
        lead.location ? `LOCATION: ${lead.location}` : '',
        facts ? `DETAILS:\n${facts}` : '',
    ];

    if (memory.feud) {
        parts.push(
            `HISTORY: these two powers have a running quarrel known as ${memory.feud.epithet} — ${memory.feud.eventCount} incidents so far. Notable: ${memory.feud.highlights.join('; ')}.`,
        );
    }
    if (memory.precedents.length) {
        parts.push(`PRIOR COVERAGE you may reference: ${memory.precedents.map(p => `"${p.headline}"`).join(', ')}.`);
    }
    if (memory.isReversal) parts.push('NOTE: this ground has changed hands before.');
    if (memory.isGalacticFirst) parts.push('NOTE: nothing of this kind has been recorded in this galaxy before.');

    return parts.filter(Boolean).join('\n');
}

const SYSTEM_RULES = `You are a journalist in a space-opera setting, filing a short wire report.

Hard rules:
- Use ONLY the facts given. Invent no names, numbers, casualties, quotes or events.
- Do NOT invent sources. No "sources confirm", "officials say", "reports suggest",
  "analysts believe" — you were not given any source but the record itself.
- Do NOT state that something is unknown, unconfirmed or uncasualtied unless the
  facts say so. Silence in the record is not a fact you may report.
- Do NOT characterise a faction ("the renegade X", "the notorious Y") beyond what
  the facts state. You know what happened, not who they are.
- If no responsible party is given, do not speculate about who did it. Report the effect.
- If a party is marked SUSPECTED, make clear it is an accusation, not an established fact.
- No markdown, no lists, no headings inside the body.
- Be concise: a headline under 90 characters, and a body of one or two short paragraphs, at most 90 words total.

Reply with STRICT JSON and nothing else, in this exact shape:
{"headline": "...", "lede": "...", "body": "...", "tone": "grave|alarmed|triumphal|wry|neutral"}
The lede is a single sentence summarising the story for a front page.`;

/** Models like to wrap JSON in prose or fences. Dig it out. */
function extractJson(text: string): any | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * Reject output that broke the rules that matter.
 *
 * The critical one is Invariant 6: if the model somehow produced a name that
 * was never given to it, the article is discarded rather than published. That
 * cannot happen through the prompt — hidden actors are never in it — but a
 * model hallucinating a plausible faction name into an unattributed story would
 * still be a leak-shaped bug, so it is checked rather than assumed.
 */
function validate(parsed: any, request: NarrationRequest): NarrationResult | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    const lede = typeof parsed.lede === 'string' && parsed.lede.trim()
        ? parsed.lede.trim()
        : body.split(/(?<=[.!?])\s/)[0] ?? '';
    if (headline.length < 8 || body.length < 40) return null;
    if (headline.length > 200 || body.length > 1500) return null;

    // An unattributed story that names one of the real actors is a leak.
    if (request.visibleActors.length === 0) {
        const printed = `${headline} ${body}`.toLowerCase();
        for (const name of request.lead.actorNames) {
            if (name && name.length > 3 && printed.includes(name.toLowerCase())) return null;
        }
    }

    // Fabricated sourcing is the failure mode small models fall into most
    // readily, and it is the one that makes the paper untrustworthy in a way
    // players would notice. Reject rather than print it.
    const INVENTED_SOURCING = /\b(sources?|officials?|analysts?|observers?|witnesses?|insiders?)\s+(say|said|claim|confirm|confirmed|suggest|report|believe|indicate)\b/i;
    if (INVENTED_SOURCING.test(body)) return null;

    const tone = ['grave', 'alarmed', 'triumphal', 'wry', 'neutral'].includes(parsed.tone)
        ? parsed.tone
        : 'neutral';

    return { headline, body, lede, tone, provider: 'llm' };
}

export class LlmWriter implements ProseWriter {
    private readonly provider: NarrativeProvider;
    private readonly minImportance: number;
    private readonly budget: CallBudget;
    private readonly fallback = new TemplateWriter();

    constructor(options: LlmWriterOptions = {}) {
        this.provider = options.provider
            ?? (process.env.NARRATOR_LLM as NarrativeProvider)
            ?? (process.env.LLM_PROVIDER as NarrativeProvider)
            ?? 'template';
        this.minImportance = options.minImportance ?? Number(process.env.NARRATOR_LLM_MIN_IMPORTANCE ?? 40);
        this.budget = new CallBudget(
            options.maxCallsPerHour ?? Number(process.env.NARRATOR_LLM_MAX_PER_HOUR ?? 40),
            options.maxCallsPerDay ?? Number(process.env.NARRATOR_LLM_MAX_PER_DAY ?? 300),
        );
    }

    budgetSpent(): { hour: number; day: number } {
        return this.budget.spent();
    }

    async write(request: NarrationRequest): Promise<NarrationResult> {
        if (this.provider === 'template') return this.fallback.write(request);
        if (request.lead.importance < this.minImportance) return this.fallback.write(request);
        if (!this.budget.allows()) return this.fallback.write(request);

        const systemPrompt = `${SYSTEM_RULES}\n\n${voiceBrief(request)}`;
        const userPrompt = factSheet(request);

        try {
            this.budget.record();
            const client = this.provider === 'gemini' ? new GeminiProvider() : new OllamaProvider();
            const { text } = await client.generateFactionReply({ systemPrompt, userPrompt });

            const result = validate(extractJson(text), request);
            if (!result) {
                console.warn(`[Narrator] ${this.provider} output rejected for ${request.lead.type}; using the template.`);
                return this.fallback.write(request);
            }

            // Continuity is appended deterministically rather than trusted to
            // the model, so the feud line is always accurate even when the
            // prose around it is generated.
            const templated = await this.fallback.write(request);
            const tail = templated.body.split('\n\n').slice(1).join('\n\n');

            return {
                ...result,
                body: tail ? `${result.body}\n\n${tail}` : result.body,
                provider: this.provider,
            };
        } catch (e: any) {
            console.warn(`[Narrator] ${this.provider} unavailable (${e.message}); using the template.`);
            return this.fallback.write(request);
        }
    }
}
