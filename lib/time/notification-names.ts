// lib/time/notification-names.ts
// Stars of Dominion — Faction names in notification text.
//
// Notification bodies are assembled in 21 different services, and plenty of
// them end up printing a raw id: "faction-leopantheri has declared war",
// "rebel-faction-midrim-106 seized three worlds". Rather than chase 46 call
// sites and every string they compose, the text is rewritten once on the way
// out (see drainNotifications).
//
// This module holds no world state and imports nothing from the simulation:
// each process REGISTERS the labels it knows (the worker does it every
// strategic tick) and the rewrite is a pure string pass over what is known.

/** How one faction should read to a player. */
export interface FactionLabel {
    /** Empire name, e.g. "The Leopantheri Ascendancy". */
    name: string;
    /** The human who holds it, when one does. */
    player?: string;
}

const _labels = new Map<string, FactionLabel>();

/**
 * Replace the known faction labels. Called once per strategic tick by the
 * worker; safe to call from anywhere that can see the faction records.
 */
export function registerFactionLabels(labels: Record<string, FactionLabel>): void {
    _labels.clear();
    for (const [id, label] of Object.entries(labels)) {
        if (!id || !label?.name) continue;
        _labels.set(id, label);
    }
}

/** Test/reset seam. */
export function clearFactionLabels(): void {
    _labels.clear();
}

/** How a single id should be printed. Unknown ids are prettified, not echoed. */
export function labelFor(factionId: string): string {
    const known = _labels.get(factionId);
    if (known) return known.player ? `${known.name} (${known.player})` : known.name;
    return prettifyId(factionId);
}

/**
 * An id nobody registered — a rebel state born this cycle, a corporate actor,
 * a faction from a save this process never loaded. Print something readable
 * rather than the slug: `rebel-faction-midrim-106` → "Midrim 106 Rebels",
 * `banking_clan` → "Banking Clan".
 */
function prettifyId(id: string): string {
    const rebel = /^rebel-faction-(.+)$/.exec(id);
    const core = rebel ? rebel[1] : id.replace(/^faction-/, '');
    const words = core
        .split(/[-_]/)
        .filter(Boolean)
        .map(w => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
    if (!words) return id;
    return rebel ? `${words} Rebels` : words;
}

/** Anything shaped like a faction id, so unregistered ones are caught too. */
const ID_SHAPE = /\b(?:rebel-)?faction-[a-z0-9][a-z0-9_-]*\b/gi;
/** Same shape, unanchored and stateless — `.test()` on a /g regex is not. */
const IS_ID_SHAPED = /^(?:rebel-)?faction-[a-z0-9][a-z0-9_-]*$/i;

/**
 * Rewrite every faction id in a string. Registered ids become their empire
 * name (plus the player holding it); id-shaped strings nobody registered are
 * prettified.
 *
 * Whole ids only: `faction-midrim` must not be substituted inside
 * `rebel-faction-midrim-106`, which would read "rebel-Midrim Compact-106".
 */
export function humanizeText(text: string): string {
    if (!text) return text;

    // Every id-shaped token, registered or not, resolved as a whole token.
    let out = text.replace(ID_SHAPE, match => {
        const known = _labels.get(match);
        return known ? labelFor(match) : prettifyId(match);
    });

    // Ids that do not carry the `faction-` prefix (corporate actors, pirate
    // clans) are only found by name, so bound them to non-id characters.
    const others = [..._labels.keys()]
        .filter(id => !IS_ID_SHAPED.test(id))
        .sort((a, b) => b.length - a.length);
    for (const id of others) {
        if (!out.includes(id)) continue;
        const bounded = new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`, 'g');
        out = out.replace(bounded, labelFor(id));
    }
    return out;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rewrite a notification's player-visible text. Everything else is untouched. */
export function humanizeNotification<T extends { title: string; body: string }>(note: T): T {
    const title = humanizeText(note.title);
    const body = humanizeText(note.body);
    if (title === note.title && body === note.body) return note;
    return { ...note, title, body };
}
