/**
 * lib/fallen/fellows-service.ts
 * Item 14f: fallen leaders in hiding join forces. Server-only.
 *
 * Joining is an alliance of cells, never a merge of claims: each leader keeps
 * their own cell and seat on their own former world, so each movement still
 * rises to its own state. What they share is people: a job can take
 * companions from every allied crew, a companion stays on their own cell's
 * record (so a death is remembered there and lost to everyone at once), and a
 * joint job runs only once every leader with people on it has committed to
 * the plan. Only players in the same position may join: a player who still
 * holds an empire has no cell and no crew, and can only give sanctuary.
 */

import type { GameWorldState } from '../game-world-state';
import { noteForSeat, type Companion, type FellowView, type AllyPlanView, type RebelCell } from '../rebellion/rebellion-types';
import { ensureRebellion } from '../rebellion/cell-service';
import { JOB_BY_ID } from './jobs';

export type FellowResult = { ok: true; message: string } | { ok: false; message: string };

/** A fallen leader in hiding, still leading a cell. */
function isExileSeat(c: RebelCell | undefined): c is RebelCell {
    return !!c && c.status === 'active' && !!c.seat && !!c.exile;
}

function cellById(world: GameWorldState, id: string): RebelCell | undefined {
    return ensureRebellion(world).cells.get(id);
}

/** Cells joined with this one: both sides list each other, both still in hiding. */
export function allyCellsOf(world: GameWorldState, cell: RebelCell): RebelCell[] {
    return (cell.exile?.allies ?? [])
        .map(id => cellById(world, id))
        .filter(isExileSeat)
        .filter(c => (c.exile!.allies ?? []).includes(cell.id));
}

/** Everyone a job led from this cell can draw on: our crew, then our allies'. */
export function pooledCrew(world: GameWorldState, cell: RebelCell): Companion[] {
    return [...(cell.exile?.crew ?? []), ...allyCellsOf(world, cell).flatMap(c => c.exile!.crew)];
}

/** The cell a companion belongs to, among this cell and its allies. */
export function ownerCellOf(world: GameWorldState, cell: RebelCell, companionId: string): RebelCell {
    if (cell.exile?.crew.some(c => c.id === companionId)) return cell;
    return allyCellsOf(world, cell).find(c => c.exile!.crew.some(x => x.id === companionId)) ?? cell;
}

/** Companions out on a job or a watch right now, across this cell and its allies. */
export function busyIds(world: GameWorldState, cell: RebelCell): Set<string> {
    const out = new Set<string>();
    for (const c of [cell, ...allyCellsOf(world, cell)]) {
        if (c.job?.status === 'running') c.job.crewIds.forEach(id => out.add(id));
        if (c.plan?.reconBy) out.add(c.plan.reconBy);
    }
    return out;
}

/** The fellow exile's job this cell has people on, running now. */
export function jointJobFor(world: GameWorldState, cell: RebelCell): RebelCell | null {
    for (const lead of allyCellsOf(world, cell)) {
        if (lead.job?.status === 'running' && (lead.job.party ?? []).includes(cell.id)) return lead;
    }
    return null;
}

// ─── Joining ─────────────────────────────────────────────────────────────────

/**
 * Ask to join a fellow exile, or accept when they asked first. The seat id of
 * the other leader never travels: the page names a cell from the fellows list.
 */
export function joinFellow(world: GameWorldState, cell: RebelCell, otherCellId: unknown): FellowResult {
    if (!cell.exile) return { ok: false, message: 'Only a fallen leader in hiding can join another.' };
    const other = cellById(world, String(otherCellId ?? ''));
    if (!isExileSeat(other) || other.id === cell.id) return { ok: false, message: 'Nobody in hiding by that name.' };
    const mine = cell.exile;
    const theirs = other.exile!;
    if ((mine.allies ?? []).includes(other.id) && (theirs.allies ?? []).includes(cell.id)) return { ok: false, message: 'We are already together.' };
    const now = world.nowSeconds;
    const theyAsked = (mine.invites ?? []).some(i => i.fromCellId === other.id);
    if (theyAsked) {
        mine.invites = (mine.invites ?? []).filter(i => i.fromCellId !== other.id);
        theirs.invites = (theirs.invites ?? []).filter(i => i.fromCellId !== cell.id);
        mine.allies = [...new Set([...(mine.allies ?? []), other.id])];
        theirs.allies = [...new Set([...(theirs.allies ?? []), cell.id])];
        noteForSeat(cell, now, `We have joined forces with ${other.seat!.displayName} of ${theirs.fromName}. Their people and ours are one crew now.`);
        noteForSeat(other, now, `${cell.seat!.displayName} of ${mine.fromName} has joined forces with us. Their people and ours are one crew now.`);
        return { ok: true, message: `Together with ${theirs.fromName}'s people.` };
    }
    if ((theirs.invites ?? []).some(i => i.fromCellId === cell.id)) return { ok: false, message: 'We have asked already. It is their answer now.' };
    theirs.invites = [...(theirs.invites ?? []), { fromCellId: cell.id, at: now }];
    noteForSeat(other, now, `${cell.seat!.displayName}, of the fallen ${mine.fromName}, asks to join forces with us.`);
    return { ok: true, message: `Word has gone to ${other.seat!.displayName}.` };
}

