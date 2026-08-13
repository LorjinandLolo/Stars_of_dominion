// lib/narrative/naming.ts — turning engine identifiers into printable English.
//
// Shared by the recorder (which stamps faction names onto events at emission)
// and the narrator (which sometimes has to print a party the recorder never
// saw, such as a faction being framed for someone else's operation).

/** `faction-null-syndicate` → `Null Syndicate`; splinter cuids are trimmed. */
export function prettifyFactionId(id: string): string {
    if (!id) return 'an unnamed power';
    const cleaned = id
        .replace(/^faction-/, '')
        .replace(/-[0-9a-f]{8,}$/i, '')  // trailing cuid on runtime-created factions
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    return cleaned || id;
}

/** `shadowEconomy` → `shadow economy`; used for domains, modes and enum-ish
 *  fact values that would otherwise reach print in camelCase. */
export function humanizeTerm(term: string): string {
    if (!term) return term;
    return term
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .toLowerCase()
        .trim();
}
