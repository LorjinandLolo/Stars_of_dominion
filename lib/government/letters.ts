// lib/government/letters.ts
// Stars of Dominion — a minister's letter to the ruler.
//
// A written character (lib/leadership/cast.ts) speaks through the brief, the
// cabinet card and, when an arc stage opens, a letter: a short piece of text
// with their name on it, no buttons, the way Suzerain's ministers write.
// Letters are the ruler's private post: they ride the faction shard
// (`ministerLetters`), never the shared snapshot, and a seat holder does not
// read them. Pure; the brief reads them, the arc runner and the cast draw
// write them.

export interface MinisterLetter {
    id: string;
    /** Sim clock. */
    atSeconds: number;
    fromLeaderId: string;
    fromName: string;
    portfolio: string;
    characterId?: string;
    /** One line, the way a letter is headed. */
    subject: string;
    /** Plain text. Render as text. */
    body: string;
}

/** The ruler's post is short: a season of letters, not an archive. */
export const MAX_LETTERS = 30;

export interface LettersWorld {
    nowSeconds: number;
    ministerLetters?: Map<string, MinisterLetter[]>;
}

export function lettersOf(world: LettersWorld, factionId: string): MinisterLetter[] {
    if (!(world.ministerLetters instanceof Map)) world.ministerLetters = new Map();
    return world.ministerLetters.get(factionId) ?? [];
}

/** File a letter, newest last; the oldest fall off the end of the drawer. */
export function pushLetter(world: LettersWorld, factionId: string, letter: Omit<MinisterLetter, 'id' | 'atSeconds'> & { id?: string }): MinisterLetter {
    if (!(world.ministerLetters instanceof Map)) world.ministerLetters = new Map();
    const list = world.ministerLetters.get(factionId) ?? [];
    const full: MinisterLetter = { id: letter.id ?? `letter-${factionId}-${letter.fromLeaderId}-${world.nowSeconds}-${list.length}`, atSeconds: world.nowSeconds, ...letter };
    list.push(full);
    if (list.length > MAX_LETTERS) list.splice(0, list.length - MAX_LETTERS);
    world.ministerLetters.set(factionId, list);
    return full;
}
