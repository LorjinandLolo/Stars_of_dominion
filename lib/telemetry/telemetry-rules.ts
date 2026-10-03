// lib/telemetry/telemetry-rules.ts
// Stars of Dominion — what the game records about how it is played, and the
// one function that decides whether a reported event is acceptable.
//
// Pure and client-safe: the browser recorder imports the kinds, the ingest
// route imports the sanitizer, and neither drags the other's dependencies in.
//
// What is recorded is deliberately narrow. Sessions and minutes played, which
// screens get opened, which orders are given and which are refused (and why),
// and errors a player actually ran into. Never what anybody typed — not a
// message, not a name, not a search. A free-text field is only ever an error
// string the game itself produced.

/** Events the browser may report. Anything else is dropped at the door. */
export const CLIENT_EVENT_KINDS = [
    /** A game page was opened. detail: { w, h, touch } */
    'session_start',
    /** Sent once a minute while the game is on screen. Minutes played = count. */
    'heartbeat',
    /** A main panel came to the front. detail: { tab } */
    'tab_opened',
    /** A map overlay was switched on. detail: { overlay } */
    'overlay_opened',
    /** An order the player gave was refused before it reached the worker. detail: { actionId, error } */
    'order_refused',
    /** An uncaught error in the page. detail: { message } */
    'client_error',
] as const;
export type ClientEventKind = typeof CLIENT_EVENT_KINDS[number];

/** Events only the server writes. A browser claiming one of these is ignored. */
export const SERVER_EVENT_KINDS = [
    /** The order queue accepted an order from its verified owner. detail: { actionId } */
    'order_queued',
    /** The worker refused an order when it came to carry it out. detail: { actionId, reason } */
    'order_failed',
] as const;
export type ServerEventKind = typeof SERVER_EVENT_KINDS[number];

export type TelemetryKind = ClientEventKind | ServerEventKind;

/** One event as the browser sends it. `ageMs`: how long ago it happened. */
export interface ReportedEvent {
    kind: string;
    detail?: unknown;
    ageMs?: number;
}

/** One event ready to store. */
export interface CleanEvent {
    kind: TelemetryKind;
    detail: string | null;
    at: Date;
}

/** Events accepted in one request; a flush every 30 s never comes near it. */
export const MAX_EVENTS_PER_REPORT = 50;
/** Stored detail, as JSON, is cut to this many characters. */
export const MAX_DETAIL_CHARS = 400;
/** A buffered event older than this is stamped as this old, no older. */
export const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

const CLIENT_KINDS = new Set<string>(CLIENT_EVENT_KINDS);

/** Keys a detail object may carry, per kind. Everything else is stripped. */
const DETAIL_KEYS: Record<ClientEventKind, string[]> = {
    session_start: ['w', 'h', 'touch'],
    heartbeat: [],
    tab_opened: ['tab'],
    overlay_opened: ['overlay'],
    order_refused: ['actionId', 'error'],
    client_error: ['message'],
};

/** Strings in a detail are cut short; nothing else but numbers and booleans survives. */
const MAX_STRING_CHARS = 200;

function cleanDetail(kind: ClientEventKind, raw: unknown): string | null {
    const keys = DETAIL_KEYS[kind];
    if (keys.length === 0 || !raw || typeof raw !== 'object') return null;
    const out: Record<string, string | number | boolean> = {};
    for (const key of keys) {
        const value = (raw as Record<string, unknown>)[key];
        if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING_CHARS);
        else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
        else if (typeof value === 'boolean') out[key] = value;
    }
    if (Object.keys(out).length === 0) return null;
    return JSON.stringify(out).slice(0, MAX_DETAIL_CHARS);
}

/**
 * Turn what a browser reported into what may be stored: known client kinds
 * only, details reduced to their allowed keys, timestamps taken from the
 * server's clock (the browser only says how long ago), at most
 * MAX_EVENTS_PER_REPORT per report.
 */
export function sanitizeReport(raw: unknown, now: Date): CleanEvent[] {
    const events = Array.isArray((raw as any)?.events) ? (raw as any).events as ReportedEvent[] : [];
    const clean: CleanEvent[] = [];
    for (const event of events.slice(0, MAX_EVENTS_PER_REPORT)) {
        if (!event || typeof event.kind !== 'string' || !CLIENT_KINDS.has(event.kind)) continue;
        const kind = event.kind as ClientEventKind;
        const age = typeof event.ageMs === 'number' && Number.isFinite(event.ageMs)
            ? Math.min(MAX_EVENT_AGE_MS, Math.max(0, event.ageMs))
            : 0;
        clean.push({ kind, detail: cleanDetail(kind, event.detail), at: new Date(now.getTime() - age) });
    }
    return clean;
}

/** A server-side detail, cut to size. */
export function serverDetail(detail: Record<string, string | number | boolean>): string {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(detail)) {
        out[key] = typeof value === 'string' ? value.slice(0, MAX_STRING_CHARS) : value;
    }
    return JSON.stringify(out).slice(0, MAX_DETAIL_CHARS);
}

/** Off switch for the whole thing: TELEMETRY=off in the server's .env. */
export function telemetryEnabled(env: Record<string, string | undefined>): boolean {
    return (env.TELEMETRY ?? '').trim().toLowerCase() !== 'off';
}