/** Part ways with a fellow exile (or turn down their offer). Plans that relied on them fall apart. */
export function leaveFellow(world: GameWorldState, cell: RebelCell, otherCellId: unknown): FellowResult {
    if (!cell.exile) return { ok: false, message: 'Nobody to part from.' };
    const id = String(otherCellId ?? '');
    const other = cellById(world, id);
    const wasAllied = (cell.exile.allies ?? []).includes(id);
    const hadInvite = (cell.exile.invites ?? []).some(i => i.fromCellId === id);
    if (!wasAllied && !hadInvite) return { ok: false, message: 'We are not joined with them.' };
    if (cell.job?.status === 'running' && (cell.job.party ?? []).includes(id)) return { ok: false, message: 'Not in the middle of a job with them.' };
    if (other?.job?.status === 'running' && (other.job.party ?? []).includes(cell.id)) return { ok: false, message: 'Not in the middle of a job with them.' };
    cell.exile.allies = (cell.exile.allies ?? []).filter(x => x !== id);
    cell.exile.invites = (cell.exile.invites ?? []).filter(i => i.fromCellId !== id);
    if (other?.exile) {
        other.exile.allies = (other.exile.allies ?? []).filter(x => x !== cell.id);
        if (wasAllied) noteForSeat(other, world.nowSeconds, `${cell.seat?.displayName ?? 'Our fellow exile'} has gone their own way. Their people go with them.`);
    }
    // A plan that leaned on the other side's people no longer holds.
    for (const [a, b] of [[cell, other], [other, cell]] as const) {
        if (!a?.plan || !b) continue;
        if ((a.plan.party ?? []).includes(b.id)) {
            const theirs = new Set(b.exile?.crew.map(c => c.id) ?? []);
            a.plan.crewIds = a.plan.crewIds.filter(x => !theirs.has(x));
            a.plan.party = (a.plan.party ?? []).filter(x => x !== b.id);
            a.plan.commits = [];
            for (const k of Object.keys(a.plan.roles)) if (theirs.has((a.plan.roles as any)[k])) delete (a.plan.roles as any)[k];
        }
    }
    return { ok: true, message: wasAllied ? 'We go our own way.' : 'We turn them down.' };
}

/** Commit our people to a fellow exile's plan. The lead may start it once everyone has. */
export function commitToPlan(world: GameWorldState, cell: RebelCell, leadCellId: unknown): FellowResult {
    const lead = allyCellsOf(world, cell).find(c => c.id === String(leadCellId ?? ''));
    if (!lead?.plan || !(lead.plan.party ?? []).includes(cell.id)) return { ok: false, message: 'No plan of theirs needs us.' };
    if ((lead.plan.commits ?? []).includes(cell.id)) return { ok: false, message: 'We have given our word already.' };
    lead.plan.commits = [...(lead.plan.commits ?? []), cell.id];
    const job = JOB_BY_ID[lead.plan.jobId]?.title ?? 'the job';
    noteForSeat(lead, world.nowSeconds, `${cell.seat!.displayName} commits their people to ${job}.`);
    return { ok: true, message: `Our people are in: ${job}.` };
}

// ─── What the leader sees ────────────────────────────────────────────────────

function planetName(world: GameWorldState, planetId: string): string {
    return String((world.construction?.planets?.get?.(planetId) as any)?.name ?? 'an unknown world');
}

/** Every other fallen leader in hiding, and where we stand with them. */
export function fellowsView(world: GameWorldState, cell: RebelCell): FellowView[] {
    if (!cell.exile) return [];
    const allies = new Set(allyCellsOf(world, cell).map(c => c.id));
    const out: FellowView[] = [];
    for (const c of ensureRebellion(world).cells.values()) {
        if (c.id === cell.id || !isExileSeat(c)) continue;
        out.push({
            cellId: c.id,
            leaderName: c.seat!.displayName,
            fromName: c.exile!.fromName,
            planetName: planetName(world, c.planetId),
            allied: allies.has(c.id),
            invitedUs: (cell.exile.invites ?? []).some(i => i.fromCellId === c.id),
            invitedByUs: (c.exile!.invites ?? []).some(i => i.fromCellId === cell.id),
        });
    }
    return out;
}

/** Fellow exiles' plans that have our people on them. */
export function allyPlansView(world: GameWorldState, cell: RebelCell, targetLabel: (lead: RebelCell) => string | null): AllyPlanView[] {
    const ours = new Set(cell.exile?.crew.map(c => c.id) ?? []);
    return allyCellsOf(world, cell)
        .filter(lead => lead.plan && (lead.plan.party ?? []).includes(cell.id))
        .map(lead => ({
            leadCellId: lead.id,
            leaderName: lead.seat!.displayName,
            jobTitle: JOB_BY_ID[lead.plan!.jobId]?.title ?? 'A job',
            targetLabel: targetLabel(lead),
            ourCrew: lead.plan!.crewIds.filter(id => ours.has(id)).map(id => cell.exile!.crew.find(c => c.id === id)!.name),
            committed: (lead.plan!.commits ?? []).includes(cell.id),
        }));
}
